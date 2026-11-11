/**
 * 써 보기 (§11): "내 단어장에서 가장 센 문장이 54에서 71로".
 * 덱 전체(손패 무관)에서 표준 스테이지의 첫·가운데·마지막 문장 기댓값 최고점을 평균한다.
 * 상점 미리보기와 시뮬레이터 봇이 같은 함수를 쓴다.
 */
import { card as cardDef } from './data'
import { expectedScore, validatePick } from './scoring'
import type { DeckCard, ScoreLoadout, SentencePick, StageContext } from './types'
import { EMPTY_CARRY } from './types'

/** 표준 3기회 맑은 날의 세 위치. 새 물감은 첫 문장만 받는다. */
export function referenceContexts(): StageContext[] {
  const base = (left: number, used: number, emotionsUsed: StageContext['emotionsUsed']): StageContext => ({
    formId: 'standard', weatherIds: ['clear'], chancesTotal: 3, chancesLeft: left, sentencesUsed: used, tears: used * 2,
    history: [], carry: { ...EMPTY_CARRY }, emotionsUsed, angerWordsUsed: used, wordUses: {}, stageAdd: 0,
    oncePerStageUsed: [],
  })
  return [base(3, 0, []), base(2, 1, ['anger', 'sorrow', 'joy', 'pleasure', 'chaos']), base(1, 2, ['anger', 'sorrow', 'joy', 'pleasure', 'chaos'])]
}

export function allPicks(deck: DeckCard[], ctx: StageContext): SentencePick[] {
  const subj = deck.filter((c) => cardDef(c.cardId).slot === 'subj')
  const adv = deck.filter((c) => cardDef(c.cardId).slot === 'adv')
  const verb = deck.filter((c) => cardDef(c.cardId).slot === 'verb')
  const advs: (DeckCard | undefined)[] = ctx.weatherIds.includes('drowsy') ? [undefined, ...adv] : adv
  const out: SentencePick[] = []
  for (const s of subj) for (const a of advs) for (const v of verb) {
    const p = { subj: s, adv: a, verb: v }
    if (validatePick(p, ctx).ok) out.push(p)
  }
  return out
}

export interface TryoutBaseline {
  /** 위치별 상위 문장과 기댓값. */
  top: { pick: SentencePick; ev: number }[][]
  value: number
}

const TOP_K = 12

export function tryoutBaseline(deck: DeckCard[], loadout: ScoreLoadout): TryoutBaseline {
  const ctxs = referenceContexts()
  const top = ctxs.map((ctx) =>
    allPicks(deck, ctx)
      .map((pick) => ({ pick, ev: expectedScore(pick, ctx, loadout) }))
      .sort((a, b) => b.ev - a.ev)
      .slice(0, TOP_K),
  )
  return { top, value: avg(top.map((t) => t[0]?.ev ?? 0)) }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

/** 스탯·유물이 바뀐 로드아웃의 값. 기준 상위 문장만 다시 계산한다(근사). */
export function tryoutLoadout(base: TryoutBaseline, loadout: ScoreLoadout): number {
  const ctxs = referenceContexts()
  return avg(ctxs.map((ctx, i) => Math.max(0, ...base.top[i].map((t) => expectedScore(t.pick, ctx, loadout)))))
}

/** 덱에 카드 한 장(또는 스티커를 붙인 카드)을 바꿔 넣었을 때의 값. 그 카드가 든 문장만 새로 계산한다. */
export function tryoutCard(base: TryoutBaseline, deck: DeckCard[], changed: DeckCard, loadout: ScoreLoadout): number {
  const ctxs = referenceContexts()
  const rest = deck.filter((c) => c.uid !== changed.uid)
  const next = [...rest, changed]
  return avg(ctxs.map((ctx, i) => {
    const kept = base.top[i].filter((t) => ![t.pick.subj, t.pick.adv, t.pick.verb].some((c) => c?.uid === changed.uid))
    const withNew = allPicks(next, ctx).filter((p) => [p.subj, p.adv, p.verb].some((c) => c?.uid === changed.uid))
    return Math.max(0, ...kept.map((t) => t.ev), ...withNew.map((p) => expectedScore(p, ctx, loadout)))
  }))
}

// ── 상점 물건의 써 보기 ──

export interface OfferTryout {
  from: number
  to: number
  /** 스티커를 붙이면 가장 좋은 단어. */
  targetUid?: number
  /** 유물을 놓으면 가장 좋은 자리. */
  relicAt?: number
}

/** 단어(새 단어 또는 강화)를 덱에 넣었을 때. */
export function tryoutWord(base: TryoutBaseline, deck: DeckCard[], loadout: ScoreLoadout, cardId: string, upgradeUid?: number): OfferTryout {
  const owned = upgradeUid != null ? deck.find((c) => c.uid === upgradeUid) : undefined
  const probe: DeckCard = owned ? { ...owned, level: owned.level + 1 } : { uid: -1, cardId, level: 0 }
  return { from: base.value, to: Math.max(base.value, tryoutCard(base, deck, probe, loadout)) }
}

/** 스티커를 맞는 칸의 단어 중 가장 좋은 곳에 붙였을 때. */
export function tryoutSticker(base: TryoutBaseline, deck: DeckCard[], loadout: ScoreLoadout, stickerId: string, slot: string): OfferTryout {
  let best: OfferTryout = { from: base.value, to: base.value }
  for (const c of deck) {
    if (cardDef(c.cardId).slot !== slot) continue
    const v = tryoutCard(base, deck, { ...c, sticker: stickerId }, loadout)
    if (best.targetUid == null || v > best.to) best = { from: base.value, to: v, targetUid: c.uid }
  }
  return best
}

/** 유물을 가장 좋은 자리에 놓았을 때. */
export function tryoutRelic(base: TryoutBaseline, loadout: ScoreLoadout, relicId: string): OfferTryout {
  let best: OfferTryout = { from: base.value, to: -Infinity, relicAt: loadout.relics.length }
  for (let at = 0; at <= loadout.relics.length; at++) {
    const relics = [...loadout.relics.slice(0, at), relicId, ...loadout.relics.slice(at)]
    const v = tryoutLoadout(base, { stats: loadout.stats, relics })
    if (v > best.to) best = { from: base.value, to: v, relicAt: at }
  }
  return best
}
