/**
 * 컴파일러 ★핵심. 순수함수 — RNG 없음, 전역 상태 참조 없음.
 * variance는 적용하지 않고 그대로 넘긴다(시뮬이 굴린다) → 전수 검사 가능.
 *
 * 슬롯을 하드코딩하지 않고 template.slots 순서/역할을 따라 계산하므로
 * 슬롯을 4칸/6칸으로 바꿔도 컴파일러는 그대로 동작한다.
 */

import { eul } from './josa'
import type { Combo, Intent, IntentPart, Selection, StatBlock, StatName, Tables, Word } from './types'

export const isDamageIntent = (intent: Pick<Intent, 'kind'>): boolean =>
  intent.kind !== 'heal' && intent.kind !== 'guard'

// 스탯이 없는 호출(전수 검사 도구 등)에서 쓰는 중립 스탯 — 계수를 그대로 읽는다.
export const NEUTRAL_STATS: StatBlock = { atk: 1, guard: 1, heal: 1, luck: 0 }

// 스탯 표기 이름 — 카드/집계판에서 "공격 ×1"처럼 그대로 쓴다.
export const STAT_NAME: Record<StatName, string> = { atk: '공격', guard: '방어', heal: '회복', luck: '운' }

// 단어 하나가 만드는 깡수치. 스탯 비례 단어는 "스탯 × 계수", 아니면 고정 위력.
export function wordFlat(w: Word, stats: StatBlock): number {
  if (w.stat && w.statMult != null) return Math.max(0, Math.round(stats[w.stat] * w.statMult))
  return w.power || 0
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

const roleOf = (t: Tables, key: string) => t.template.slots.find((s) => s.key === key)?.role

export function compile(sel: Selection, t: Tables, stats: StatBlock = NEUTRAL_STATS): Intent {
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
      const flat = wordFlat(w, stats)
      if (flat > 0) {
        const hint = w.stat && w.statMult != null ? `${STAT_NAME[w.stat]} ×${w.statMult}` : undefined
        flats.push({ label: w.text, value: flat, source: w.stat ? 'stat' : 'word', hint })
        if (w.kind === 'guard') statGuard += flat
        else if (w.kind === 'heal') statHeal += flat
        else base += flat
      }
    } else {
      bonusPool += w.bonus || 0
      if (w.bonus) mults.push({ label: w.text, value: 1 + w.bonus, source: 'word' })
    }
    critP += w.crit || 0
    failP += w.fail || 0
    // 룰렛을 밀어 줄 스탯은 수식이 지정한다(단단히=방어, 힘껏=공격 …).
    if (role === 'modifier' && w.stat) statKey = w.stat

    if (role === 'verb' && w.kind) kind = w.kind
    if (role === 'subject') {
      if (w.targetMode) targetMode = w.targetMode
    }
    if (w.aoe) aoe = w.aoe // subject/verb 어느 쪽이든 지정하면 채택
    // 도박 범위(×하한~×상한)는 어느 슬롯이든 가질 수 있다 — 배율이 낮은 카드에
    // "가끔 크게 터진다"는 메리트를 붙여 주는 장치다. 뒤 슬롯이 지정하면 그쪽으로 덮인다.
    if (w.variance) variance = w.variance
    if (role === 'ending' && w.timing) timing = w.timing
  }

  const comboMult = combos.reduce((m, c) => m * c.mult, 1)
  for (const c of combos) mults.push({ label: `「${c.name}」`, value: c.mult, source: 'combo', hint: '완벽한 맥락' })

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

  // 천장 없음 — 배율은 상한 없이 곱해진다(벌레 스웜을 오버킬로 관통하는 쾌감).
  // 등급제 폐지 — 희귀도 보너스 없음(다양성 + 반복강화로 대체 예정).
  const multiplier = (1 + bonusPool) * comboMult * coherence

  const sumEffect = (k: keyof NonNullable<Word['effects']>) =>
    order.reduce((n, key) => n + (sel[key]?.effects?.[k] || 0), 0)

  return {
    sentence: sentenceTokens(sel, t).join(' '),
    targetMode,
    aoe,
    kind,
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
  parts: { variance: number; luck: number; roulette: number }
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
  return { mult: m, outcome, critP, failP, parts: { variance, luck, roulette } }
}

// sweep 전용 — variance만 적용한 기본 배율 분포(룰렛/운 제외, 천장 없음).
export function finalMultiplier(intent: Intent, roll: number | null = null): number {
  let m = intent.multiplier
  if (intent.variance && roll !== null) m *= roll < intent.variance.p ? intent.variance.hi : intent.variance.lo
  return m
}
