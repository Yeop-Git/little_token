/**
 * 점수 계산기 (SCORE_REDESIGN.md §4·§5).
 *
 * `점수 = 칩 × 배율 × 증폭 × 대성공`. 순수함수다. 무작위는 `Roller`와 대성공 굴림 값으로만 받는다.
 * 배율은 주어 → 수식어 → 동사 순서로 왼쪽부터 쌓는다: 가산은 `mult += x`, 곱셈은 `mult *= x`.
 * 그래서 일찍 더한 가산은 이후 곱셈으로 불어나고 늦게 더한 가산은 불어나지 않는다(§4-1).
 * 유물 줄은 그 뒤 왼쪽에서 오른쪽으로 발동한다(§4-4).
 */
import {
  CRIT_BASE, CRIT_CAP, CRIT_MULT, NEW_PAINT_MULT, RESONANCE, card as cardDef, form as formDef,
  relic as relicDef, sticker as stickerDef, weather as weatherDef,
} from './data'
import type {
  CardDef, CarryState, DeckCard, Roller, ScoreEmotion, ScoreLoadout, ScoreStep, SentencePick,
  SentenceRecord, SentenceResult, StageContext, StickerDef, ValidationResult, WeatherDef,
} from './types'
import { EMPTY_CARRY, STAT_EMOTIONS } from './types'

// ── 굴림 ──

export function rngRoller(rng: () => number): Roller {
  return {
    pick: (p, a, b) => (rng() < p ? a : b),
    range: (lo, hi) => lo + (hi - lo) * rng(),
  }
}

export const expectedRoller: Roller = {
  pick: (p, a, b) => p * a + (1 - p) * b,
  range: (lo, hi) => (lo + hi) / 2,
}

// ── 공용 해석 ──

interface Resolved {
  subj: CardDef
  adv?: CardDef
  verb: CardDef
  subjSticker?: StickerDef
  advSticker?: StickerDef
  verbSticker?: StickerDef
}

function resolve(pick: SentencePick): Resolved {
  const st = (c?: DeckCard) => (c?.sticker ? stickerDef(c.sticker) : undefined)
  return {
    subj: cardDef(pick.subj.cardId),
    adv: pick.adv ? cardDef(pick.adv.cardId) : undefined,
    verb: cardDef(pick.verb.cardId),
    subjSticker: st(pick.subj),
    advSticker: st(pick.adv),
    verbSticker: st(pick.verb),
  }
}

const isUri = (c: CardDef) => c.grammar === '우리'
const RESTRICTION_ORDER = ['rain', 'heat', 'gust', 'hail', 'drowsy', 'fog', 'calm', 'eclipse', 'blackout']

/** 칸 순서대로의 실효 감정. 뒤섞어는 주어와 동사의 감정을 바꾼다. */
function slotEmotions(r: Resolved): (ScoreEmotion | undefined)[] {
  const out: (ScoreEmotion | undefined)[] = [r.subj.emotion, r.adv?.emotion, r.verb.emotion]
  if (r.adv?.id === 'dwiseok') [out[0], out[2]] = [out[2], out[0]]
  return out
}

const distinct = (es: (ScoreEmotion | undefined)[]) => [...new Set(es.filter((e): e is ScoreEmotion => !!e))]

/** 제약 무시 수: 아무개는·단단히·부숴버렸다(스테이지당 1번). */
function ignoreBudget(r: Resolved, ctx: StageContext): { count: number; usesBuswo: boolean } {
  let count = 0
  if (r.subj.id === 'amugae') count += r.subj.b
  if (r.adv?.id === 'dandan') count += r.adv.b
  const usesBuswo = r.verb.id === 'buswo' && !ctx.oncePerStageUsed.includes('buswo')
  if (usesBuswo) count += r.verb.b
  return { count, usesBuswo }
}

/**
 * 이번 문장에 실제로 걸리는 날씨. 제약 무시는 이 문장을 막는 것부터, 그다음 점수를 깎는 것 순으로 지운다.
 * 보너스 날씨는 지우지 않는다.
 */
function activeWeathers(r: Resolved, ctx: StageContext): { weathers: WeatherDef[]; ignored: string[]; usesBuswo: boolean } {
  const all = ctx.weatherIds.map(weatherDef)
  const { count, usesBuswo } = ignoreBudget(r, ctx)
  if (count <= 0) return { weathers: all, ignored: [], usesBuswo: false }
  const blocking = new Set(all.filter((w) => violation(r, ctx, [w])).map((w) => w.id))
  const restrictive = all
    .filter((w) => w.kind === 'ban' || w.kind === 'restrict')
    .sort((x, y) => {
      const bx = blocking.has(x.id) ? 0 : 1
      const by = blocking.has(y.id) ? 0 : 1
      return bx - by || RESTRICTION_ORDER.indexOf(x.id) - RESTRICTION_ORDER.indexOf(y.id)
    })
  const ignored = restrictive.slice(0, count).map((w) => w.id)
  return { weathers: all.filter((w) => !ignored.includes(w.id)), ignored, usesBuswo: usesBuswo && ignored.length > 0 }
}

/** 날씨 목록에 대해 이 문장을 막는 이유. 없으면 undefined. */
function violation(r: Resolved, ctx: StageContext, weathers: WeatherDef[]): string | undefined {
  const words: [CardDef | undefined, StickerDef | undefined][] = [
    [r.subj, r.subjSticker], [r.adv, r.advSticker], [r.verb, r.verbSticker],
  ]
  const hapil = r.adv?.id === 'hapil'
  for (const w of weathers) {
    if (w.kind === 'ban') {
      for (const [c, s] of words) {
        if (c && c.emotion === w.emotion && !hapil && s?.id !== 'jocha') return `${w.name}: ${c.name} 사용 불가`
      }
    }
    if (w.id === 'drowsy' && r.adv) return `${w.name}: 수식어 칸이 잠김`
    if (w.id === 'gust') {
      const es = slotEmotions(r).filter(Boolean)
      for (const e of distinct(es)) {
        if (es.filter((x) => x === e).length >= w.a) return `${w.name}: 같은 감정 ${w.a}장 금지`
      }
    }
    if (w.id === 'hail') {
      for (const [c] of words) if (c && (ctx.wordUses[c.id] ?? 0) >= w.a) return `${w.name}: ${c.name}은 스테이지에 ${w.a}번까지`
    }
  }
  return undefined
}

/** 문장을 놓을 수 있는지. 막히면 이유를 함께 돌려준다(§5, AGENTS 맥락 원칙: 차단 이유를 화면에 보인다). */
export function validatePick(pick: SentencePick, ctx: StageContext): ValidationResult {
  const r = resolve(pick)
  if (r.subj.slot !== 'subj' || r.verb.slot !== 'verb' || (r.adv && r.adv.slot !== 'adv')) {
    return { ok: false, reason: '칸이 맞지 않음' }
  }
  for (const [c, s] of [[r.subj, r.subjSticker], [r.adv, r.advSticker], [r.verb, r.verbSticker]] as const) {
    if (c && s && s.slot !== c.slot) return { ok: false, reason: `${s.name}은 ${c.name}에 붙지 않음` }
  }
  // 기회가 남아 있으면 비용이 남은 기회를 넘을 수 없다. 기회를 다 쓴 뒤(한 대씩 맞으며)에는 기회 1 동사만.
  const room = Math.max(1, ctx.chancesLeft)
  if (r.verb.cost > room) return { ok: false, reason: `남은 기회 ${ctx.chancesLeft}: 기회 ${r.verb.cost} 동사 잠김` }
  const { weathers } = activeWeathers(r, ctx)
  if (!r.adv && !weathers.some((w) => w.id === 'drowsy')) return { ok: false, reason: '수식어 칸이 비어 있음' }
  const v = violation(r, ctx, weathers)
  return v ? { ok: false, reason: v } : { ok: true }
}

// ── 대성공 ──

export interface CritInfo {
  chance: number
  mult: number
}

export function critInfo(pick: SentencePick, ctx: StageContext, loadout: ScoreLoadout): CritInfo {
  const r = resolve(pick)
  const { weathers } = activeWeathers(r, ctx)
  if (weathers.some((w) => w.id === 'fog')) return { chance: 0, mult: CRIT_MULT }
  let p = CRIT_BASE + loadout.stats.crit + ctx.carry.crit
  if (r.subj.id === 'sinnan') p += r.subj.b
  if (r.adv?.id === 'saljjak') p += r.adv.a
  if (r.adv?.id === 'deulsseok') p += r.adv.a
  if (r.verb.id === 'deonjyeot') p += r.verb.b
  if (r.verbSticker?.id === 'guna') p += r.verbSticker.a
  for (const id of expandRelics(loadout.relics)) if (id === 'dice') p += relicDef(id).a
  p = Math.min(CRIT_CAP, p)
  if (loadout.relics.includes('retry')) p = 1 - (1 - p) * (1 - p)
  let mult = CRIT_MULT
  if (r.adv?.id === 'deulsseok') mult = Math.max(mult, r.adv.b)
  if (r.verb.id === 'ssoaol') mult = Math.max(mult, r.verb.b)
  return { chance: p, mult }
}

/**
 * 유물 줄을 발동 순서로 펼친다. 각주는 왼쪽 이웃을, 줄바꿈은 오른쪽 이웃을 한 번 더 발동한다.
 * 위치 유물끼리는 복제하지 않는다(무한 연쇄 방지).
 */
export function expandRelics(relics: string[]): string[] {
  const out: string[] = []
  relics.forEach((id, i) => {
    if (id === 'footnote') {
      const left = relics[i - 1]
      if (left && left !== 'footnote' && left !== 'linebreak') out.push(left)
    } else if (id === 'linebreak') {
      const right = relics[i + 1]
      if (right && right !== 'footnote' && right !== 'linebreak') out.push(right)
    } else out.push(id)
  })
  return out
}

// ── 문장 계산 ──

interface Walk {
  chips: number
  mult: number
  addPool: number
  subjectAdd: number
  steps: ScoreStep[]
  tearsGain: number
  tearsSpent: number
}

/**
 * 한 문장의 점수. `critRoll`은 0~1 균등 굴림 값(대성공 확률보다 작으면 대성공).
 * 대성공 여부를 먼저 정하는 이유: 「들뜬 우리는」「물음표」처럼 대성공을 조건으로 하는 효과가 배율 중간에 있다.
 */
export function scoreSentence(
  pick: SentencePick,
  ctx: StageContext,
  loadout: ScoreLoadout,
  roller: Roller,
  critRoll: number,
): SentenceResult {
  const r = resolve(pick)
  const stats = loadout.stats
  const { weathers, ignored, usesBuswo } = activeWeathers(r, ctx)
  const has = (id: string) => weathers.some((w) => w.id === id)
  const relics = expandRelics(loadout.relics)
  const ci = critInfo(pick, ctx, loadout)
  const crit = critRoll < ci.chance
  const isFirst = ctx.sentencesUsed === 0
  const isLast = ctx.chancesLeft - r.verb.cost <= 0
  const prev = ctx.history[ctx.history.length - 1]
  const emotions = slotEmotions(r)
  const kinds = distinct(emotions)
  const statOf = (e: ScoreEmotion) => (e === 'chaos' ? 0 : stats[e])
  const statValues = STAT_EMOTIONS.map((e) => stats[e])
  const maxStat = Math.max(...statValues)
  const minStat = Math.min(...statValues)
  const angerWords = emotions.filter((e) => e === 'anger').length
  const sorrowWords = emotions.filter((e) => e === 'sorrow').length
  void sorrowWords

  const w: Walk = { chips: 0, mult: 1, addPool: 0, subjectAdd: 0, steps: [], tearsGain: 0, tearsSpent: 0 }
  let tears = ctx.tears
  const step = (source: string, label: string) => w.steps.push({ source, label, chips: w.chips, mult: w.mult })
  const add = (x: number, source: string, label: string, subject = false) => {
    if (x === 0) return
    w.mult += x
    w.addPool += x
    if (subject) w.subjectAdd += x
    step(source, label)
  }
  const times = (x: number, source: string, label: string) => {
    if (x === 1) return
    w.mult *= x
    step(source, label)
  }
  const chips = (x: number, source: string, label: string) => {
    if (x === 0) return
    w.chips += x
    step(source, label)
  }

  // 0. 바탕: 기본 칩·기본 가산·스테이지 가산·이월.
  chips(stats.baseChips, 'stat', '기본 칩')
  chips(ctx.carry.chips, 'carry', '이월 칩')
  add(stats.baseAdd, 'stat', '기본 가산')
  add(ctx.stageAdd, 'stage', '스테이지 가산')
  add(ctx.carry.add, 'carry', '이월 가산')

  // 1. 동사 칩(칩은 순서와 무관하지만 롤업은 동사 칸에서 보인다).
  const verbChips = (): number => {
    const v = r.verb
    switch (v.id) {
      case 'ttaeryeot': return stats.anger * v.a
      case 'naerichyeot': return stats.anger * (isFirst ? v.a : v.b)
      case 'huryeo': return stats.anger * (w.addPool >= v.c ? v.a : v.b)
      case 'buswo': return stats.anger * v.a
      case 'nallyeo': return stats.anger * v.a
      case 'ureot': return stats.sorrow * v.a
      case 'kkwemaet': return stats.sorrow * v.a + tears * v.b
      case 'samkyeot': return stats.sorrow * v.a
      case 'heullyeo': return stats.sorrow * v.a + tears * v.b
      case 'doesae': return stats.sorrow * v.a + (prev?.score ?? 0) * v.b
      case 'gamssat': return stats.joy * v.a
      case 'pumeot': {
        const other = Math.max(statOf(r.subj.emotion), r.adv ? statOf(r.adv.emotion) : 0)
        return stats.joy * v.a + other * v.b
      }
      case 'teoreo': return stats.joy * v.a
      case 'peotteu': return stats.joy * v.a
      case 'hamkke': return stats.joy * v.a * (isUri(r.subj) ? v.b : 1)
      case 'deonjyeot': return stats.pleasure * v.a
      case 'gullyeot': return stats.pleasure * roller.range(v.a, v.b)
      case 'twinggyeot': return stats.pleasure * v.a
      case 'heundeul': return stats.pleasure * v.a
      case 'ssoaol': return stats.pleasure * v.a
      case 'dwijib': return kinds.length * v.a
      case 'seokk': return ((maxStat + minStat) / 2) * v.a
      case 'heutteu': return maxStat * v.a
      case 'bakkwo': return maxStat * v.a
      case 'dwieong': return minStat * v.a
      default: throw new Error(`동사 효과 없음: ${v.id}`)
    }
  }

  // 감쌌다: 수식어의 가산 효과 +50%. 동사보다 먼저 읽는 수식어에 걸리므로 미리 본다.
  const modAddScale = r.verb.id === 'gamssat' ? 1 + r.verb.b : 1

  const subjectEffect = () => {
    const s = r.subj
    const eclipse = has('eclipse')
    const sAdd = (x: number, label: string) => { if (!eclipse) add(x, 'subj', label, true) }
    switch (s.id) {
      case 'hwanan': sAdd(isFirst ? s.a + s.b : s.a, s.name); break
      case 'matseo': sAdd(s.a, s.name); if (r.verb.emotion === 'anger') chips(s.b, 'subj', s.name); break
      case 'kkeutkkaji': sAdd(isLast ? s.a : s.b, s.name); break
      case 'gyeobip': sAdd(s.a + s.b * angerWords, s.name); break
      case 'naman': sAdd(s.a, s.name); if (kinds.length === 1) times(s.b, 'subj', s.name); break
      case 'eoje': sAdd(prev ? prev.subjectAdd : s.a, s.name); break
      case 'hollo': sAdd(Math.min(s.b, tears * s.a), s.name); break
      case 'gogae': sAdd(s.a, s.name); w.tearsGain += s.b; break
      case 'jinan': sAdd(ctx.sentencesUsed * s.a, s.name); break
      case 'ulmeok': sAdd(s.a, s.name); if (r.verb.emotion === 'sorrow') w.tearsGain += s.b; break
      case 'na': sAdd(s.a, s.name); break
      case 'ttatteut': sAdd(s.a, s.name); break
      case 'utneun': sAdd(s.a, s.name); break
      case 'andohan': sAdd(s.a, s.name); break
      case 'oneul': sAdd(Math.max(0, ctx.chancesLeft) * s.a, s.name); break
      case 'nado': sAdd(s.a, s.name); if (prev?.modifierId) modifierEffect(cardDef(prev.modifierId), '나도: ' + cardDef(prev.modifierId).name); break
      case 'sinnan': sAdd(s.a, s.name); break
      case 'jangnan': sAdd(roller.pick(s.c, s.a, s.b), s.name); break
      case 'deultteun': sAdd(crit ? s.a * s.b : s.a, s.name); break
      case 'uyeon': sAdd(s.a, s.name); break
      case 'natseon': sAdd(s.a * kinds.length, s.name); break
      case 'ireum': sAdd(s.a, s.name); if (emotions.filter((e) => e === 'chaos').length >= 2) times(s.b, 'subj', s.name); break
      case 'geokkuro': sAdd(s.a, s.name); break
      case 'amugae': sAdd(s.a, s.name); break
      case 'sebeon': sAdd(kinds.length >= 3 ? s.a : 0, s.name); break
      default: throw new Error(`주어 효과 없음: ${s.id}`)
    }
    const st = r.subjSticker
    if (st && !eclipse) {
      if (st.id === 'do') add(w.subjectAdd * (st.a - 1), 'sticker', st.name, true)
      if (st.id === 'kkaji') add(Math.max(0, ctx.chancesLeft) * st.a, 'sticker', st.name, true)
      if (st.id === 'majeo' && isLast) add(w.subjectAdd * (st.a - 1), 'sticker', st.name, true)
    }
    if (st?.id === 'man' && kinds.length === 1) times(st.a, 'sticker', st.name)
  }

  function modifierEffect(m: CardDef, label = m.name) {
    const mAdd = (x: number) => add(x * modAddScale, 'adv', label)
    switch (m.id) {
      case 'himkkeot': mAdd(m.a + m.b * (ctx.angerWordsUsed + angerWords)); break
      case 'naepda': if (isFirst) times(m.a, 'adv', label); break
      case 'michin': mAdd(m.a * w.subjectAdd); break
      case 'ipan': if (isLast) times(m.a, 'adv', label); break
      case 'geochil': chips(m.a, 'adv', label); break
      case 'kkuk': w.tearsGain += m.a; chips(m.b, 'adv', label); break
      case 'nunmul': chips(stats.sorrow * m.a, 'adv', label); break
      case 'motda': mAdd(Math.max(0, ctx.chancesLeft - r.verb.cost) * m.a); break
      case 'sseulsseul': chips((prev?.score ?? 0) * m.a, 'adv', label); break
      case 'aesseo':
        if (tears - w.tearsSpent >= m.a) { w.tearsSpent += m.a; times(m.b, 'adv', label) }
        break
      case 'dandan': mAdd(m.a); break
      case 'hwanhage': mAdd(emotions[0] !== emotions[2] ? m.a : m.b); break
      case 'pogeun': break // 공명 단계에서 처리
      case 'bangap': mAdd(prev && kinds.some((e) => prev.emotions.includes(e)) ? m.a : 0); break
      case 'useum': break // 동사 칩 단계에서 처리
      case 'saljjak': break // 대성공 확률
      case 'jaeppal': break // 기회 환급
      case 'sinnage': times(roller.pick(m.c, m.a, m.b), 'adv', label); break
      case 'deulsseok': break // 대성공 확률·배율
      case 'gyeongkwae': break // 대성공 뒤 스테이지 가산
      case 'jemeot': mAdd(m.a); break
      case 'dwiseok': break // 감정 교환
      case 'igeot': mAdd(distinct([...ctx.emotionsUsed, ...emotions]).length * m.a); break
      case 'gapjagi': if (prev && !kinds.some((e) => prev.emotions.includes(e))) times(m.a, 'adv', label); break
      case 'hapil': mAdd(m.a); break
      default: throw new Error(`수식어 효과 없음: ${m.id}`)
    }
  }

  const advEffect = () => {
    if (!r.adv) return
    const reads = r.subj.id === 'ttatteut' ? 2 : 1
    for (let i = 0; i < reads; i++) modifierEffect(r.adv, i ? `${r.adv.name} (두 번 읽기)` : r.adv.name)
    const st = r.advSticker
    if (st?.id === 'ge') add(st.a, 'sticker', st.name)
    if (st?.id === 'deut') add(w.subjectAdd * st.a, 'sticker', st.name)
  }

  const verbEffect = () => {
    let vc = verbChips()
    if (r.verb.id === 'heullyeo' && tears > 0) {
      times(1 + tears * r.verb.c, 'verb', r.verb.name)
    }
    // 웃으며·-며: 동사를 한 번 더 발동.
    if (r.adv?.id === 'useum') vc *= r.adv.a * (r.subj.id === 'ttatteut' ? r.adv.a : 1)
    if (r.advSticker?.id === 'myeo') vc *= r.advSticker.a
    chips(vc, 'verb', r.verb.name)
    if (r.verb.id === 'bakkwo') times(r.verb.b, 'verb', r.verb.name)
    const st = r.verbSticker
    if (st?.id === 'ja' && isUri(r.subj)) times(st.a, 'sticker', st.name)
    if (st?.id === 'lgeot' && !isLast) times(st.a, 'sticker', st.name)
    if (st?.id === 'beoryeot' && isLast) times(st.a, 'sticker', st.name)
  }

  // 2. 칸 순서대로 계산. 제멋대로는 오른쪽에서 왼쪽.
  const order = r.adv?.id === 'jemeot' ? [verbEffect, advEffect, subjectEffect] : [subjectEffect, advEffect, verbEffect]
  for (const f of order) f()

  // 3. 감정 공명.
  if (!has('calm')) {
    const counts = new Map<ScoreEmotion, number>()
    emotions.forEach((e) => {
      if (!e) return
      const weight = e === 'joy' && relics.includes('sunlight') ? relicDef('sunlight').a : 1
      counts.set(e, (counts.get(e) ?? 0) + weight)
    })
    let best = Math.max(0, ...counts.values())
    // 웃는 나는: 주어 한 장이 어떤 감정으로도 침(나머지 칸 중 가장 많은 감정 + 1).
    if (r.subj.id === 'utneun') {
      const rest = new Map<ScoreEmotion, number>()
      emotions.slice(1).forEach((e) => { if (e) rest.set(e, (rest.get(e) ?? 0) + 1) })
      best = Math.max(best, Math.max(0, ...rest.values()) + 1)
    }
    // 거꾸로 선 나는: 한 단어가 다른 칸 감정을 따라감(감정이 둘 이상일 때만 의미가 있다).
    if (r.subj.id === 'geokkuro' && kinds.length > 1) best += 1
    if (r.adv?.id === 'pogeun') best += r.adv.a * (r.subj.id === 'ttatteut' ? 2 : 1)
    const level = Math.min(3, Math.floor(best))
    times(RESONANCE[level], 'resonance', `감정 공명 ${level}장`)
  }

  // 4. 새 물감(§15).
  const fresh = kinds.filter((e) => !ctx.emotionsUsed.includes(e)).length
  times(Math.pow(NEW_PAINT_MULT, fresh), 'paint', `새 물감 ${fresh}색`)

  // 5. 형태·날씨·문장 사이 배율.
  const f = formDef(ctx.formId)
  const sharesPrev = !!prev && kinds.some((e) => prev.emotions.includes(e))
  const allDiffer = !!prev && !kinds.some((e) => prev.emotions.includes(e))
  if (f.id === 'chain' && sharesPrev) times(f.a, 'form', f.name)
  if (f.id === 'bazaar' && kinds.length >= 3) times(f.a, 'form', f.name)
  for (const wd of weathers) {
    if (wd.id === 'sunset' && isLast) times(wd.a, 'weather', wd.name)
    if (wd.id === 'thunder' && isFirst) times(wd.a, 'weather', wd.name)
    if (wd.id === 'aurora' && kinds.length >= 3) times(wd.a, 'weather', wd.name)
    if (wd.id === 'rainbow' && allDiffer) times(wd.a, 'weather', wd.name)
    if (wd.id === 'weakday' && ctx.weakness && (kinds.includes(ctx.weakness) || r.verb.id === 'bakkwo')) times(wd.a, 'weather', wd.name)
  }
  times(ctx.carry.mult, 'carry', '예고')
  if (ctx.carry.askEmotion && emotions[0] === ctx.carry.askEmotion) times(ctx.carry.askMult, 'carry', '의문')

  // 6. 유물 줄(왼쪽 → 오른쪽).
  let postAdd = 0
  const prevScore = prev?.score ?? 0
  for (const id of relics) {
    const d = relicDef(id)
    switch (id) {
      case 'comma': chips(d.a, 'relic', d.name); break
      case 'period': if (isLast) chips(d.a, 'relic', d.name); break
      case 'lead': chips(maxStat * d.a, 'relic', d.name); break
      case 'underline': add(d.a, 'relic', d.name); break
      case 'paren': add(w.subjectAdd * d.a, 'relic', d.name); break
      case 'brazier': add((ctx.sentencesUsed + 1) * d.a, 'relic', d.name); break
      case 'exclaim': times(d.a, 'relic', d.name); break
      case 'question': if (crit) times(d.a, 'relic', d.name); break
      case 'quote': postAdd += prevScore * d.a; break
      case 'bookmark': if (isLast && ctx.firstScore != null && !isFirst) postAdd += ctx.firstScore * d.a; break
      case 'ember': if (isFirst && angerWords > 0) chips(d.a, 'relic', d.name); break
      case 'kaleido': if (kinds.length >= 3) times(d.a, 'relic', d.name); break
      default: break // 문장 밖에서 작동하거나(일기장·저금통 등) 3차 구현 대상(겹주어·겹동사).
    }
  }
  if (has('snow')) postAdd += prevScore * weatherDef('snow').a

  // 7. 증폭·대성공.
  const amp = 1 + stats.amp
  const critMult = crit ? ci.mult : 1
  let score = w.chips * w.mult * amp * critMult
  if (crit && relics.includes('echo')) score *= 1 + relicDef('echo').a
  score = Math.round(score + postAdd)

  // 8. 문장 뒤 상태.
  if (has('drizzle')) w.tearsGain += weatherDef('drizzle').a
  if (r.verb.id === 'ureot' || r.verb.id === 'samkyeot') w.tearsGain += r.verb.b
  let stageAddGain = 0
  if (r.verb.id === 'heutteu') w.tearsGain += r.verb.b * kinds.length
  let tearsAfter = tears - w.tearsSpent
  if (r.verb.id === 'heullyeo') tearsAfter = Math.floor(tearsAfter * r.verb.d)
  tearsAfter += w.tearsGain
  if (r.adv?.id === 'gyeongkwae' && crit) stageAddGain += r.adv.a

  const carry: CarryState = { ...EMPTY_CARRY }
  if (r.subj.id === 'andohan') carry.add += w.addPool * r.subj.b
  if (r.advSticker?.id === 'go') carry.add += w.addPool * r.advSticker.a
  if (r.verb.id === 'teoreo') carry.add += r.verb.b
  if (r.verb.id === 'peotteu') carry.chips += w.chips * r.verb.b
  if (r.verbSticker?.id === 'lgeot' && !isLast) carry.mult = r.verbSticker.b
  if (r.advSticker?.id === 'daga' && crit) carry.crit += r.advSticker.a
  if (r.verbSticker?.id === 'lkka') { carry.askEmotion = emotions[2]; carry.askMult = r.verbSticker.a }

  const onceUsed: string[] = []
  let refund = 0
  if (usesBuswo) onceUsed.push('buswo')
  if (crit && r.adv?.id === 'jaeppal' && !ctx.oncePerStageUsed.includes('jaeppal')) { refund = r.verb.cost; onceUsed.push('jaeppal') }
  if (crit && r.verb.id === 'twinggyeot' && !ctx.oncePerStageUsed.includes('twinggyeot') && refund === 0) { refund = 1; onceUsed.push('twinggyeot') }
  const blackout = has('blackout')
  const freeSwaps = r.subj.id === 'uyeon' && !blackout ? r.subj.b : 0
  const redrawHand = r.verb.id === 'heundeul' && crit && !blackout

  const record: SentenceRecord = {
    score, chips: w.chips, addPool: w.addPool, subjectAdd: w.subjectAdd, emotions: kinds, slotEmotions: emotions,
    modifierId: r.adv?.id, wordIds: [r.subj.id, ...(r.adv ? [r.adv.id] : []), r.verb.id], crit, cost: r.verb.cost,
  }
  void ignored
  return {
    score, chips: w.chips, mult: w.mult, amp, crit, critChance: ci.chance, critMult: ci.mult,
    addPool: w.addPool, subjectAdd: w.subjectAdd, steps: w.steps, tearsAfter, carry, stageAddGain,
    chanceSpent: Math.max(0, r.verb.cost - refund), freeSwaps, redrawHand, onceUsed, record,
  }
}

/** 기댓값 점수(미리보기·써 보기·봇). 대성공은 두 갈래를 확률로 섞고, 무작위 효과는 평균을 쓴다. */
export function expectedScore(pick: SentencePick, ctx: StageContext, loadout: ScoreLoadout): number {
  const { chance } = critInfo(pick, ctx, loadout)
  const hit = chance > 0 ? scoreSentence(pick, ctx, loadout, expectedRoller, 0).score : 0
  const miss = chance < 1 ? scoreSentence(pick, ctx, loadout, expectedRoller, 1).score : 0
  return chance * hit + (1 - chance) * miss
}
