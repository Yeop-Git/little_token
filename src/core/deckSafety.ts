import type { Tables } from './types'
import type { LocaleCode } from '@/localization'
import { compile, effectiveBase, isDamageIntent } from './compiler'
import { SENTENCE_BASE_INK } from './ink'
import type { OwnedItem, PlayerState } from './player'
import { slotOrderFor } from './passives'
import { canCompleteSentence } from './validator'
import { EARLY_TEMPLATE, EARLY_WORDS, makeEarlyTables } from '@data/earlyWords'

/** 이월 잉크 없이 초과 집필을 포함해 전투 문장을 완성할 수 있는가. */
export function hasCompletableDeck(player: PlayerState): boolean {
  return canCompleteSentence(makeEarlyTables(player.deck, player), {}, SENTENCE_BASE_INK, () => false)
}

/** 이월 잉크 없이 직접 피해를 낼 수 있는 문장이 있는가. */
export function hasDirectAttackDeck(player: PlayerState): boolean {
  const tables = makeEarlyTables(player.deck, player)
  return canCompleteSentence(tables, {}, SENTENCE_BASE_INK, () => false, (selection) => {
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
  const hasOffense = canCompleteSentence(tables, {}, SENTENCE_BASE_INK, () => false, (selection) => {
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
    words[slot.key] = [...current, ...loans]
  }
  return { ...tables, words }
}
