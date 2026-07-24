import { SKILL_ART } from '@/assets'
import type { Word } from '@core/types'

export const CARD_HAND_CONFIG = {
  maxHand: 6,
  cardWidth: 158,
  cardHeight: 218,
  maxSpacing: 170,
  minSpacing: 112,
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
  const desiredSpacing = CARD_HAND_CONFIG.maxSpacing
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
  private dragGhost: HTMLElement | null = null
  private dragOrigin = { x: 0, y: 0 }
  private dragPointerOffset = { x: 0, y: 0 }
  private dragDestination: { x: number; y: number } | null = null
  private lastDragX = 0
  private dragAccepted = false
  private drawQueue = 0
  private processing = false
  private serial = 0
  private epoch = 0
  private conflictOf: ConflictResolver = () => null
  private destroyed = false
  private readonly battlefield: HTMLElement
  private readonly stage: HTMLElement
  private readonly wordZone: HTMLElement | null

  private readonly onResize = () => this.render()
  private readonly onOutsidePointer = (event: PointerEvent) => {
    if (!this.opts.handRoot.contains(event.target as Node) && !this.opts.dropZone.contains(event.target as Node)) {
      this.select(null)
    }
  }

  constructor(private readonly opts: CardHandOptions) {
    this.battlefield = this.opts.handRoot.closest('.scene')?.querySelector<HTMLElement>('.stage-area')
      ?? this.opts.handRoot.parentElement!
    this.stage = this.opts.handRoot.closest<HTMLElement>('.stage') ?? this.opts.handRoot.parentElement!
    this.wordZone = this.opts.handRoot.closest<HTMLElement>('.word-zone')
    this.opts.dropZone.setAttribute('aria-hidden', 'true')
    this.opts.dropZone.setAttribute('tabindex', '-1')
    this.opts.deckButton.addEventListener('click', () => this.enqueueDraw())
    this.battlefield.addEventListener('dragover', (event) => {
      if (!this.draggingId) return
      event.preventDefault()
      this.moveDragGhost(event.clientX, event.clientY)
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    })
    this.battlefield.addEventListener('drop', (event) => this.dropCard(event))
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
    this.removeDragGhost()
    this.clearDragFeedback()
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
    this.removeDragGhost()
    this.clearDragFeedback()
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
    const previousPositions = new Map(
      [...this.opts.handRoot.querySelectorAll<HTMLElement>('.word-card')].map((card) => [
        card.dataset.instanceId ?? '',
        card.getBoundingClientRect(),
      ]),
    )
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
      button.addEventListener('pointerdown', () => button.classList.add('pressing'))
      ;['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => {
        button.addEventListener(type, () => button.classList.remove('pressing'))
      })
      button.addEventListener('keydown', (event) => this.handleCardKey(event, button, state.hand))

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
    this.updateDropZone(state)
  }

  private cardHtml(card: CardInstance, index: number, count: number, availableWidth: number): string {
    const line = calculateLineTransform(index, count, availableWidth)
    const blocked = this.conflictOf(card.word)
    const selected = this.selectedId === card.instanceId
    const isDrawing = this.drawingId === card.instanceId
    const aria = blocked ? `${card.word.text}, 선택 불가: ${blocked}` : `${card.word.text}, ${card.word.note}`
    const artUrl = card.word.art ? SKILL_ART[card.word.art] : undefined
    const level = card.word.level ?? 1
    const levelBadge = level > 1 ? `<span class="card-level">Lv.${level}</span>` : ''
    // 풀 일러스트 카드 — 일러스트 위에 kind별 색감 틴트 + 중앙에 발광·깊은 그림자 글자.
    const front = artUrl
      ? `<span class="card-face card-front art">
          <img class="card-illus" src="${artUrl}" alt="" aria-hidden="true" />
          <span class="card-tint" aria-hidden="true"></span>
          <span class="card-veil" aria-hidden="true"></span>
          ${levelBadge}
          <strong class="card-title">${card.word.text}</strong>
          <span class="card-note">${blocked ?? card.word.note}</span>
        </span>`
      : `<span class="card-face card-front">
          ${levelBadge}
          <span class="card-art" aria-hidden="true"><i></i><b>${this.artGlyph(card.word)}</b></span>
          <strong>${card.word.text}</strong>
          <span class="card-note">${blocked ?? card.word.note}</span>
          <small>${blocked ? '맥락 충돌' : 'WORD CARD'}</small>
        </span>`
    return `<button class="word-card mood-${this.moodOf(card.word)}${selected ? ' selected' : ''}${blocked ? ' blocked' : ''}${isDrawing ? ' drawing' : ''}"
      data-instance-id="${card.instanceId}" aria-label="${aria}" aria-pressed="${selected}" ${blocked ? 'disabled' : ''}
      draggable="${!blocked && !isDrawing}"
      style="--card-x:${line.translateX.toFixed(1)}px;--card-z:${line.zIndex};--selected-lift:${CARD_HAND_CONFIG.selectedLift}px;--selected-scale:${CARD_HAND_CONFIG.selectedScale}">
      <span class="card-lift"><span class="card-inner">
        <span class="card-face card-back" aria-hidden="true"><i></i><b>그림일기</b></span>
        ${front}
      </span></span>
    </button>`
  }

  // 카드 색감(--wglow): 공격=붉음 · 방어=파랑 · 회복=초록 · 도박=보라.
  // TODO(기획): 보라색 '혼돈(chaos)' 종류 — 무슨 효과가 터질지 모르는 카드. 추후 추가.
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

  private beginDrag(event: DragEvent, button: HTMLButtonElement, card: CardInstance) {
    if (button.disabled || this.drawingId === card.instanceId) {
      event.preventDefault()
      return
    }
    this.draggingId = card.instanceId
    this.dragAccepted = false
    button.classList.remove('pressing')
    this.selectedId = card.instanceId
    this.opts.handRoot.querySelectorAll('.word-card.selected').forEach((item) => {
      item.classList.remove('selected')
      item.setAttribute('aria-pressed', 'false')
    })
    button.classList.add('selected')
    this.createDragGhost(button, event.clientX, event.clientY)
    this.battlefield.classList.add('card-drag-target')
    this.wordZone?.classList.add('card-drag-origin')
    this.wordZone?.querySelector('.slot-step .step.active')?.classList.add('receiving')
    requestAnimationFrame(() => button.classList.add('dragging'))
    button.setAttribute('aria-pressed', 'true')
    this.opts.onPreview(card.word)
    this.updateDropZone(this.currentState())
    event.dataTransfer?.setData('text/plain', card.instanceId)
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      const transparentDragImage = document.createElement('canvas')
      transparentDragImage.width = 1
      transparentDragImage.height = 1
      event.dataTransfer.setDragImage(transparentDragImage, 0, 0)
    }
  }

  private endDrag(button: HTMLButtonElement) {
    this.suppressClickId = button.dataset.instanceId ?? this.draggingId
    this.draggingId = null
    button.classList.remove('dragging')
    this.clearDragFeedback()
    void this.settleDragGhost(this.dragAccepted)
    this.render()
  }

  private dropCard(event: DragEvent) {
    event.preventDefault()
    const instanceId = event.dataTransfer?.getData('text/plain') || this.draggingId
    const state = this.currentState()
    const card = state?.hand.find((item) => item.instanceId === instanceId)
    if (!card || this.conflictOf(card.word)) return
    this.dragAccepted = true
    this.draggingId = null
    const steps = this.wordZone?.querySelector<HTMLElement>('.slot-step')
    steps?.classList.remove('commit-pulse')
    void steps?.offsetWidth
    steps?.classList.add('commit-pulse')
    window.setTimeout(() => steps?.classList.remove('commit-pulse'), 420)
    this.opts.onConfirm(card.word)
  }

  private stagePoint(clientX: number, clientY: number) {
    const rect = this.stage.getBoundingClientRect()
    const scaleX = rect.width / this.stage.offsetWidth || 1
    const scaleY = rect.height / this.stage.offsetHeight || 1
    return {
      x: (clientX - rect.left) / scaleX,
      y: (clientY - rect.top) / scaleY,
    }
  }

  private createDragGhost(button: HTMLButtonElement, clientX: number, clientY: number) {
    this.removeDragGhost()
    const stageRect = this.stage.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const scaleX = stageRect.width / this.stage.offsetWidth || 1
    const scaleY = stageRect.height / this.stage.offsetHeight || 1
    const pointer = this.stagePoint(clientX, clientY)
    this.dragOrigin = {
      x: (buttonRect.left - stageRect.left) / scaleX,
      y: (buttonRect.top - stageRect.top) / scaleY,
    }
    this.dragPointerOffset = {
      x: pointer.x - this.dragOrigin.x,
      y: pointer.y - this.dragOrigin.y,
    }
    this.lastDragX = pointer.x
    const activeStep = this.opts.handRoot.closest('.word-zone')?.querySelector<HTMLElement>('.slot-step .step.active')
    if (activeStep) {
      const rect = activeStep.getBoundingClientRect()
      const target = this.stagePoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      this.dragDestination = {
        x: target.x - CARD_HAND_CONFIG.cardWidth / 2,
        y: target.y - CARD_HAND_CONFIG.cardHeight / 2,
      }
    } else {
      this.dragDestination = null
    }

    const ghost = button.cloneNode(true) as HTMLElement
    ghost.classList.remove('selected', 'dragging')
    ghost.classList.add('drag-ghost')
    ghost.removeAttribute('data-instance-id')
    ghost.removeAttribute('draggable')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.style.setProperty('--drag-x', `${this.dragOrigin.x}px`)
    ghost.style.setProperty('--drag-y', `${this.dragOrigin.y}px`)
    ghost.style.setProperty('--drag-tilt', '0deg')
    this.stage.append(ghost)
    this.dragGhost = ghost
  }

  private moveDragGhost(clientX: number, clientY: number) {
    if (!this.dragGhost) return
    const point = this.stagePoint(clientX, clientY)
    const tilt = Math.max(-5, Math.min(5, (point.x - this.lastDragX) * 0.22))
    this.lastDragX = point.x
    this.dragGhost.style.setProperty('--drag-x', `${point.x - this.dragPointerOffset.x}px`)
    this.dragGhost.style.setProperty('--drag-y', `${point.y - this.dragPointerOffset.y}px`)
    this.dragGhost.style.setProperty('--drag-tilt', `${tilt.toFixed(2)}deg`)
    this.battlefield.style.setProperty('--drag-cue-x', `${point.x}px`)
    this.battlefield.style.setProperty('--drag-cue-y', `${point.y}px`)
  }

  private async settleDragGhost(accepted: boolean) {
    const ghost = this.dragGhost
    if (!ghost) return
    this.dragGhost = null
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      ghost.remove()
      return
    }

    const current = getComputedStyle(ghost).transform
    let destination = `translate3d(${this.dragOrigin.x}px, ${this.dragOrigin.y}px, 0) scale(1)`
    if (accepted && this.dragDestination) {
      destination = `translate3d(${this.dragDestination.x}px, ${this.dragDestination.y}px, 0) scale(.28) rotate(-2deg)`
    }

    const animation = ghost.animate(
      accepted
        ? [
            { transform: current, opacity: 0.98, filter: 'brightness(1)' },
            { transform: destination, opacity: 0, filter: 'brightness(1.45)' },
          ]
        : [
            { transform: current, opacity: 0.98 },
            { transform: destination, opacity: 0.72 },
          ],
      {
        duration: accepted ? 260 : 220,
        easing: accepted ? 'cubic-bezier(.2,.82,.22,1)' : 'cubic-bezier(.34,1.2,.5,1)',
      },
    )
    await animation.finished.catch(() => undefined)
    ghost.remove()
    this.dragAccepted = false
  }

  private removeDragGhost() {
    this.dragGhost?.remove()
    this.dragGhost = null
  }

  private clearDragFeedback() {
    this.battlefield.classList.remove('card-drag-target')
    this.battlefield.style.removeProperty('--drag-cue-x')
    this.battlefield.style.removeProperty('--drag-cue-y')
    this.wordZone?.classList.remove('card-drag-origin')
    this.wordZone?.querySelector('.slot-step .step.receiving')?.classList.remove('receiving')
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
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const card = hand.find((item) => item.instanceId === button.dataset.instanceId)
      if (!card || this.conflictOf(card.word)) return
      this.selectedId = card.instanceId
      this.opts.onConfirm(card.word)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const index = hand.findIndex((item) => item.instanceId === button.dataset.instanceId)
    const direction = event.key === 'ArrowLeft' ? -1 : 1
    const next = (index + direction + hand.length) % hand.length
    this.opts.handRoot.querySelector<HTMLElement>(`[data-instance-id="${hand[next].instanceId}"]`)?.focus()
  }
}
