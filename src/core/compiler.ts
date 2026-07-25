/**
 * 컴파일러 ★핵심. 순수함수 — RNG 없음, 전역 상태 참조 없음.
 * variance는 적용하지 않고 그대로 넘긴다(시뮬이 굴린다) → 전수 검사 가능.
 *
 * 슬롯을 하드코딩하지 않고 template.slots 순서/역할을 따라 계산하므로
 * 슬롯을 4칸/6칸으로 바꿔도 컴파일러는 그대로 동작한다.
 */

import { eul } from './josa'
import { DOUBT_RANGE } from './passives'
import type { Combo, CompileMods, Intent, IntentPart, Selection, StatBlock, StatName, Tables, Word } from './types'

export const isDamageIntent = (intent: Pick<Intent, 'kind'>): boolean =>
  intent.kind !== 'heal' && intent.kind !== 'guard'

// 스탯이 없는 호출(전수 검사 도구 등)에서 쓰는 중립 스탯 — 계수를 그대로 읽는다.
export const NEUTRAL_STATS: StatBlock = { atk: 1, guard: 1, heal: 1, luck: 0 }

// 스탯 표기 이름 — 카드/집계판에서 "공격 ×1"처럼 그대로 쓴다.
export const STAT_NAME: Record<StatName, string> = { atk: '공격', guard: '방어', heal: '회복', luck: '운' }

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

// 완성 문장 토큰 배열(빈 슬롯은 '____'). josa 슬롯만 조사 부착.
export function sentenceTokens(sel: Selection, t: Tables): string[] {
  return t.template.slots.map((s) => {
    const w = sel[s.key]
    if (!w) return '____'
    return s.josa ? eul(w.text) : w.text
  })
}

// 토큰을 문장으로 — attach 슬롯(문장부호)은 앞 단어에 공백 없이 붙인다.
export function joinTokens(tokens: string[], t: Tables): string {
  return tokens.reduce((out, tok, i) => {
    if (!out) return tok
    return t.template.slots[i]?.attach ? out + tok : `${out} ${tok}`
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

  // base = object/verb 깡수치 합, bonusPool = subject/modifier/ending bonus 합.
  let base = 0
  let statGuard = 0 // 방어 동사가 스탯에서 뽑아낸 수치
  let statHeal = 0 // 회복 동사가 스탯에서 뽑아낸 수치
  let bonusPool = 0
  let critP = 0 // 수식 룰렛: 대성공 확률 합
  let failP = 0 // 수식 룰렛: 실패 확률 합
  let statKey: Intent['statKey'] = null
  let kind: Intent['kind'] = 'attack'
  let damageKind: Intent['kind'] | null = null
  let growHp = 0
  const bonusFrom: string[] = [] // 보너스 풀에 기여한 단어 이름(집계판 힌트용)
  let targetMode: Intent['targetMode'] = 'enemy'
  let aoe: Intent['aoe'] = 'single'
  let timing: Intent['timing'] = 'immediate'
  let variance: Intent['variance'] = null
  const flats: IntentPart[] = []
  const mults: IntentPart[] = []

  for (const key of order) {
    const w = sel[key]
    if (!w) continue
    const role = roleOf(t, key)
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
    growHp += w.growHp || 0
    critP += w.crit || 0
    failP += w.fail || 0
    // 룰렛을 밀어 줄 스탯은 수식이 지정한다(단단히=방어, 힘껏=공격 …).
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
    // 도박 범위(×하한~×상한)는 어느 슬롯이든 가질 수 있다 — 배율이 낮은 카드에
    // "가끔 크게 터진다"는 메리트를 붙여 주는 장치다. 뒤 슬롯이 지정하면 그쪽으로 덮인다.
    if (w.variance) variance = w.variance
    if (role === 'ending' && w.timing) timing = w.timing
  }

  // 보너스 풀은 가산이다 — 단어마다 칩을 하나씩 세우면 화면이 곱셈으로 읽히고
  // (1+0.2)×(1+0.15) ≠ 1+0.35 만큼 집계판이 실제 피해와 어긋난다. 한 칩으로 합쳐 세운다.
  if (bonusPool) {
    mults.push({ label: '배율 풀', value: 1 + bonusPool, source: 'word', hint: bonusFrom.join(' · ') })
  }

  // 백설공주의 구두 — 피해 동사가 하나라도 있으면 문장 끝에 고정 깡수치를 한 번 얹는다.
  // 동사마다가 아니라 문장당 한 번이라 겹동사와 곱해져 폭발하지 않는다.
  if (base > 0 && mods.verbFlat) {
    base += mods.verbFlat
    flats.push({ label: '무거운 구두', value: mods.verbFlat, source: 'word', lane: 'damage' })
  }

  // 피해 깡수치가 실제로 쌓였으면 회복/방어 동사가 뒤에 와도 공격 문장이다.
  if (base > 0 && damageKind) kind = damageKind

  const comboMult = combos.reduce((m, c) => m * c.mult, 1)
  for (const c of combos) mults.push({ label: `「${c.name}」`, value: c.mult, source: 'combo', hint: '완벽한 맥락' })

  // 잭과 숙주나물 — 맥락이 터질 때마다 무럭무럭이 한 장씩 더 붙는다.
  if (mods.grow) growHp += combos.length

  // 부조화(맥락 어긋남) 패널티 — 안 맞는 태그 쌍이 있으면 위력을 깎는다("틀린 문장").
  const allTags = order.flatMap((k) => (sel[k] ? sel[k]!.tags : []))
  let coherence = 1
  const penalties: string[] = []
  for (const d of t.dissonances ?? []) {
    if (allTags.includes(d.a) && allTags.includes(d.b)) {
      coherence *= d.penalty
      penalties.push(d.reason)
      mults.push({ label: '어긋남', value: d.penalty, source: 'coherence', hint: d.reason })
    }
  }

  // 아기돼지 바베큐 — 이번 전투에서 잡은 수만큼 문장 전체가 세진다.
  const stageMult = mods.stageMult ?? 1
  if (stageMult !== 1) mults.push({ label: '바베큐', value: stageMult, source: 'combo', hint: '잡은 만큼 세진다' })

  // 천장 없음 — 배율은 상한 없이 곱해진다(벌레 스웜을 오버킬로 관통하는 쾌감).
  // 등급제 폐지 — 희귀도 보너스 없음(다양성 + 반복강화로 대체 예정).
  const multiplier = (1 + bonusPool) * comboMult * coherence * stageMult

  const sumEffect = (k: keyof NonNullable<Word['effects']>) =>
    order.reduce((n, key) => n + (sel[key]?.effects?.[k] || 0), 0)

  return {
    sentence: joinTokens(sentenceTokens(sel, t), t),
    targetMode,
    aoe,
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
    tags: allTags,
    combos: combos.map((c) => c.name),
    coherence,
    penalties,
    critP,
    failP,
    statKey,
    growHp,
    doubtCount: mods.doubt ? combos.length : 0,
    breakdown: { flats, mults },
  }
}

// 룰렛 계수와 확률 보정 상수. 값은 임시 — 플레이 테스트로 다듬는다.
export const ROULETTE = { crit: 1.5, fail: 0.25 } as const
const LUCK_MULT = 0.02 // 운 1당 기본 배율 +2% (그리 드라마틱하지 않게)
const CRIT_STAT_K = 0.01 // 맥락 스탯 1당 대성공 +1%
const FAIL_STAT_K = 0.01 // 맥락 스탯 1당 실패 −1%
const CRIT_CAP = 0.6 // 아무리 높아도 대성공은 60%에서 수렴(실패가 없어진 만큼 천장을 올렸다)
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
