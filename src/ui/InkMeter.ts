import { INK_UI } from '@/assets'
import { t } from '@/localization'

export interface InkMeterState {
  spent: number
  max: number
  overdraw: number
}

function inkText(key: string, korean: string, values: Record<string, number> = {}): string {
  let text = t(key, korean)
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

/**
 * 잉크 HUD의 구조와 생성 에셋 참조를 한곳에 둔다.
 * 위치·크기는 style.css의 --ink-meter-* 변수만 바꾸면 되고, 이미지는 INK_UI만 교체한다.
 */
export function inkMeterHtml(): string {
  return `<div class="ink-meter" id="ink-meter" role="img" tabindex="0" aria-live="polite">
    <img class="ink-meter-bottle" src="${INK_UI.bottle}" alt="" aria-hidden="true">
    <span class="ink-meter-bar" aria-hidden="true">
      <span class="ink-meter-track"><i class="ink-meter-fill"></i></span>
      <img class="ink-meter-frame" src="${INK_UI.barFrame}" alt="">
    </span>
    <span class="ink-meter-copy"><small>${t('hudInkLabel', '잉크')}</small><b><span data-ink-now>10</span><i>/</i><span data-ink-max>10</span></b></span>
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
  meter.classList.toggle('is-full', remaining >= max)
  meter.classList.toggle('is-empty', remaining <= 0)
  meter.classList.toggle('is-overdrawn', overdraw > 0)
  meter.classList.toggle('is-low', remaining > 0 && remaining <= Math.ceil(max * 0.3))
  meter.querySelector<HTMLElement>('[data-ink-now]')!.textContent = String(remaining)
  meter.querySelector<HTMLElement>('[data-ink-max]')!.textContent = String(max)

  const warning = meter.querySelector<HTMLElement>('[data-ink-overdraw]')!
  warning.hidden = overdraw <= 0
  warning.textContent = overdraw > 0
    ? inkText('hudInkOverdrawLabel', `초과 집필 · 체력 -${overdraw}`, { overdraw })
    : ''
  const accessibilityText = overdraw > 0
    ? inkText('hudInkOverdrawAria', `잉크 ${spent}/${max}, 초과 체력 피해 ${overdraw}`, { spent, max, overdraw })
    : inkText('hudInkAria', `남은 잉크 ${remaining}/${max}`, { remaining, max })
  const tooltip = (overdraw > 0
    ? t('hudInkOverdrawTip', `잉크 ${spent}/${max}\n문장은 완성할 수 있지만 확정할 때 방어를 무시하고 초과분 체력 ${overdraw}을 직접 지불한다.`)
    : t('hudInkTip', `잉크 ${remaining}/${max}\n각 문장은 잉크 ${max}으로 시작하며 선택한 단어가 잉크를 소비한다.`))
    .split('{spent}').join(String(spent))
    .split('{remaining}').join(String(remaining))
    .split('{max}').join(String(max))
    .split('{overdraw}').join(String(overdraw))
  meter.setAttribute('aria-label', accessibilityText)
  meter.dataset.tooltip = tooltip
  meter.dataset.tipPlace = 'above'
}
