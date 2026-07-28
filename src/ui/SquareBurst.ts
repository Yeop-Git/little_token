import { GraphicsSettings } from '@/ui/GameSettings'

/**
 * SquareBurst — 언멜팅의 사각형 블라스트 이펙트를 가져와 적용.
 * 원점에서 16~20개의 단색 사각형이 흩어지며 터진다. 피격/방어/회복 등
 * 테마별 4단계 팔레트로 실루엣이 또렷하게 읽힌다.
 *
 *   SquareBurst.playOn(targetEl, 'damage')  — DOM 요소 중심에서 터뜨림
 *   SquareBurst.playAt(x, y, 'heal')         — 뷰포트 픽셀 좌표
 */

export type BurstTheme = 'damage' | 'guard' | 'heal' | 'self' | 'gold'

interface Palette {
  shades: [string, string, string, string]
}

const PALETTES: Record<BurstTheme, Palette> = {
  // 피격 — 검붉은 → 불씨 노랑
  damage: { shades: ['#1c0608', '#7a1f22', '#d6492f', '#f4c34a'] },
  // 방어(임시 체력) — 남색 → 하늘빛
  guard: { shades: ['#06121e', '#1f4a72', '#5fa6d8', '#dceefc'] },
  // 회복 — 짙은 녹색 → 연둣빛
  heal: { shades: ['#0e1f12', '#2c5e34', '#7ed091', '#e2f7c8'] },
  // 자해 — 진홍 → 살구
  self: { shades: ['#24070b', '#9f2734', '#f06a72', '#ffd8c9'] },
  // 금빛(보상 등)
  gold: { shades: ['#2c1c06', '#7a4e10', '#e3a624', '#ffe28a'] },
}

export interface BurstOptions {
  count?: number
  spread?: number
  duration?: number
  size?: [number, number]
}

const OVERLAY_ID = 'square-burst-overlay'
const STYLE_ID = 'square-burst-styles'
const MAX_POOLED_PIECES = 96
const piecePool: HTMLElement[] = []

function getOverlay(): HTMLElement {
  let el = document.getElementById(OVERLAY_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = OVERLAY_ID
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)
  return el
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
#${OVERLAY_ID} { position: fixed; inset: 0; z-index: 400; pointer-events: none; overflow: visible; }
.square-burst-piece { position: absolute; width: 14px; height: 14px; will-change: transform, opacity; pointer-events: none; border-radius: 2px; }
`
  document.head.appendChild(style)
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const pickShade = (p: Palette) => p.shades[Math.floor(Math.random() * p.shades.length)]

function spawnSquare(overlay: HTMLElement, ox: number, oy: number, palette: Palette, spread: number, duration: number, sizeRange: [number, number]) {
  const piece = piecePool.pop() ?? document.createElement('div')
  piece.getAnimations().forEach((animation) => animation.cancel())
  piece.className = 'square-burst-piece'
  const size = rand(sizeRange[0], sizeRange[1])
  const angle = rand(0, Math.PI * 2)
  const distance = rand(spread * 0.35, spread)
  const dx = Math.cos(angle) * distance
  const dy = Math.sin(angle) * distance
  const sr = rand(-30, 30)
  const er = sr + rand(-90, 90)
  piece.style.left = `${ox - size / 2}px`
  piece.style.top = `${oy - size / 2}px`
  piece.style.width = `${size}px`
  piece.style.height = `${size}px`
  piece.style.background = pickShade(palette)
  overlay.appendChild(piece)
  const anim = piece.animate(
    [
      { transform: `translate(0px,0px) rotate(${sr}deg) scale(0.6)`, opacity: 1 },
      { transform: `translate(${dx * 0.55}px,${dy * 0.55}px) rotate(${sr + (er - sr) * 0.55}deg) scale(1)`, opacity: 0.95, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) rotate(${er}deg) scale(0.85)`, opacity: 0 },
    ],
    { duration, easing: 'cubic-bezier(0.18,0.78,0.28,1)', fill: 'forwards' },
  )
  let released = false
  const release = () => {
    if (released) return
    released = true
    piece.remove()
    if (piecePool.length < MAX_POOLED_PIECES) piecePool.push(piece)
  }
  anim.onfinish = release
  window.setTimeout(release, duration + 200)
}

export const SquareBurst = {
  playAt(x: number, y: number, theme: BurstTheme, opts: BurstOptions = {}): void {
    ensureStyles()
    const overlay = getOverlay()
    const palette = PALETTES[theme]
    const requestedCount = opts.count ?? Math.floor(rand(16, 21))
    const count = Math.max(4, Math.round(requestedCount * GraphicsSettings.profile().effectScale))
    const spread = opts.spread ?? 130
    const duration = opts.duration ?? 560
    const sizeRange = opts.size ?? [10, 22]
    for (let i = 0; i < count; i += 1) spawnSquare(overlay, x, y, palette, spread, duration, sizeRange)
  },
  playOn(target: HTMLElement | DOMRect | null | undefined, theme: BurstTheme, opts: BurstOptions = {}): void {
    if (!target) return
    const rect = target instanceof HTMLElement ? target.getBoundingClientRect() : target
    SquareBurst.playAt(rect.left + rect.width / 2, rect.top + rect.height / 2, theme, opts)
  },
}
