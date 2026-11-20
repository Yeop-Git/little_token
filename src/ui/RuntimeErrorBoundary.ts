import type { LocaleCode } from '@/localization'
import { runtimeErrorText } from '@/localization/runtimeError'

let installed = false

/**
 * 이미 내려간 화면의 비동기 연출이 뒤늦게 깨어났을 때 던지는 표식. 진짜 고장이
 * 아니라 "주인이 떠난 체인"이 멈춘 것이라 오류창 없이 버린다.
 */
export class DisposedViewError extends Error {
  constructor() {
    super('view already disposed')
    this.name = 'DisposedViewError'
  }
}
let displayed = false

/**
 * 뷰 생성자가 reset() 뒤 던져도 검은 무대가 남지 않게 하는 마지막 복구선이다.
 * 예외를 삼키지 않고 콘솔에 원인을 남긴 뒤 안전한 재시작만 제공한다.
 */
export function installRuntimeErrorBoundary(stage: HTMLElement, locale: LocaleCode): void {
  if (installed) return
  installed = true

  const reveal = (kind: 'error' | 'unhandledrejection', reason: unknown) => {
    console.error(`[Little Token] ${kind}`, reason)
    if (displayed) return
    displayed = true

    const copy = runtimeErrorText(locale)
    const overlay = document.createElement('section')
    overlay.className = 'runtime-error-overlay'
    overlay.setAttribute('role', 'alertdialog')
    overlay.setAttribute('aria-modal', 'true')

    const paper = document.createElement('div')
    paper.className = 'runtime-error-paper'
    const eyebrow = document.createElement('p')
    eyebrow.className = 'runtime-error-eyebrow'
    eyebrow.textContent = copy.eyebrow
    const title = document.createElement('h1')
    title.textContent = copy.title
    const body = document.createElement('p')
    body.textContent = copy.body
    const reload = document.createElement('button')
    reload.type = 'button'
    reload.className = 'runtime-error-reload'
    reload.textContent = copy.reload
    reload.addEventListener('click', () => window.location.reload())
    paper.append(eyebrow, title, body, reload)
    overlay.appendChild(paper)
    stage.appendChild(overlay)
    reload.focus()
  }

  window.addEventListener('error', (event) => {
    if (event.error instanceof DisposedViewError) {
      event.preventDefault()
      return
    }
    reveal('error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason instanceof DisposedViewError) {
      event.preventDefault()
      return
    }
    reveal('unhandledrejection', event.reason)
  })
}
