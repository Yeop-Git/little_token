import type { RunState } from './run'

const SAVE_KEY = 'little-token.run.v1'
const TUTORIAL_KEY = 'little-token.tutorial-seen.v1'

function isRunState(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<RunState>
  const player = run.player
  return (
    typeof run.day === 'number' &&
    run.day >= 1 &&
    !!player &&
    typeof player === 'object' &&
    !!player.stats &&
    typeof player.stats.hp === 'number' &&
    Array.isArray(player.items) &&
    !!player.deck &&
    typeof player.deck === 'object'
  )
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isRunState(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(run))
  } catch {
    // 저장 공간을 사용할 수 없는 브라우저에서도 게임 진행은 유지한다.
  }
}

// 새로하기와 패배는 진행 중인 런만 지운다. 튜토리얼 완료 기록은 유지한다.
export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1')
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // 저장소를 못 쓰는 환경이면 애초에 남은 런도 없다.
  }
}
