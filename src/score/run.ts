/**
 * 런 엔진 (SCORE_REDESIGN.md §1·§9·§10·§11). 화면과 시뮬레이터 봇이 같은 엔진을 몬다.
 *
 * 흐름: battle → (목표 달성) → shop ⇄ forge → 다음 층 battle … → won / lost.
 * 무작위는 시드 하나에서만 나온다. 같은 시드와 같은 입력은 같은 런을 만든다.
 */
import {
  FLOORS_TOTAL, MAX_LEVEL, OVERTIME_HIT_PIECES, PIECES_PER_HEART, SCORE_CARDS, SCORE_RELICS, card as cardDef,
  relic as relicDef, startingStats, sticker as stickerDef,
} from './data'
import { afterSentence, newHand, redraw, swapOne, type Hand } from './hand'
import { expectedScore, pickCost, rngRoller, scoreSentence, validatePick } from './scoring'
import {
  ERASER_PRICE, FORGE_SLOTS, HEAL_PRICE, HEART_TRADES, MIN_SLOT_CARDS, RARITY_BASE_POINTS, RELIC_SLOTS, REROLL_PRICE,
  applyStatPoints, bonusSpread, forgeChoices, priceWithReceipt, rollStock, wordPrice,
  type HeartTradeId, type Rarity, type ShopOffer,
} from './shop'
import { applySentence, clearMoney, planStage, startStage, type StagePlan } from './stage'
import type {
  DeckCard, ScoreLoadout, ScoreSlot, ScoreStats, SentencePick, SentenceResult, StageContext, StatDef, StatEmotion,
  ValidationResult,
} from './types'
import { STAT_EMOTIONS } from './types'

export type RunPhase = 'battle' | 'shop' | 'forge' | 'won' | 'lost'

export interface StageState {
  plan: StagePlan
  ctx: StageContext
  hand: Hand
  scored: number
  /** 우연히 만난 나는이 손패에 있을 때 쓸 수 있는 무료 교체 수. */
  swapsLeft: number
  last?: SentenceResult
  overtime: number
}

export interface ShopState {
  stock: ShopOffer[]
  freeRerolls: number
  afterBoss: boolean
  /** 예보(§11): 다음 스테이지 둘. */
  forecast: StagePlan[]
  /** 유물 흥정 후보. */
  haggle?: string[]
}

export interface ForgeState {
  rarity: Rarity
  /** 기본 스탯(일반 1점·희귀 2점)이 붙은 감정. */
  baseStat?: StatEmotion
  choices: StatDef[][]
  bonus: number[]
  step: number
  picked: { id: string; points: number }[]
}

export interface RunEvent {
  kind: 'sentence' | 'overtime' | 'clear' | 'buy' | 'trade' | 'forge' | 'lost' | 'won' | 'softlock'
  floor: number
  detail: string
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export class ScoreRun {
  phase: RunPhase = 'battle'
  floor = 1
  deck: DeckCard[]
  stats: ScoreStats
  relics: string[] = []
  relicSlots = RELIC_SLOTS
  /** 현재 하트 조각. 최대치는 stats.mind. */
  pieces: number
  /** 지킴(소울하트) 조각. 일회용이며 하트보다 먼저 닳는다. */
  guard = 0
  money = 0
  cleared = 0
  /** 굳은 약속: 다음 재련의 등급 보너스 추가 점수. */
  pledge = 0
  sixthSlotBought = false
  stage!: StageState
  shop?: ShopState
  forge?: ForgeState
  events: RunEvent[] = []
  readonly rng: () => number
  private nextUid = 1

  constructor(public readonly seed: number) {
    this.rng = mulberry32(seed)
    this.deck = SCORE_CARDS.filter((c) => c.start).map((c) => ({ uid: this.nextUid++, cardId: c.id, level: 0 }))
    this.stats = startingStats()
    this.pieces = this.stats.mind
    this.enterStage()
  }

  get loadout(): ScoreLoadout { return { stats: this.stats, relics: this.relics } }
  get maxPieces(): number { return this.stats.mind }
  private log(kind: RunEvent['kind'], detail: string) { this.events.push({ kind, floor: this.floor, detail }) }

  // ── 전투 ──

  private enterStage() {
    const plan = planStage(this.floor, STAT_EMOTIONS[Math.floor(this.rng() * STAT_EMOTIONS.length)])
    const ctx = startStage(plan, this.loadout)
    const hand = newHand(this.deck, this.rng)
    this.stage = { plan, ctx, hand, scored: 0, swapsLeft: 0, overtime: 0 }
    this.refreshSwaps()
    this.phase = 'battle'
    this.shop = undefined
  }

  private refreshSwaps() {
    const st = this.stage
    const blackout = st.ctx.weatherIds.includes('blackout')
    const uyeon = st.hand.subj.hand.find((c) => c.cardId === 'uyeon')
    st.swapsLeft = uyeon && !blackout ? cardDef('uyeon').b : 0
  }

  /** 손패로 만들 수 있는 모든 문장(겹주어·겹동사 포함). */
  handPicks(): SentencePick[] {
    const { hand, ctx } = this.stage
    const drowsy = ctx.weatherIds.includes('drowsy')
    const advs: (DeckCard | undefined)[] = drowsy ? [undefined, ...hand.adv.hand] : hand.adv.hand
    const subj2s: (DeckCard | undefined)[] = this.relics.includes('twinSubj') ? [undefined, ...hand.subj.hand] : [undefined]
    const verb2s: (DeckCard | undefined)[] = this.relics.includes('twinVerb') ? [undefined, ...hand.verb.hand] : [undefined]
    const out: SentencePick[] = []
    for (const subj of hand.subj.hand) for (const adv of advs) for (const verb of hand.verb.hand) {
      for (const subj2 of subj2s) for (const verb2 of verb2s) {
        if (subj2 === subj || verb2 === verb) continue
        // 겹주어·겹동사는 순서가 없는 한 쌍이 아니라 첫째·둘째 칸이 다르므로 그대로 둔다.
        const p: SentencePick = { subj, adv, verb, subj2, verb2 }
        if (validatePick(p, ctx).ok) out.push(p)
      }
    }
    return out
  }

  validate(pick: SentencePick): ValidationResult {
    if (this.phase !== 'battle') return { ok: false, reason: '전투 중이 아님' }
    if (pick.subj2 && !this.relics.includes('twinSubj')) return { ok: false, reason: '겹주어 유물이 없음' }
    if (pick.verb2 && !this.relics.includes('twinVerb')) return { ok: false, reason: '겹동사 유물이 없음' }
    return validatePick(pick, this.stage.ctx)
  }

  /** 예상 점수(기댓값). 칸을 채울 때마다 보여 주는 미리보기(§0 기대). */
  preview(pick: SentencePick): number {
    return expectedScore(pick, this.stage.ctx, this.loadout)
  }

  /** 이 문장을 쓰면 맞는 하트 조각(기회를 다 쓴 뒤). */
  overtimeHit(): number {
    return this.stage.ctx.chancesLeft <= 0 ? OVERTIME_HIT_PIECES : 0
  }

  /** 손패 한 장 무료 교체(우연히 만난 나는). */
  swap(slot: ScoreSlot, card: DeckCard): boolean {
    const st = this.stage
    if (this.phase !== 'battle' || st.swapsLeft <= 0 || !st.hand[slot].hand.includes(card)) return false
    st.hand = swapOne(st.hand, slot, card, this.rng)
    st.swapsLeft--
    return true
  }

  /**
   * 손패로 문장을 만들 수 없을 때의 구제. 소프트락은 허용하지 않는다(AGENTS 불변식).
   * 차례로: 손패 새로 뽑기 → 우박의 사용 횟수 초기화 → 이 스테이지의 날씨 걷힘. 그래도 없으면 런 종료.
   */
  rescueHand(): boolean {
    if (this.handPicks().length) return true
    const st = this.stage
    st.hand = redraw(st.hand, this.rng)
    if (this.handPicks().length) return true
    st.ctx = { ...st.ctx, wordUses: {} }
    if (this.handPicks().length) { this.log('softlock', '우박이 잦아들어 단어를 다시 쓸 수 있다'); return true }
    st.ctx = { ...st.ctx, weatherIds: ['clear'] }
    if (this.handPicks().length) { this.log('softlock', '날씨가 걷혔다'); return true }
    this.log('softlock', '손패로 문장을 만들 수 없음')
    this.phase = 'lost'
    return false
  }

  play(pick: SentencePick): SentenceResult {
    const v = this.validate(pick)
    if (!v.ok) throw new Error(`놓을 수 없는 문장: ${v.reason}`)
    const st = this.stage
    const hit = this.overtimeHit()
    if (hit > 0) {
      st.overtime++
      const absorbed = Math.min(this.guard, hit)
      this.guard -= absorbed
      this.pieces -= hit - absorbed
      this.log('overtime', `하트 조각 -${hit - absorbed}${absorbed ? `, 지킴 -${absorbed}` : ''}`)
    }
    const res = scoreSentence(pick, st.ctx, this.loadout, rngRoller(this.rng), this.rng())
    st.scored += res.score
    st.last = res
    st.ctx = applySentence(st.ctx, res)
    st.hand = afterSentence(st.hand, { subj: pick.subj, adv: pick.adv, verb: pick.verb }, this.rng)
    if (res.redrawHand) st.hand = redraw(st.hand, this.rng)
    this.refreshSwaps()
    this.log('sentence', `${res.record.wordIds.map((id) => cardDef(id).name).join(' ')} → ${res.score}${res.crit ? ' (대성공)' : ''}`)
    if (st.scored >= st.plan.target) this.clearStage()
    else if (this.pieces <= 0) { this.phase = 'lost'; this.log('lost', `${this.floor}층에서 하트가 다함`) }
    return res
  }

  /** 도구 전용: 목표와 무관하게 스테이지를 넘긴다(점수 여력 측정). */
  forceClear() { if (this.phase === 'battle') this.clearStage() }

  private clearStage() {
    const st = this.stage
    const earned = clearMoney(st.ctx, this.loadout)
    this.money += earned
    this.cleared++
    this.log('clear', `돈 +${earned} (남은 기회 ${Math.max(0, st.ctx.chancesLeft)})`)
    const boss = !!st.plan.boss
    if (boss) this.pieces = Math.min(this.maxPieces, this.pieces + PIECES_PER_HEART)
    if (this.relics.includes('beanstalk')) {
      const d = relicDef('beanstalk')
      if (this.cleared % d.a === 0 && this.stats.mind < d.b * PIECES_PER_HEART) {
        this.stats = { ...this.stats, mind: this.stats.mind + PIECES_PER_HEART }
        this.pieces += PIECES_PER_HEART
      }
    }
    if (this.floor >= FLOORS_TOTAL) { this.phase = 'won'; this.log('won', '완주'); return }
    this.openShop(boss)
  }

  // ── 상점 ──

  private rollShopStock(afterBoss: boolean): ShopOffer[] {
    return rollStock({
      deck: this.deck, relics: this.relics, luck: this.stats.luck, afterBoss,
      nextWeathers: planStage(this.floor + 1).weatherIds,
    }, this.rng)
  }

  private openShop(afterBoss: boolean) {
    const forecast = [this.floor + 1, this.floor + 2].filter((f) => f <= FLOORS_TOTAL).map((f) => planStage(f))
    this.shop = { stock: this.rollShopStock(afterBoss), freeRerolls: this.stats.freeReroll, afterBoss, forecast }
    this.phase = 'shop'
  }

  slotCount(slot: ScoreSlot): number {
    return this.deck.filter((c) => cardDef(c.cardId).slot === slot).length
  }

  /** 이 물건을 지금 살 수 있는지와 이유. */
  canBuy(offer: ShopOffer, targetUid?: number): ValidationResult {
    if (this.phase !== 'shop' || !this.shop?.stock.includes(offer)) return { ok: false, reason: '진열대에 없음' }
    if (offer.price > this.money) return { ok: false, reason: '돈이 모자람' }
    if (offer.kind === 'relic' && this.relics.length >= this.relicSlots) return { ok: false, reason: '유물 칸이 가득 참' }
    if (offer.kind === 'sticker') {
      const target = this.deck.find((c) => c.uid === targetUid)
      if (!target) return { ok: false, reason: '붙일 단어를 골라야 함' }
      if (cardDef(target.cardId).slot !== stickerDef(offer.id).slot) return { ok: false, reason: '칸이 맞지 않는 스티커' }
    }
    return { ok: true }
  }

  /**
   * 구매. 스티커는 붙일 단어(targetUid), 유물은 놓을 자리(relicAt, 기본 맨 오른쪽)를 받는다.
   * 이미 스티커가 붙은 단어에 붙이면 옛 스티커는 사라진다(§7).
   */
  buy(offer: ShopOffer, opts: { targetUid?: number; relicAt?: number } = {}): boolean {
    if (!this.canBuy(offer, opts.targetUid).ok) return false
    this.money -= offer.price
    this.shop!.stock = this.shop!.stock.filter((o) => o !== offer)
    this.take(offer, opts)
    return true
  }

  private take(offer: ShopOffer, opts: { targetUid?: number; relicAt?: number }) {
    if (offer.kind === 'word') {
      const owned = offer.upgradeUid != null ? this.deck.find((c) => c.uid === offer.upgradeUid) : this.deck.find((c) => c.cardId === offer.id)
      if (owned) owned.level = Math.min(MAX_LEVEL, owned.level + 1)
      else this.deck.push({ uid: this.nextUid++, cardId: offer.id, level: 0 })
      this.log('buy', `단어 ${cardDef(offer.id).name}${owned ? ' 강화' : ''}`)
    } else if (offer.kind === 'sticker') {
      this.deck.find((c) => c.uid === opts.targetUid)!.sticker = offer.id
      this.log('buy', `스티커 ${stickerDef(offer.id).name}`)
    } else if (offer.kind === 'relic') {
      this.relics.splice(opts.relicAt ?? this.relics.length, 0, offer.id)
      this.log('buy', `유물 ${relicDef(offer.id).name}`)
    } else {
      this.startForge(offer.rarity)
    }
  }

  reroll(): boolean {
    const sh = this.shop
    if (this.phase !== 'shop' || !sh) return false
    if (sh.freeRerolls > 0) sh.freeRerolls--
    else if (this.money >= REROLL_PRICE) this.money -= REROLL_PRICE
    else return false
    sh.stock = this.rollShopStock(sh.afterBoss)
    return true
  }

  /** 돈 10으로 하트 1개 회복(§10). */
  heal(): boolean {
    const price = priceWithReceipt(HEAL_PRICE, this.relics)
    if (this.phase !== 'shop' || this.money < price || this.pieces >= this.maxPieces) return false
    this.money -= price
    this.pieces = Math.min(this.maxPieces, this.pieces + PIECES_PER_HEART)
    this.log('buy', '하트 회복')
    return true
  }

  private canRemove(uid: number): boolean {
    const c = this.deck.find((x) => x.uid === uid)
    if (!c) return false
    const def = cardDef(c.cardId)
    if (this.slotCount(def.slot) <= MIN_SLOT_CARDS) return false
    // 기회 1 동사가 하나는 남아야 막다른 길이 없다(§6).
    if (def.slot === 'verb' && def.cost === 1) {
      const others = this.deck.filter((x) => x.uid !== uid && cardDef(x.cardId).slot === 'verb' && cardDef(x.cardId).cost === 1)
      if (!others.length) return false
    }
    return true
  }

  /** 단어 팔기: 반값(§11). */
  sell(uid: number): boolean {
    if (this.phase !== 'shop' || !this.canRemove(uid)) return false
    const c = this.deck.find((x) => x.uid === uid)!
    this.money += Math.floor(wordPrice(cardDef(c.cardId).cost) / 2)
    this.deck = this.deck.filter((x) => x.uid !== uid)
    return true
  }

  /** 지우개: 돈을 내고 단어를 덱에서 뺀다(§11). */
  erase(uid: number): boolean {
    const price = priceWithReceipt(ERASER_PRICE, this.relics)
    if (this.phase !== 'shop' || this.money < price || !this.canRemove(uid)) return false
    this.money -= price
    this.deck = this.deck.filter((x) => x.uid !== uid)
    return true
  }

  /** 유물 줄 순서 바꾸기. 순서가 점수를 바꾼다(§4-4). 전투 중에는 바꿀 수 없다. */
  moveRelic(from: number, to: number): boolean {
    if (this.phase !== 'shop' || from < 0 || from >= this.relics.length || to < 0 || to >= this.relics.length) return false
    const [id] = this.relics.splice(from, 1)
    this.relics.splice(to, 0, id)
    return true
  }

  sellRelic(index: number): boolean {
    if (this.phase !== 'shop' || !this.relics[index]) return false
    this.money += Math.floor(relicDef(this.relics[index]).price / 2)
    this.relics.splice(index, 1)
    return true
  }

  // ── 하트 거래 (§10) ──

  canTrade(id: HeartTradeId): ValidationResult {
    if (this.phase !== 'shop') return { ok: false, reason: '상점이 아님' }
    const cost = HEART_TRADES[id].pieces
    // 현재 하트로만 지불하고 마지막 하트 1개는 낼 수 없다.
    if (this.pieces - cost < PIECES_PER_HEART) return { ok: false, reason: '마지막 하트는 낼 수 없음' }
    if (id === 'sixthSlot' && this.sixthSlotBought) return { ok: false, reason: '런에 한 번' }
    if (id === 'sticker' && !this.shop!.stock.some((o) => o.kind === 'sticker')) return { ok: false, reason: '진열된 스티커가 없음' }
    if (id === 'haggle' && this.relics.length >= this.relicSlots) return { ok: false, reason: '유물 칸이 가득 참' }
    if (id === 'recall' && !this.deck.some((c) => c.level < MAX_LEVEL && cardDef(c.cardId).grow)) return { ok: false, reason: '강화할 단어가 없음' }
    return { ok: true }
  }

  /**
   * 하트 거래. sticker는 진열된 스티커(offer)와 붙일 단어, recall은 강화할 단어(targetUid)가 필요하다.
   * haggle은 후보 셋을 `shop.haggle`에 올리고 `chooseHaggle`로 고른다.
   */
  trade(id: HeartTradeId, opts: { offer?: ShopOffer; targetUid?: number } = {}): boolean {
    if (!this.canTrade(id).ok) return false
    const sh = this.shop!
    const t = HEART_TRADES[id]
    if (id === 'sticker') {
      const o = opts.offer
      const target = this.deck.find((c) => c.uid === opts.targetUid)
      if (!o || o.kind !== 'sticker' || !sh.stock.includes(o) || !target || cardDef(target.cardId).slot !== stickerDef(o.id).slot) return false
      sh.stock = sh.stock.filter((x) => x !== o)
      target.sticker = o.id
    } else if (id === 'exchange') {
      this.money += HEART_TRADES.exchange.money
    } else if (id === 'recall') {
      const target = this.deck.find((c) => c.uid === opts.targetUid)
      if (!target || target.level >= MAX_LEVEL || !cardDef(target.cardId).grow) return false
      target.level = Math.min(MAX_LEVEL, target.level + HEART_TRADES.recall.levels)
    } else if (id === 'pledge') {
      this.pledge += HEART_TRADES.pledge.bonus
    } else if (id === 'haggle') {
      const pool = SCORE_RELICS.filter((r) => !this.relics.includes(r.id))
      const picks: string[] = []
      while (picks.length < HEART_TRADES.haggle.candidates && pool.length) picks.push(pool.splice(Math.floor(this.rng() * pool.length), 1)[0].id)
      sh.haggle = picks
    } else if (id === 'sixthSlot') {
      this.relicSlots++
      this.sixthSlotBought = true
    }
    this.pieces -= t.pieces
    this.log('trade', t.name)
    return true
  }

  chooseHaggle(relicId: string, at?: number): boolean {
    const sh = this.shop
    if (!sh?.haggle?.includes(relicId) || this.relics.length >= this.relicSlots) return false
    this.relics.splice(at ?? this.relics.length, 0, relicId)
    sh.haggle = undefined
    return true
  }

  leaveShop(): boolean {
    if (this.phase !== 'shop') return false
    this.floor++
    this.enterStage()
    return true
  }

  // ── 재련 (§9) ──

  private startForge(rarity: Rarity) {
    let baseStat: StatEmotion | undefined
    const basePts = RARITY_BASE_POINTS[rarity]
    if (basePts) {
      baseStat = STAT_EMOTIONS[Math.floor(this.rng() * STAT_EMOTIONS.length)]
      this.stats = applyStatPoints(this.stats, baseStat, basePts)
    }
    this.forge = {
      rarity, baseStat, choices: forgeChoices(this.stats, this.rng), bonus: bonusSpread(rarity, this.rng, this.pledge),
      step: 0, picked: [],
    }
    this.pledge = 0
    this.phase = 'forge'
  }

  /** 지금 칸(감탄 → 정도 → 평가)에서 스탯 하나를 고른다. 되돌리지 않는다. */
  forgeChoose(statId: string): boolean {
    const f = this.forge
    if (this.phase !== 'forge' || !f) return false
    const def = f.choices[f.step].find((s) => s.id === statId)
    if (!def) return false
    const points = 1 + f.bonus[f.step]
    this.stats = applyStatPoints(this.stats, statId, points)
    if (statId === 'mind') this.pieces += def.perPoint * points
    if (statId === 'guard') this.guard += def.perPoint * points
    f.picked.push({ id: statId, points })
    f.step++
    if (f.step >= FORGE_SLOTS.length) {
      this.log('forge', f.picked.map((p) => `${p.id}+${p.points}`).join(' '))
      this.forge = undefined
      this.phase = 'shop'
    }
    return true
  }
}

export { pickCost }
