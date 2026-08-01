import { mobileText } from '@/localization/mobile'

const STAGE_WIDTH = 1920
const STAGE_HEIGHT = 1080

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MobileLayout {
  scale: number
  left: number
  top: number
  phonePortrait: boolean
  touchTarget: number
  touchText: number
  touchSmallText: number
}

export function mobileLayoutFor(
  width: number,
  height: number,
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 },
  offsetLeft = 0,
  offsetTop = 0,
): MobileLayout {
  const availableWidth = Math.max(1, width - insets.left - insets.right)
  const availableHeight = Math.max(1, height - insets.top - insets.bottom)
  const scale = Math.min(availableWidth / STAGE_WIDTH, availableHeight / STAGE_HEIGHT)
  const portrait = height > width
  return {
    scale,
    left: offsetLeft + insets.left + availableWidth / 2,
    top: offsetTop + insets.top + availableHeight / 2,
    phonePortrait: portrait && Math.min(width, height) < 600,
    touchTarget: Math.max(64, Math.min(148, 48 / scale)),
    touchText: Math.max(24, Math.min(40, 13 / scale)),
    touchSmallText: Math.max(18, Math.min(32, 11 / scale)),
  }
}

function safeAreaInsets(probe: HTMLElement): Insets {
  const style = getComputedStyle(probe)
  const value = (side: string) => Number.parseFloat(style.getPropertyValue(`padding-${side}`)) || 0
  const insets = { top: value('top'), right: value('right'), bottom: value('bottom'), left: value('left') }
  return insets
}

export function installMobileViewport(stage: HTMLElement): void {
  const coarse = matchMedia('(pointer: coarse)')
  const root = document.documentElement
  const safeAreaProbe = document.createElement('div')
  safeAreaProbe.className = 'safe-area-probe'
  document.body.append(safeAreaProbe)
  const gate = document.createElement('div')
  gate.id = 'orientation-gate'
  gate.setAttribute('role', 'status')
  gate.innerHTML = `<div><b>${mobileText('rotateTitle')}</b><span>${mobileText('rotateBody')}</span></div>`
  document.body.append(gate)

  const fit = () => {
    const viewport = window.visualViewport
    const width = viewport?.width ?? window.innerWidth
    const height = viewport?.height ?? window.innerHeight
    const offsetLeft = viewport?.offsetLeft ?? 0
    const offsetTop = viewport?.offsetTop ?? 0
    const insets = safeAreaInsets(safeAreaProbe)
    const touch = coarse.matches
    const portrait = height > width
    const layout = mobileLayoutFor(width, height, insets, offsetLeft, offsetTop)

    root.dataset.input = touch ? 'touch' : 'pointer'
    root.dataset.orientation = portrait ? 'portrait' : 'landscape'
    stage.style.setProperty('--scale', String(layout.scale))
    stage.style.setProperty('--touch-target', `${layout.touchTarget}px`)
    stage.style.setProperty('--touch-text', `${layout.touchText}px`)
    stage.style.setProperty('--touch-small-text', `${layout.touchSmallText}px`)
    stage.style.left = `${layout.left}px`
    stage.style.top = `${layout.top}px`
    gate.hidden = !(touch && layout.phonePortrait)
  }

  window.addEventListener('resize', fit, { passive: true })
  window.addEventListener('orientationchange', fit, { passive: true })
  window.visualViewport?.addEventListener('resize', fit, { passive: true })
  window.visualViewport?.addEventListener('scroll', fit, { passive: true })
  coarse.addEventListener('change', fit)
  fit()
}
