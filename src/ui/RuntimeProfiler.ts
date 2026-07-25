interface MemoryPerformance extends Performance {
  memory?: {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
  }
}

interface TimedEntry {
  at: number
  duration: number
}

interface LayoutShiftEntry extends PerformanceEntry {
  value: number
  hadRecentInput: boolean
}

const OUTPUT_ID = 'runtime-profile-data'
const MAX_FRAME_SAMPLES = 3_600
const MAX_TIMED_ENTRIES = 240

/**
 * 로컬 개발 서버에서 `?profile=1`로 진입했을 때만 실행하는 무부하 지향 계측기다.
 * 브라우저 자동 검수가 읽을 수 있도록 결과를 숨은 output의 JSON으로 발행한다.
 */
export function startRuntimeProfiler() {
  if (document.getElementById(OUTPUT_ID)) return

  const output = document.createElement('output')
  output.id = OUTPUT_ID
  output.hidden = true
  output.setAttribute('aria-hidden', 'true')
  document.documentElement.append(output)

  const startedAt = performance.now()
  const frameTimes: TimedEntry[] = []
  const longTasks: TimedEntry[] = []
  const events: TimedEntry[] = []
  const layoutShifts: Array<{ at: number; value: number }> = []
  let previousFrame = startedAt
  let animationFrame = 0

  const appendTimed = (target: TimedEntry[], entry: TimedEntry) => {
    target.push(entry)
    if (target.length > MAX_TIMED_ENTRIES) target.splice(0, target.length - MAX_TIMED_ENTRIES)
  }

  const observers: PerformanceObserver[] = []
  const supported = PerformanceObserver.supportedEntryTypes
  if (supported.includes('longtask')) {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => appendTimed(longTasks, {
        at: entry.startTime,
        duration: entry.duration,
      }))
    })
    observer.observe({ type: 'longtask', buffered: true })
    observers.push(observer)
  }
  if (supported.includes('event')) {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => appendTimed(events, {
        at: entry.startTime,
        duration: entry.duration,
      }))
    })
    observer.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit & { durationThreshold: number })
    observers.push(observer)
  }
  if (supported.includes('layout-shift')) {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        const shift = entry as LayoutShiftEntry
        if (shift.hadRecentInput) return
        layoutShifts.push({ at: shift.startTime, value: shift.value })
        if (layoutShifts.length > MAX_TIMED_ENTRIES) {
          layoutShifts.splice(0, layoutShifts.length - MAX_TIMED_ENTRIES)
        }
      })
    })
    observer.observe({ type: 'layout-shift', buffered: true })
    observers.push(observer)
  }

  const tick = (now: number) => {
    frameTimes.push({ at: now, duration: now - previousFrame })
    if (frameTimes.length > MAX_FRAME_SAMPLES) {
      frameTimes.splice(0, frameTimes.length - MAX_FRAME_SAMPLES)
    }
    previousFrame = now
    animationFrame = requestAnimationFrame(tick)
  }
  animationFrame = requestAnimationFrame(tick)

  const percentile = (values: number[], ratio: number) => {
    if (!values.length) return 0
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0
  }

  const publish = () => {
    const now = performance.now()
    const windowStart = now - 10_000
    const recentFrames = frameTimes.filter((entry) => entry.at >= windowStart).map((entry) => entry.duration)
    const recentLongTasks = longTasks.filter((entry) => entry.at >= windowStart)
    const recentEvents = events.filter((entry) => entry.at >= windowStart)
    const memory = (performance as MemoryPerformance).memory
    const scene = document.querySelector<HTMLElement>('.scene')
    const modelShells = [...document.querySelectorAll<HTMLElement>('.model-shell')]
    const duration = recentFrames.reduce((sum, value) => sum + value, 0)

    output.textContent = JSON.stringify({
      now,
      elapsed: now - startedAt,
      scene: scene?.className ?? null,
      visibility: document.visibilityState,
      frames: {
        samples: recentFrames.length,
        fps: duration > 0 ? recentFrames.length * 1_000 / duration : 0,
        p50: percentile(recentFrames, 0.5),
        p95: percentile(recentFrames, 0.95),
        p99: percentile(recentFrames, 0.99),
        max: recentFrames.length ? Math.max(...recentFrames) : 0,
        over25: recentFrames.filter((value) => value > 25).length,
        over50: recentFrames.filter((value) => value > 50).length,
      },
      longTasks: {
        count: recentLongTasks.length,
        total: recentLongTasks.reduce((sum, entry) => sum + entry.duration, 0),
        max: recentLongTasks.length ? Math.max(...recentLongTasks.map((entry) => entry.duration)) : 0,
        entries: recentLongTasks,
      },
      events: {
        count: recentEvents.length,
        max: recentEvents.length ? Math.max(...recentEvents.map((entry) => entry.duration)) : 0,
        entries: recentEvents,
      },
      layoutShift: layoutShifts
        .filter((entry) => entry.at >= windowStart)
        .reduce((sum, entry) => sum + entry.value, 0),
      memory: memory ? {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      } : null,
      dom: {
        nodes: document.getElementsByTagName('*').length,
        canvases: document.querySelectorAll('canvas').length,
        videos: document.querySelectorAll('video').length,
      },
      models: {
        total: modelShells.length,
        ready: modelShells.filter((shell) => shell.dataset.modelStatus === 'ready-3d').length,
        preparing: modelShells.filter((shell) => shell.dataset.modelStatus === 'preparing-3d').length,
        fallback: modelShells.filter((shell) => shell.dataset.modelStatus === 'fallback-2d').length,
        performanceMode: document.documentElement.dataset.modelPerformance ?? 'standard',
        reduced: document.documentElement.dataset.modelPerformance === 'reduced',
      },
    })
  }

  const publishTimer = window.setInterval(publish, 250)
  publish()

  window.addEventListener('pagehide', () => {
    window.clearInterval(publishTimer)
    cancelAnimationFrame(animationFrame)
    observers.forEach((observer) => observer.disconnect())
  }, { once: true })
}
