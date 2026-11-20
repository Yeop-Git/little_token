import type { Selection, Word } from './types'
import type { PlayerState } from './player'
import { bonusInkFor, slotOrderFor } from './passives'

export const SENTENCE_BASE_INK = 5
export const SENTENCE_CARRY_LIMIT = 0
export const SENTENCE_OVERDRAW_LIMIT = 0
export const SENTENCE_MAX_INK = SENTENCE_BASE_INK + SENTENCE_CARRY_LIMIT + SENTENCE_OVERDRAW_LIMIT
export const SENTENCE_INK = SENTENCE_BASE_INK + SENTENCE_CARRY_LIMIT

export function expectedMultiplier(word: Word): number {
  const variance = word.variance
    ? word.variance.p * word.variance.hi + (1 - word.variance.p) * word.variance.lo
    : 1
  return (1 + Math.max(0, word.bonus ?? 0)) * variance * (1 + 0.5 * Math.max(0, word.crit ?? 0))
}

/**
 * 카드 기능을 잉크로 환산하는 단일 정본.
 * 동사는 본행동 계수에 부가 동작의 세기만큼 더한다. 같은 키워드라도 계수가 높으면
 * 더 비싸며, 명시 비용은 `check-tables`에서 이 값과 정확히 일치해야 한다.
 */
export function recommendedWordInkCost(word: Word): number {
  // 문장부호(올림프의 황금 당근)는 아이템이 여는 덤 칸이라 잉크를 쓰지 않는다.
  if (word.slot === 'punct') return 0

  // 시작 잉크 5에 주어·수식어·동사 세 칸을 모두 채워야 하므로 칸별 상한은 주어 1 · 수식어 2 · 동사 3.
  // 카드별 실제 값은 src/tools/ink-cost-index.ts(조합 전수 기여도)가 정하고, 이 공식은 명시 비용이 없을 때의 폴백이다.
  if (word.growHp) return word.slot === 'adv' ? 2 : 1

  if (word.slot === 'subj' || word.slot === 'subj2') {
    const expected = expectedMultiplier(word)
    const cost = Math.ceil((expected - 1.2) / 0.3)
      + (word.aoe === 'all' ? 1 : 0)
    return Math.max(0, Math.min(1, cost))
  }

  if (word.slot === 'verb' || word.slot === 'verb2') {
    const effects = word.effects
    let cost = Math.max(1, Math.ceil(Math.max(0, word.statMult ?? 1) * 2 - 1e-6))
    if (word.aoe === 'all' || word.targetCount === 'all') cost += 2
    else if ((word.targetCount ?? 1) > 1) cost += Math.max(1, (word.targetCount as number) - 1)
    cost += Math.ceil(Math.max(0, (effects?.hitCount ?? 1) - 1) * .5)
    if (word.effects?.pierceGuard) cost += 1
    if (effects?.counter) cost += 1
    cost += Math.max(0, effects?.magicShield ?? 0) * 2
    cost += Math.ceil(Math.max(0, effects?.guardAttackMultiplier ?? 0))
    cost += Math.ceil(Math.max(0, effects?.overhealDamageMultiplier ?? 0))
    cost += Math.ceil(Math.max(0, effects?.lifeStealRate ?? 0) / .5)
    return Math.max(1, Math.min(3, cost))
  }

  let power = 0
  power += Math.ceil(Math.max(0, word.bonus ?? 0) / .2 - 1e-6)
  power += Math.ceil(Math.max(0, word.crit ?? 0) / .25 - 1e-6)
  if (word.variance) {
    const expectedBonus = word.variance.p * (word.variance.hi - 1)
      + (1 - word.variance.p) * (word.variance.lo - 1)
    power += Math.max(0, expectedBonus)
  }
  const effects = word.effects
  if (word.tags.includes('preempt')) power += 1
  if (word.aoe === 'all' || word.targetCount === 'all') power += 2
  else if ((word.targetCount ?? 1) > 1) power += Math.max(1, (word.targetCount as number) - 1)
  if (effects?.pierceGuard) power += 1
  if (effects?.counter) power += 1
  power += Math.ceil(Math.max(0, (effects?.hitCount ?? 1) - 1) * .5)
  power += Math.max(0, (effects?.castCount ?? 1) - 1) * 2
  power += Math.max(0, effects?.magicShield ?? 0) * 4
  power += Math.abs(effects?.attackRank ?? 0)
  power += Math.abs(effects?.guardRank ?? 0)
  power -= Math.max(0, effects?.inkDiscount ?? 0)

  return Math.max(0, Math.min(2, Math.floor(power + 1e-6)))
}

export function wordInkCost(word: Word): number {
  if (word.inkCost != null) return Math.max(0, Math.floor(word.inkCost))
  return recommendedWordInkCost(word)
}

/**
 * 문장의 잉크 지출은 카드에 찍힌 비용의 합에서 리필을 뺀 값이다.
 * 같은 카드를 겹주어·겹동사 칸에 다시 골라도 카드에 적힌 비용만 낸다 — 예전에는
 * 반복 선택에 최소 1을 몰래 매겨, 잉크 0 카드(「들뜬 나는」)를 두 번 고르면
 * 표시와 달리 1이 빠졌다.
 */
export function selectionInkCost(selection: Selection): number {
  const words = Object.values(selection).filter((word): word is Word => !!word)
  const listed = words.reduce((sum, word) => sum + wordInkCost(word), 0)
  const discount = words.reduce((sum, word) => sum + Math.max(0, word.effects?.inkDiscount ?? 0), 0)
  return Math.max(0, listed - discount)
}

/** 리필 전, 고른 카드에 찍힌 잉크 비용의 합. */
export function selectionListedInk(selection: Selection): number {
  return Object.values(selection).reduce((sum, word) => sum + (word ? wordInkCost(word) : 0), 0)
}

/** 이번 문장에 고른 리필 카드들이 채워 주는 잉크 합. 쓴 잉크보다 많이 채우지는 않는다. */
export function selectionInkRefill(selection: Selection): number {
  return Object.values(selection).reduce((sum, word) => sum + Math.max(0, word?.effects?.inkDiscount ?? 0), 0)
}

export function sentenceInkAvailable(carry = 0, player?: PlayerState): number {
  return SENTENCE_BASE_INK + bonusInkFor(player) + Math.min(SENTENCE_CARRY_LIMIT, Math.max(0, Math.floor(carry)))
}

export function inkOverdraw(cost: number, available = SENTENCE_INK): number {
  return Math.max(0, Math.floor(cost) - Math.max(0, Math.floor(available)))
}

export function inkExceedsLimit(cost: number, available = SENTENCE_INK): boolean {
  return Math.floor(cost) > Math.max(0, Math.floor(available)) + SENTENCE_OVERDRAW_LIMIT
}

export function carryInkAfterSpend(cost: number, available = SENTENCE_INK): number {
  return Math.min(
    SENTENCE_CARRY_LIMIT,
    Math.max(0, Math.floor(available) - Math.floor(cost)),
  )
}

/**
 * 지금 칸 구성에서 가장 비싼 문장이 쓰는 잉크. 이보다 큰 잉크 한도는 쓸 곳이 없다.
 * `slotCap`은 칸마다 카드 한 장의 최대 비용(카드 카탈로그에서 계산해 넘긴다 — 상한이 바뀌어도 따라간다).
 */
export function maxUsefulInk(baseOrder: string[], slotCap: (slotKey: string) => number, player?: PlayerState): number {
  return slotOrderFor(baseOrder, player).reduce((sum, key) => sum + Math.max(0, slotCap(key)), 0)
}

/** 잉크 한도가 이미 가장 비싼 문장을 감당하는가 — 그러면 잉크 특성(넉넉한 잉크)은 효과가 없다. */
export function inkAlreadySaturated(baseOrder: string[], slotCap: (slotKey: string) => number, player?: PlayerState): boolean {
  return sentenceInkAvailable(0, player) >= maxUsefulInk(baseOrder, slotCap, player)
}
