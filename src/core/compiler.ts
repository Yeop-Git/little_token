/**
 * 컴파일러 ★핵심. 순수함수 — RNG 없음, 전역 상태 참조 없음.
 * variance는 적용하지 않고 그대로 넘긴다(시뮬이 굴린다) → 전수 검사 가능.
 *
 * 슬롯을 하드코딩하지 않고 template.slots 순서/역할을 따라 계산하므로
 * 슬롯을 4칸/6칸으로 바꿔도 컴파일러는 그대로 동작한다.
 */

import { emotionResonanceFor } from './combatRules'
import { eul } from './josa'
import { DOUBT_RANGE, DOUBT_SUFFIX } from './passives'
import { EMOTION_LABEL, emotionOrNeutral, type Combo, type CompileMods, type Emotion, type Intent, type IntentPart, type Selection, type StatBlock, type StatName, type Tables, type TargetCount, type Word } from './types'
import { currentLocale } from '@/localization'
import { localizedWordText } from '@/localization/content'

export const isDamageIntent = (intent: Pick<Intent, 'kind'>): boolean =>
  intent.kind !== 'heal' && intent.kind !== 'guard'

// 스탯이 없는 호출(전수 검사 도구 등)에서 쓰는 중립 스탯 — 계수를 그대로 읽는다.
export const NEUTRAL_STATS: StatBlock = { atk: 1, guard: 1, heal: 1, luck: 0 }

// 스탯 표기 이름 — 카드/집계판에서 "공격 ×1"처럼 그대로 쓴다.
export const STAT_NAME: Record<StatName, string> = currentLocale === 'en'
  ? { atk: 'Attack', guard: 'Guard', heal: 'Heal', luck: 'Luck' }
  : currentLocale === 'ja'
    ? { atk: '攻撃', guard: '防御', heal: '回復', luck: '運' }
    : currentLocale === 'ru'
      ? { atk: 'Атака', guard: 'Защита', heal: 'Лечение', luck: 'Удача' }
      : currentLocale === 'zh-Hans'
        ? { atk: '攻击', guard: '防御', heal: '恢复', luck: '幸运' }
        : currentLocale === 'zh-Hant'
          ? { atk: '攻擊', guard: '防禦', heal: '恢復', luck: '幸運' }
          : { atk: '공격', guard: '방어', heal: '회복', luck: '운' }

const CORE_TEXT = currentLocale === 'en'
  ? { pool:'Multiplier pool', shoe:'Heavy Shoe', perfect:'Perfect context', mismatch:'Mismatch', bbq:'Barbecue', kills:'Grows with defeated enemies', resonance:'resonance', sameEmotion:'matching emotions' }
  : currentLocale === 'ja'
    ? { pool:'倍率プール', shoe:'重い靴', perfect:'完璧な文脈', mismatch:'不一致', bbq:'バーベキュー', kills:'倒した敵の数だけ強くなる', resonance:'共鳴', sameEmotion:'同じ感情' }
    : currentLocale === 'ru'
      ? { pool:'Пул множителя', shoe:'Тяжёлая туфля', perfect:'Идеальный контекст', mismatch:'Несоответствие', bbq:'Барбекю', kills:'Усиливается за побеждённых врагов', resonance:'резонанс', sameEmotion:'одинаковых эмоций' }
      : currentLocale === 'zh-Hans'
        ? { pool:'倍率池', shoe:'沉重鞋子', perfect:'完美语境', mismatch:'不匹配', bbq:'烧烤', kills:'随消灭敌人数增强', resonance:'共鸣', sameEmotion:'相同情绪' }
        : currentLocale === 'zh-Hant'
          ? { pool:'倍率池', shoe:'沉重鞋子', perfect:'完美語境', mismatch:'不匹配', bbq:'燒烤', kills:'隨消滅敵人數增強', resonance:'共鳴', sameEmotion:'相同情緒' }
          : { pool:'배율 풀', shoe:'무거운 구두', perfect:'완벽한 맥락', mismatch:'어긋남', bbq:'바베큐', kills:'잡은 만큼 세진다', resonance:'공명', sameEmotion:'같은 감정' }

const sameEmotionHint = (count: number): string => currentLocale === 'ko'
  ? `${CORE_TEXT.sameEmotion} ${count}장`
  : currentLocale === 'en'
    ? `${CORE_TEXT.sameEmotion} ${count} cards`
    : currentLocale === 'ru'
      ? `${CORE_TEXT.sameEmotion}: ${count}`
      : `${CORE_TEXT.sameEmotion} ${count}枚`

// 단어 하나가 만드는 깡수치. 스탯 비례 단어는 "스탯 × 계수", 아니면 고정 위력.
// 성냥팔이 소녀의 망토(verbLuck)를 들면 어떤 동사든 운 스탯만큼을 더 받는다.
export function wordFlat(w: Word, stats: StatBlock, mods: CompileMods = {}): number {
  const base = w.stat && w.statMult != null ? Math.round(stats[w.stat] * w.statMult) : w.power || 0
  // 깡수치를 내는 단어(동사·목적어)에만 운을 얹는다. 주어·수식은 애초에 0이라 대상이 아니다.
  const luck = mods.verbLuck && (w.stat != null || w.power) ? stats.luck : 0
  return Math.max(0, base + luck)
}

// 스탯이 곧 위력이라 별도 가산은 없다. 위력 0인 문장(주어만 고른 상태)은 피해도 0이다.
export const effectiveBase = (intent: Pick<Intent, 'kind' | 'base'>): number =>
  !isDamageIntent(intent) || intent.base <= 0 ? 0 : intent.base

// 선택된 단어들의 tag를 전부 모아 멀티셋으로 관용구를 매칭.
export function matchCombos(sel: Selection, combos: Combo[], order: string[]): Combo[] {
  const pool = order.flatMap((k) => (sel[k] ? sel[k]!.tags : []))
  return combos.filter((c) => {
    const rest = [...pool]
    return c.need.every((n) => {
      const i = rest.indexOf(n)
      if (i < 0) return false
      rest.splice(i, 1)
      return true
    })
  })
}

/**
 * 이 단어가 열어 두는 맥락 — 태그가 관용구의 필요 태그를 하나라도 채우면 후보다.
 * `missing`은 아직 비어 있는 필요 태그(멀티셋)이라 "무엇과 같이 써야 터지는지"가 된다.
 *
 * 태그로 붙는 맥락 접근권은 카드 수치에 안 적히는 숨은 값이었다. 같은 등급·같은
 * 수치인 카드의 차이가 여기서만 갈리는데 화면에 없으면 플레이어는 알 수가 없으므로,
 * 카드 상세가 이 목록을 그대로 내건다("숨은 정답 금지").
 */
export interface ComboLead {
  combo: Combo
  missing: string[]
}
export function comboLeads(w: Word, combos: Combo[]): ComboLead[] {
  const leads: ComboLead[] = []
  for (const c of combos) {
    const rest = [...c.need]
    let used = 0
    for (const tag of w.tags) {
      const i = rest.indexOf(tag)
      if (i < 0) continue
      rest.splice(i, 1)
      used++
    }
    if (used > 0) leads.push({ combo: c, missing: rest })
  }
  return leads.sort((a, b) => a.missing.length - b.missing.length || b.combo.mult - a.combo.mult)
}

// 완성 문장 토큰 배열(빈 슬롯은 '____'). josa 슬롯만 조사 부착.
// 다만 무럭무럭은 문장 성분이 아니라 그냥 자라는 카드다. 목적어 칸에서 "무럭무럭을"이
// 되면 여러 칸에 겹쳤을 때의 말맛("무럭무럭 무럭무럭 무럭무럭")이 죽으므로 그대로 둔다.
export function sentenceTokens(sel: Selection, t: Tables): string[] {
  return t.template.slots.map((s) => {
    const w = sel[s.key]
    if (!w) return '____'
    const text = localizedWordText(w)
    if (!s.josa || w.growHp) return text
    if (currentLocale === 'ko') return eul(text)
    if (currentLocale === 'ja') return `${text}を`
    return text
  })
}

// 토큰을 문장으로 — attach 슬롯(문장부호)은 앞 단어에 공백 없이 붙인다.
export function joinTokens(tokens: string[], t: Tables): string {
  return tokens.reduce((out, tok, i) => {
    if (!out) return tok
    return t.template.slots[i]?.attach || currentLocale === 'ja' || currentLocale === 'zh-Hans' || currentLocale === 'zh-Hant'
      ? out + tok
      : `${out} ${tok}`
  }, '')
}

/** 이 태그가 붙은 문장은 선공 상대보다 먼저 행동한다(문장부호 '!'). */
export const PREEMPT_TAG = 'preempt'

const roleOf = (t: Tables, key: string) => t.template.slots.find((s) => s.key === key)?.role

export function compile(
  sel: Selection,
  t: Tables,
  stats: StatBlock = NEUTRAL_STATS,
  mods: CompileMods = {},
): Intent {
  const order = t.template.slots.map((s) => s.key)
  const combos = matchCombos(sel, t.combos, order)
  // 피노키오의 미아핑 — 문장을 끝까지 완성했을 때만 끝에 "…근데?"가 붙는다.
  const complete = order.length > 0 && order.every((k) => !!sel[k])
  const doubting = !!mods.doubt && complete

  // base = object/verb 깡수치 합, bonusPool = subject/ending bonus 합.
  let base = 0
  let statGuard = 0 // 방어 동사가 스탯에서 뽑아낸 수치
  let statHeal = 0 // 회복 동사가 스탯에서 뽑아낸 수치
  let bonusPool = 0
  let critP = 0 // 규칙 카드의 대성공 확률 합
  let failP = 0 // 폐지된 실패 확률 합
  let statKey: Intent['statKey'] = null
  let kind: Intent['kind'] = 'attack'
  let damageKind: Intent['kind'] | null = null
  let growHp = 0
  const bonusFrom: string[] = [] // 보너스 풀에 기여한 단어 이름(집계판 힌트용)
  let targetMode: Intent['targetMode'] = 'enemy'
  let aoe: Intent['aoe'] = 'single'
  let targetCount: TargetCount = 1
  let timing: Intent['timing'] = 'immediate'
  let variance: Intent['variance'] = null
  const flats: IntentPart[] = []
  const mults: IntentPart[] = []

  for (const key of order) {
    const w = sel[key]
    if (!w) continue
    const role = roleOf(t, key)
    // 무럭무럭은 문장에 아무 기여도 하지 않고 자라기만 한다 — 카드 문구 그대로
    // 배율도 깡수치도 받지 않는다. 어느 칸에나 들어가므로 여기서 끊지 않으면
    // 칸 역할에 붙는 아이템 효과(백설공주의 구두·빨간망토의 성냥·성냥팔이 망토)를
    // 그대로 받아 "자라면서 때리는" 카드가 된다.
    if (w.growHp) {
      growHp += w.growHp
      continue
    }
    if (role === 'object' || role === 'verb') {
      // 동사의 깡수치는 스탯에서 나온다 — 공격이면 위력, 방어/회복이면 그쪽 수치로.
      const flat = wordFlat(w, stats, mods)
      if (flat > 0) {
        const hint = w.stat && w.statMult != null ? `${STAT_NAME[w.stat]} ×${w.statMult}` : undefined
        const lane = w.kind === 'guard' ? 'guard' : w.kind === 'heal' ? 'heal' : 'damage'
        flats.push({ label: w.text, value: flat, source: w.stat ? 'stat' : 'word', hint, lane })
        if (lane === 'guard') statGuard += flat
        else if (lane === 'heal') statHeal += flat
        else base += flat
      }
    } else {
      // 빨간망토의 성냥 — 배율 역할 칸은 채워질 때마다 보너스를 조금씩 더 얹는다.
      // 칸이 늘어나는 아이템(겹주어·문장부호)과 곱하기로 붙는 게 아니라 칸 수만큼 쌓인다.
      const extra = mods.bonusEach ?? 0
      const bonus = (w.bonus || 0) + extra
      bonusPool += bonus
      if (bonus) bonusFrom.push(w.text)
    }
    critP += w.crit || 0
    failP += w.fail || 0
    // 확장 수식어가 룰렛 기준 스탯을 지정할 수 있다. 일반 수식어는 전술 기능 전용이다.
    if (role === 'modifier' && w.stat) statKey = w.stat

    // 동사가 둘일 수 있다(맛동사). 뒤 동사가 앞 동사를 덮어쓰되, 피해를 내는
    // 동사가 하나라도 있으면 문장은 공격 문장으로 확정한다 — 안 그러면 회복
    // 동사가 뒤에 왔다는 이유로 앞 동사의 깡수치가 통째로 버려진다.
    if (role === 'verb' && w.kind) {
      kind = w.kind
      if (w.kind !== 'guard' && w.kind !== 'heal') damageKind = w.kind
    }
    if (role === 'subject') {
      if (w.targetMode) targetMode = w.targetMode
    }
    if (w.aoe) aoe = w.aoe // subject/verb 어느 쪽이든 지정하면 채택
    if (w.targetCount) targetCount = w.targetCount
    if (w.aoe === 'all') targetCount = 'all'
    // 도박 범위(×하한~×상한)는 어느 슬롯이든 가질 수 있다 — 배율이 낮은 카드에
    // "가끔 크게 터진다"는 메리트를 붙여 주는 장치다. 뒤 슬롯이 지정하면 그쪽으로 덮인다.
    if (w.variance) variance = w.variance
    if (role === 'ending' && w.timing) timing = w.timing
  }

  // 보너스 풀은 가산이다 — 단어마다 칩을 하나씩 세우면 화면이 곱셈으로 읽히고
  // (1+0.2)×(1+0.15) ≠ 1+0.35 만큼 집계판이 실제 피해와 어긋난다. 한 칩으로 합쳐 세운다.
  if (bonusPool) {
    mults.push({ label: CORE_TEXT.pool, value: 1 + bonusPool, source: 'word', hint: bonusFrom.join(' · ') })
  }

  // 백설공주의 구두 — 피해 동사가 하나라도 있으면 문장 끝에 고정 깡수치를 한 번 얹는다.
  // 동사마다가 아니라 문장당 한 번이라 겹동사와 곱해져 폭발하지 않는다.
  if (base > 0 && mods.verbFlat) {
    base += mods.verbFlat
    flats.push({ label: CORE_TEXT.shoe, value: mods.verbFlat, source: 'word', lane: 'damage' })
  }

  // 피해 깡수치가 실제로 쌓였으면 회복/방어 동사가 뒤에 와도 공격 문장이다.
  if (base > 0 && damageKind) kind = damageKind

  const comboMult = combos.reduce((m, c) => m * c.mult, 1)
  for (const c of combos) mults.push({ label: `「${c.name}」`, value: c.mult, source: 'combo', hint: CORE_TEXT.perfect })

  // 부조화(맥락 어긋남) 패널티 — 안 맞는 태그 쌍이 있으면 위력을 깎는다("틀린 문장").
  const allTags = order.flatMap((k) => (sel[k] ? sel[k]!.tags : []))
  let coherence = 1
  const penalties: string[] = []
  for (const d of t.dissonances ?? []) {
    if (allTags.includes(d.a) && allTags.includes(d.b)) {
      coherence *= d.penalty
      penalties.push(d.reason)
      mults.push({ label: CORE_TEXT.mismatch, value: d.penalty, source: 'coherence', hint: d.reason })
    }
  }

  // 아기돼지 바베큐 — 이번 전투에서 잡은 수만큼 문장 전체가 세진다.
  const stageMult = mods.stageMult ?? 1
  if (stageMult !== 1) mults.push({ label: CORE_TEXT.bbq, value: stageMult, source: 'combo', hint: CORE_TEXT.kills })

  // 천장 없음 — 배율은 상한 없이 곱해진다(벌레 스웜을 오버킬로 관통하는 쾌감).
  // 등급제 폐지 — 희귀도 보너스 없음(다양성 + 반복강화로 대체 예정).
  const emotions = order.flatMap((key) => {
    const emotion = emotionOrNeutral(sel[key]?.emotion)
    return emotion === 'neutral' ? [] : [emotion]
  })
  const emotionCounts = new Map<Emotion, number>()
  emotions.forEach((emotion) => emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + 1))
  const repeatedEmotion = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1])[0]
  const emotionResonance = emotionResonanceFor(repeatedEmotion?.[1] ?? 0)
  if (emotionResonance !== 1) {
    mults.push({
      label: `${EMOTION_LABEL[repeatedEmotion![0]]} ${CORE_TEXT.resonance}`,
      value: emotionResonance,
      source: 'emotion',
      hint: sameEmotionHint(repeatedEmotion![1]),
    })
  }

  const multiplier = (1 + bonusPool) * comboMult * coherence * stageMult * emotionResonance

  const sumEffect = (k: keyof NonNullable<Word['effects']>) =>
    order.reduce((n, key) => {
      const value = sel[key]?.effects?.[k]
      return n + (typeof value === 'number' ? value : 0)
    }, 0)

  const sentence = joinTokens(sentenceTokens(sel, t), t)

  return {
    sentence: doubting ? `${sentence} ${DOUBT_SUFFIX}` : sentence,
    targetMode,
    aoe,
    targetCount,
    kind,
    preempt: allTags.includes(PREEMPT_TAG),
    base,
    multiplier,
    variance,
    timing,
    guard: sumEffect('guard') + statGuard,
    heal: sumEffect('heal') + statHeal,
    recoil: sumEffect('recoil'),
    evade: sumEffect('evade'),
    pierceGuard: order.some((key) => !!sel[key]?.effects?.pierceGuard),
    hitCount: Math.max(1, ...order.map((key) => sel[key]?.effects?.hitCount ?? 1)),
    castCount: Math.max(1, ...order.map((key) => sel[key]?.effects?.castCount ?? 1)),
    castScale: Math.min(1, ...order.map((key) => sel[key]?.effects?.castScale ?? 1)),
    overdrawHitCount: Math.max(0, ...order.map((key) => sel[key]?.effects?.overdrawHitCount ?? 0)),
    counterMultiplier: Math.max(0, ...order.map((key) => sel[key]?.effects?.counterMultiplier ?? 0)),
    enemyAttackDown: sumEffect('enemyAttackDown'),
    drawCards: sumEffect('drawCards'),
    emotions,
    emotionResonance,
    tags: allTags,
    combos: combos.map((c) => c.name),
    coherence,
    penalties,
    critP,
    failP,
    statKey,
    growHp,
    // 맥락 수와 무관하게 문장 하나당 한 번 — 항상 붙는 고정 맥락이다.
    doubtCount: doubting ? 1 : 0,
    breakdown: { flats, mults },
  }
}

/** Activates the explicitly disclosed reward for paying health through Ink overdraw. */
export function withOverdrawEffects(intent: Intent, healthPaid: number): Intent {
  if (healthPaid <= 0 || intent.overdrawHitCount <= 0 || intent.base <= 0) return intent
  return { ...intent, hitCount: intent.hitCount + intent.overdrawHitCount }
}

// 룰렛 계수와 확률 보정 상수. 값은 임시 — 플레이 테스트로 다듬는다.
export const ROULETTE = { crit: 1.5, fail: 0.25 } as const
export const LUCK_MULT = 0.02 // 운 1당 기본 배율 +2% (그리 드라마틱하지 않게)
export const CRIT_STAT_K = 0.01 // 맥락 스탯 1당 대성공 +1%
const FAIL_STAT_K = 0.01 // 맥락 스탯 1당 실패 −1%
export const CRIT_CAP = 0.6 // 아무리 높아도 대성공은 60%에서 수렴(실패가 없어진 만큼 천장을 올렸다)
const FAIL_FLOOR = 0.05 // 실패는 0%로 수렴하지 않는다

export type RouletteOutcome = 'crit' | 'normal' | 'fail'
export interface MultContext {
  luck: number
  statBias: number // 수식이 지정한 스탯(단단히→방어, 힘껏→공격). 없으면 맥락(kind)으로 결정
}

// 룰렛을 밀어 줄 스탯 — 수식이 지정했으면 그것, 아니면 문장의 맥락(공격/회복/방어)을 따른다.
export function statBiasOf(intent: Pick<Intent, 'statKey' | 'kind'>, stats: StatBlock): number {
  if (intent.statKey) return stats[intent.statKey]
  if (intent.kind === 'heal') return stats.heal
  if (intent.kind === 'guard') return stats.guard
  return stats.atk
}
export interface ResolvedMult {
  mult: number
  outcome: RouletteOutcome
  critP: number
  failP: number
  /** 배율 분해 — 화면에서 "무엇이 몇 배를 줬는지" 그대로 늘어놓으려고 쪼개 둔다. */
  parts: { variance: number; luck: number; roulette: number; doubt: number }
  /** 피노키오의 미아핑 — 맥락마다 굴린 "근데?" 배율. 없으면 빈 배열. */
  doubtRolls: number[]
}

/**
 * 피노키오의 미아핑 — 맥락 하나당 ×1.00 ~ ×1.30을 따로 굴려 전부 곱한다.
 * 굴림값은 밖에서 받는다(컴파일러/이 함수 모두 RNG를 쓰지 않는다).
 */
export function doubtMults(intent: Pick<Intent, 'doubtCount'>, rolls: number[]): number[] {
  return Array.from({ length: intent.doubtCount }, (_, i) =>
    Math.round((1 + (rolls[i] ?? 0) * DOUBT_RANGE) * 100) / 100,
  )
}

// 스탯 보정된 룰렛 확률. 기본 실패가 0이면 0을 유지(무실패 수식은 계속 안전).
export function rouletteOdds(intent: Intent, statBias: number): { critP: number; failP: number } {
  const critP = Math.min(CRIT_CAP, intent.critP + statBias * CRIT_STAT_K)
  const failP = intent.failP > 0 ? Math.max(FAIL_FLOOR, intent.failP - statBias * FAIL_STAT_K) : 0
  return { critP, failP }
}

// 최종 배율 확정 — 기본배율 × variance × 운 × 룰렛. 천장 없음.
// 공격/회복/방어 모든 산출이 이 하나의 배율을 공유한다(한 문장 한 번의 굴림).
export function resolveMultiplier(
  intent: Intent,
  ctx: MultContext,
  rouletteRoll: number,
  varRoll: number | null = null,
  doubtRolls: number[] = [],
): ResolvedMult {
  let m = intent.multiplier
  const variance = intent.variance && varRoll !== null ? (varRoll < intent.variance.p ? intent.variance.hi : intent.variance.lo) : 1
  m *= variance
  const luck = 1 + ctx.luck * LUCK_MULT // 운은 기본 배율 요소
  m *= luck
  const { critP, failP } = rouletteOdds(intent, ctx.statBias)
  let outcome: RouletteOutcome = 'normal'
  let roulette = 1
  if (rouletteRoll < critP) {
    roulette = ROULETTE.crit
    outcome = 'crit'
  } else if (rouletteRoll > 1 - failP) {
    roulette = ROULETTE.fail
    outcome = 'fail'
  }
  m *= roulette
  // 피노키오의 미아핑 — 맥락마다 붙는 "근데?"는 룰렛과 별개로 곱해진다.
  const rolls = doubtMults(intent, doubtRolls)
  const doubt = rolls.reduce((a, b) => a * b, 1)
  m *= doubt
  return { mult: m, outcome, critP, failP, parts: { variance, luck, roulette, doubt }, doubtRolls: rolls }
}

// sweep 전용 — variance만 적용한 기본 배율 분포(룰렛/운 제외, 천장 없음).
export function finalMultiplier(intent: Intent, roll: number | null = null): number {
  let m = intent.multiplier
  if (intent.variance && roll !== null) m *= roll < intent.variance.p ? intent.variance.hi : intent.variance.lo
  return m
}
