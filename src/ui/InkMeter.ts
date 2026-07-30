import { INK_UI } from '@/assets'
import { t } from '@/localization'
import {
  SENTENCE_BASE_INK,
  SENTENCE_CARRY_LIMIT,
  SENTENCE_MAX_INK,
  SENTENCE_OVERDRAW_LIMIT,
} from '@core/ink'

export interface InkMeterState {
  spent: number
  max: number
  overdraw: number
  previewSpent?: number | null
}

function inkText(key: string, korean: string, values: Record<string, number> = {}): string {
  let text = t(key, korean)
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

export function inkMeterHtml(): string {
  const bottles = Array.from({ length: SENTENCE_MAX_INK }, (_, index) =>
    `<span class="ink-meter-vial" data-ink-bottle="${index}"><img src="${INK_UI.bottle}" alt=""></span>`,
  ).join('')
  return `<div class="ink-meter" id="ink-meter" role="img" tabindex="0" aria-live="polite">
    <span class="ink-meter-vials" aria-hidden="true">
      ${bottles}
    </span>
    <span class="ink-meter-copy"><small>${t('hudInkLabel', '잉크')}</small><b><span data-ink-now>${SENTENCE_BASE_INK}</span><i>/</i><span data-ink-max>${SENTENCE_BASE_INK}</span></b></span>
    <span class="ink-meter-extra" data-ink-extra hidden></span>
    <em class="ink-meter-overdraw" data-ink-overdraw hidden></em>
  </div>`
}

export function updateInkMeter(meter: HTMLElement, state: InkMeterState): void {
  const max = Math.max(1, Math.floor(state.max))
  const spent = Math.max(0, Math.floor(state.spent))
  const remaining = Math.max(0, max - spent)
  const overdraw = Math.max(0, Math.floor(state.overdraw))
  const previewSpent = state.previewSpent == null ? spent : Math.max(spent, Math.floor(state.previewSpent))
  const previewRemaining = Math.max(0, max - previewSpent)
  const previewOverdraw = Math.min(
    SENTENCE_OVERDRAW_LIMIT,
    Math.max(overdraw, previewSpent - max),
  )
  // 프레임은 언제나 10칸이다. 턴마다 가용량이 6↔8로 바뀌어도 잉크 한 칸의 폭은 같다.
  const fill = Math.max(0, Math.min(1, remaining / SENTENCE_MAX_INK))
  const overdrawFill = Math.max(0, Math.min(1, overdraw / SENTENCE_MAX_INK))

  meter.style.setProperty('--ink-fill', `${fill * 100}%`)
  meter.style.setProperty('--ink-overdraw-fill', `${overdrawFill * 100}%`)
  meter.classList.toggle('is-full', remaining >= max)
  meter.classList.toggle('is-empty', remaining <= 0)
  meter.classList.toggle('is-overdrawn', overdraw > 0)
  meter.classList.toggle('is-low', remaining > 0 && remaining <= Math.ceil(max * 0.3))
  meter.querySelector<HTMLElement>('[data-ink-now]')!.textContent = String(remaining)
  meter.querySelector<HTMLElement>('[data-ink-max]')!.textContent = String(SENTENCE_MAX_INK)
  const extra = meter.querySelector<HTMLElement>('[data-ink-extra]')!
  extra.hidden = overdraw <= 0
  extra.textContent = overdraw > 0 ? `+${overdraw}` : ''
  meter.querySelectorAll<HTMLElement>('[data-ink-bottle]').forEach((bottle) => {
    const index = Number(bottle.dataset.inkBottle)
    const freeFilled = index < remaining
    const freeSpent = index >= remaining && index < max
    const overdrawFilled = index >= max && index < max + overdraw
    const previewFreeSpent = index >= previewRemaining && index < remaining
    const previewOverdrawFilled = index >= max + overdraw && index < max + previewOverdraw
    bottle.className = [
      'ink-meter-vial',
      freeFilled ? 'is-free-filled' : '',
      freeSpent ? 'is-free-spent' : '',
      overdrawFilled ? 'is-overdraw-filled' : '',
      previewFreeSpent ? 'is-preview-spend' : '',
      previewOverdrawFilled ? 'is-overdraw-preview' : '',
      !freeFilled && !freeSpent && !overdrawFilled && !previewOverdrawFilled ? 'is-hidden' : '',
    ].filter(Boolean).join(' ')
  })

  const warning = meter.querySelector<HTMLElement>('[data-ink-overdraw]')!
  warning.hidden = overdraw <= 0
  warning.textContent = overdraw > 0
    ? inkText('hudInkOverdrawLabel', `초과 집필 · 체력 -${overdraw}`, { overdraw })
    : ''
  const accessibilityText = overdraw > 0
    ? inkText('hudInkOverdrawAria', `잉크 ${spent}/${max}, 초과 체력 피해 ${overdraw}`, { spent, max, overdraw })
    : inkText('hudInkAria', `남은 잉크 ${remaining}/${max}`, { remaining, max })
  const tooltip = (overdraw > 0
    ? t('hudInkOverdrawTip', `잉크 ${spent}/${max}\n기본 ${SENTENCE_BASE_INK} + 이월 ${SENTENCE_CARRY_LIMIT} + 체력 ${SENTENCE_OVERDRAW_LIMIT}까지 최대 ${SENTENCE_MAX_INK}. 초과분 체력 ${overdraw}을 직접 지불한다.`)
    : t('hudInkTip', `잉크 ${remaining}/${max}\n기본 ${SENTENCE_BASE_INK} + 이월 ${SENTENCE_CARRY_LIMIT} + 체력 ${SENTENCE_OVERDRAW_LIMIT}까지 최대 ${SENTENCE_MAX_INK}. 남은 잉크는 최대 ${SENTENCE_CARRY_LIMIT} 이월된다.`))
    .split('{spent}').join(String(spent))
    .split('{remaining}').join(String(remaining))
    .split('{max}').join(String(max))
    .split('{overdraw}').join(String(overdraw))
  meter.setAttribute('aria-label', accessibilityText)
  meter.dataset.tooltip = tooltip
  meter.dataset.tipPlace = 'above'
}
