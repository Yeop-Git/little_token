import type { Rarity, Selection, Word } from './types'

/** A fresh sentence may spend this much ink without hurting the player. */
export const SENTENCE_INK = 10

const RARITY_COST: Record<Rarity, number> = {
  common: 2,
  rare: 3,
  epic: 5,
  legendary: 7,
}

/**
 * Card cost is derived from its current rules, so reinforced and unusually powerful
 * cards remain honest even when their numbers change. Rarity sets the floor and the
 * strongest mechanics add at most three more ink.
 */
export function wordInkCost(word: Word): number {
  let power = 0
  power += Math.max(0, (word.statMult ?? 1) - 1) * 2
  power += Math.max(0, word.bonus ?? 0) * 2
  power += Math.max(0, word.crit ?? 0) * 3
  if (word.variance) {
    const expectedBonus = word.variance.p * (word.variance.hi - 1)
      + (1 - word.variance.p) * (word.variance.lo - 1)
    power += Math.max(0, expectedBonus) * 2
  }
  if (word.aoe === 'all') power += 1.5
  else if (word.targetCount === 'all') power += 1.5
  else if ((word.targetCount ?? 1) > 1) power += ((word.targetCount as number) - 1) * 0.65
  power += Math.max(0, (word.effects?.hitCount ?? 1) - 1) * 0.45
  if (word.effects?.pierceGuard) power += 0.6
  if ((word.effects?.counterMultiplier ?? 0) > 0) power += 0.6
  if (word.growHp) power += word.growHp / 2

  return RARITY_COST[word.rarity ?? 'common'] + Math.min(3, Math.floor(power + 1e-6))
}

export function selectionInkCost(selection: Selection): number {
  return Object.values(selection).reduce((sum, word) => sum + (word ? wordInkCost(word) : 0), 0)
}

export function inkOverdraw(cost: number, available = SENTENCE_INK): number {
  return Math.max(0, Math.floor(cost) - Math.max(0, Math.floor(available)))
}
