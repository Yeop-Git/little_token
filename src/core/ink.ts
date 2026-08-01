import type { Rarity, Selection, Word } from './types'

export const SENTENCE_BASE_INK = 6
export const SENTENCE_CARRY_LIMIT = 2
export const SENTENCE_OVERDRAW_LIMIT = 2
export const SENTENCE_MAX_INK = SENTENCE_BASE_INK + SENTENCE_CARRY_LIMIT + SENTENCE_OVERDRAW_LIMIT
export const SENTENCE_INK = SENTENCE_BASE_INK + SENTENCE_CARRY_LIMIT

const RARITY_STEP: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
}

export function expectedMultiplier(word: Word): number {
  const variance = word.variance
    ? word.variance.p * word.variance.hi + (1 - word.variance.p) * word.variance.lo
    : 1
  return (1 + Math.max(0, word.bonus ?? 0)) * variance * (1 + 0.5 * Math.max(0, word.crit ?? 0))
}

export function wordInkCost(word: Word): number {
  if (word.inkCost != null) return Math.max(0, Math.floor(word.inkCost))
  if (word.growHp) return 3

  const rarity = RARITY_STEP[word.rarity ?? 'common']

  if (word.slot === 'subj' || word.slot === 'subj2') {
    const expected = expectedMultiplier(word)
    const cost = Math.ceil((expected - 1.2) / 0.3) + (word.aoe === 'all' ? 1 : 0)
    return Math.max(0, Math.min(4, cost))
  }

  if (word.slot === 'verb' || word.slot === 'verb2') {
    // Rarity already carries the tier's base coefficient budget; charging two base Ink
    // would count that strength twice once coefficient and tactical effects are added.
    let cost = 1 + rarity
    cost += Math.max(0, Math.ceil(((word.statMult ?? 1) - 1) / 0.5))
    if (word.aoe === 'all') cost += 1
    else if (word.targetCount === 'all') cost += 1
    else if ((word.targetCount ?? 1) > 1) cost += 1
    if ((word.effects?.hitCount ?? 1) > 1) cost += 1
    if (word.effects?.pierceGuard) cost += 1
    if ((word.effects?.counterMultiplier ?? 0) > 0) cost += 1
    if ((word.effects?.magicShield ?? 0) > 0) cost += 3
    cost += Math.ceil(Math.max(0, word.effects?.guardAttackMultiplier ?? 0) * 2)
    cost += Math.ceil(Math.max(0, word.effects?.overhealDamageMultiplier ?? 0))
    cost += Math.ceil(Math.max(0, word.effects?.lifeStealRate ?? 0) * 2)
    cost += Math.abs(word.effects?.attackRank ?? 0)
    cost += Math.abs(word.effects?.guardRank ?? 0)
    cost += Math.abs(word.effects?.enemyAttackRank ?? 0)
    cost += Math.max(0, word.effects?.carryInk ?? 0)
    cost += Math.max(0, word.effects?.bonusDraws ?? 0)
    return Math.max(1, Math.min(5, cost))
  }

  let power = rarity
  power += Math.max(0, word.bonus ?? 0) * 2
  power += Math.max(0, word.crit ?? 0) * 2
  if (word.variance) {
    const expectedBonus = word.variance.p * (word.variance.hi - 1)
      + (1 - word.variance.p) * (word.variance.lo - 1)
    power += Math.max(0, expectedBonus)
  }
  if (word.aoe === 'all') power += 1.5
  else if (word.targetCount === 'all') power += 1.5
  else if ((word.targetCount ?? 1) > 1) power += ((word.targetCount as number) - 1) * 0.65
  power += Math.max(0, (word.effects?.hitCount ?? 1) - 1) * 0.45
  power += Math.max(0, (word.effects?.castCount ?? 1) * (word.effects?.castScale ?? 1) - 1)
  if (word.effects?.pierceGuard) power += 0.6
  if ((word.effects?.counterMultiplier ?? 0) > 0) power += 0.6

  return Math.max(0, Math.min(4, Math.floor(power + 1e-6)))
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

export function selectionCarryInk(selection: Selection): number {
  return Object.values(selection).reduce(
    (sum, word) => sum + Math.max(0, word?.effects?.carryInk ?? 0),
    0,
  )
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

export function carryInkAfterSpend(cost: number, available = SENTENCE_INK, carryBonus = 0): number {
  const earnedBonus = cost <= available ? Math.max(0, Math.floor(carryBonus)) : 0
  return Math.min(
    SENTENCE_CARRY_LIMIT,
    Math.max(0, Math.floor(available) - Math.floor(cost)) + earnedBonus,
  )
}
