import { INK_UI } from '@/assets'
import { t } from '@/localization'
import {
  SENTENCE_BASE_INK,
  SENTENCE_OVERDRAW_LIMIT,
} from '@core/ink'

export interface InkMeterState {
  spent: number
  max: number
  overdraw: number
  previewSpent?: number | null
  /** 이번 문장에 고른 리필 카드가 채워 주는 잉크 합. 지출(spent)에는 이미 반영돼 있다. */
  refill?: number
  /** 리필 전 카드 비용 합 — 리필로 다시 채워진 병을 표시하는 데 쓴다. */
  listed?: number
}

function inkText(key: string, korean: string, values: Record<string, number> = {}): string {
  let text = t(key, korean)
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

export function inkMeterHtml(max = SENTENCE_BASE_INK): string {
  const bottles = Array.from({ length: max }, (_, index) =>
    `<span class="ink-meter-vial" data-ink-bottle="${index}"><img src="${INK_UI.bottle}" alt=""></span>`,
  ).join('')
  return `<div class="ink-meter" id="ink-meter" role="img" tabindex="0" aria-live="polite">
    <span class="ink-meter-vials" aria-hidden="true">
      ${bottles}
    </span>
    <span class="ink-meter-copy"><small>${t('hudInkLabel', '잉크')}</small><b><span data-ink-now>${max}</span><i>/</i><span data-ink-max>${max}</span></b></span>
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
  // 잉크 칸은 문장의 최대 비용을 나타낸다.
  const fill = Math.max(0, Math.min(1, remaining / max))
  const overdrawFill = Math.max(0, Math.min(1, overdraw / max))

  meter.style.setProperty('--ink-fill', `${fill * 100}%`)
  meter.style.setProperty('--ink-overdraw-fill', `${overdrawFill * 100}%`)
  meter.classList.toggle('is-full', remaining >= max)
  meter.classList.toggle('is-empty', remaining <= 0)
  meter.classList.toggle('is-overdrawn', overdraw > 0)
  meter.classList.toggle('is-low', remaining > 0 && remaining <= Math.ceil(max * 0.3))
  meter.querySelector<HTMLElement>('[data-ink-now]')!.textContent = String(remaining)
  meter.querySelector<HTMLElement>('[data-ink-max]')!.textContent = String(max)
  const refill = Math.max(0, Math.floor(state.refill ?? 0))
  const extra = meter.querySelector<HTMLElement>('[data-ink-extra]')!
  // 아직 쓴 잉크가 없으면 채울 병이 없어 리필이 안 먹은 것처럼 보이므로, 이번 문장에 걸린 리필 양을 따로 띄워 둔다.
  extra.hidden = overdraw <= 0 && refill <= 0
  extra.classList.toggle('is-refill', overdraw <= 0 && refill > 0)
  extra.textContent = overdraw > 0 ? `+${overdraw}` : refill > 0 ? `${t('inkRefillShort', '리필')} +${refill}` : ''
  // 리필은 쓴 잉크를 다시 채운다 — 채워진 병은 따로 빛나게 해 잉크가 차오른 것이 보이게 한다.
  const listed = Math.max(spent, Math.floor(state.listed ?? spent))
  const refilled = Math.max(0, Math.min(refill, listed - spent, remaining))
  meter.querySelectorAll<HTMLElement>('[data-ink-bottle]').forEach((bottle) => {
    const index = Number(bottle.dataset.inkBottle)
    const freeFilled = index < remaining
    const refilledBottle = index >= remaining - refilled && index < remaining
    const freeSpent = index >= remaining && index < max
    const overdrawFilled = index >= max && index < max + overdraw
    const previewFreeSpent = index >= previewRemaining && index < remaining
    const previewOverdrawFilled = index >= max + overdraw && index < max + previewOverdraw
    bottle.className = [
      'ink-meter-vial',
      freeFilled ? 'is-free-filled' : '',
      refilledBottle ? 'is-refilled' : '',
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
  const baseTooltip = inkText('hudInkTip', '잉크 {remaining}/{max}\n문장을 쓸 때마다 잉크는 가득 찬 채로 시작한다.\n단어를 고르면, 적힌 만큼 잉크가 줄어든다.\n모자라면 그 단어는 쓸 수 없다.', { remaining, max })
  const tooltip = refill > 0
    ? `${baseTooltip}\n${inkText('hudInkRefillTip', '리필 +{refill}: 쓴 잉크가 그만큼 다시 차오른다.', { refill })}`
    : baseTooltip
  meter.setAttribute('aria-label', accessibilityText)
  meter.dataset.tooltip = tooltip
  meter.dataset.tipPlace = 'above'
}
