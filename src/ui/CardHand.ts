import { SPRITES } from '@/assets'
import { emotionOrNeutral, RARITY_LABEL, type Word } from '@core/types'
import { emotionIconBadge } from '@/ui/EmotionBadge'
import { wordCardDisplayNote, wordCardFrontHtml, wordMood } from '@/ui/WordCardFace'
import { wordNoteText } from '@core/wordText'
import { wordInkCost } from '@core/ink'
import { spawnCardCommitBurst } from '@/ui/CardCommitBurst'

// 클릭한 카드가 화면 중앙으로 날아가 터진 뒤 문장에 적용되는 시간.
const COMMIT_FLIGHT_MS = 480
const COMMIT_POP_MS = 180
export const CARD_HAND_CONFIG = {
  /** Subjects/modifiers open three choices; the eight-card verb deck opens four. */
  initialHand: 3,
  verbInitialHand: 4,
  maxHand: 6,
  /** 한 스테이지에서 추가로 뽑을 수 있는 횟수. 전투를 시작할 때 이 값으로 초기화된다. */
  drawsPerStage: 2,
  cardWidth: 158,
  cardHeight: 218,
  maxSpacing: 170,
  minSpacing: 68,
  selectedLift: 82,
  selectedScale: 1.12,
  drawDuration: 620,
} as const

export interface LineTransform {
  translateX: number
  zIndex: number
}

/** DOM과 무관한 일렬 손패 좌표 계산. 카드 묶음의 중심을 항상 화면 중앙에 맞춘다. */
export function calculateLineTransform(index: number, count: number, availableWidth = 900): LineTransform {
  const safeCount = Math.max(1, count)
  // 기본 3~4장은 또렷하게 펼치고, 추가 드로우로 5~6장이 되면 좌측 카드가 아래,
  // 우측 카드가 위인 한 방향 계단처럼 겹친다.
  const desiredSpacing = safeCount <= 4
    ? CARD_HAND_CONFIG.maxSpacing
    : safeCount === 5 ? 142 : 126
  const fitSpacing = safeCount === 1
    ? desiredSpacing
    : (availableWidth - CARD_HAND_CONFIG.cardWidth) / (safeCount - 1)
  const spacing = Math.max(CARD_HAND_CONFIG.minSpacing, Math.min(desiredSpacing, fitSpacing))
  const centerOffset = index - (safeCount - 1) / 2

  return {
    translateX: centerOffset * spacing,
    zIndex: 100 + index,
  }
}

interface CardInstance {
  instanceId: string
  word: Word
}

export interface SealedCard {
  instanceId: string
  word: Word
}

export type DebugCardSpawnResult = 'spawned' | 'already-in-hand' | 'hand-full' | 'unavailable'

interface SlotHandState {
  hand: CardInstance[]
  deck: CardInstance[]
}

/**
 * 초기 손패에 조건을 만족하는 카드가 없으면 덱의 첫 대상 카드와 교환한다.
 * 이미 섞인 순서는 가능한 한 유지해 나머지 카드의 무작위성을 바꾸지 않는다.
 */
export function ensureCardInInitialDraw(
  words: Word[],
  initialCount: number,
  predicate: (word: Word) => boolean,
): Word[] {
  const ordered = [...words]
  if (initialCount <= 0 || ordered.slice(0, initialCount).some(predicate)) return ordered

  const guaranteedIndex = ordered.findIndex((word, index) => index >= initialCount && predicate(word))
  if (guaranteedIndex < 0) return ordered

  ;[ordered[initialCount - 1], ordered[guaranteedIndex]] = [ordered[guaranteedIndex], ordered[initialCount - 1]]
  return ordered
}

/**
 * 초기 손패에 여러 종류를 각각 한 장씩 보장한다.
 * 입력은 이미 섞인 순서이므로 각 종류에서 처음 만난 카드만 앞으로 옮기고,
 * 나머지 카드의 상대적인 순서는 유지한다.
 */
export function ensureCardsInInitialDraw(
  words: Word[],
  initialCount: number,
  predicates: Array<(word: Word) => boolean>,
): Word[] {
  if (initialCount <= 0 || predicates.length === 0) return [...words]

  const guaranteedIndexes: number[] = []
  for (const predicate of predicates.slice(0, initialCount)) {
    const index = words.findIndex((word, wordIndex) =>
      !guaranteedIndexes.includes(wordIndex) && predicate(word),
    )
    if (index >= 0) guaranteedIndexes.push(index)
  }

  if (guaranteedIndexes.length === 0) return [...words]
  const guaranteed = guaranteedIndexes
    .sort((a, b) => a - b)
    .map((index) => words[index])
  const guaranteedSet = new Set(guaranteedIndexes)
  return [...guaranteed, ...words.filter((_, index) => !guaranteedSet.has(index))]
}

interface CardHandOptions {
  handRoot: HTMLElement
  deckButton: HTMLButtonElement
  onConfirm: (word: Word) => void
  onHover?: (word: Word) => void
  onHoverEnd?: () => void
  onPreview: (word: Word) => void
  onPreviewEnd: () => void
}

type ConflictResolver = (word: Word) => string | null

export class CardHand {
  private readonly states = new Map<string, SlotHandState>()
  // 같은 단어 카드는 바깥 button 객체를 풀에서 재사용한다. 내부 표시는 강화도·충돌 상태가
  // 달라질 수 있어 빌릴 때 갱신하고, 슬롯 이동/사용 뒤에는 분리해 대기시킨다.
  private readonly cardPool = new Map<string, HTMLButtonElement[]>()
  private slotKey = ''
  private selectedId: string | null = null
  private drawingId: string | null = null
  /** 장로거미 봉인은 턴이 아니라 전투 동안 단어 카드에 남는다. */
  private readonly sealedWordIds = new Set<string>()
  // 스테이지(전투) 단위 추가 드로우 예산. 턴이 바뀌어도 이어지고, 전투를 새로 열 때만 채워진다.
  private drawsLeft = CARD_HAND_CONFIG.drawsPerStage
  private nextOpeningHandBonus = 0
  private processing = false
  private inputEnabled = true
  private serial = 0
  private epoch = 0
  private conflictOf: ConflictResolver = () => null
  private destroyed = false
  private readonly stage: HTMLElement
  private readonly wordZone: HTMLElement | null

  private readonly onResize = () => this.render()
  private readonly onHandPointerOver = (event: PointerEvent) => {
    const button = this.cardButton(event.target)
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return
    const card = this.cardFor(button)
    if (card) {
      this.opts.onHover?.(card.word)
      this.opts.onPreview(card.word)
    }
  }
  private readonly onHandPointerOut = (event: PointerEvent) => {
    const button = this.cardButton(event.target)
    if (!button || (event.relatedTarget instanceof Node && button.contains(event.relatedTarget))) return
    button.classList.remove('pressing')
    this.opts.onHoverEnd?.()
    const state = this.currentState()
    const selected = state?.hand.find((item) => item.instanceId === this.selectedId)
    if (selected) this.opts.onPreview(selected.word)
    else this.opts.onPreviewEnd()
  }
  private readonly onHandClick = (event: MouseEvent) => {
    const button = this.cardButton(event.target)
    const card = button ? this.cardFor(button) : undefined
    if (button && card) this.commit(card, button)
  }
  private readonly onHandPointerDown = (event: PointerEvent) => {
    if (this.inputEnabled) this.cardButton(event.target)?.classList.add('pressing')
  }
  private readonly onHandPointerUp = (event: PointerEvent) => this.cardButton(event.target)?.classList.remove('pressing')
  private readonly onHandKeyDown = (event: KeyboardEvent) => {
    const button = this.cardButton(event.target)
    const state = this.currentState()
    if (button && state) this.handleCardKey(event, button, state.hand)
  }
  private readonly onHandFocusIn = (event: FocusEvent) => {
    const button = this.cardButton(event.target)
    const card = button ? this.cardFor(button) : undefined
    if (card) this.opts.onPreview(card.word)
  }

  constructor(private readonly opts: CardHandOptions) {
    this.stage = this.opts.handRoot.closest<HTMLElement>('.stage') ?? this.opts.handRoot.parentElement!
    this.wordZone = this.opts.handRoot.closest<HTMLElement>('.word-zone')
    this.opts.deckButton.addEventListener('click', () => void this.drawOne())
    this.opts.handRoot.addEventListener('pointerover', this.onHandPointerOver)
    this.opts.handRoot.addEventListener('pointerout', this.onHandPointerOut)
    this.opts.handRoot.addEventListener('click', this.onHandClick)
    this.opts.handRoot.addEventListener('pointerdown', this.onHandPointerDown)
    this.opts.handRoot.addEventListener('focusin', this.onHandFocusIn)
    this.opts.handRoot.addEventListener('pointerup', this.onHandPointerUp)
    this.opts.handRoot.addEventListener('pointercancel', this.onHandPointerUp)
    this.opts.handRoot.addEventListener('keydown', this.onHandKeyDown)
    window.addEventListener('resize', this.onResize)
  }

  resetTurn() {
    this.epoch++
    this.states.clear()
    this.slotKey = ''
    this.selectedId = null
    this.drawingId = null
    this.processing = false
  }

  setInputEnabled(enabled: boolean) {
    if (this.inputEnabled === enabled) return
    this.inputEnabled = enabled
    this.opts.handRoot.classList.toggle('input-locked', !enabled)
    this.render()
  }

  /** 장로거미 전용 — 봉인을 누적하되 현재 손패에는 선택 가능한 카드를 반드시 남긴다. */
  sealRandom(maxSealed: number, rng: () => number = Math.random): SealedCard | null {
    const state = this.currentState()
    if (!state || this.processing || this.sealedWordIds.size >= maxSealed) return null
    const usable = state.hand.filter((card) => !this.conflictOf(card.word) && !this.sealedWordIds.has(card.word.id))
    if (usable.length <= 1) return null
    const candidates = usable
    const picked = candidates[Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))]
    this.sealedWordIds.add(picked.word.id)
    if (this.selectedId === picked.instanceId) this.selectedId = null
    this.render()
    return { instanceId: picked.instanceId, word: picked.word }
  }

  /** 거미줄 발사체가 도착하는 프레임에 봉인 카드의 부착 연출을 재생한다. */
  playSealImpact(instanceId: string, delay = 0) {
    window.setTimeout(() => {
      const button = this.opts.handRoot.querySelector<HTMLButtonElement>(`[data-instance-id="${instanceId}"]`)
      if (!button) return
      button.classList.add('web-catching')
      window.setTimeout(() => button.isConnected && button.classList.remove('web-catching'), 900)
    }, delay)
  }

  /** 가장 오래된 봉인부터 지정한 수만큼 푼다. */
  releaseSealed(count = 1): number {
    let released = 0
    for (const id of this.sealedWordIds) {
      if (released >= count) break
      this.sealedWordIds.delete(id)
      released++
    }
    if (released > 0) this.render()
    return released
  }

  releaseAllSealed(): number {
    return this.releaseSealed(this.sealedWordIds.size)
  }

  get sealedCount(): number {
    return this.sealedWordIds.size
  }

  /** 상세 보기에서도 손패 카드와 같은 거미줄 봉인 상태를 표시한다. */
  isSealed(word: Word | string): boolean {
    return this.sealedWordIds.has(typeof word === 'string' ? word : word.id)
  }

  showSlot(
    slotKey: string,
    words: Word[],
    chosen: Word | undefined,
    conflictOf: ConflictResolver,
    preferred?: (word: Word) => boolean,
  ) {
    const changed = this.slotKey !== slotKey
    if (changed) {
      this.epoch++
      this.drawingId = null
      this.processing = false
      this.slotKey = slotKey
    }
    this.conflictOf = conflictOf

    let state = this.states.get(slotKey)
    if (!state) {
      const handTarget = slotKey === 'verb' || slotKey === 'verb2'
        ? CARD_HAND_CONFIG.verbInitialHand
        : CARD_HAND_CONFIG.initialHand
      const initialCount = Math.min(handTarget + this.nextOpeningHandBonus, words.length)
      this.nextOpeningHandBonus = 0
      const shuffled = ensureCardInInitialDraw(
        this.shuffle(words),
        initialCount,
        (word) => !this.sealedWordIds.has(word.id) && !this.conflictOf(word),
      )
      // 동사와 겹동사의 첫 손패에는 현재 문맥에서 선택 가능한 공격·방어·회복을
      // 각각 한 장씩 보장한다. 모순 카드를 억지로 살리지는 않는다.
      const roleOrderedWords = slotKey === 'verb' || slotKey === 'verb2'
        ? ensureCardsInInitialDraw(shuffled, initialCount, [
            (word) => word.kind === 'attack' && !this.conflictOf(word),
            (word) => word.kind === 'guard' && !this.conflictOf(word),
            (word) => word.kind === 'heal' && !this.conflictOf(word),
          ])
        : shuffled
      // 역할별 보장 카드가 앞쪽을 다시 채운 뒤에도 거미줄에 묶이지 않은 선택지 하나는
      // 반드시 첫 손패에 남긴다. 누적 봉인이 문장 완성을 막아서는 안 된다.
      const preferredWords = preferred
        ? ensureCardInInitialDraw(roleOrderedWords, initialCount, (word) => preferred(word) && !this.conflictOf(word))
        : roleOrderedWords
      const orderedWords = ensureCardInInitialDraw(
        preferredWords,
        initialCount,
        (word) => !this.sealedWordIds.has(word.id) && !this.conflictOf(word),
      )
      const ordered = orderedWords.map((word) => this.makeInstance(slotKey, word))
      state = { hand: ordered.slice(0, initialCount), deck: ordered.slice(initialCount) }
      this.states.set(slotKey, state)
    }

    if (chosen) {
      let card = state.hand.find((item) => item.word.id === chosen.id)
      if (!card) {
        const deckIndex = state.deck.findIndex((item) => item.word.id === chosen.id)
        card = deckIndex >= 0 ? state.deck.splice(deckIndex, 1)[0] : this.makeInstance(slotKey, chosen)
        state.hand.unshift(card)
      }
      this.selectedId = card.instanceId
    } else if (changed || (this.selectedId && !state.hand.some((item) => item.instanceId === this.selectedId))) {
      this.selectedId = null
    }
    this.render()
  }

  destroy() {
    this.destroyed = true
    this.epoch++
    window.removeEventListener('resize', this.onResize)
    this.opts.handRoot.removeEventListener('pointerover', this.onHandPointerOver)
    this.opts.handRoot.removeEventListener('pointerout', this.onHandPointerOut)
    this.opts.handRoot.removeEventListener('click', this.onHandClick)
    this.opts.handRoot.removeEventListener('pointerdown', this.onHandPointerDown)
    this.opts.handRoot.removeEventListener('pointerup', this.onHandPointerUp)
    this.opts.handRoot.removeEventListener('pointercancel', this.onHandPointerUp)
    this.opts.handRoot.removeEventListener('keydown', this.onHandKeyDown)
    this.opts.handRoot.removeEventListener('focusin', this.onHandFocusIn)
    this.releaseRenderedCards()
    this.cardPool.clear()
  }

  private makeInstance(slotKey: string, word: Word): CardInstance {
    this.serial++
    return { instanceId: `${slotKey}-${word.id}-${this.serial}`, word }
  }

  private shuffle(words: Word[]): Word[] {
    const result = [...words]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }

  /** 이번 전투에서 아직 쓰지 않은 뽑기 횟수 — 승리 시 영감으로 환산된다. */
  get savedDraws(): number {
    return Math.max(0, this.drawsLeft)
  }

  grantNextOpeningHand(count: number) {
    this.nextOpeningHandBonus += Math.max(0, Math.floor(count))
  }

  /** 개발 치트 전용 — 뽑기 횟수를 쓰지 않고 현재 슬롯 손패에 카드 한 장을 넣는다. */
  async debugSpawn(word: Word): Promise<DebugCardSpawnResult> {
    const state = this.currentState()
    if (!state || this.destroyed || this.processing) return 'unavailable'
    if (state.hand.some((card) => card.word.id === word.id)) return 'already-in-hand'
    if (state.hand.length >= CARD_HAND_CONFIG.maxHand) return 'hand-full'

    const epoch = this.epoch
    const deckIndex = state.deck.findIndex((card) => card.word.id === word.id)
    const card = deckIndex >= 0 ? state.deck.splice(deckIndex, 1)[0] : this.makeInstance(this.slotKey, word)
    state.hand.push(card)
    this.processing = true
    this.drawingId = card.instanceId
    this.render()
    try {
      await this.animateDraw(card.instanceId, epoch)
    } finally {
      if (epoch === this.epoch) {
        this.processing = false
        this.drawingId = null
        this.render()
      }
    }
    return 'spawned'
  }

  private currentState(): SlotHandState | undefined {
    return this.states.get(this.slotKey)
  }

  private async drawOne() {
    const state = this.currentState()
    if (!state || this.destroyed || this.processing || !this.inputEnabled) return
    if (this.drawsLeft <= 0 || state.hand.length >= CARD_HAND_CONFIG.maxHand || state.deck.length === 0) {
      this.opts.deckButton.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
        { duration: 180 },
      )
      return
    }

    const epoch = this.epoch
    const next = state.deck.shift()!
    this.drawsLeft--
    this.processing = true
    state.hand.push(next)
    this.drawingId = next.instanceId
    this.render()
    try {
      await this.animateDraw(next.instanceId, epoch)
    } finally {
      if (epoch === this.epoch) {
        this.processing = false
        this.drawingId = null
        this.render()
      }
    }
  }

  private async animateDraw(instanceId: string, epoch: number) {
    const card = this.opts.handRoot.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`)
    if (!card) return
    const deckRect = this.opts.deckButton.getBoundingClientRect()
    const cardRect = card.getBoundingClientRect()
    const dx = deckRect.left + deckRect.width / 2 - (cardRect.left + cardRect.width / 2)
    const dy = deckRect.top + deckRect.height / 2 - (cardRect.top + cardRect.height / 2)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 1 : CARD_HAND_CONFIG.drawDuration
    const finalTransform = getComputedStyle(card).transform
    const movement = card.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(16deg) scale(.48)`, opacity: 0.35 },
        { transform: `translate(${dx * 0.42}px, ${dy * 0.42 - 42}px) rotate(5deg) scale(1.06)`, opacity: 1, offset: 0.58 },
        { transform: finalTransform, opacity: 1 },
      ],
      { duration, easing: 'cubic-bezier(.2,.82,.22,1)', fill: 'none' },
    )
    const inner = card.querySelector<HTMLElement>('.card-inner')
    const flip = inner?.animate(
      [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(180deg)', offset: 0.38 }, { transform: 'rotateY(0deg)' }],
      { duration, easing: 'ease-out' },
    )
    // 애니메이션이 끝나지 않는 상황(백그라운드 탭 등)에서도 드로우는 반드시 완료돼야 한다.
    // 여기서 멈추면 예산만 깎이고 카드가 오지 않는다.
    const settled = Promise.allSettled([movement.finished, flip?.finished ?? Promise.resolve()])
    await Promise.race([settled, new Promise((r) => window.setTimeout(r, duration + 200))])
    if (epoch !== this.epoch) movement.cancel()
  }

  private render() {
    const state = this.currentState()
    if (!state) {
      this.releaseRenderedCards()
      return
    }
    const previousPositions = new Map(
      [...this.opts.handRoot.querySelectorAll<HTMLElement>('.word-card')].map((card) => [
        card.dataset.instanceId ?? '',
        card.getBoundingClientRect(),
      ]),
    )
    const availableWidth = Math.max(520, this.opts.handRoot.clientWidth - 40)
    this.releaseRenderedCards()
    const fragment = document.createDocumentFragment()
    state.hand.forEach((card, index) => {
      const button = this.acquireCard(card, index, state.hand.length, availableWidth)
      fragment.append(button)
    })
    this.opts.handRoot.append(fragment)

    this.opts.handRoot.querySelectorAll<HTMLButtonElement>('.word-card').forEach((button) => {
      const card = state.hand.find((item) => item.instanceId === button.dataset.instanceId)!
      const previous = previousPositions.get(card.instanceId)
      if (previous && this.drawingId !== card.instanceId) {
        const current = button.getBoundingClientRect()
        const dx = previous.left - current.left
        const dy = previous.top - current.top
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          button.animate(
            [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }],
            { duration: 340, easing: 'cubic-bezier(.2,.82,.22,1)' },
          )
        }
      }
    })
    this.updateDeckButton(state)
  }

  private cardButton(target: EventTarget | null): HTMLButtonElement | null {
    return target instanceof Element ? target.closest<HTMLButtonElement>('.word-card') : null
  }

  private cardFor(button: HTMLButtonElement): CardInstance | undefined {
    return this.currentState()?.hand.find((item) => item.instanceId === button.dataset.instanceId)
  }

  private releaseRenderedCards() {
    this.opts.handRoot.querySelectorAll<HTMLButtonElement>(':scope > .word-card').forEach((button) => {
      // 안쪽까지 훑는다. 뽑기 뒤집기(.card-inner)나 이동 보간이 남은 채로 카드가
      // 풀에 들어가면, 다음에 빌려 쓸 때 그 애니메이션이 이어져 뒷면이 보이거나
      // 엉뚱한 자리에서 시작한다. CSS 애니메이션은 다시 붙을 때 처음부터 돈다.
      button.getAnimations({ subtree: true }).forEach((animation) => animation.cancel())
      button.classList.remove('pressing', 'selected', 'drawing', 'sealed', 'blocked', 'web-catching')
      button.remove()
      const key = button.dataset.poolKey
      if (!key) return
      const pool = this.cardPool.get(key) ?? []
      pool.push(button)
      this.cardPool.set(key, pool)
    })
  }

  private acquireCard(card: CardInstance, index: number, count: number, availableWidth: number): HTMLButtonElement {
    const pool = this.cardPool.get(card.word.id)
    let button = pool?.pop()
    if (!button) {
      const template = document.createElement('template')
      template.innerHTML = this.cardHtml(card, index, count, availableWidth).trim()
      button = template.content.firstElementChild as HTMLButtonElement
    } else {
      const line = calculateLineTransform(index, count, availableWidth)
      const blocked = this.conflictOf(card.word)
      const sealed = this.sealedWordIds.has(card.word.id)
      const unavailable = sealed ? '거미줄 봉인 · 이번 문장에는 선택할 수 없다' : blocked
      const selected = this.selectedId === card.instanceId
      const drawing = this.drawingId === card.instanceId
      const rarity = card.word.rarity ?? 'common'
      const emotionKey = emotionOrNeutral(card.word.emotion)
      button.className = `word-card mood-${wordMood(card.word)} emotion-${emotionKey} rarity-${rarity}${selected ? ' selected' : ''}${unavailable ? ' blocked' : ''}${sealed ? ' sealed' : ''}${drawing ? ' drawing' : ''}`
      button.dataset.instanceId = card.instanceId
      button.disabled = !this.inputEnabled || !!unavailable
      button.setAttribute('aria-label', unavailable ? `${card.word.text}, 선택 불가: ${unavailable}` : this.cardAriaLabel(card.word))
      button.setAttribute('aria-pressed', String(selected))
      button.style.setProperty('--card-x', `${line.translateX.toFixed(1)}px`)
      button.style.setProperty('--card-z', String(line.zIndex))
      button.style.setProperty('--selected-lift', `${CARD_HAND_CONFIG.selectedLift}px`)
      button.style.setProperty('--selected-scale', String(CARD_HAND_CONFIG.selectedScale))
      const note = button.querySelector<HTMLElement>('.card-note-text')
      if (note) note.textContent = unavailable ?? wordCardDisplayNote(card.word)
      const emotionBadge = button.querySelector<HTMLElement>('.card-emotion')
      if (emotionBadge) {
        emotionBadge.outerHTML = emotionIconBadge(emotionKey, 'card-emotion')
      }
      const costBadge = button.querySelector<HTMLElement>('.card-cost')
      if (costBadge) {
        const inkCost = wordInkCost(card.word)
        costBadge.textContent = String(inkCost)
        costBadge.setAttribute('aria-label', `잉크 ${inkCost}`)
      }
      const footer = button.querySelector<HTMLElement>('.card-front > small')
      if (footer) footer.textContent = sealed ? 'WEB SEALED' : blocked ? '맥락 충돌' : 'WORD CARD'
    }
    button.dataset.poolKey = card.word.id
    return button
  }

  private cardHtml(card: CardInstance, index: number, count: number, availableWidth: number): string {
    const line = calculateLineTransform(index, count, availableWidth)
    const blocked = this.conflictOf(card.word)
    const sealed = this.sealedWordIds.has(card.word.id)
    const unavailable = sealed ? '거미줄 봉인 · 이번 문장에는 선택할 수 없다' : blocked
    const selected = this.selectedId === card.instanceId
    const isDrawing = this.drawingId === card.instanceId
    const aria = unavailable ? `${card.word.text}, 선택 불가: ${unavailable}` : this.cardAriaLabel(card.word)
    const rarity = card.word.rarity ?? 'common'
    const emotion = emotionOrNeutral(card.word.emotion)
    // 임시 CSS 거미줄. 최종 스프라이트는 이 전용 훅의 배경만 교체한다.
    const webOverlay = `<span class="card-web-overlay" aria-hidden="true" style="--card-web-seal-image:url('${SPRITES.effect_card_web_seal}')"><i></i><b>거미줄 봉인</b><small>사용 불가</small></span>`
    // 앞면은 손패 밖 화면과 같은 함수로 그린다(ui/WordCardFace.ts).
    const front = wordCardFrontHtml(card.word, {
      note: unavailable ?? wordNoteText(card.word),
      footer: sealed ? 'WEB SEALED' : blocked ? '맥락 충돌' : 'WORD CARD',
      overlay: webOverlay,
    })
    return `<button class="word-card mood-${wordMood(card.word)} emotion-${emotion} rarity-${rarity}${selected ? ' selected' : ''}${unavailable ? ' blocked' : ''}${sealed ? ' sealed' : ''}${isDrawing ? ' drawing' : ''}"
      data-instance-id="${card.instanceId}" aria-label="${aria}" aria-pressed="${selected}" ${!this.inputEnabled || unavailable ? 'disabled' : ''}
      style="--card-x:${line.translateX.toFixed(1)}px;--card-z:${line.zIndex};--selected-lift:${CARD_HAND_CONFIG.selectedLift}px;--selected-scale:${CARD_HAND_CONFIG.selectedScale}">
      <span class="card-lift"><span class="card-inner">
        <span class="card-face card-back" aria-hidden="true"><i></i><b>그림일기</b></span>
        ${front}
      </span></span>
    </button>`
  }

  /** 앞면에서 덜어낸 등급·강화 단계도 보조기기에서는 잃지 않게 읽는다. */
  private cardAriaLabel(word: Word): string {
    const rarity = RARITY_LABEL[word.rarity ?? 'common']
    const level = word.level ?? 1
    return `${word.text}, ${rarity}${level > 1 ? `, Lv.${level}` : ''}, 잉크 ${wordInkCost(word)}, ${wordNoteText(word)}`
  }

  // 카드를 문장에 넣는 단 하나의 경로 — 클릭과 키보드 입력이 여기로 모인다.
  // 중앙에서 카드가 터지는 프레임에 onConfirm을 호출해 화면 연출과 실제 적용을 일치시킨다.
  private async commit(card: CardInstance, button?: HTMLButtonElement) {
    if (this.destroyed || this.processing || !this.inputEnabled) return
    // 재렌더로 이미 손을 떠난 버튼(예: Enter 직후 따라오는 click)은 무시한다.
    if (button && !button.isConnected) return
    if (this.drawingId === card.instanceId) return
    if (this.sealedWordIds.has(card.word.id)) return
    if (this.conflictOf(card.word)) return

    this.selectedId = card.instanceId
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!button || reduced) {
      this.pulseSlotStep()
      this.opts.onConfirm(card.word)
      return
    }

    this.processing = true
    this.wordZone?.classList.add('is-committing')
    try {
      await this.playCommitFx(button)
      if (this.destroyed) return
      this.pulseSlotStep()
      this.opts.onConfirm(card.word)
    } finally {
      this.processing = false
      this.wordZone?.classList.remove('is-committing')
    }
  }

  // 원본 위치의 복제 카드가 화면 중앙으로 이동한 뒤 광환과 파편으로 터진다.
  private async playCommitFx(button: HTMLButtonElement) {
    const ghost = this.spawnCommitGhost(button)
    const fromX = Number(ghost.dataset.fromX) || 0
    const fromY = Number(ghost.dataset.fromY) || 0
    const toX = Number(ghost.dataset.toX) || 0
    const toY = Number(ghost.dataset.toY) || 0
    const at = (x: number, y: number, scale: number, rotate = 0) =>
      `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rotate}deg) scale(${scale})`
    const flight = ghost.animate(
      [
        { transform: at(fromX, fromY, 1), opacity: 1, filter: 'brightness(1)' },
        {
          transform: at(fromX + (toX - fromX) * 0.58, fromY + (toY - fromY) * 0.58 - 54, 1.08, -2),
          opacity: 1,
          filter: 'brightness(1.28) saturate(1.15)',
          offset: 0.62,
        },
        { transform: at(toX, toY, 1.18), opacity: 1, filter: 'brightness(1.85) saturate(1.3)' },
      ],
      { duration: COMMIT_FLIGHT_MS, easing: 'cubic-bezier(.18,.76,.2,1)', fill: 'forwards' },
    )
    await Promise.race([
      Promise.allSettled([flight.finished]),
      new Promise((resolve) => window.setTimeout(resolve, COMMIT_FLIGHT_MS + 120)),
    ])
    if (this.destroyed) {
      ghost.remove()
      return
    }

    this.spawnCommitBurst(button)
    const pop = ghost.animate(
      [
        { transform: at(toX, toY, 1.18), opacity: 1, filter: 'brightness(1.85) saturate(1.3)' },
        { transform: at(toX, toY, 1.42), opacity: 0.88, filter: 'brightness(3) saturate(1.1)', offset: 0.28 },
        { transform: at(toX, toY, 0.72), opacity: 0, filter: 'brightness(4) blur(8px)' },
      ],
      { duration: COMMIT_POP_MS, easing: 'cubic-bezier(.22,.72,.18,1)', fill: 'forwards' },
    )
    void Promise.allSettled([pop.finished]).then(() => ghost.remove())
    window.setTimeout(() => ghost.remove(), COMMIT_POP_MS + 120)
  }

  private pulseSlotStep() {
    const steps = this.wordZone?.querySelector<HTMLElement>('.slot-step')
    if (!steps) return
    steps.classList.remove('commit-pulse')
    void steps.offsetWidth
    steps.classList.add('commit-pulse')
    window.setTimeout(() => steps.classList.remove('commit-pulse'), 420)
  }

  private spawnCommitGhost(button: HTMLElement): HTMLElement {
    const stageRect = this.stage.getBoundingClientRect()
    const rect = button.querySelector<HTMLElement>('.card-lift')?.getBoundingClientRect() ?? button.getBoundingClientRect()
    const scaleX = stageRect.width / this.stage.offsetWidth || 1
    const scaleY = stageRect.height / this.stage.offsetHeight || 1
    const visibleCenterX = (Math.max(0, stageRect.left) + Math.min(window.innerWidth, stageRect.right)) / 2
    const visibleCenterY = (Math.max(0, stageRect.top) + Math.min(window.innerHeight, stageRect.bottom)) / 2
    const ghost = button.cloneNode(true) as HTMLElement
    // 원본 WebGL 캔버스의 비트맵은 cloneNode로 복제되지 않는다. 빈 캔버스를 버리면
    // 포일 렌더러가 고스트용 캔버스를 새로 붙여 이동 중에도 등급 연출을 그린다.
    ghost.querySelectorAll('.foil-shader-canvas').forEach((canvas) => canvas.remove())
    ghost.classList.remove('selected', 'committing')
    ghost.classList.add('commit-ghost')
    ghost.removeAttribute('data-instance-id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.dataset.fromX = ((rect.left - stageRect.left) / scaleX).toFixed(1)
    ghost.dataset.fromY = ((rect.top - stageRect.top) / scaleY).toFixed(1)
    ghost.dataset.toX = ((visibleCenterX - stageRect.left - rect.width / 2) / scaleX).toFixed(1)
    ghost.dataset.toY = ((visibleCenterY - stageRect.top - rect.height / 2) / scaleY).toFixed(1)
    this.stage.append(ghost)
    return ghost
  }

  private spawnCommitBurst(button: HTMLElement) {
    const stageRect = this.stage.getBoundingClientRect()
    const scaleX = stageRect.width / this.stage.offsetWidth || 1
    const scaleY = stageRect.height / this.stage.offsetHeight || 1
    const visibleCenterX = (Math.max(0, stageRect.left) + Math.min(window.innerWidth, stageRect.right)) / 2
    const visibleCenterY = (Math.max(0, stageRect.top) + Math.min(window.innerHeight, stageRect.bottom)) / 2
    spawnCardCommitBurst(
      this.stage,
      (visibleCenterX - stageRect.left) / scaleX,
      (visibleCenterY - stageRect.top) / scaleY,
      getComputedStyle(button).getPropertyValue('--wglow').trim() || '#ffe3a1',
    )
  }

  // 덱 버튼 — 이번 스테이지에 남은 추가 드로우 횟수를 보여준다(덱 장수가 아니다).
  private updateDeckButton(state: SlotHandState) {
    const pileLeft = state.deck.length
    const full = state.hand.length >= CARD_HAND_CONFIG.maxHand
    const spent = this.drawsLeft <= 0
    const disabled = !this.inputEnabled || this.processing || full || spent || pileLeft === 0
    const note = spent ? '이번 전투 소진' : full ? '손패 가득' : pileLeft === 0 ? '남은 카드 없음' : `${this.drawsLeft}회 남음`
    // 아끼면 그만큼 영감이 오른다 — 뽑기를 참는 선택에 값을 붙여 둔다.
    const saveHint = this.drawsLeft > 0 ? ` · 아끼면 영감 +${this.drawsLeft}` : ''
    this.opts.deckButton.disabled = disabled
    this.opts.deckButton.title = `남은 뽑기 ${this.savedDraws}회${saveHint}`
    this.opts.deckButton.setAttribute('aria-label', (disabled ? `카드 뽑기 불가: ${note}` : `카드 뽑기, ${note}`) + saveHint)
    const overlayNote = note.replace('회 남음', '회남음')
    this.opts.deckButton.innerHTML = `<span class="deck-stack" aria-hidden="true"><i></i><i></i><span class="deck-overlay"><b>카드 뽑기</b><small>(${overlayNote})</small></span></span>`
  }

  private handleCardKey(event: KeyboardEvent, button: HTMLButtonElement, hand: CardInstance[]) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const card = hand.find((item) => item.instanceId === button.dataset.instanceId)
      if (card) this.commit(card, button)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = hand.findIndex((item) => item.instanceId === button.dataset.instanceId)
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    for (let offset = 1; offset <= hand.length; offset++) {
      const next = (index + direction * offset + hand.length) % hand.length
      const candidate = this.opts.handRoot.querySelector<HTMLButtonElement>(`[data-instance-id="${hand[next].instanceId}"]`)
      if (candidate && !candidate.disabled) {
        candidate.focus()
        break
      }
    }
  }
}
