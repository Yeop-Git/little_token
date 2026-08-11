import type { LocaleCode } from '@/localization'
import { runtimeErrorText } from '@/localization/runtimeError'

let installed = false
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

  window.addEventListener('error', (event) => reveal('error', event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reveal('unhandledrejection', event.reason))
}
