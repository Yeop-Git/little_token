/**
 * 컴파일러 ★핵심. 순수함수 — RNG 없음, 전역 상태 참조 없음.
 * variance는 적용하지 않고 그대로 넘긴다(시뮬이 굴린다) → 전수 검사 가능.
 *
 * 슬롯을 하드코딩하지 않고 template.slots 순서/역할을 따라 계산하므로
 * 슬롯을 4칸/6칸으로 바꿔도 컴파일러는 그대로 동작한다.
 */

import { eul } from './josa'
import type { Combo, Intent, Selection, Tables, Word } from './types'

export const isDamageIntent = (intent: Pick<Intent, 'kind'>): boolean =>
  intent.kind !== 'heal' && intent.kind !== 'guard'

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

export function compile(sel: Selection, t: Tables): Intent {
  const order = t.template.slots.map((s) => s.key)
  const combos = matchCombos(sel, t.combos, order)

  // base = object/verb power 합, bonusPool = subject/modifier/ending bonus 합.
  let base = 0
  let bonusPool = 0
  let critP = 0 // 수식 룰렛: 대성공 확률 합
  let failP = 0 // 수식 룰렛: 실패 확률 합
  let kind: Intent['kind'] = 'attack'
  let targetMode: Intent['targetMode'] = 'enemy'
  let aoe: Intent['aoe'] = 'single'
  let timing: Intent['timing'] = 'immediate'
  let variance: Intent['variance'] = null

  for (const key of order) {
    const w = sel[key]
    if (!w) continue
    const role = roleOf(t, key)
    if (role === 'object' || role === 'verb') base += w.power || 0
    else bonusPool += w.bonus || 0
    critP += w.crit || 0
    failP += w.fail || 0

    if (role === 'verb' && w.kind) kind = w.kind
    if (role === 'subject') {
      if (w.targetMode) targetMode = w.targetMode
    }
    if (w.aoe) aoe = w.aoe // subject/verb 어느 쪽이든 지정하면 채택
    if (role === 'ending') {
      if (w.timing) timing = w.timing
      if (w.variance) variance = w.variance
    }
  }

  const comboMult = combos.reduce((m, c) => m * c.mult, 1)

  // 부조화(맥락 어긋남) 패널티 — 안 맞는 태그 쌍이 있으면 위력을 깎는다("틀린 문장").
  const allTags = order.flatMap((k) => (sel[k] ? sel[k]!.tags : []))
  let coherence = 1
  const penalties: string[] = []
  for (const d of t.dissonances ?? []) {
    if (allTags.includes(d.a) && allTags.includes(d.b)) {
      coherence *= d.penalty
      penalties.push(d.reason)
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
    guard: sumEffect('guard'),
    heal: sumEffect('heal'),
    recoil: sumEffect('recoil'),
    evade: sumEffect('evade'),
    tags: allTags,
    combos: combos.map((c) => c.name),
    coherence,
    penalties,
    critP,
    failP,
  }
}

// 룰렛 계수와 확률 보정 상수. 값은 임시 — 플레이 테스트로 다듬는다.
export const ROULETTE = { crit: 1.5, fail: 0.25 } as const
const LUCK_MULT = 0.02 // 운 1당 기본 배율 +2% (그리 드라마틱하지 않게)
const CRIT_STAT_K = 0.01 // 맥락 스탯 1당 대성공 +1%
const FAIL_STAT_K = 0.01 // 맥락 스탯 1당 실패 −1%
const CRIT_CAP = 0.45 // 아무리 높아도 대성공은 45%에서 수렴
const FAIL_FLOOR = 0.05 // 실패는 0%로 수렴하지 않는다

export type RouletteOutcome = 'crit' | 'normal' | 'fail'
export interface MultContext {
  luck: number
  statBias: number // 맥락에 맞는 스탯(공격→atk, 회복→heal, 방어→guard)
}
export interface ResolvedMult {
  mult: number
  outcome: RouletteOutcome
  critP: number
  failP: number
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
  if (intent.variance && varRoll !== null) m *= varRoll < intent.variance.p ? intent.variance.hi : intent.variance.lo
  m *= 1 + ctx.luck * LUCK_MULT // 운은 기본 배율 요소
  const { critP, failP } = rouletteOdds(intent, ctx.statBias)
  let outcome: RouletteOutcome = 'normal'
  if (rouletteRoll < critP) {
    m *= ROULETTE.crit
    outcome = 'crit'
  } else if (rouletteRoll > 1 - failP) {
    m *= ROULETTE.fail
    outcome = 'fail'
  }
  return { mult: m, outcome, critP, failP }
}

// sweep 전용 — variance만 적용한 기본 배율 분포(룰렛/운 제외, 천장 없음).
export function finalMultiplier(intent: Intent, roll: number | null = null): number {
  let m = intent.multiplier
  if (intent.variance && roll !== null) m *= roll < intent.variance.p ? intent.variance.hi : intent.variance.lo
  return m
}
