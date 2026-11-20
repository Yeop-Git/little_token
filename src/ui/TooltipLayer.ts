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

import { tipLineHtml } from './TraitText'

const EDGE_PAD = 16
const GAP = 9

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
  return alt
    ? `<li class="is-alt"><b class="tip-or">${alt[1]}</b> ${tipLineHtml(alt[2])}</li>`
    : `<li>${tipLineHtml(item)}</li>`
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

    scene.addEventListener('pointerover', this.onOver)
    scene.addEventListener('pointerleave', this.onLeave)
    scene.addEventListener('focusin', this.onFocusIn)
    scene.addEventListener('focusout', this.onLeave)
    // 카드를 집는 순간 아이콘이 사라져도 포인터는 그 자리에 그대로다 — 그때는
    // pointerover가 다시 오지 않으므로 눌린 시점에 한 번 정리한다.
    scene.addEventListener('pointerdown', this.onLeave, true)
  }

  private onOver = (event: PointerEvent) => {
    const target = event.target as Element | null
    const host = target?.closest<HTMLElement>('[data-tooltip]') ?? null
    if (host) this.show(host)
    else this.hide()
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
      this.anchor = host
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
    if (!this.anchor) return
    this.anchor = null
    this.bubble.classList.remove('show')
    if (this.raf) {
      cancelAnimationFrame(this.raf)
      this.raf = 0
    }
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

  destroy() {
    this.destroyed = true
    this.hide()
    this.scene.removeEventListener('pointerover', this.onOver)
    this.scene.removeEventListener('pointerleave', this.onLeave)
    this.scene.removeEventListener('focusin', this.onFocusIn)
    this.scene.removeEventListener('focusout', this.onLeave)
    this.scene.removeEventListener('pointerdown', this.onLeave, true)
    this.bubble.remove()
  }
}
