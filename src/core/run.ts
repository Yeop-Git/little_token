/**
 * 런 상태 — 낮게 시작한 스탯을 아이템/문장 보상으로 키워 나간다.
 * 하루(레벨)를 클리어하면 보상 → 다음날. 운이 낮으면 낮은 등급 보상만 뜬다.
 */

import type { OwnedItem, PlayerState, PlayerStats } from './player'
import type { Rarity, Word } from './types'
import { EARLY_WORDS } from '@data/earlyWords'

export interface RunState {
  player: PlayerState
  day: number
}

function cloneDeck(d: Record<string, Word[]>): Record<string, Word[]> {
  const out: Record<string, Word[]> = {}
  for (const k of Object.keys(d)) out[k] = [...d[k]]
  return out
}

// 낮은 시작 스탯 — 공격 2~5·체력 10~20 대역, 아이템으로 성장.
export function startingPlayer(): PlayerState {
  return {
    stats: { hp: 20, atk: 3, guard: 2, heal: 2, luck: 2 },
    items: [],
    deck: cloneDeck(EARLY_WORDS),
  }
}

export function newRun(): RunState {
  return { player: startingPlayer(), day: 1 }
}

const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }

// 운이 낮으면 커먼~레어만, 오를수록 영웅·전설 해금.
export function luckRarityCap(luck: number): Rarity {
  return luck < 5 ? 'rare' : luck < 10 ? 'epic' : 'legendary'
}
export function rarityAllowed(r: Rarity, cap: Rarity): boolean {
  return RARITY_ORDER[r] <= RARITY_ORDER[cap]
}

// 아이템 보상 = 스탯 수치 상승(스펙업).
export function applyItemReward(player: PlayerState, item: OwnedItem): void {
  for (const k of Object.keys(item.stats) as (keyof PlayerStats)[]) {
    player.stats[k] = (player.stats[k] ?? 0) + (item.stats[k] ?? 0)
  }
  player.items.push(item)
}

// 문장 보상 = 단어장에 새 단어 등록(스킬업).
export function registerWord(player: PlayerState, word: Word): void {
  const slot = player.deck[word.slot] ?? (player.deck[word.slot] = [])
  if (!slot.some((w) => w.id === word.id)) slot.push(word)
}
