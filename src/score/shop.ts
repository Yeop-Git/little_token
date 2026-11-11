/**
 * 상점 (§11)과 아이템 재련 (§9). 보상 3택 순환을 대체한다.
 * 가게 셋: 문방구(스티커·소품), 헌책방(단어 낱장), 필통 가게(유물). 보스를 넘긴 날은 가게가 하나 더 열린다.
 * 가격 중 기획안에 없는 것(단어, 소품, 새로고침, 하트 회복 외)은 초안 상수다.
 */
import { SCORE_CARDS, SCORE_RELICS, SCORE_STATS, SCORE_STICKERS, SCORE_WEATHERS, relic as relicDef } from './data'
import type { DeckCard, ScoreStats, StatDef, StatEmotion } from './types'
import { STAT_EMOTIONS } from './types'

export const WORD_PRICE = 4
export const WORD_PRICE_COST2 = 5
export const ITEM_PRICE = 6
export const REROLL_PRICE = 2
/** §10: 상점에서 돈 10으로 하트 1개 회복. */
export const HEAL_PRICE = 10
export const RELIC_SLOTS = 5
/** 칸 수가 바뀌는 3차 유물은 계산기가 아직 처리하지 않아 진열하지 않는다. */
export const UNSHELVED_RELICS = ['twinSubj', 'twinVerb']

export type ShopOffer =
  | { kind: 'word'; id: string; price: number; guaranteed?: boolean }
  | { kind: 'sticker'; id: string; price: number }
  | { kind: 'relic'; id: string; price: number }
  | { kind: 'item'; rarity: Rarity; price: number }

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'
export const RARITY_BONUS: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 }
export const RARITY_BASE_POINTS: Record<Rarity, number> = { common: 1, rare: 2, epic: 0, legendary: 0 }

function sample<T>(xs: T[], n: number, rng: () => number): T[] {
  const a = [...xs]
  const out: T[] = []
  while (out.length < n && a.length) out.push(a.splice(Math.floor(rng() * a.length), 1)[0])
  return out
}

export function rollRarity(luck: number, rng: () => number): Rarity {
  const r = rng() - luck * 0.03
  if (r < 0.03) return 'legendary'
  if (r < 0.12) return 'epic'
  if (r < 0.38) return 'rare'
  return 'common'
}

export function priceWithReceipt(price: number, relics: string[]): number {
  const off = relics.filter((id) => id === 'receipt').length * (relicDef('receipt').a)
  return Math.max(1, price - off)
}

export interface StockInput {
  deck: DeckCard[]
  relics: string[]
  luck: number
  afterBoss: boolean
  /** 예보된 다음 스테이지 날씨. 막히는 칸이 생기면 대응 카드를 최소 1장 보장한다(§2 소프트락 방지). */
  nextWeathers?: string[]
}

/** 다음 날씨의 금지 감정 때문에 덱으로 채울 수 없는 칸에 대응 단어를 하나씩 보장한다. */
function guaranteedWords(input: StockInput, rng: () => number): ShopOffer[] {
  const banned = (input.nextWeathers ?? []).map((id) => SCORE_WEATHERS.find((w) => w.id === id)).filter((w) => w?.kind === 'ban').map((w) => w!.emotion)
  if (!banned.length) return []
  const owned = new Set(input.deck.map((c) => c.cardId))
  const out: ShopOffer[] = []
  for (const slot of ['subj', 'adv', 'verb'] as const) {
    const usable = input.deck.some((d) => { const c = SCORE_CARDS.find((x) => x.id === d.cardId)!; return c.slot === slot && !banned.includes(c.emotion) })
    if (usable) continue
    const pool = SCORE_CARDS.filter((c) => c.slot === slot && !banned.includes(c.emotion) && !owned.has(c.id) && c.cost === 1)
    const c = pool[Math.floor(rng() * pool.length)]
    if (c) out.push({ kind: 'word', id: c.id, price: WORD_PRICE, guaranteed: true })
  }
  return out
}

export function rollStock(input: StockInput, rng: () => number): ShopOffer[] {
  const owned = new Set(input.deck.map((c) => c.cardId))
  const words = sample(SCORE_CARDS.filter((c) => !owned.has(c.id)), 4, rng).map((c): ShopOffer => ({
    kind: 'word', id: c.id, price: c.cost === 2 ? WORD_PRICE_COST2 : WORD_PRICE,
  }))
  const stickers = sample(SCORE_STICKERS, 3, rng).map((s): ShopOffer => ({ kind: 'sticker', id: s.id, price: s.price }))
  const relicPool = SCORE_RELICS.filter((r) => !input.relics.includes(r.id) && !UNSHELVED_RELICS.includes(r.id))
  const relics = sample(relicPool, input.afterBoss ? 3 : 2, rng).map((r): ShopOffer => ({ kind: 'relic', id: r.id, price: r.price }))
  const items: ShopOffer[] = Array.from({ length: input.afterBoss ? 2 : 1 }, () => ({
    kind: 'item', rarity: rollRarity(input.luck, rng), price: ITEM_PRICE,
  }))
  return [...guaranteedWords(input, rng), ...words, ...stickers, ...relics, ...items].map((o) => ({ ...o, price: priceWithReceipt(o.price, input.relics) }))
}

// ── 재련 (§9): 감탄 → 정도 → 평가. 칸마다 5개 중 3개가 열린다. ──

export const STAT_BY_SLOT = {
  exclaim: SCORE_STATS.filter((s) => s.slot === 'exclaim'),
  degree: SCORE_STATS.filter((s) => s.slot === 'degree'),
  verdict: SCORE_STATS.filter((s) => s.slot === 'verdict'),
}
export const FORGE_SLOTS = ['exclaim', 'degree', 'verdict'] as const

export function highestEmotion(stats: ScoreStats): StatEmotion {
  return STAT_EMOTIONS.reduce((a, b) => (stats[b] > stats[a] ? b : a))
}

/** 칸마다 열리는 3장. 감탄 칸은 지금 가장 높은 감정이 약 80%로 열린다. */
export function forgeChoices(stats: ScoreStats, rng: () => number): StatDef[][] {
  return FORGE_SLOTS.map((slot) => {
    const pool = STAT_BY_SLOT[slot]
    if (slot !== 'exclaim') return sample(pool, 3, rng)
    const top = pool.find((s) => s.id === highestEmotion(stats))!
    const rest = pool.filter((s) => s !== top)
    return rng() < 0.8 ? [top, ...sample(rest, 2, rng)] : sample(rest, 3, rng)
  })
}

/** 등급 보너스 점수를 세 칸에 무작위로 나눈다. */
export function bonusSpread(rarity: Rarity, rng: () => number): number[] {
  const out = [0, 0, 0]
  for (let i = 0; i < RARITY_BONUS[rarity]; i++) out[Math.floor(rng() * 3)]++
  return out
}

/** 스탯 점수를 적용한다. 마음은 최대 하트 조각이자 현재 조각을 함께 올린다(호출자가 현재 조각 처리). */
export function applyStatPoints(stats: ScoreStats, id: string, points: number): ScoreStats {
  const def = SCORE_STATS.find((s) => s.id === id)
  if (!def) throw new Error(`스탯 없음: ${id}`)
  const s = { ...stats }
  if (id === 'lowestTwo') {
    const low = [...STAT_EMOTIONS].sort((a, b) => s[a] - s[b]).slice(0, 2)
    for (const e of low) s[e] += def.perPoint * points
    return s
  }
  ;(s as unknown as Record<string, number>)[id] += def.perPoint * points
  return s
}
