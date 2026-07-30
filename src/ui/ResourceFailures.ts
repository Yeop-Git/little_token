import { STRICT_RESOURCE_LOADING, strictResourceError } from '@/config/edition'

export interface ResourceFailure {
  kind: string
  src: string
  message: string
}

const failures: ResourceFailure[] = []
let monitorInstalled = false
let statusMeta: HTMLMetaElement | null = null

export function reportResourceFailure(kind: string, src: string, cause?: unknown): Error {
  const error = strictResourceError(kind, src)
  if (!STRICT_RESOURCE_LOADING) return error
  const causeMessage = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''
  const entry = {
    kind,
    src,
    message: causeMessage ? `${error.message} (${causeMessage})` : error.message,
  }
  if (!failures.some((failure) => failure.kind === entry.kind && failure.src === entry.src)) {
    failures.push(entry)
    if (statusMeta) statusMeta.content = String(failures.length)
    console.error(entry.message)
    window.dispatchEvent(new CustomEvent('little-token:resource-error', { detail: entry }))
  }
  return error
}

export function installResourceFailureMonitor(): void {
  if (!STRICT_RESOURCE_LOADING || monitorInstalled) return
  monitorInstalled = true
  Object.defineProperty(window, '__LITTLE_TOKEN_RESOURCE_FAILURES__', {
    configurable: true,
    value: failures,
  })
  statusMeta = document.createElement('meta')
  statusMeta.name = 'little-token-resource-failures'
  statusMeta.content = String(failures.length)
  document.head.append(statusMeta)
  window.addEventListener('error', (event) => {
    const target = event.target
    if (target instanceof HTMLImageElement) reportResourceFailure('image element', target.currentSrc || target.src)
    else if (target instanceof HTMLVideoElement) reportResourceFailure('video element', target.currentSrc || target.src)
  }, true)
}
