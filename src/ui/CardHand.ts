import type { Word } from '@core/types'

export const CARD_HAND_CONFIG = {
  maxHand: 6,
  cardWidth: 158,
  cardHeight: 218,
  maxSpacing: 132,
  minSpacing: 64,
  maxRotation: 12,
  fanCurve: 34,
  selectedLift: 82,
  selectedScale: 1.12,
  drawDuration: 620,
} as const

export interface FanTransform {
  normalized: number
  translateX: number
  translateY: number
  rotate: number
  scale: number
  zIndex: number
}

/** DOM과 무관한 손패 좌표 계산. 인덱스를 -1..1로 정규화해 부채꼴을 만든다. */
export function calculateFanTransform(index: number, count: number, availableWidth = 900): FanTransform {
  const safeCount = Math.max(1, count)
  const normalized = safeCount === 1 ? 0 : (index / (safeCount - 1)) * 2 - 1
  const density = Math.max(0, safeCount - 2)
  const desiredSpacing = CARD_HAND_CONFIG.maxSpacing - density * 10
  const fitSpacing = safeCount === 1
    ? desiredSpacing
    : Math.max(54, (availableWidth - CARD_HAND_CONFIG.cardWidth) / (safeCount - 1))
  const spacing = Math.max(CARD_HAND_CONFIG.minSpacing, Math.min(desiredSpacing, fitSpacing))
  const centerOffset = index - (safeCount - 1) / 2
  const edge = Math.abs(normalized)

  return {
    normalized,
    translateX: centerOffset * spacing,
    translateY: edge * edge * CARD_HAND_CONFIG.fanCurve,
    rotate: normalized * CARD_HAND_CONFIG.maxRotation,
    scale: 1 - edge * 0.035,
    zIndex: 100 + index,
  }
}

interface CardInstance {
  instanceId: string
  word: Word
}

interface SlotHandState {
  hand: CardInstance[]
  deck: CardInstance[]
}

interface CardHandOptions {
  handRoot: HTMLElement
  deckButton: HTMLButtonElement
  dropZone: HTMLElement
  onConfirm: (word: Word) => void
  onPreview: (word: Word) => void
  onPreviewEnd: () => void
}

type ConflictResolver = (word: Word) => string | null

export class CardHand {
  private readonly states = new Map<string, SlotHandState>()
  private slotKey = ''
  private selectedId: string | null = null
  private drawingId: string | null = null
  private draggingId: string | null = null
  private suppressClickId: string | null = null
  private drawQueue = 0
  private processing = false
  private serial = 0
  private epoch = 0
  private conflictOf: ConflictResolver = () => null
  private destroyed = false

  private readonly onResize = () => this.render()
  private readonly onOutsidePointer = (event: PointerEvent) => {
    if (!this.opts.handRoot.contains(event.target as Node) && !this.opts.dropZone.contains(event.target as Node)) {
      this.select(null)
    }
  }

  constructor(private readonly opts: CardHandOptions) {
    this.opts.deckButton.addEventListener('click', () => this.enqueueDraw())
    this.opts.dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        this.confirmSelection()
      }
    })
    this.opts.dropZone.addEventListener('dragover', (event) => {
      if (!this.draggingId) return
      event.preventDefault()
      event.dataTransfer!.dropEffect = 'move'
      this.opts.dropZone.classList.add('drag-ready')
    })
    this.opts.dropZone.addEventListener('dragleave', (event) => {
      if (!this.opts.dropZone.contains(event.relatedTarget as Node | null)) {
        this.opts.dropZone.classList.remove('drag-ready')
      }
    })
    this.opts.dropZone.addEventListener('drop', (event) => this.dropCard(event))
    window.addEventListener('resize', this.onResize)
    document.addEventListener('pointerdown', this.onOutsidePointer)
  }

  resetTurn() {
    this.epoch++
    this.states.clear()
    this.slotKey = ''
    this.selectedId = null
    this.drawingId = null
    this.draggingId = null
    this.drawQueue = 0
    this.processing = false
  }

  showSlot(slotKey: string, words: Word[], chosen: Word | undefined, conflictOf: ConflictResolver) {
    const changed = this.slotKey !== slotKey
    if (changed) {
      this.epoch++
      this.drawQueue = 0
      this.drawingId = null
      this.processing = false
      this.slotKey = slotKey
    }
    this.conflictOf = conflictOf

    let state = this.states.get(slotKey)
    if (!state) {
      const shuffled = this.shuffle(words).map((word) => this.makeInstance(slotKey, word))
      const initialCount = Math.min(2, shuffled.length)
      state = { hand: shuffled.slice(0, initialCount), deck: shuffled.slice(initialCount) }
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
    document.removeEventListener('pointerdown', this.onOutsidePointer)
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

  private currentState(): SlotHandState | undefined {
    return this.states.get(this.slotKey)
  }

  private enqueueDraw() {
    const state = this.currentState()
    if (!state || this.destroyed) return
    const reserved = state.hand.length + this.drawQueue
    if (reserved >= CARD_HAND_CONFIG.maxHand || this.drawQueue >= state.deck.length) {
      this.opts.deckButton.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }],
        { duration: 180 },
      )
      return
    }
    this.drawQueue++
    this.updateDeckButton(state)
    if (!this.processing) void this.processDrawQueue(this.epoch)
  }

  private async processDrawQueue(epoch: number) {
    this.processing = true
    while (this.drawQueue > 0 && epoch === this.epoch && !this.destroyed) {
      const state = this.currentState()
      if (!state || state.hand.length >= CARD_HAND_CONFIG.maxHand || state.deck.length === 0) break
      this.drawQueue--
      const next = state.deck.shift()!
      state.hand.push(next)
      this.drawingId = next.instanceId
      this.render()
      await this.animateDraw(next.instanceId, epoch)
      if (epoch !== this.epoch) return
      this.drawingId = null
      this.render()
    }
    if (epoch === this.epoch) {
      this.drawQueue = 0
      this.processing = false
      this.drawingId = null
      this.render()
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
    await Promise.allSettled([movement.finished, flip?.finished ?? Promise.resolve()])
    if (epoch !== this.epoch) movement.cancel()
  }

  private render() {
    const state = this.currentState()
    if (!state) {
      this.opts.handRoot.innerHTML = ''
      return
    }
    const availableWidth = Math.max(520, this.opts.handRoot.clientWidth - 40)
    this.opts.handRoot.innerHTML = state.hand
      .map((card, index) => this.cardHtml(card, index, state.hand.length, availableWidth))
      .join('')

    this.opts.handRoot.querySelectorAll<HTMLButtonElement>('.word-card').forEach((button) => {
      const card = state.hand.find((item) => item.instanceId === button.dataset.instanceId)!
      button.addEventListener('mouseenter', () => this.opts.onPreview(card.word))
      button.addEventListener('mouseleave', () => {
        if (this.selectedId) {
          const selected = state.hand.find((item) => item.instanceId === this.selectedId)
          if (selected) this.opts.onPreview(selected.word)
        } else this.opts.onPreviewEnd()
      })
      button.addEventListener('click', () => {
        if (this.suppressClickId === card.instanceId) {
          this.suppressClickId = null
          return
        }
        if (button.disabled || this.drawingId === card.instanceId) return
        this.select(this.selectedId === card.instanceId ? null : card.instanceId)
      })
      button.addEventListener('dragstart', (event) => this.beginDrag(event, button, card))
      button.addEventListener('dragend', () => this.endDrag(button))
      button.addEventListener('keydown', (event) => this.handleCardKey(event, button, state.hand))
    })
    this.updateDeckButton(state)
    this.updateDropZone(state)
  }

  private cardHtml(card: CardInstance, index: number, count: number, availableWidth: number): string {
    const fan = calculateFanTransform(index, count, availableWidth)
    const blocked = this.conflictOf(card.word)
    const selected = this.selectedId === card.instanceId
    const rarity = card.word.rarity ?? 'common'
    const isDrawing = this.drawingId === card.instanceId
    const aria = blocked ? `${card.word.text}, 선택 불가: ${blocked}` : `${card.word.text}, ${card.word.note}`
    return `<button class="word-card mood-${this.moodOf(card.word)} rarity-${rarity}${selected ? ' selected' : ''}${blocked ? ' blocked' : ''}${isDrawing ? ' drawing' : ''}"
      data-instance-id="${card.instanceId}" aria-label="${aria}" aria-pressed="${selected}" ${blocked ? 'disabled' : ''}
      draggable="${!blocked && !isDrawing}"
      style="--card-x:${fan.translateX.toFixed(1)}px;--card-y:${fan.translateY.toFixed(1)}px;--card-r:${fan.rotate.toFixed(2)}deg;--card-s:${fan.scale.toFixed(3)};--card-z:${fan.zIndex};--selected-lift:${CARD_HAND_CONFIG.selectedLift}px;--selected-scale:${CARD_HAND_CONFIG.selectedScale}">
      <span class="card-lift"><span class="card-inner">
        <span class="card-face card-back" aria-hidden="true"><i></i><b>그림일기</b></span>
        <span class="card-face card-front">
          <span class="card-rarity">${this.rarityMark(rarity)}</span>
          <span class="card-art" aria-hidden="true"><i></i><b>${this.artGlyph(card.word)}</b></span>
          <strong>${card.word.text}</strong>
          <span class="card-note">${blocked ?? card.word.note}</span>
          <small>${blocked ? '맥락 충돌' : 'WORD CARD'}</small>
        </span>
      </span></span>
    </button>`
  }

  private moodOf(word: Word): string {
    if (word.variance) return 'gamble'
    if (word.kind === 'heal' || word.effects?.heal) return 'heal'
    if (word.kind === 'guard' || word.effects?.guard) return 'guard'
    if (word.kind === 'attack' || (word.power ?? 0) > 0) return 'attack'
    if (word.effects?.recoil) return 'sacrifice'
    return 'buff'
  }

  private artGlyph(word: Word): string {
    if (word.variance) return '✧'
    if (word.kind === 'heal' || word.effects?.heal) return '✚'
    if (word.kind === 'guard' || word.effects?.guard) return '◇'
    if (word.kind === 'attack' || word.power) return '↗'
    if (word.effects?.recoil) return '※'
    return '✦'
  }

  private rarityMark(rarity: Word['rarity']): string {
    return rarity === 'legendary' ? '◆◆◆' : rarity === 'epic' ? '◆◆' : rarity === 'rare' ? '◆' : '◇'
  }

  private select(instanceId: string | null) {
    this.selectedId = instanceId
    const state = this.currentState()
    const selected = state?.hand.find((item) => item.instanceId === instanceId)
    if (selected) this.opts.onPreview(selected.word)
    else this.opts.onPreviewEnd()
    this.render()
    if (instanceId) {
      requestAnimationFrame(() => this.opts.handRoot.querySelector<HTMLElement>(`[data-instance-id="${instanceId}"]`)?.focus())
    }
  }

  private confirmSelection() {
    const state = this.currentState()
    const selected = state?.hand.find((item) => item.instanceId === this.selectedId)
    if (!selected || this.conflictOf(selected.word)) return
    this.opts.onConfirm(selected.word)
  }

  private beginDrag(event: DragEvent, button: HTMLButtonElement, card: CardInstance) {
    if (button.disabled || this.drawingId === card.instanceId) {
      event.preventDefault()
      return
    }
    this.draggingId = card.instanceId
    this.selectedId = card.instanceId
    this.opts.handRoot.querySelectorAll('.word-card.selected').forEach((item) => {
      item.classList.remove('selected')
      item.setAttribute('aria-pressed', 'false')
    })
    button.classList.add('selected')
    requestAnimationFrame(() => button.classList.add('dragging'))
    button.setAttribute('aria-pressed', 'true')
    this.opts.onPreview(card.word)
    this.updateDropZone(this.currentState())
    this.opts.dropZone.classList.add('visible')
    event.dataTransfer?.setData('text/plain', card.instanceId)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  private endDrag(button: HTMLButtonElement) {
    if (this.draggingId) this.suppressClickId = this.draggingId
    this.draggingId = null
    button.classList.remove('dragging')
    this.opts.dropZone.classList.remove('visible', 'drag-ready')
    this.render()
  }

  private dropCard(event: DragEvent) {
    event.preventDefault()
    const instanceId = event.dataTransfer?.getData('text/plain') || this.draggingId
    const state = this.currentState()
    const card = state?.hand.find((item) => item.instanceId === instanceId)
    this.opts.dropZone.classList.remove('visible', 'drag-ready')
    if (!card || this.conflictOf(card.word)) return
    this.draggingId = null
    this.opts.onConfirm(card.word)
  }

  private updateDeckButton(state: SlotHandState) {
    const remaining = Math.max(0, state.deck.length - this.drawQueue)
    const full = state.hand.length + this.drawQueue >= CARD_HAND_CONFIG.maxHand
    const disabled = full || remaining === 0
    this.opts.deckButton.disabled = disabled
    this.opts.deckButton.setAttribute('aria-label', disabled ? (full ? '손패가 가득 참' : '덱이 비었음') : `카드 뽑기, ${remaining}장 남음`)
    this.opts.deckButton.innerHTML = `<span class="deck-stack" aria-hidden="true"><i></i><i></i><b>그림일기</b></span><span class="deck-copy"><b>카드 뽑기</b><small>${full ? '손패 가득' : `${remaining}장 남음`}</small></span>`
  }

  private updateDropZone(state: SlotHandState | undefined) {
    if (!state) return
    const selected = state.hand.find((item) => item.instanceId === this.selectedId)
    const disabled = !selected || !!this.conflictOf(selected.word) || this.drawingId === selected?.instanceId
    this.opts.dropZone.classList.toggle('disabled', disabled)
    this.opts.dropZone.setAttribute('aria-disabled', String(disabled))
    this.opts.dropZone.innerHTML = selected
      ? `<b>「${selected.word.text}」</b><span>여기에 놓아 발동</span>`
      : '<b>문장에 넣기</b><span>카드를 여기로 끌어 놓기</span>'
  }

  private handleCardKey(event: KeyboardEvent, button: HTMLButtonElement, hand: CardInstance[]) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = hand.findIndex((item) => item.instanceId === button.dataset.instanceId)
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const next = (index + direction + hand.length) % hand.length
    this.opts.handRoot.querySelector<HTMLElement>(`[data-instance-id="${hand[next].instanceId}"]`)?.focus()
  }
}
