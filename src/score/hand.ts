/**
 * 손패 (§15 쉬는 카드). 칸마다 뽑을 더미·손패·버린 더미를 따로 둔다.
 * 쓴 단어는 버린 더미로 가고 손패를 다시 채운다. 더미가 비면 버린 더미를 섞어 다시 쓰되
 * 칸에 단어가 3장 이상이면 직전 기회에 쓴 단어는 다음 손패에서 한 번 쉰다.
 */
import { HAND_PER_SLOT, REST_MIN_SLOT_CARDS, card as cardDef } from './data'
import type { DeckCard, ScoreSlot } from './types'
import { SCORE_SLOTS } from './types'

export interface SlotPile {
  draw: DeckCard[]
  hand: DeckCard[]
  discard: DeckCard[]
}

export type Hand = Record<ScoreSlot, SlotPile>

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function slotCards(deck: DeckCard[], slot: ScoreSlot): DeckCard[] {
  return deck.filter((c) => cardDef(c.cardId).slot === slot)
}

export function newHand(deck: DeckCard[], rng: () => number): Hand {
  const out = {} as Hand
  for (const slot of SCORE_SLOTS) {
    const draw = shuffle(slotCards(deck, slot), rng)
    out[slot] = { draw, hand: [], discard: [] }
    refill(out[slot], undefined, rng)
  }
  return out
}

function refill(p: SlotPile, resting: DeckCard | undefined, rng: () => number, size = HAND_PER_SLOT) {
  while (p.hand.length < size) {
    if (!p.draw.length) {
      const total = p.hand.length + p.discard.length
      const keepOut = resting && total >= REST_MIN_SLOT_CARDS ? resting : undefined
      const back = p.discard.filter((c) => c !== keepOut)
      if (!back.length) break
      p.discard = keepOut ? [keepOut] : []
      p.draw = shuffle(back, rng)
    }
    p.hand.push(p.draw.pop()!)
  }
}

/** 문장에 쓴 단어를 버리고 손패를 채운다. */
export function afterSentence(h: Hand, used: Partial<Record<ScoreSlot, DeckCard>>, rng: () => number): Hand {
  const out = {} as Hand
  for (const slot of SCORE_SLOTS) {
    const p: SlotPile = { draw: [...h[slot].draw], hand: [...h[slot].hand], discard: [...h[slot].discard] }
    const u = used[slot]
    if (u) {
      p.hand = p.hand.filter((c) => c !== u)
      p.discard.push(u)
    }
    refill(p, u, rng)
    out[slot] = p
  }
  return out
}

/** 손패를 모두 버리고 새로 뽑는다(흔들었다). */
export function redraw(h: Hand, rng: () => number): Hand {
  const out = {} as Hand
  for (const slot of SCORE_SLOTS) {
    const p: SlotPile = { draw: [...h[slot].draw], hand: [], discard: [...h[slot].discard, ...h[slot].hand] }
    refill(p, undefined, rng)
    out[slot] = p
  }
  return out
}

/** 한 칸에서 한 장을 바꾼다(우연히 만난 나는). */
export function swapOne(h: Hand, slot: ScoreSlot, out: DeckCard, rng: () => number): Hand {
  const p: SlotPile = { draw: [...h[slot].draw], hand: h[slot].hand.filter((c) => c !== out), discard: [...h[slot].discard, out] }
  refill(p, out, rng)
  return { ...h, [slot]: p }
}
