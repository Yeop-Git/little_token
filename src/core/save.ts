import type { RunState } from './run'

const SAVE_KEY = 'little-token.run.v1'

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
