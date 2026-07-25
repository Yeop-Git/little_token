import { SKILL_ART } from '@/assets'
import { RARITY_LABEL, type Word } from '@core/types'

// 클릭으로 카드를 먹일 때 고스트가 부풀어 사라지는 시간.
const COMMIT_ANIM_MS = 340

export const CARD_HAND_CONFIG = {
  maxHand: 6,
  /** 한 스테이지에서 추가로 뽑을 수 있는 횟수. 전투를 시작할 때 이 값으로 초기화된다. */
  drawsPerStage: 2,
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
  onConfirm: (word: Word) => void
  onHover?: (word: Word) => void
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
  // 스테이지(전투) 단위 추가 드로우 예산. 턴이 바뀌어도 이어지고, 전투를 새로 열 때만 채워진다.
  private drawsLeft = CARD_HAND_CONFIG.drawsPerStage
  private processing = false
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
  private readonly onHandPointerDown = (event: PointerEvent) => this.cardButton(event.target)?.classList.add('pressing')
  private readonly onHandPointerUp = (event: PointerEvent) => this.cardButton(event.target)?.classList.remove('pressing')
  private readonly onHandKeyDown = (event: KeyboardEvent) => {
    const button = this.cardButton(event.target)
    const state = this.currentState()
    if (button && state) this.handleCardKey(event, button, state.hand)
  }

  constructor(private readonly opts: CardHandOptions) {
    this.stage = this.opts.handRoot.closest<HTMLElement>('.stage') ?? this.opts.handRoot.parentElement!
    this.wordZone = this.opts.handRoot.closest<HTMLElement>('.word-zone')
    this.opts.deckButton.addEventListener('click', () => void this.drawOne())
    this.opts.handRoot.addEventListener('pointerover', this.onHandPointerOver)
    this.opts.handRoot.addEventListener('pointerout', this.onHandPointerOut)
    this.opts.handRoot.addEventListener('click', this.onHandClick)
    this.opts.handRoot.addEventListener('pointerdown', this.onHandPointerDown)
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

  showSlot(slotKey: string, words: Word[], chosen: Word | undefined, conflictOf: ConflictResolver) {
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
    this.opts.handRoot.removeEventListener('pointerover', this.onHandPointerOver)
    this.opts.handRoot.removeEventListener('pointerout', this.onHandPointerOut)
    this.opts.handRoot.removeEventListener('click', this.onHandClick)
    this.opts.handRoot.removeEventListener('pointerdown', this.onHandPointerDown)
    this.opts.handRoot.removeEventListener('pointerup', this.onHandPointerUp)
    this.opts.handRoot.removeEventListener('pointercancel', this.onHandPointerUp)
    this.opts.handRoot.removeEventListener('keydown', this.onHandKeyDown)
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

  /** 이번 전투에서 아직 쓰지 않은 뽑기 횟수 — 승리 시 보상등급으로 환산된다. */
  get savedDraws(): number {
    return Math.max(0, this.drawsLeft)
  }

  private currentState(): SlotHandState | undefined {
    return this.states.get(this.slotKey)
  }

  private async drawOne() {
    const state = this.currentState()
    if (!state || this.destroyed || this.processing) return
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
      button.getAnimations().forEach((animation) => animation.cancel())
      button.classList.remove('pressing', 'selected', 'drawing')
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
      const selected = this.selectedId === card.instanceId
      const drawing = this.drawingId === card.instanceId
      const rarity = card.word.rarity ?? 'common'
      button.className = `word-card mood-${this.moodOf(card.word)} rarity-${rarity}${selected ? ' selected' : ''}${blocked ? ' blocked' : ''}${drawing ? ' drawing' : ''}`
      button.dataset.instanceId = card.instanceId
      button.disabled = !!blocked
      button.setAttribute('aria-label', blocked ? `${card.word.text}, 선택 불가: ${blocked}` : `${card.word.text}, ${card.word.note}`)
      button.setAttribute('aria-pressed', String(selected))
      button.style.setProperty('--card-x', `${line.translateX.toFixed(1)}px`)
      button.style.setProperty('--card-z', String(line.zIndex))
      button.style.setProperty('--selected-lift', `${CARD_HAND_CONFIG.selectedLift}px`)
      button.style.setProperty('--selected-scale', String(CARD_HAND_CONFIG.selectedScale))
      const level = card.word.level ?? 1
      const badge = button.querySelector<HTMLElement>('.card-level')
      if (badge) badge.textContent = `${RARITY_LABEL[rarity]}${level > 1 ? ` Lv.${level}` : ''}`
      const note = button.querySelector<HTMLElement>('.card-note')
      if (note) note.textContent = blocked ?? card.word.note
      const footer = button.querySelector<HTMLElement>('.card-front > small')
      if (footer) footer.textContent = blocked ? '맥락 충돌' : 'WORD CARD'
    }
    button.dataset.poolKey = card.word.id
    return button
  }

  private cardHtml(card: CardInstance, index: number, count: number, availableWidth: number): string {
    const line = calculateLineTransform(index, count, availableWidth)
    const blocked = this.conflictOf(card.word)
    const selected = this.selectedId === card.instanceId
    const isDrawing = this.drawingId === card.instanceId
    const aria = blocked ? `${card.word.text}, 선택 불가: ${blocked}` : `${card.word.text}, ${card.word.note}`
    const artUrl = card.word.art ? SKILL_ART[card.word.art] : undefined
    const level = card.word.level ?? 1
    // 대상 범위 대신 등급·강화 단계를 보여준다 — 카드에서 알고 싶은 건 이쪽이다.
    const rarity = card.word.rarity ?? 'common'
    const levelBadge = `<span class="card-level rarity-${rarity}">${RARITY_LABEL[rarity]}${level > 1 ? ` Lv.${level}` : ''}</span>`
    // 풀 일러스트 카드 — 일러스트 위에 kind별 색감 틴트 + 중앙에 발광·깊은 그림자 글자.
    const front = artUrl
      ? `<span class="card-face card-front art">
          <img class="card-illus" src="${artUrl}" alt="" aria-hidden="true" />
          <span class="card-tint" aria-hidden="true"></span>
          <span class="card-veil" aria-hidden="true"></span>
          <span class="card-foil" aria-hidden="true"></span>
          ${levelBadge}
          <strong class="card-title">${card.word.text}</strong>
          <span class="card-note">${blocked ?? card.word.note}</span>
        </span>`
      : `<span class="card-face card-front">
          <span class="card-foil" aria-hidden="true"></span>
          ${levelBadge}
          <span class="card-art" aria-hidden="true"><i></i><b>${this.artGlyph(card.word)}</b></span>
          <strong>${card.word.text}</strong>
          <span class="card-note">${blocked ?? card.word.note}</span>
          <small>${blocked ? '맥락 충돌' : 'WORD CARD'}</small>
        </span>`
    return `<button class="word-card mood-${this.moodOf(card.word)} rarity-${rarity}${selected ? ' selected' : ''}${blocked ? ' blocked' : ''}${isDrawing ? ' drawing' : ''}"
      data-instance-id="${card.instanceId}" aria-label="${aria}" aria-pressed="${selected}" ${blocked ? 'disabled' : ''}
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

  // 카드를 문장에 넣는 단 하나의 경로 — 클릭과 키보드 입력이 여기로 모인다.
  // 게임 진행(onConfirm)은 즉시 일어나고, 카드가 부풀어 빨려드는 연출은 뒤에서 따로 논다.
  // 이렇게 분리해야 연출이 입력을 삼키지 않는다(예전엔 190ms 동안 클릭이 먹혔다).
  private commit(card: CardInstance, button?: HTMLButtonElement) {
    if (this.destroyed) return
    // 재렌더로 이미 손을 떠난 버튼(예: Enter 직후 따라오는 click)은 무시한다.
    if (button && !button.isConnected) return
    if (this.drawingId === card.instanceId) return
    if (this.conflictOf(card.word)) return

    this.selectedId = card.instanceId
    this.pulseSlotStep()
    // 연출은 진행 전에 미리 찍어 둔다 — onConfirm이 손패를 다시 그리면 버튼이 사라지기 때문.
    if (button && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.playCommitFx(button)
    }
    this.opts.onConfirm(card.word)
  }

  // 순수 연출 — 원본 위치에서 고스트를 복제해 화면 쪽으로 부풀리며 빛으로 흩어 보낸다.
  private playCommitFx(button: HTMLButtonElement) {
    const ghost = this.spawnCommitGhost(button)
    // 좌표는 숫자로 계산한다(키프레임 안의 calc()는 브라우저가 거부할 수 있다).
    const x = parseFloat(ghost.style.getPropertyValue('--commit-x')) || 0
    const y = parseFloat(ghost.style.getPropertyValue('--commit-y')) || 0
    const at = (dy: number, s: number) => `translate3d(${x.toFixed(1)}px, ${(y + dy).toFixed(1)}px, 0) scale(${s})`
    ghost.animate(
      [
        { transform: at(0, 1), opacity: 1, filter: 'brightness(1)' },
        { transform: at(-34, 1.34), opacity: 1, filter: 'brightness(1.75) saturate(1.25)', offset: 0.45 },
        { transform: at(-96, 2.05), opacity: 0, filter: 'brightness(2.6) saturate(1.4)' },
      ],
      { duration: COMMIT_ANIM_MS, easing: 'cubic-bezier(.2,.72,.24,1)' },
    )
    window.setTimeout(() => ghost.remove(), COMMIT_ANIM_MS + 80)
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
    const rect = button.getBoundingClientRect()
    const scaleX = stageRect.width / this.stage.offsetWidth || 1
    const scaleY = stageRect.height / this.stage.offsetHeight || 1
    const ghost = button.cloneNode(true) as HTMLElement
    ghost.classList.remove('selected', 'committing')
    ghost.classList.add('commit-ghost')
    ghost.removeAttribute('data-instance-id')
    ghost.setAttribute('aria-hidden', 'true')
    ghost.style.setProperty('--commit-x', `${((rect.left - stageRect.left) / scaleX).toFixed(1)}px`)
    ghost.style.setProperty('--commit-y', `${((rect.top - stageRect.top) / scaleY).toFixed(1)}px`)
    this.stage.append(ghost)
    return ghost
  }

  // 덱 버튼 — 이번 스테이지에 남은 추가 드로우 횟수를 보여준다(덱 장수가 아니다).
  private updateDeckButton(state: SlotHandState) {
    const pileLeft = state.deck.length
    const full = state.hand.length >= CARD_HAND_CONFIG.maxHand
    const spent = this.drawsLeft <= 0
    const disabled = this.processing || full || spent || pileLeft === 0
    const note = spent ? '이번 전투 소진' : full ? '손패 가득' : pileLeft === 0 ? '남은 카드 없음' : `${this.drawsLeft}회 남음`
    // 아끼면 그만큼 보상등급이 오른다 — 뽑기를 참는 선택에 값을 붙여 둔다.
    const saveHint = this.drawsLeft > 0 ? ` · 아끼면 보상등급 +${this.drawsLeft}` : ''
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
    const next = (index + direction + hand.length) % hand.length
    this.opts.handRoot.querySelector<HTMLElement>(`[data-instance-id="${hand[next].instanceId}"]`)?.focus()
  }
}
