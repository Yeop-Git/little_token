import { INK_UI } from '@/assets'

export interface InkMeterState {
  spent: number
  max: number
  overdraw: number
}

/**
 * 잉크 HUD의 구조와 생성 에셋 참조를 한곳에 둔다.
 * 위치·크기는 style.css의 --ink-meter-* 변수만 바꾸면 되고, 이미지는 INK_UI만 교체한다.
 */
export function inkMeterHtml(): string {
  return `<div class="ink-meter" id="ink-meter" aria-live="polite">
    <img class="ink-meter-bottle" src="${INK_UI.bottle}" alt="" aria-hidden="true">
    <span class="ink-meter-bar" aria-hidden="true">
      <span class="ink-meter-track"><i class="ink-meter-fill"></i></span>
      <img class="ink-meter-frame" src="${INK_UI.barFrame}" alt="">
    </span>
    <span class="ink-meter-copy"><small>잉크</small><b><span data-ink-now>10</span><i>/</i><span data-ink-max>10</span></b></span>
    <em class="ink-meter-overdraw" data-ink-overdraw hidden></em>
  </div>`
}

export function updateInkMeter(meter: HTMLElement, state: InkMeterState): void {
  const max = Math.max(1, Math.floor(state.max))
  const spent = Math.max(0, Math.floor(state.spent))
  const remaining = Math.max(0, max - spent)
  const overdraw = Math.max(0, Math.floor(state.overdraw))
  const fill = Math.max(0, Math.min(1, remaining / max))

  meter.style.setProperty('--ink-fill', `${fill * 100}%`)
  meter.classList.toggle('is-overdrawn', overdraw > 0)
  meter.classList.toggle('is-low', remaining > 0 && remaining <= Math.ceil(max * 0.3))
  meter.querySelector<HTMLElement>('[data-ink-now]')!.textContent = String(remaining)
  meter.querySelector<HTMLElement>('[data-ink-max]')!.textContent = String(max)

  const warning = meter.querySelector<HTMLElement>('[data-ink-overdraw]')!
  warning.hidden = overdraw <= 0
  warning.textContent = overdraw > 0 ? `초과 집필 · 체력 -${overdraw}` : ''
  meter.setAttribute('aria-label', overdraw > 0
    ? `잉크 ${spent}/${max}, 초과 체력 피해 ${overdraw}`
    : `남은 잉크 ${remaining}/${max}`)
}
