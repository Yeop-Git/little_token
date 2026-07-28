/**
 * 스테이지 클리어 보상 — 주어·수식어 → 아이템 → 동사 순서로 각각 3택한다.
 * 전투 등급에 15층 사이클 진행 보정을 더해 뒤로 갈수록 단어 보상의 높은 희귀도가
 * 자주 나온다. 1~4층 노멀, 5~9층 희귀, 10~15층 영웅이 중심이며 각 구간에서
 * 다음 등급 확률이 상승한다. 10층에는 전설 아이템을, 15층에는 전설 스킬을
 * 하나씩 선택 가능하게 보장한다.
 */

import type { Rarity, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import type { RewardPhase } from '@core/run'
import { GRADE_MAX, startGrade } from '@core/grade'
import { floorInCycle, STORY_FLOORS } from './stages'
import { ALL_REWARD_WORDS } from './earlyWords'
import { ITEMS, PASSIVE_ITEMS, type ItemDef } from './items'
import { tacticalCardIdsForRewardDay } from './tacticalCards'

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

export const GUARANTEED_LEGENDARY_ITEM_FLOOR = 10
export const GUARANTEED_LEGENDARY_SKILL_FLOOR = 15

/** 보스 클리어마다 한 장은 해당 장의 대표 등급으로 못 박아 상승감을 만든다. */
export function bossRewardRarity(day: number): Rarity | null {
  const floor = floorInCycle(day)
  return floor === 5 ? 'rare' : floor === 10 ? 'epic' : floor === 15 ? 'legendary' : null
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * 15층 희귀도 곡선.
 * 1~4층은 노멀, 5~9층은 희귀, 10~15층은 영웅이 항상 가장 큰 가중치다.
 * 전투 등급은 각 구간의 중심을 뒤집지 않는 범위에서 다음 등급 확률만 조금 보탠다.
 */
export function rewardRarityWeights(grade: number, day: number): Record<Rarity, number> {
  const floor = floorInCycle(day)
  const quality = clamp((grade - 5) / 5, -1, 1)

  if (floor <= 4) {
    const progress = (floor - 1) / 3
    const rare = 20 + progress * 25 + quality * 3
    return { common: 100 - rare, rare, epic: 0, legendary: 0 }
  }
  if (floor <= 9) {
    const progress = (floor - 5) / 4
    const common = 20 - progress * 10
    const epic = 5 + progress * 30 + quality * 5
    return { common, rare: 100 - common - epic, epic, legendary: 0 }
  }

  const progress = (floor - 10) / 5
  const common = 5 - progress * 2
  const rare = 25 - progress * 15
  const legendary = 2 + progress * 18 + quality * 3
  return { common, rare, epic: 100 - common - rare - legendary, legendary }
}

function rollRewardRarity(grade: number, day: number, rng: () => number = Math.random): Rarity {
  const weights = rewardRarityWeights(grade, day)
  let roll = rng() * Object.values(weights).reduce((sum, weight) => sum + weight, 0)
  for (const rarity of RARITY_ORDER) {
    roll -= weights[rarity]
    if (roll < 0) return rarity
  }
  return 'common'
}

function pickOne(
  candidates: RewardOption[],
  grade: number,
  day: number,
  used: Set<string>,
  forceRarity?: Rarity,
): RewardOption | null {
  const pools = new Map<Rarity, RewardOption[]>()
  for (const option of candidates) {
    const id = option.word?.id ?? option.item?.id ?? option.name
    if (used.has(id)) continue
    const pool = pools.get(option.rarity) ?? []
    pool.push(option)
    pools.set(option.rarity, pool)
  }
  for (const [rarity, pool] of pools) pools.set(rarity, shuffle(pool))
  const pool = forceRarity
    ? pools.get(forceRarity) ?? null
    : nearestPool(pools, rollRewardRarity(grade, day))
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
  desc: item.passive ? '고유효과 · 제련 문장으로 스탯 선택' : '제련 문장으로 스탯 선택',
  art: 'gift',
  item,
})

function itemOptions(player: PlayerState): RewardOption[] {
  const owned = new Set(player.items.map((item) => item.id))
  const unownedPassives = Object.values(PASSIVE_ITEMS).filter((item) => !owned.has(item.id))
  const passives = unownedPassives.length ? unownedPassives : Object.values(PASSIVE_ITEMS)
  return [...Object.values(ITEMS), ...passives].map(toItemOption)
}

function generateWordRewards(player: PlayerState, grade: number, day: number, phase: 'subject' | 'verb'): RewardOption[] {
  const slots = phase === 'subject' ? ['subj', 'adv'] : ['verb']
  const all = wordOptions(player, slots)
  const used = new Set<string>()
  const picks: RewardOption[] = []

  // 5·10·15층 보상에는 각각 희귀·영웅·전설 스킬을 한 장 이상 고정한다.
  const bossRarity = bossRewardRarity(day)
  if (bossRarity) {
    const option = pickOne(all, grade, day, used, bossRarity)
    if (option) picks.push(option)
  }
  // 첫 단계는 세 장이 한 문법에 몰리지 않도록 주어와 수식어를 한 장씩 보장한다.
  if (phase === 'subject') {
    for (const slot of slots) {
      if (picks.some((entry) => entry.word?.slot === slot)) continue
      const option = pickOne(all.filter((entry) => entry.word?.slot === slot), grade, day, used)
      if (option) picks.push(option)
    }
  }
  // A boss-eve verb reward always includes one card that interacts with the next boss's rule.
  // Already-owned cards remain useful here because the reward becomes a reinforcement.
  if (phase === 'verb') {
    const tacticalIds = new Set(tacticalCardIdsForRewardDay(day))
    const option = pickOne(all.filter((entry) => entry.word && tacticalIds.has(entry.word.id)), grade, day, used)
    if (option) picks.push(option)
  }
  while (picks.length < 3) {
    const option = pickOne(all, grade, day, used)
    if (!option) break
    picks.push(option)
  }
  return shuffle(picks)
}

function generateItemRewards(player: PlayerState, grade: number, day: number): RewardOption[] {
  const items = itemOptions(player)
  const used = new Set<string>()
  const picks: RewardOption[] = []

  // 단어 카드와 같은 pickOne/희귀도 곡선을 사용한다. 10층 확정 전설만 추가 예외다.
  // 10층에는 매 사이클 전설 규칙 아이템을 최소 한 장 선택할 수 있게 둔다.
  const forceLegendaryItem = floorInCycle(day) === GUARANTEED_LEGENDARY_ITEM_FLOOR
  if (forceLegendaryItem) {
    const item = pickOne(items, grade, day, used, 'legendary')
    if (item) picks.push(item)
  }
  while (picks.length < 3) {
    const option = pickOne(items, grade, day, used)
    if (!option) break
    picks.push(option)
  }
  return shuffle(picks)
}

export function genRewards(
  player: PlayerState,
  grade = startGrade(player.stats.luck),
  day = 1,
  phase: RewardPhase = 'subject',
): RewardOption[] {
  const effectiveGrade = rewardGradeForDay(grade, day)
  if (phase === 'item') return generateItemRewards(player, effectiveGrade, day)
  return generateWordRewards(player, effectiveGrade, day, phase)
}
