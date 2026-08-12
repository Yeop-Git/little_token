import type { Selection, Word } from './types'

export const SENTENCE_BASE_INK = 6
export const SENTENCE_CARRY_LIMIT = 2
export const SENTENCE_OVERDRAW_LIMIT = 2
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
  if (word.growHp) return 3

  if (word.slot === 'subj' || word.slot === 'subj2') {
    const expected = expectedMultiplier(word)
    const cost = Math.ceil((expected - 1.2) / 0.3)
      + (word.aoe === 'all' ? 1 : 0)
    return Math.max(0, Math.min(4, cost))
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
    return Math.max(1, Math.min(6, cost))
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

  return Math.max(0, Math.min(4, Math.floor(power + 1e-6)))
}

export function wordInkCost(word: Word): number {
  if (word.inkCost != null) return Math.max(0, Math.floor(word.inkCost))
  return recommendedWordInkCost(word)
}

export function selectionInkCost(selection: Selection): number {
  const words = Object.values(selection).filter((word): word is Word => !!word)
  const seen = new Set<string>()
  const listed = words.reduce((sum, word) => {
    const repeated = seen.has(word.id)
    seen.add(word.id)
    return sum + (repeated ? Math.max(1, wordInkCost(word)) : wordInkCost(word))
  }, 0)
  const discount = words.reduce((sum, word) => sum + Math.max(0, word.effects?.inkDiscount ?? 0), 0)
  return Math.max(0, listed - discount)
}

export function sentenceInkAvailable(carry = 0): number {
  return SENTENCE_BASE_INK + Math.min(SENTENCE_CARRY_LIMIT, Math.max(0, Math.floor(carry)))
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
