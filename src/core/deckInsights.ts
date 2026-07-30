import { matchCombos } from './compiler'
import type { Combo, Selection, Word } from './types'

/** 현재 덱에서 실제 슬롯 순서로 완성 가능한 관용구를 중복 없이 찾는다. */
export function availableCombos(
  deck: Record<string, Word[]>,
  combos: Combo[],
  order: string[] = ['subj', 'adv', 'verb'],
): Combo[] {
  const found = new Map<string, Combo>()
  const selection: Selection = {}

  const visit = (index: number) => {
    if (index >= order.length) {
      for (const combo of matchCombos(selection, combos, order)) found.set(combo.name, combo)
      return
    }
    const key = order[index]
    for (const word of deck[key] ?? []) {
      selection[key] = word
      visit(index + 1)
    }
    delete selection[key]
  }

  visit(0)
  return [...found.values()].sort((a, b) => b.mult - a.mult || a.name.localeCompare(b.name))
}
