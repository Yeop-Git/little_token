/**
 * 스테이지 클리어 보상 — 주어·수식어 → 아이템 → 동사 순서로 각각 3택한다.
 * 전투 등급에 15층 사이클 진행 보정을 더해 뒤로 갈수록 단어 보상의 높은 희귀도가
 * 자주 나온다. 1~4층 노멀, 5~9층 희귀, 10~15층 영웅이 중심이며 각 구간에서
 * 다음 등급 확률이 상승한다. 10층에는 전설 아이템을, 15층에는 전설 스킬을
 * 하나씩 선택 가능하게 보장한다.
 */

import type { Emotion, Rarity, Word } from '@core/types'
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

/** 영감 가격은 희귀도만 읽는다. 같은 등급 안에서는 새 카드와 반복강화가 같은 선택 무게를 갖는다. */
export const REWARD_PRICE: Readonly<Record<Rarity, number>> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
}
export const REWARD_REFRESH_COST = 1

export function rewardPrice(option: RewardOption): number {
  return REWARD_PRICE[option.rarity]
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식어', verb: '동사', obj: '목적어', end: '어미' }
const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary']

function shuffle<T>(values: T[], rng: () => number): T[] {
  const result = [...values]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
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
export const EARLY_BUILD_REWARD_DAY = 2
/** 2층에서 수식어로 먼저 고르는 방어·회복·순환 전술의 방향. */
export const EARLY_BUILD_MODIFIER_IDS = ['deulsseogimyeo', 'pogeunhage', 'gyeongkwaehage'] as const
/** 같은 보상의 동사 단계에서 각 전술을 실제 승리 엔진으로 완성한다. */
export const EARLY_BUILD_CARD_IDS = ['storedResolve', 'overflowingHeart', 'drinkInk'] as const

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
  rng: () => number,
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
  for (const [rarity, pool] of pools) pools.set(rarity, shuffle(pool, rng))
  const pool = forceRarity
    ? pools.get(forceRarity) ?? null
    : nearestPool(pools, rollRewardRarity(grade, day, rng))
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

const REWARD_EMOTIONS = ['joy', 'anger', 'sorrow', 'pleasure'] as const satisfies readonly Emotion[]

/** 주력 감정은 이어 주고 가장 부족한 감정은 선택지로 열어, 어느 길도 보상 RNG가 닫지 않게 한다. */
function deckEmotionProfile(player: PlayerState): { preferred: Emotion | null; support: Emotion } {
  const counts = new Map<Emotion, number>(REWARD_EMOTIONS.map((emotion) => [emotion, 0]))
  for (const word of Object.values(player.deck).flat()) {
    if (word.emotion === 'neutral') continue
    counts.set(word.emotion, (counts.get(word.emotion) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return {
    preferred: ranked[0] && ranked[0][1] > (ranked[1]?.[1] ?? 0) ? ranked[0][0] : null,
    support: [...ranked].reverse()[0][0],
  }
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
  // 아이템은 슬롯 제한 없이 영구 누적되므로 같은 정의를 다시 주면 감탄사 스탯만
  // 무한히 쌓인다. 한 런에서는 일반 스탯 아이템과 규칙 아이템 모두 한 번만 등장한다.
  return [...Object.values(ITEMS), ...Object.values(PASSIVE_ITEMS)]
    .filter((item) => !owned.has(item.id))
    .map(toItemOption)
}

function generateWordRewards(player: PlayerState, grade: number, day: number, phase: 'subject' | 'verb', rng: () => number): RewardOption[] {
  const slots = phase === 'subject' ? ['subj', 'adv'] : ['verb']
  const all = wordOptions(player, slots)
  const used = new Set<string>()
  const picks: RewardOption[] = []
  const emotionProfile = deckEmotionProfile(player)

  // 공격만 고르는 습관이 굳기 전에, 수식어 자체가 문장의 전술을 바꾼다는 것을
  // 세 갈래로 직접 보여 준다. 방어도 피해·초과 회복 피해·손패 순환은 어느 쪽도
  // 실패나 자해가 없고, 공격하지 않는 선택에도 독립된 성장 방향을 준다.
  if (phase === 'subject' && day === EARLY_BUILD_REWARD_DAY) {
    for (const id of EARLY_BUILD_MODIFIER_IDS) {
      const option = pickOne(all.filter((entry) => entry.word?.id === id), grade, day, used, rng)
      if (option) picks.push(option)
    }
    if (picks.length === 3) return shuffle(picks, rng)
  }

  // 첫 보스 전에 방어 전환·초과 회복·흡혈 중 하나를 직접 고르게 한다. 핵심 빌드가
  // 무작위 보상에 묻히면 스탯만 올리고 그 스탯을 쓸 문장을 끝내 못 얻을 수 있다.
  if (phase === 'verb' && day === EARLY_BUILD_REWARD_DAY) {
    for (const id of EARLY_BUILD_CARD_IDS) {
      const option = pickOne(all.filter((entry) => entry.word?.id === id), grade, day, used, rng)
      if (option) picks.push(option)
    }
    if (picks.length === 3) return shuffle(picks, rng)
  }

  // 5·10·15층 보상에는 각각 희귀·영웅·전설 스킬을 한 장 이상 고정한다.
  const bossRarity = bossRewardRarity(day)
  if (bossRarity) {
    const option = pickOne(all, grade, day, used, rng, bossRarity)
    if (option) picks.push(option)
  }
  if (picks.length < 3 && !picks.some((entry) => entry.word?.emotion === emotionProfile.support)) {
    const option = pickOne(all.filter((entry) => entry.word?.emotion === emotionProfile.support), grade, day, used, rng)
    if (option) picks.push(option)
  }
  // 첫 단계는 세 장이 한 문법에 몰리지 않도록 주어와 수식어를 한 장씩 보장한다.
  if (phase === 'subject') {
    for (const slot of slots) {
      if (picks.some((entry) => entry.word?.slot === slot)) continue
      const slotPool = all.filter((entry) => entry.word?.slot === slot)
      const alignedPool = emotionProfile.preferred && !picks.some((entry) => entry.word?.emotion === emotionProfile.preferred)
        ? slotPool.filter((entry) => entry.word?.emotion === emotionProfile.preferred)
        : []
      const option = pickOne(alignedPool.length ? alignedPool : slotPool, grade, day, used, rng)
      if (option) picks.push(option)
    }
  }
  // A boss-eve verb reward always includes one card that interacts with the next boss's rule.
  // Already-owned cards remain useful here because the reward becomes a reinforcement.
  if (phase === 'verb') {
    const tacticalIds = new Set(tacticalCardIdsForRewardDay(day))
    const option = pickOne(all.filter((entry) => entry.word && tacticalIds.has(entry.word.id)), grade, day, used, rng)
    if (option) picks.push(option)
  }
  // 동사 보상은 공격 카드만 셋 겹쳐 나오지 않게 한다. 이미 보장 카드가 들어왔다면
  // 남은 칸부터 비어 있는 행동 축을 채워 공격·방어·회복 빌드를 화면에서 함께 읽힌다.
  if (phase === 'verb') {
    for (const kind of ['guard', 'heal', 'attack'] as const) {
      if (picks.length >= 3 || picks.some((entry) => entry.word?.kind === kind)) continue
      const option = pickOne(all.filter((entry) => entry.word?.kind === kind), grade, day, used, rng)
      if (option) picks.push(option)
    }
  }
  if (emotionProfile.preferred && picks.length < 3 && !picks.some((entry) => entry.word?.emotion === emotionProfile.preferred)) {
    const option = pickOne(all.filter((entry) => entry.word?.emotion === emotionProfile.preferred), grade, day, used, rng)
    if (option) picks.push(option)
  }
  while (picks.length < 3) {
    const shownEmotions = new Set(picks.map((entry) => entry.word?.emotion).filter(Boolean))
    const diverse = all.filter((entry) => entry.word && !shownEmotions.has(entry.word.emotion))
    const option = pickOne(diverse.length ? diverse : all, grade, day, used, rng)
    if (!option) break
    picks.push(option)
  }
  return shuffle(picks, rng)
}

function generateItemRewards(player: PlayerState, grade: number, day: number, rng: () => number): RewardOption[] {
  const items = itemOptions(player)
  const used = new Set<string>()
  const picks: RewardOption[] = []

  // 단어 카드와 같은 pickOne/희귀도 곡선을 사용한다. 10층 확정 전설만 추가 예외다.
  // 10층에는 매 사이클 전설 규칙 아이템을 최소 한 장 선택할 수 있게 둔다.
  const forceLegendaryItem = floorInCycle(day) === GUARANTEED_LEGENDARY_ITEM_FLOOR
  if (forceLegendaryItem) {
    const item = pickOne(items, grade, day, used, rng, 'legendary')
    if (item) picks.push(item)
  }
  while (picks.length < 3) {
    const option = pickOne(items, grade, day, used, rng)
    if (!option) break
    picks.push(option)
  }
  return shuffle(picks, rng)
}

export function genRewards(
  player: PlayerState,
  grade = startGrade(player.stats.luck),
  day = 1,
  phase: RewardPhase = 'subject',
  rng: () => number = Math.random,
  availableInspiration = Number.POSITIVE_INFINITY,
): RewardOption[] {
  const effectiveGrade = rewardGradeForDay(grade, day)
  const candidates = phase === 'item'
    ? itemOptions(player)
    : wordOptions(player, phase === 'subject' ? ['subj', 'adv'] : ['verb'])
  const picks = phase === 'item'
    ? generateItemRewards(player, effectiveGrade, day, rng)
    : generateWordRewards(player, effectiveGrade, day, phase, rng)
  if (!picks.length || picks.some((option) => rewardPrice(option) <= availableInspiration)) return picks

  // 구매 불가 카드를 고급 선택지로 보여 줄 수는 있지만 셋 전부 잠기지는 않는다.
  // 같은 단계의 후보 중 현재 잔액으로 살 수 있는 가장 좋은 한 장을 마지막 칸에 보장한다.
  const shownIds = new Set(picks.map((option) => option.word?.id ?? option.item?.id ?? option.name))
  const affordable = candidates
    .filter((option) => rewardPrice(option) <= availableInspiration)
    .sort((a, b) => rewardPrice(b) - rewardPrice(a))
  const replacements = affordable.filter((option) => !shownIds.has(option.word?.id ?? option.item?.id ?? option.name))
  if (!replacements.length && affordable[0]) replacements.push(affordable[0])
  if (!replacements.length) return picks

  let best = { score: Number.NEGATIVE_INFINITY, picks }
  const milestoneRarity = bossRewardRarity(day)
  for (let index = 0; index < picks.length; index++) {
    const removesOnlyMilestone = milestoneRarity
      && picks[index].rarity === milestoneRarity
      && picks.filter((option) => option.rarity === milestoneRarity).length === 1
    for (const replacement of replacements) {
      const proposal = picks.map((option, optionIndex) => optionIndex === index ? replacement : option)
      const actionKinds = phase === 'verb'
        ? new Set(proposal.map((option) => option.word?.kind).filter(Boolean)).size
        : 0
      const grammarSlots = phase === 'subject'
        ? new Set(proposal.map((option) => option.word?.slot).filter(Boolean)).size
        : 0
      const score = actionKinds * 100 + grammarSlots * 20 + (removesOnlyMilestone ? -1_000 : 0) + rewardPrice(replacement)
      if (score > best.score) best = { score, picks: proposal }
    }
  }
  return shuffle(best.picks, rng)
}

/** 저장된 씨앗·단계·새로고침 횟수에서 같은 진열을 재현하는 작은 PRNG. */
export function rewardOfferRng(seed: number, phase: RewardPhase, refreshes: number): () => number {
  const phaseSalt: Record<RewardPhase, number> = { subject: 0x13579bdf, item: 0x2468ace, verb: 0x5bd1e995 }
  let state = (seed ^ phaseSalt[phase] ^ Math.imul(refreshes + 1, 0x9e3779b1)) >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}
