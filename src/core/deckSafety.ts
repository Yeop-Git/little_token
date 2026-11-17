import type { Tables } from './types'
import type { LocaleCode } from '@/localization'
import { compile, effectiveBase, isDamageIntent } from './compiler'
import { sentenceInkAvailable } from './ink'
import type { OwnedItem, PlayerState } from './player'
import { slotOrderFor } from './passives'
import { canCompleteSentence } from './validator'
import { EARLY_TEMPLATE, EARLY_WORDS, makeEarlyTables } from '@data/earlyWords'

/** 기본 잉크로 전투 문장을 완성할 수 있는가. */
export function hasCompletableDeck(player: PlayerState): boolean {
  return canCompleteSentence(makeEarlyTables(player.deck, player), {}, sentenceInkAvailable(0, player), () => false)
}

/** 이월 잉크 없이 직접 피해를 낼 수 있는 문장이 있는가. */
export function hasDirectAttackDeck(player: PlayerState): boolean {
  const tables = makeEarlyTables(player.deck, player)
  return canCompleteSentence(tables, {}, sentenceInkAvailable(0, player), () => false, (selection) => {
    const intent = compile(selection, tables, player.stats)
    return isDamageIntent(intent) && effectiveBase(intent) > 0
  })
}

/** 슬롯이 늘어난 뒤에도 이월 없이 적어도 한 문장을 쓸 수 있는가. */
export function canAddItemWithoutLock(player: PlayerState, item: Pick<OwnedItem, 'id' | 'passive'>): boolean {
  if (!item.passive) return true
  const next: PlayerState = { ...player, items: [...player.items, { ...item, name: item.id, art: '', line: '', stats: {} }] }
  if (slotOrderFor(EARLY_TEMPLATE, next).length <= slotOrderFor(EARLY_TEMPLATE, player).length) return true
  return hasCompletableDeck(next)
}

/** 오래된 막힌 저장은 전투에만 기본 단어를 빌려 문장·공격 경로를 복구한다. */
export function recoverBattleTables(tables: Tables, player: PlayerState, locale?: LocaleCode): Tables {
  const hasOffense = canCompleteSentence(tables, {}, sentenceInkAvailable(0, player), () => false, (selection) => {
    const intent = compile(selection, tables, player.stats)
    return (isDamageIntent(intent) && effectiveBase(intent) > 0)
      || intent.guardAttackMultiplier > 0
      || (intent.overhealDamageMultiplier > 0 && intent.heal > 0)
  })
  if (hasOffense) return tables
  const starter = makeEarlyTables(EARLY_WORDS, player, locale)
  const words = { ...tables.words }
  for (const slot of tables.template.slots) {
    const current = words[slot.key] ?? []
    const present = new Set(current.map((word) => word.id))
    const loans = (starter.words[slot.key] ?? []).filter((word) => !present.has(word.id))
      .map((word) => ({ ...word, recoveryLoan: true }))
    // 옛 저장의 겹동사와 겹주어가 동시에 열려 있으면 기본 동사 둘만으로도
    // 새 잉크 한도를 넘을 수 있다. 복구용 카드만 비용을 낮춰 공격 경로를 보장한다.
    if (slot.key === 'verb' || slot.key === 'verb2') {
      const attack = (starter.words[slot.key] ?? []).find((word) => word.kind === 'attack')
      if (attack) loans.push({ ...attack, id: `${attack.id}-recovery`, inkCost: 1, recoveryLoan: true })
    }
    words[slot.key] = [...current, ...loans]
  }
  return { ...tables, words }
}
