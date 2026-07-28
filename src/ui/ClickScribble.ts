/**
 * ClickScribble — 클릭할 때마다 그 자리에 연필 자국을 남긴다.
 * 일기장에서 단어에 동그라미를 치듯, 손그림 원이 한 번에 쓱 그려졌다가 지워진다.
 *
 * 자국은 클릭한 곳의 성격을 따라간다.
 *   write   — 버튼·단어 카드처럼 쓸 수 있는 곳: 금빛 동그라미 + 튀는 연필 가루
 *   plain   — 그 밖의 빈 종이: 옅은 크림빛 동그라미
 *   blocked — 모순 차단·비활성: 붉은 ✕ 두 줄(가루 없음)
 *
 * 캡처 단계에서 듣기 때문에 전파를 끊는 카드·오버레이 위에서도 빠짐없이 남고,
 * 한 클릭에 하나씩만 그린다(겹쳐 쌓이면 더블클릭처럼 읽힌다).
 * 표시 전용이라 게임 상태를 건드리지 않는다.
 */

type Mark = 'write' | 'plain' | 'blocked'

interface Tone {
  /** 위에 얹는 잉크색 — 어두운 유리 패널 위에서 읽히는 밝은 선. */
  ink: string
  /** 아래 깔리는 연필심색 — 밝은 종이 위에서 읽히는 어두운 선. */
  lead: string
  radius: number
  dust: number
}

const TONES: Record<Mark, Tone> = {
  write: { ink: '#ffd98a', lead: 'rgba(52,34,20,0.6)', radius: 19, dust: 5 },
  plain: { ink: '#f7ecd2', lead: 'rgba(44,30,20,0.52)', radius: 15, dust: 3 },
  blocked: { ink: '#f5947c', lead: 'rgba(52,24,18,0.55)', radius: 15, dust: 0 },
}

/** 선이 그려지는 시간. 너무 길면 클릭보다 자국이 늦게 도착한다. */
const DRAW_MS = 180
/** 다 그린 뒤 지워지는 시간. */
const FADE_MS = 240
const DUST_MS = 340
/** 연타로 화면이 자국투성이가 되지 않게 두는 상한. */
const MAX_MARKS = 6

const OVERLAY_ID = 'click-scribble-overlay'
const STYLE_ID = 'click-scribble-styles'
const VIEW = 60

const live: SVGSVGElement[] = []

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${OVERLAY_ID} { position: fixed; inset: 0; z-index: 1500; pointer-events: none; overflow: visible; }
.click-scribble { position: absolute; width: ${VIEW}px; height: ${VIEW}px; margin: ${-VIEW / 2}px 0 0 ${-VIEW / 2}px; overflow: visible; will-change: transform, opacity; }
.click-scribble path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.click-dust { position: absolute; width: 7px; height: 2.5px; border-radius: 2px; box-shadow: 0 0 0 0.6px rgba(36,22,12,0.45); will-change: transform, opacity; }
`
  document.head.appendChild(style)
}

function getOverlay(): HTMLElement {
  const found = document.getElementById(OVERLAY_ID)
  if (found) return found
  const el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

const round = (n: number) => Math.round(n * 10) / 10

/** 점들을 중점 이차곡선으로 이어 손으로 그은 듯 부드럽게 만든다. */
function smoothPath(points: Array<[number, number]>): string {
  let d = `M${round(points[0][0])} ${round(points[0][1])}`
  for (let i = 1; i < points.length - 1; i += 1) {
    const [x, y] = points[i]
    const [nx, ny] = points[i + 1]
    d += ` Q${round(x)} ${round(y)} ${round((x + nx) / 2)} ${round((y + ny) / 2)}`
  }
  const last = points[points.length - 1]
  return `${d} L${round(last[0])} ${round(last[1])}`
}

/** 시작점을 지나쳐 한 바퀴 더 도는, 반지름이 조금씩 흔들리는 동그라미. */
function ringPath(radius: number): string {
  const start = Math.random() * Math.PI * 2
  const sweep = Math.PI * 2 + 0.5 + Math.random() * 0.7
  const squash = 0.88 + Math.random() * 0.14
  const steps = 18
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const angle = start + sweep * t
    // 손으로 그리면 끝으로 갈수록 조금 벌어진다.
    const r = radius * (1 + (Math.random() - 0.5) * 0.12 + t * 0.07)
    points.push([Math.cos(angle) * r, Math.sin(angle) * r * squash])
  }
  return smoothPath(points)
}

/** 쓱쓱 두 번 그은 취소 표시. */
function crossPath(radius: number): string {
  const jitter = () => (Math.random() - 0.5) * 2.4
  const r = radius * 0.8
  const first = smoothPath([
    [-r + jitter(), -r + jitter()],
    [jitter() * 0.6, jitter() * 0.6],
    [r + jitter(), r + jitter()],
  ])
  const second = smoothPath([
    [r + jitter(), -r + jitter()],
    [jitter() * 0.6, jitter() * 0.6],
    [-r + jitter(), r + jitter()],
  ])
  return `${first} ${second}`
}

function drawStroke(path: SVGPathElement, delay: number): void {
  const length = path.getTotalLength()
  path.style.strokeDasharray = `${length}`
  path.style.strokeDashoffset = `${length}`
  path.animate([{ strokeDashoffset: `${length}` }, { strokeDashoffset: '0' }], {
    duration: DRAW_MS,
    delay,
    easing: 'cubic-bezier(0.2,0.7,0.3,1)',
    fill: 'forwards',
  })
}

function spawnDust(overlay: HTMLElement, x: number, y: number, tone: Tone): void {
  for (let i = 0; i < tone.dust; i += 1) {
    const speck = document.createElement('i')
    speck.className = 'click-dust'
    speck.style.left = `${x}px`
    speck.style.top = `${y}px`
    speck.style.background = i % 2 === 0 ? tone.ink : '#4a3625'
    overlay.appendChild(speck)
    // 아래쪽으로 치우쳐 흩어진다 — 종이 위에 떨어지는 연필 가루.
    const angle = Math.random() * Math.PI * 2
    const distance = 18 + Math.random() * 26
    const dx = Math.cos(angle) * distance
    const dy = Math.sin(angle) * distance * 0.6 + 12 + Math.random() * 14
    const spin = Math.round(Math.random() * 360 - 180)
    const animation = speck.animate(
      [
        { transform: `translate(0px, 0px) rotate(${spin / 3}deg) scale(1)`, opacity: 1 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${spin}deg) scale(0.5)`, opacity: 0 },
      ],
      { duration: DUST_MS + Math.random() * 120, easing: 'cubic-bezier(0.2,0.8,0.4,1)', fill: 'forwards' },
    )
    animation.onfinish = () => speck.remove()
  }
}

function markFor(target: EventTarget | null): Mark {
  if (!(target instanceof Element)) return 'plain'
  if (target.closest(':disabled, [aria-disabled="true"], .blocked')) return 'blocked'
  return target.closest('button, [role="button"], a[href], .codex-selectable') ? 'write' : 'plain'
}

function spawnMark(overlay: HTMLElement, x: number, y: number, mark: Mark): void {
  const tone = TONES[mark]
  const lowGraphics = document.documentElement.dataset.effects === 'low'
  const d = mark === 'blocked' ? crossPath(tone.radius) : ringPath(tone.radius)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'click-scribble')
  svg.setAttribute('viewBox', `${-VIEW / 2} ${-VIEW / 2} ${VIEW} ${VIEW}`)
  svg.style.left = `${x}px`
  svg.style.top = `${y}px`
  svg.style.transform = `rotate(${(Math.random() * 16 - 8).toFixed(1)}deg)`

  // 어두운 심 자국을 먼저 깔고 밝은 잉크를 얹어, 밝은 종이와 어두운 패널
  // 양쪽에서 선이 사라지지 않게 한다. 저사양에서는 잉크 한 겹만 그린다.
  const strokes: SVGPathElement[] = []
  if (!lowGraphics) {
    const lead = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    lead.setAttribute('d', d)
    lead.setAttribute('stroke', tone.lead)
    lead.setAttribute('stroke-width', '4')
    strokes.push(lead)
  }
  const ink = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  ink.setAttribute('d', d)
  ink.setAttribute('stroke', tone.ink)
  ink.setAttribute('stroke-width', '2.2')
  strokes.push(ink)
  strokes.forEach((stroke) => svg.appendChild(stroke))

  overlay.appendChild(svg)
  live.push(svg)
  while (live.length > MAX_MARKS) live.shift()?.remove()

  strokes.forEach((stroke, index) => drawStroke(stroke, index * 12))

  const fade = svg.animate(
    [
      { opacity: 1, transform: `${svg.style.transform} scale(1)` },
      { opacity: 0, transform: `${svg.style.transform} scale(1.18)` },
    ],
    { duration: FADE_MS, delay: DRAW_MS - 30, easing: 'ease-out', fill: 'forwards' },
  )
  fade.onfinish = () => {
    const index = live.indexOf(svg)
    if (index >= 0) live.splice(index, 1)
    svg.remove()
  }

  if (!lowGraphics && tone.dust > 0) spawnDust(overlay, x, y, tone)
}

export const ClickScribble = {
  install(): void {
    ensureStyles()
    const overlay = getOverlay()
    window.addEventListener(
      'pointerdown',
      (event) => {
        // 주 버튼만 — 오른쪽·가운데 클릭은 자국을 남기지 않는다.
        if (event.button !== 0) return
        spawnMark(overlay, event.clientX, event.clientY, markFor(event.target))
      },
      { capture: true },
    )
  },
}
