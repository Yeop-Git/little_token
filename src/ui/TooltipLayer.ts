/**
 * TooltipLayer — `data-tooltip` 쪽지를 무대 최상단 한 겹에서만 그린다.
 *
 * 예전에는 아이콘마다 `::after` 가상 요소로 띄웠다. 가상 요소는 자기 아이콘이 속한
 * 쌓임 맥락을 못 벗어나므로, 전장 안(z 3)의 적 상태 아이콘 쪽지는 상단 HUD(z 6)와
 * 손패(z 7)와 문장 진행표(z 950) 아래로 깔렸다 — z-index를 아무리 올려도 그 안에서만
 * 올라갔다. 그래서 쪽지 하나를 씬 맨 위에 따로 세워 두고, 호버한 아이콘의 자리를
 * 무대 좌표로 환산해 옮겨 붙인다.
 *
 * 붙는 대상: `[data-tooltip]`. 위로 세울지 아래로 내릴지는 `data-tip-place`가 정한다.
 */

import type { Word } from '@core/types'
import { ALL_REWARD_WORDS } from '@data/earlyWords'
import { EARLY_WORDS, WORDS } from '@data/generated/sentenceData'
import { localizedWordText } from '@/localization/content'
import { tipLineHtml } from './TraitText'
import { wordCardHtml } from './WordCardFace'

const EDGE_PAD = 16
const GAP = 9
/** 아이콘에서 쪽지로 마우스를 옮기는 사이 쪽지가 닫히지 않게 기다리는 시간. */
const HIDE_GRACE_MS = 320
/** 옆 쪽지(태그 설명·카드 미리보기)와 본 쪽지 사이 간격. */
const SUB_GAP = 10

let wordsByName: Map<string, Word> | null = null
/** 「카드 이름」 태그로 실제 카드를 찾는다 — 화면에 보이는 이름(현지화 포함)과 원문 둘 다로. */
function wordByName(name: string): Word | undefined {
  if (!wordsByName) {
    wordsByName = new Map()
    const all = [...ALL_REWARD_WORDS, ...Object.values(EARLY_WORDS).flat(), ...Object.values(WORDS).flat()]
    for (const word of all) {
      for (const key of [localizedWordText(word), word.text]) if (key && !wordsByName.has(key)) wordsByName.set(key, word)
    }
  }
  return wordsByName.get(name)
}

/**
 * 설명 문장을 글머리표 항목으로 나눈다 — 줄바꿈, 그리고 문장 끝(. 。 ! ?) 뒤의 띄어쓰기.
 * "×1.5"처럼 숫자 안의 점은 뒤에 띄어쓰기가 없어 쪼개지지 않는다(11/20 피드백: 설명은 •로 나눠 간결하게).
 */
export function tipBulletItems(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line) => line.split(/(?<=[.。!?！？])\s+/))
    .map((item) => item.trim().replace(/^[•·\-]\s*/, ''))
    .filter(Boolean)
}

/** 상세 칸·도감처럼 HTML 문자열로 그리는 설명도 쪽지와 같은 •목록으로 나눈다. */
export function tipBulletsHtml(text: string): string {
  const items = tipBulletItems(text)
  if (items.length <= 1) return tipLineHtml(items[0] ?? '')
  return `<ul class="tip-bullets">${items.map(tipBulletHtml).join('')}</ul>`
}

/** '혹은 …'으로 시작하는 줄은 다른 선택지라서 머리말을 따로 강조한다. */
function tipBulletHtml(item: string): string {
  const alt = /^(혹은)\s+(.+)$/.exec(item)
  if (alt) return `<li class="is-alt"><b class="tip-or">${alt[1]}</b> ${tipLineHtml(alt[2])}</li>`
  // '예시 …' 줄은 바로 윗줄의 부연이라 들여 쓰고 머리말을 파랗게 둔다(11/20 피드백).
  const example = /^(예시)(?:\s*카드)?\s+(.+)$/.exec(item)
  if (example) return `<li class="is-example"><b class="tip-or">${example[1]}</b> ${tipLineHtml(example[2])}</li>`
  return `<li>${tipLineHtml(item)}</li>`
}

/** 쪽지 본문 — •목록과 키워드·카드 태그. tipBulletsHtml이 모든 글자를 이스케이프한다. */
export function fillTipBody(target: HTMLElement, text: string): void {
  target.innerHTML = tipBulletsHtml(text)
}

export class TooltipLayer {
  private scene: HTMLElement
  private bubble: HTMLElement
  private head: HTMLElement
  /** `data-tip-label`이 붙은 쪽지에만 서는 머리 라벨(예: 공략 팁의 `TIP`). */
  private label: HTMLElement
  private title: HTMLElement
  private body: HTMLElement
  private anchor: HTMLElement | null = null
  /** 쪽지를 띄운 손패 카드 — 쪽지가 떠 있는 동안 들린 자세를 유지한다. */
  private heldCard: HTMLElement | null = null
  /** 본 쪽지 안 태그에 올렸을 때 옆에 붙는 두 번째 쪽지(태그 설명이나 카드 앞면). */
  private sub: HTMLElement
  private subAnchor: HTMLElement | null = null
  /** 본 쪽지 안에 툴팁 달린 태그가 있으면 마우스로 들어가 볼 수 있게 한다. */
  private interactive = false
  private hideTimer = 0
  private raf = 0
  private destroyed = false

  constructor(scene: HTMLElement) {
    this.scene = scene
    this.bubble = document.createElement('div')
    this.bubble.className = 'tip-bubble'
    this.bubble.setAttribute('aria-hidden', 'true')
    this.head = document.createElement('span')
    this.head.className = 'tip-bubble-head'
    this.label = document.createElement('span')
    this.label.className = 'tip-bubble-label'
    this.title = document.createElement('strong')
    this.title.className = 'tip-bubble-title'
    this.body = document.createElement('span')
    this.body.className = 'tip-bubble-body'
    this.head.append(this.label, this.title)
    this.bubble.append(this.head, this.body)
    scene.appendChild(this.bubble)
    this.sub = document.createElement('div')
    this.sub.className = 'tip-sub'
    this.sub.setAttribute('aria-hidden', 'true')
    scene.appendChild(this.sub)

    scene.addEventListener('pointerover', this.onOver)
    scene.addEventListener('pointerleave', this.onLeave)
    scene.addEventListener('focusin', this.onFocusIn)
    scene.addEventListener('focusout', this.onLeave)
    // 카드를 집는 순간 아이콘이 사라져도 포인터는 그 자리에 그대로다 — 그때는
    // pointerover가 다시 오지 않으므로 눌린 시점에 한 번 정리한다.
    scene.addEventListener('pointerdown', this.onDown, true)
  }

  private onOver = (event: PointerEvent) => {
    const target = event.target as Element | null
    // 쪽지 안으로 들어왔다 — 닫지 않고, 태그 위면 옆 쪽지를 띄운다.
    if (target && this.interactive && this.bubble.contains(target)) {
      this.cancelHide()
      const tag = target.closest<HTMLElement>('[data-tooltip]')
      if (tag && this.bubble.contains(tag)) this.showSub(tag)
      else this.hideSub()
      return
    }
    if (target && this.sub.contains(target)) {
      this.cancelHide()
      return
    }
    const host = target?.closest<HTMLElement>('[data-tooltip]') ?? null
    if (host) {
      this.cancelHide()
      this.show(host)
    } else this.scheduleHide()
  }

  private onDown = (event: PointerEvent) => {
    const target = event.target as Element | null
    if (target && (this.bubble.contains(target) || this.sub.contains(target))) return
    this.hide()
  }

  /** 들어가 볼 수 있는 쪽지는 아이콘을 벗어나도 잠깐 기다린다 — 쪽지로 옮겨 가는 길에 닫히지 않게. */
  private scheduleHide() {
    if (!this.anchor) return
    if (!this.interactive) {
      this.hide()
      return
    }
    if (!this.hideTimer) this.hideTimer = window.setTimeout(() => {
      this.hideTimer = 0
      this.hide()
    }, HIDE_GRACE_MS)
  }

  private cancelHide() {
    if (!this.hideTimer) return
    window.clearTimeout(this.hideTimer)
    this.hideTimer = 0
  }

  private onFocusIn = (event: FocusEvent) => {
    const target = event.target as Element | null
    const host = target?.closest<HTMLElement>('[data-tooltip]')
    if (host) this.show(host)
  }

  private onLeave = () => this.hide()

  private show(host: HTMLElement) {
    const text = host.dataset.tooltip
    if (!text) return
    if (host !== this.anchor) {
      this.releaseCardHold()
      this.anchor = host
      // 손패 카드의 태그 쪽지는 카드 위로 겹쳐 뜬다. 쪽지로 마우스가 넘어가는 순간 카드의
      // :hover가 풀려 카드가 내려앉고, 따라 내려온 쪽지 아래로 다시 카드가 잡혀 올라오는
      // 진동이 생겼다(11/20 피드백). 쪽지가 떠 있는 동안 그 카드를 들린 자세로 붙잡아 둔다.
      this.heldCard = host.closest<HTMLElement>('.word-card')
      this.heldCard?.classList.add('tip-hold')
      this.hideSub()
      const label = host.dataset.tipLabel ?? ''
      const lines = text.split('\n')
      const explicitTitle = host.dataset.tipTitle ?? ''
      const title = explicitTitle || (lines.length > 1 ? lines.shift()!.trim() : '')
      const body = explicitTitle ? text : lines.join('\n').trim()
      this.label.textContent = label
      this.label.hidden = !label
      this.title.textContent = title
      this.title.hidden = !title
      this.head.hidden = !label && !title
      // `data-tip-html`은 게임이 직접 조립한 표(보유 아이템 쪽지 등)에만 쓴다. 사용자 입력은 넣지 않는다.
      const html = host.dataset.tipHtml
      if (html) this.body.innerHTML = html
      else fillTipBody(this.body, body)
      this.interactive = !!this.body.querySelector('[data-tooltip]')
      this.bubble.classList.toggle('is-interactive', this.interactive)
      this.bubble.classList.toggle('is-rich', !!html)
      this.bubble.classList.toggle('has-title', !!title)
      this.bubble.dataset.kind = host.dataset.tipKind ?? ''
      this.bubble.dataset.place = host.dataset.tipPlace === 'above' ? 'above' : 'below'
      this.bubble.classList.add('show')
    }
    this.place()
    if (!this.raf) this.raf = requestAnimationFrame(this.follow)
  }

  private hide() {
    this.cancelHide()
    if (!this.anchor) return
    this.anchor = null
    this.releaseCardHold()
    this.interactive = false
    this.bubble.classList.remove('is-interactive')
    this.hideSub()
    this.bubble.classList.remove('show')
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
  }

  private releaseCardHold() {
    this.heldCard?.classList.remove('tip-hold')
    this.heldCard = null
  }

  /** 적이 걸어 들어오거나 레일이 당겨지는 동안에도 쪽지가 아이콘을 따라간다. */
  private follow = () => {
    this.raf = 0
    if (this.destroyed) return
    const host = this.anchor
    if (!host || !host.isConnected || !host.offsetParent) {
      this.hide()
      return
    }
    this.place()
    if (this.subAnchor) this.placeSub()
    this.raf = requestAnimationFrame(this.follow)
  }

  private place() {
    const host = this.anchor
    if (!host) return
    const sceneRect = this.scene.getBoundingClientRect()
    const stageW = this.scene.offsetWidth
    const stageH = this.scene.offsetHeight
    // 무대는 뷰포트에 맞춰 통째로 축소돼 있다. 화면 픽셀을 무대 픽셀로 되돌린다.
    const scale = sceneRect.width / Math.max(1, stageW) || 1
    const rect = host.getBoundingClientRect()
    const centerX = (rect.left + rect.width / 2 - sceneRect.left) / scale
    const anchorTop = (rect.top - sceneRect.top) / scale
    const anchorBottom = (rect.bottom - sceneRect.top) / scale

    const w = this.bubble.offsetWidth
    const h = this.bubble.offsetHeight
    let above = this.bubble.dataset.place === 'above'
    let y = above ? anchorTop - h - GAP : anchorBottom + GAP
    // 자리가 모자라면 반대쪽으로 넘긴다 — 잘려 못 읽는 것보다 낫다.
    if (y < EDGE_PAD) {
      y = anchorBottom + GAP
      above = false
    }
    if (y + h > stageH - EDGE_PAD) {
      y = anchorTop - h - GAP
      above = true
    }
    this.bubble.dataset.actualPlace = above ? 'above' : 'below'
    const x = Math.min(Math.max(centerX - w / 2, EDGE_PAD), Math.max(EDGE_PAD, stageW - EDGE_PAD - w))

    // 매 프레임 같은 값을 다시 써 넣으면 레이아웃이 계속 무효화된다 — 바뀔 때만 쓴다.
    const nextLeft = `${Math.round(x)}px`
    const nextTop = `${Math.round(Math.max(EDGE_PAD, y))}px`
    if (this.bubble.style.left !== nextLeft) this.bubble.style.left = nextLeft
    if (this.bubble.style.top !== nextTop) this.bubble.style.top = nextTop
  }

  /** 본 쪽지 안 태그의 설명, 카드 태그면 실제 카드 앞면을 본 쪽지 옆에 붙인다. */
  private showSub(tag: HTMLElement) {
    if (tag === this.subAnchor) return
    this.subAnchor = tag
    const cardName = tag.dataset.tipCard
    const word = cardName ? wordByName(cardName) : undefined
    if (word) {
      this.sub.innerHTML = `<div class="tip-sub-card">${wordCardHtml(word)}</div>`
      this.sub.dataset.kind = 'card'
    } else {
      const title = tag.dataset.tipTitle ?? ''
      const text = tag.dataset.tooltip ?? ''
      if (!text || text === title) {
        this.hideSub()
        return
      }
      this.sub.innerHTML = `<strong class="tip-sub-title"></strong><span class="tip-sub-body"></span>`
      this.sub.querySelector('.tip-sub-title')!.textContent = title
      fillTipBody(this.sub.querySelector<HTMLElement>('.tip-sub-body')!, text)
      this.sub.dataset.kind = 'text'
    }
    this.sub.classList.add('show')
    this.placeSub()
  }

  private hideSub() {
    this.subAnchor = null
    this.sub.classList.remove('show')
  }

  /** 옆 쪽지는 본 쪽지 오른쪽(자리가 없으면 왼쪽)에, 높이는 올린 태그 줄에 맞춘다. */
  private placeSub() {
    const tag = this.subAnchor
    if (!tag) return
    const sceneRect = this.scene.getBoundingClientRect()
    const stageW = this.scene.offsetWidth
    const stageH = this.scene.offsetHeight
    const scale = sceneRect.width / Math.max(1, stageW) || 1
    const tagTop = (tag.getBoundingClientRect().top - sceneRect.top) / scale
    const bx = this.bubble.offsetLeft
    const bw = this.bubble.offsetWidth
    const w = this.sub.offsetWidth
    const h = this.sub.offsetHeight
    let x = bx + bw + SUB_GAP
    if (x + w > stageW - EDGE_PAD) x = bx - w - SUB_GAP
    x = Math.max(EDGE_PAD, x)
    const y = Math.min(Math.max(EDGE_PAD, tagTop - 12), Math.max(EDGE_PAD, stageH - EDGE_PAD - h))
    this.sub.style.left = `${Math.round(x)}px`
    this.sub.style.top = `${Math.round(y)}px`
  }

  destroy() {
    this.destroyed = true
    this.hide()
    this.scene.removeEventListener('pointerover', this.onOver)
    this.scene.removeEventListener('pointerleave', this.onLeave)
    this.scene.removeEventListener('focusin', this.onFocusIn)
    this.scene.removeEventListener('focusout', this.onLeave)
    this.scene.removeEventListener('pointerdown', this.onDown, true)
    this.bubble.remove()
    this.sub.remove()
  }
}
