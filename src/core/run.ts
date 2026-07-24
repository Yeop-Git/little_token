/**
 * 런 상태 — 낮게 시작한 스탯을 아이템/문장 보상으로 키워 나간다.
 * 하루(레벨)를 클리어하면 보상 → 다음날. 운이 낮으면 낮은 등급 보상만 뜬다.
 */

import type { OwnedItem, PlayerState, PlayerStats } from './player'
import type { Word } from './types'
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
    stats: { hp: 20, atk: 3, guard: 3, heal: 3, luck: 2 },
    items: [],
    deck: cloneDeck(EARLY_WORDS),
  }
}

export function newRun(): RunState {
  return { player: startingPlayer(), day: 1 }
}

// 아이템 보상 = 스탯 수치 상승(스펙업).
export function applyItemReward(player: PlayerState, item: OwnedItem): void {
  for (const k of Object.keys(item.stats) as (keyof PlayerStats)[]) {
    player.stats[k] = (player.stats[k] ?? 0) + (item.stats[k] ?? 0)
  }
  player.items.push(item)
}

// 단어 깊은 복제 — 덱 단어는 EARLY_WORDS와 참조를 공유하므로 강화 전 복제해 오염을 막는다.
function cloneWord(w: Word): Word {
  return {
    ...w,
    tags: [...w.tags],
    effects: w.effects ? { ...w.effects } : undefined,
    variance: w.variance ? { ...w.variance } : undefined,
  }
}

// 반복강화 — 중복 단어를 먹으면 단계가 오르고 핵심 수치가 강해진다.
const REINFORCE_STEP = { power: 2, bonus: 0.15, guard: 2, heal: 2, crit: 0.05 }
export function reinforceWord(w: Word): void {
  w.level = (w.level ?? 1) + 1
  if (w.power != null) w.power += REINFORCE_STEP.power
  if (w.bonus != null) w.bonus = Math.round((w.bonus + REINFORCE_STEP.bonus) * 100) / 100
  if (w.effects?.guard) w.effects.guard += REINFORCE_STEP.guard
  if (w.effects?.heal) w.effects.heal += REINFORCE_STEP.heal
  if (w.crit != null) w.crit = Math.min(0.6, Math.round((w.crit + REINFORCE_STEP.crit) * 100) / 100)
}

// 문장 보상 = 단어장 등록. 이미 있으면 새로 넣지 않고 그 단어를 강화한다(반복강화).
export function registerWord(player: PlayerState, word: Word): void {
  const slot = player.deck[word.slot] ?? (player.deck[word.slot] = [])
  const idx = slot.findIndex((w) => w.id === word.id)
  if (idx >= 0) {
    const upgraded = cloneWord(slot[idx])
    reinforceWord(upgraded)
    slot[idx] = upgraded
  } else {
    slot.push({ ...cloneWord(word), level: 1 })
  }
}
