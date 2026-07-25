/**
 * 스테이지 클리어 보상 — 주어·수식어 → 아이템 → 동사 순서로 각각 3택한다.
 * 전투 등급에 15층 사이클 진행 보정을 더해 뒤로 갈수록 높은 희귀도가 자연스럽게
 * 자주 나오며, 10층에는 매 사이클 전설 규칙 아이템 한 장이 확정 등장한다.
 */

import type { Rarity, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import type { RewardPhase } from '@core/run'
import { GRADE_MAX, rollRarity, startGrade } from '@core/grade'
import { floorInCycle, STORY_FLOORS } from './stages'
import { ALL_REWARD_WORDS } from './earlyWords'
import { ITEMS, LEGENDARY_ITEMS, type ItemDef } from './items'

export const LEGENDARY_GIFT_FLOOR = 10

export interface RewardOption {
  kind: 'word' | 'item'
  rarity: Rarity
  name: string
  desc: string
  art: string
  reinforce?: boolean
  word?: Word
  item?: ItemDef
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식어', verb: '동사', obj: '목적어', end: '어미' }
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary']

function shuffle<T>(values: T[]): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** 1층 +0 → 15층 +4. 엔드리스에서는 다음 15층 묶음에서 같은 곡선을 반복한다. */
export function rewardGradeForDay(combatGrade: number, day: number): number {
  const progress = (floorInCycle(day) - 1) / (STORY_FLOORS - 1)
  return Math.min(GRADE_MAX, Math.max(0, combatGrade + progress * 4))
}

function nearestPool(pools: Map<Rarity, RewardOption[]>, want: Rarity): RewardOption[] | null {
  const wantedIndex = RARITY_ORDER.indexOf(want)
  for (let i = wantedIndex; i >= 0; i--) {
    const pool = pools.get(RARITY_ORDER[i])
    if (pool?.length) return pool
  }
  for (let i = wantedIndex + 1; i < RARITY_ORDER.length; i++) {
    const pool = pools.get(RARITY_ORDER[i])
    if (pool?.length) return pool
  }
  return null
}

function pickOne(candidates: RewardOption[], grade: number, used: Set<string>): RewardOption | null {
  const pools = new Map<Rarity, RewardOption[]>()
  for (const option of candidates) {
    const id = option.word?.id ?? option.item?.id ?? option.name
    if (used.has(id)) continue
    const pool = pools.get(option.rarity) ?? []
    pool.push(option)
    pools.set(option.rarity, pool)
  }
  for (const [rarity, pool] of pools) pools.set(rarity, shuffle(pool))
  const pool = nearestPool(pools, rollRarity(grade))
  if (!pool) return null
  const option = pool[0]
  used.add(option.word?.id ?? option.item?.id ?? option.name)
  return option
}

function wordOptions(player: PlayerState, slots: string[]): RewardOption[] {
  const deckWords = Object.values(player.deck).flat()
  const ownedIds = new Set(deckWords.map((word) => word.id))
  const allowed = new Set(slots)
  const fresh = ALL_REWARD_WORDS
    .filter((word) => allowed.has(word.slot) && !ownedIds.has(word.id))
    .map((word): RewardOption => ({
      kind: 'word',
      rarity: word.rarity ?? 'common',
      name: word.text,
      desc: `${SLOT_LABEL[word.slot] ?? ''} · 새 단어`,
      art: 'word',
      word,
    }))
  const reinforce = deckWords
    .filter((word) => allowed.has(word.slot))
    .map((word): RewardOption => ({
      kind: 'word',
      reinforce: true,
      rarity: word.rarity ?? 'common',
      name: word.text,
      desc: `${SLOT_LABEL[word.slot] ?? ''} · 강화 Lv.${word.level ?? 1} → ${(word.level ?? 1) + 1}`,
      art: 'word',
      word,
    }))
  return [...fresh, ...reinforce]
}

const toItemOption = (item: ItemDef): RewardOption => ({
  kind: 'item',
  rarity: item.rarity,
  name: item.name,
  desc: item.passive ? '문장의 규칙이 바뀐다' : '감탄사로 스탯을 올린다',
  art: 'gift',
  item,
})

function freshLegendaries(player: PlayerState): ItemDef[] {
  const owned = new Set(player.items.map((item) => item.id))
  const fresh = Object.values(LEGENDARY_ITEMS).filter((item) => !owned.has(item.id))
  return fresh.length ? fresh : Object.values(LEGENDARY_ITEMS)
}

function generateWordRewards(player: PlayerState, grade: number, phase: 'subject' | 'verb'): RewardOption[] {
  const slots = phase === 'subject' ? ['subj', 'adv'] : ['verb']
  const all = wordOptions(player, slots)
  const used = new Set<string>()
  const picks: RewardOption[] = []

  // 첫 단계는 세 장이 한 문법에 몰리지 않도록 주어와 수식어를 한 장씩 보장한다.
  if (phase === 'subject') {
    for (const slot of slots) {
      const option = pickOne(all.filter((entry) => entry.word?.slot === slot), grade, used)
      if (option) picks.push(option)
    }
  }
  while (picks.length < 3) {
    const option = pickOne(all, grade, used)
    if (!option) break
    picks.push(option)
  }
  return shuffle(picks)
}

function generateItemRewards(player: PlayerState, grade: number, day: number): RewardOption[] {
  const candidates = Object.values(ITEMS).map(toItemOption)
  const used = new Set<string>()
  const picks: RewardOption[] = []
  while (picks.length < 3) {
    const option = pickOne(candidates, grade, used)
    if (!option) break
    picks.push(option)
  }

  // 규칙 아이템은 확률 풀이 아니라 날짜 규칙으로만 등장한다. 15층마다 같은 10층에서
  // 한 장을 확정 노출하므로 본편과 모든 엔드리스 사이클에 같은 획득 기회가 생긴다.
  if (floorInCycle(day) === LEGENDARY_GIFT_FLOOR) {
    const legendary = shuffle(freshLegendaries(player))[0]
    if (legendary) picks[0] = toItemOption(legendary)
  }
  return picks
}

export function genRewards(
  player: PlayerState,
  grade = startGrade(player.stats.luck),
  day = 1,
  phase: RewardPhase = 'subject',
): RewardOption[] {
  const effectiveGrade = rewardGradeForDay(grade, day)
  if (phase === 'item') return generateItemRewards(player, effectiveGrade, day)
  return generateWordRewards(player, effectiveGrade, phase)
}
