import { COMBAT_BALANCE_VERSION, DECK_LIMITS, reinforceWord, type RunState } from './run'
import { ALL_REWARD_WORDS, EARLY_WORDS } from '@data/earlyWords'
import type { Emotion, Word } from './types'

const SAVE_KEY = 'little-token.run.v1'
// v1은 오프닝이 실제로 뜨기 전에 완료로 기록되어, 로딩 중 이탈하거나 기존
// 세이브가 있으면 튜토리얼을 영구히 놓칠 수 있었다. 완료 시점에 기록하는 v2로
// 한 번 갱신해 해당 사용자도 복구된 오프닝을 볼 수 있게 한다.
const TUTORIAL_KEY = 'little-token.tutorial-seen.v2'

// v0.3.25 이전 런에는 이 주어들이 무감정으로 저장됐다. 현재 데이터의 감정 분포로
// 한 번만 올려, 이어하기 런도 새 공명 경로를 바로 사용할 수 있게 한다.
const LEGACY_SUBJECT_EMOTIONS: Record<string, Emotion> = {
  na: 'joy', eoje: 'sorrow', nado: 'pleasure', oneul: 'joy',
  gyeop: 'sorrow', naman: 'anger', dachin: 'anger', uri: 'pleasure',
}

// 리뉴얼에서 사라진 고밀도 공격 카드는 같은 감정의 현행 특수 보상으로 바꾼다.
// 저장된 강화 단계는 아래 동기화 과정에서 그대로 계승한다.
const CARD_REPLACEMENTS: Record<string, string> = {
  baksal: 'focusStrike',
  hwissda: 'scatterThree',
}

const CURRENT_CARD_BY_ID = new Map(
  [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS].map((word) => [word.id, word]),
)

function cloneCurrentCard(base: Word, level: number): Word {
  const card: Word = {
    ...base,
    tags: [...base.tags],
    effects: base.effects ? { ...base.effects } : undefined,
    variance: base.variance ? { ...base.variance } : undefined,
    level: 1,
  }
  for (let step = 1; step < Math.max(1, level); step++) reinforceWord(card)
  return card
}

/** 저장된 카드가 이전 CSV 정의를 품고 있어도 현행 카드와 감정으로 동기화한다. */
function migrateCardDefinitions(run: RunState): boolean {
  let migrated = false
  for (const [slot, savedCards] of Object.entries(run.player.deck)) {
    const merged = new Map<string, Word>()
    for (const saved of savedCards) {
      const id = CARD_REPLACEMENTS[saved.id] ?? saved.id
      const base = CURRENT_CARD_BY_ID.get(id)
      if (!base) {
        merged.set(saved.id, saved)
        continue
      }
      const existing = merged.get(id)
      const level = (existing?.level ?? 0) + (saved.level ?? 1)
      merged.set(id, cloneCurrentCard(base, level))
      if (id !== saved.id || saved.text !== base.text || saved.emotion !== base.emotion) migrated = true
    }
    run.player.deck[slot] = [...merged.values()]
    const limit = DECK_LIMITS[slot]
    if (limit != null && run.player.deck[slot].length > limit) {
      run.player.deck[slot] = run.player.deck[slot].slice(0, limit)
      migrated = true
    }
  }
  return migrated
}

/**
 * v0.4.34: 기존 런도 새 기본 체력 여유를 받고, 이전 기본 방어 5에서만 2를 뺀다.
 * 아이템·무럭무럭 성장분은 같은 차이만큼 보존하며, 버전으로 중복 보정을 막는다.
 */
export function migrateCombatBalance(run: RunState): boolean {
  if ((run.balanceVersion ?? 0) >= COMBAT_BALANCE_VERSION) return false
  run.player.stats.hp += 32
  run.player.stats.guard = Math.max(3, run.player.stats.guard - 2)
  run.balanceVersion = COMBAT_BALANCE_VERSION
  return true
}

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
    if (!isRunState(parsed)) return null

    // 감정 속성 도입 전 저장된 카드도 현재 데이터 형식으로 올린다.
    let migrated = false
    // 엔드리스 상태 도입 전 16일 이상 진행한 런은 이미 첫 이야기를 마친 것으로 본다.
    if (typeof parsed.endless !== 'boolean') {
      parsed.endless = parsed.day > 15
      migrated = true
    }
    if (typeof parsed.endingSeen !== 'boolean') {
      parsed.endingSeen = parsed.day > 15
      migrated = true
    }
    if (parsed.reward === undefined) {
      parsed.reward = null
      migrated = true
    }
    migrated = migrateCombatBalance(parsed) || migrated
    for (const words of Object.values(parsed.player.deck)) {
      for (const word of words) {
        const subjectEmotion = LEGACY_SUBJECT_EMOTIONS[word.id]
        if (!word.emotion || (subjectEmotion && word.emotion === 'neutral')) {
          word.emotion = subjectEmotion ?? 'neutral'
          migrated = true
        }
      }
    }
    migrated = migrateCardDefinitions(parsed) || migrated
    if (migrated) saveRun(parsed)
    return parsed
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

// 새로하기와 패배는 진행 중인 런만 지운다. 전체 기록 삭제는 설정에서 별도로 한다.
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

function clearTutorialHistory(): void {
  try {
    localStorage.removeItem(TUTORIAL_KEY)
  } catch {
    // 저장소를 못 쓰는 환경에서는 완료 기록도 남아 있지 않다.
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // 저장소를 못 쓰는 환경이면 애초에 남은 런도 없다.
  }
}

/** 환경 설정은 유지하고 런과 튜토리얼 완료 여부 등 플레이 기록을 모두 지운다. */
export function clearAllRecords(): void {
  clearRun()
  clearTutorialHistory()
}
