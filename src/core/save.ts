import {
  COMBAT_BALANCE_VERSION,
  DECK_LIMITS,
  RUN_SAVE_SCHEMA_VERSION,
  emptyRunRecord,
  reinforceWord,
  type PendingReward,
  type RewardPhase,
  type RewardPickRef,
  type RunRecord,
  type RunState,
} from './run'
import { ALL_REWARD_WORDS, EARLY_WORDS } from '@data/earlyWords'
import { ALL_ITEMS } from '@data/items'
import type { Word } from './types'
import { STARTING_COMBAT_STATS, type OwnedItem, type PlayerStats } from './player'
import { IS_DEMO } from '@/config/edition'
/**
 * 이 게임이 브라우저에 남기는 모든 진행도의 접두사. 기록 초기화는 키를 하나씩
 * 지우는 게 아니라 이 접두사를 통째로 쓸어 낸다 — 하나씩 지우면 새로 늘어난 키가
 * 조용히 살아남는다(실제로 토큰의 기억과 학습된 정책이 그렇게 빠질 뻔했다).
 * **새 진행도 키는 반드시 이 접두사를 쓴다.**
 */
export const STORAGE_PREFIX = 'little-token.'

const SAVE_KEY = IS_DEMO ? 'little-token.demo-run.v1' : 'little-token.run.v1'
const CORRUPT_SAVE_KEY = IS_DEMO ? 'little-token.demo-run.corrupt.v1' : 'little-token.run.corrupt.v1'
// v1은 오프닝이 실제로 뜨기 전에 완료로 기록되어, 로딩 중 이탈하거나 기존
// 세이브가 있으면 튜토리얼을 영구히 놓칠 수 있었다. 완료 시점에 기록하는 v2로
// 한 번 갱신해 해당 사용자도 복구된 오프닝을 볼 수 있게 한다.
const TUTORIAL_KEY = 'little-token.tutorial-seen.v2'
const COMBAT_COACH_KEY = 'little-token.combat-coach-seen.v1'

export type CombatCoachHint =
  | 'subject'
  | 'modifier'
  | 'verb'
  | 'resonance'
  | 'context'
  | 'ink-low'
  | 'ink-overdraw'
  | 'enemy-first'
  | 'overflow'

// 리뉴얼에서 사라진 고밀도 공격 카드는 같은 감정의 현행 특수 보상으로 바꾼다.
// 저장된 강화 단계는 아래 동기화 과정에서 그대로 계승한다.
const CARD_REPLACEMENTS: Record<string, string> = {
  baksal: 'focusStrike',
  hwissda: 'scatterThree',
}

const REMOVED_ITEM_IDS = new Set(['inkBottle', 'softEraser'])

const CURRENT_CARD_BY_ID = new Map(
  [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS].map((word) => [word.id, word]),
)
const STAT_KEYS = Object.keys(STARTING_COMBAT_STATS) as (keyof PlayerStats)[]
const MAX_SAVED_CARD_LEVEL = 1000

function safeCardLevel(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, Math.min(MAX_SAVED_CARD_LEVEL, Math.floor(value)))
    : 1
}

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
  const before = JSON.stringify(run.player.deck)
  const levelsBySlot = new Map<string, Map<string, number>>()
  for (const savedCards of Object.values(run.player.deck)) {
    if (!Array.isArray(savedCards)) continue
    for (const saved of savedCards) {
      if (!saved || typeof saved !== 'object' || typeof saved.id !== 'string') continue
      const id = CARD_REPLACEMENTS[saved.id] ?? saved.id
      const base = CURRENT_CARD_BY_ID.get(id)
      if (!base) continue
      const slotLevels = levelsBySlot.get(base.slot) ?? new Map<string, number>()
      slotLevels.set(id, Math.min(MAX_SAVED_CARD_LEVEL, (slotLevels.get(id) ?? 0) + safeCardLevel(saved.level)))
      levelsBySlot.set(base.slot, slotLevels)
    }
  }

  // 필수 슬롯이 전부 손상됐거나 삭제된 카드만 남았어도 완성 가능한 시작 덱을 복구한다.
  for (const [slot, starters] of Object.entries(EARLY_WORDS)) {
    const slotLevels = levelsBySlot.get(slot) ?? new Map<string, number>()
    if (slotLevels.size === 0) for (const starter of starters) slotLevels.set(starter.id, 1)
    levelsBySlot.set(slot, slotLevels)
  }

  const normalized: Record<string, Word[]> = {}
  for (const [slot, levels] of levelsBySlot) {
    normalized[slot] = [...levels].map(([id, level]) => cloneCurrentCard(CURRENT_CARD_BY_ID.get(id)!, level))
    const limit = DECK_LIMITS[slot]
    if (limit != null) normalized[slot] = normalized[slot].slice(0, limit)
  }
  run.player.deck = normalized
  return JSON.stringify(normalized) !== before
}

function normalizedItemStats(value: unknown): Partial<PlayerStats> {
  if (!value || typeof value !== 'object') return {}
  const source = value as Partial<Record<keyof PlayerStats, unknown>>
  const stats: Partial<PlayerStats> = {}
  for (const key of STAT_KEYS) {
    const amount = source[key]
    if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0) stats[key] = amount
  }
  return stats
}

function subtractItemStats(run: RunState, value: unknown): void {
  const stats = normalizedItemStats(value)
  for (const key of STAT_KEYS) {
    run.player.stats[key] = Math.max(0, run.player.stats[key] - (stats[key] ?? 0))
  }
}

/** 삭제 ID는 제거하고, 살아 있는 아이템의 표시 정보와 패시브는 현행 정의를 사용한다. */
function migrateItems(run: RunState): boolean {
  const before = JSON.stringify(run.player.items)
  const normalized: OwnedItem[] = []
  const seen = new Set<string>()
  for (const saved of run.player.items) {
    if (!saved || typeof saved !== 'object' || typeof saved.id !== 'string') continue
    const def = ALL_ITEMS[saved.id]
    if (REMOVED_ITEM_IDS.has(saved.id) || !def || seen.has(saved.id)) {
      subtractItemStats(run, saved.stats)
      continue
    }
    seen.add(saved.id)
    normalized.push({
      id: def.id,
      name: def.name,
      rarity: def.rarity,
      art: def.art,
      line: typeof saved.line === 'string' ? saved.line : def.flavor,
      stats: normalizedItemStats(saved.stats),
      ...(def.passive ? { passive: def.passive } : {}),
    })
  }
  run.player.items = normalized
  return JSON.stringify(normalized) !== before
}

function normalizePlayerStats(run: RunState): boolean {
  let changed = false
  for (const key of STAT_KEYS) {
    const current = run.player.stats[key]
    const floor = key === 'hp' ? 1 : 0
    const fallback = STARTING_COMBAT_STATS[key]
    const normalized = typeof current === 'number' && Number.isFinite(current)
      ? Math.max(floor, current)
      : fallback
    if (normalized !== current) {
      run.player.stats[key] = normalized
      changed = true
    }
  }
  return changed
}

const REWARD_PHASES = new Set<PendingReward['phase']>(['subject', 'item', 'verb', 'complete'])
const REWARD_PICK_KINDS = new Set<RewardPickRef['kind']>(['word', 'item'])

function normalizePendingReward(run: RunState): boolean {
  const before = JSON.stringify(run.reward)
  const value = run.reward as unknown
  if (value == null) {
    run.reward = null
    return before !== 'null'
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    run.reward = null
    return true
  }

  const source = value as Record<string, unknown>
  const phase = REWARD_PHASES.has(source.phase as PendingReward['phase'])
    ? source.phase as PendingReward['phase']
    : 'subject'
  const picks: RewardPickRef[] = []
  if (Array.isArray(source.picks)) {
    for (const value of source.picks) {
      if (!value || typeof value !== 'object') continue
      const pick = value as Record<string, unknown>
      if (!REWARD_PICK_KINDS.has(pick.kind as RewardPickRef['kind']) || typeof pick.id !== 'string') continue
      const kind = pick.kind as RewardPickRef['kind']
      const id = kind === 'word' ? CARD_REPLACEMENTS[pick.id] ?? pick.id : pick.id
      if (kind === 'word' ? !CURRENT_CARD_BY_ID.has(id) : !ALL_ITEMS[id]) continue
      picks.push({ kind, id, ...(pick.reinforce === true ? { reinforce: true } : {}) })
    }
  }
  const refreshSource = source.refreshes && typeof source.refreshes === 'object'
    ? source.refreshes as Partial<Record<RewardPhase, unknown>>
    : {}
  const refreshes = Object.fromEntries((['subject', 'item', 'verb'] as RewardPhase[]).map((key) => {
    const amount = refreshSource[key]
    return [key, typeof amount === 'number' && Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0]
  })) as Record<RewardPhase, number>
  run.reward = {
    day: typeof source.day === 'number' && Number.isFinite(source.day) ? Math.max(1, Math.floor(source.day)) : run.day,
    grade: typeof source.grade === 'number' && Number.isFinite(source.grade) ? Math.max(0, source.grade) : 0,
    earned: typeof source.earned === 'number' && Number.isFinite(source.earned)
      ? Math.max(0, Math.round(source.earned))
      : typeof source.grade === 'number' && Number.isFinite(source.grade) ? Math.max(0, Math.round(source.grade)) : 0,
    phase,
    picks,
    seed: typeof source.seed === 'number' && Number.isFinite(source.seed) ? Math.floor(source.seed) : 0,
    refreshes,
  }
  return JSON.stringify(run.reward) !== before
}

function normalizeRunRecord(run: RunState): boolean {
  const before = JSON.stringify(run.record)
  const source = run.record && typeof run.record === 'object'
    ? run.record as Partial<RunRecord>
    : {}
  const base = emptyRunRecord()
  const kills: Record<string, number> = {}
  if (source.kills && typeof source.kills === 'object') {
    for (const [id, count] of Object.entries(source.kills)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) kills[id] = Math.floor(count)
    }
  }
  const bestHit = source.bestHit && typeof source.bestHit === 'object'
    && typeof source.bestHit.dmg === 'number' && Number.isFinite(source.bestHit.dmg)
    && typeof source.bestHit.sentence === 'string'
    ? { dmg: Math.max(0, source.bestHit.dmg), sentence: source.bestHit.sentence }
    : null
  const count = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : fallback
  run.record = {
    ...base,
    kills,
    bestHit,
    bestMult: typeof source.bestMult === 'number' && Number.isFinite(source.bestMult) ? Math.max(0, source.bestMult) : 0,
    bestCombo: count(source.bestCombo),
    sentences: count(source.sentences),
    daysCleared: count(source.daysCleared),
  }
  return JSON.stringify(run.record) !== before
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
    Number.isFinite(run.day) &&
    !!player &&
    typeof player === 'object' &&
    !!player.stats &&
    typeof player.stats === 'object' &&
    Array.isArray(player.items) &&
    !!player.deck &&
    typeof player.deck === 'object'
  )
}

/** 저장소 없이도 회귀 테스트할 수 있는 순수 역직렬화 경계. */
export function deserializeRun(raw: string): RunState | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRunState(parsed)) return null
    if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > RUN_SAVE_SCHEMA_VERSION) return null

    // 감정 속성 도입 전 저장된 카드도 현재 데이터 형식으로 올린다.
    let migrated = false
    const day = Math.max(1, Math.floor(parsed.day))
    if (day !== parsed.day) {
      parsed.day = day
      migrated = true
    }
    migrated = normalizePlayerStats(parsed) || migrated
    // 엔드리스 상태 도입 전 16일 이상 진행한 런은 이미 첫 이야기를 마친 것으로 본다.
    if (typeof parsed.endless !== 'boolean') {
      parsed.endless = parsed.day > 15
      migrated = true
    }
    if (typeof parsed.endingSeen !== 'boolean') {
      parsed.endingSeen = parsed.day > 15
      migrated = true
    }
    if (typeof parsed.pendingEndingGrade !== 'number' || !Number.isFinite(parsed.pendingEndingGrade)) {
      if (parsed.pendingEndingGrade !== null) migrated = true
      parsed.pendingEndingGrade = null
    } else if (parsed.pendingEndingGrade < 0) {
      parsed.pendingEndingGrade = 0
      migrated = true
    }
    if (parsed.pendingEndingGrade == null) {
      if (parsed.pendingEndingEarned !== null) migrated = true
      parsed.pendingEndingEarned = null
    } else if (typeof parsed.pendingEndingEarned !== 'number' || !Number.isFinite(parsed.pendingEndingEarned)) {
      parsed.pendingEndingEarned = Math.max(0, Math.round(parsed.pendingEndingGrade))
      migrated = true
    } else if (parsed.pendingEndingEarned < 0) {
      parsed.pendingEndingEarned = 0
      migrated = true
    }
    migrated = normalizePendingReward(parsed) || migrated
    if (typeof parsed.inspiration !== 'number' || !Number.isFinite(parsed.inspiration)) {
      parsed.inspiration = 0
      migrated = true
    } else if (parsed.inspiration < 0) {
      parsed.inspiration = 0
      migrated = true
    }
    // 결과 화면 기록 도입 전 저장은 빈 기록으로 시작하고, 부분 손상은 유효한 값만 살린다.
    migrated = normalizeRunRecord(parsed) || migrated
    migrated = migrateCombatBalance(parsed) || migrated
    // 이전 저장은 전투마다 풀피·방어 0으로 시작했으므로 보정된 최대 체력에서 새 지속 규칙을 시작한다.
    if (!parsed.combat || typeof parsed.combat.hp !== 'number' || typeof parsed.combat.guard !== 'number') {
      parsed.combat = { hp: parsed.player.stats.hp, guard: 0 }
      migrated = true
    } else {
      const hp = Math.max(0, Math.min(parsed.player.stats.hp, parsed.combat.hp))
      const guard = Math.max(0, Math.min(parsed.player.stats.hp, parsed.combat.guard))
      if (hp !== parsed.combat.hp || guard !== parsed.combat.guard) {
        parsed.combat = { hp, guard }
        migrated = true
      }
    }
    migrated = migrateCardDefinitions(parsed) || migrated
    migrated = migrateItems(parsed) || migrated
    if (parsed.schemaVersion !== RUN_SAVE_SCHEMA_VERSION) {
      parsed.schemaVersion = RUN_SAVE_SCHEMA_VERSION
      migrated = true
    }
    return parsed
  } catch {
    return null
  }
}

/** 저장 포맷 버전이 빠질 수 없도록 하는 순수 직렬화 경계. */
export function serializeRun(run: RunState): string {
  return JSON.stringify({ ...run, schemaVersion: RUN_SAVE_SCHEMA_VERSION })
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return null
    const run = deserializeRun(raw)
    if (!run) {
      localStorage.setItem(CORRUPT_SAVE_KEY, raw)
      localStorage.removeItem(SAVE_KEY)
      return null
    }
    const normalized = serializeRun(run)
    if (normalized !== raw) localStorage.setItem(SAVE_KEY, normalized)
    return run
  } catch {
    return null
  }
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(SAVE_KEY, serializeRun(run))
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

/** 전투 훈수는 최초 발견에만 나온다. 새 스테이지마다 같은 설명을 반복하지 않는다. */
export function hasSeenCombatCoach(hint: CombatCoachHint): boolean {
  try {
    const raw = localStorage.getItem(COMBAT_COACH_KEY)
    return raw ? (JSON.parse(raw) as unknown[]).includes(hint) : false
  } catch {
    return false
  }
}

export function markCombatCoachSeen(hint: CombatCoachHint): void {
  try {
    const raw = localStorage.getItem(COMBAT_COACH_KEY)
    const seen = new Set<CombatCoachHint>(raw ? JSON.parse(raw) : [])
    seen.add(hint)
    localStorage.setItem(COMBAT_COACH_KEY, JSON.stringify([...seen]))
  } catch {
    // Storage가 막혀도 현재 전투 진행은 계속한다.
  }
}

function clearTutorialHistory(): void {
  try {
    localStorage.removeItem(TUTORIAL_KEY)
    localStorage.removeItem(COMBAT_COACH_KEY)
  } catch {
    // 저장소를 못 쓰는 환경에서는 완료 기록도 남아 있지 않다.
  }
}

/** `little-token.` 접두사를 가진 저장을 전부 지운다. 기록 초기화의 실제 몸통이다. */
function clearPrefixedStorage(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) doomed.push(key)
    }
    // 훑는 도중에 지우면 인덱스가 밀려 건너뛰는 키가 생긴다. 다 모으고 나서 지운다.
    doomed.forEach((key) => localStorage.removeItem(key))
  } catch {
    // 저장소를 못 쓰는 환경에서는 지울 기록도 없다.
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
/**
 * 기록 초기화 — 이 게임이 남긴 진행도를 전부 지운다. 토큰의 기억·유대·성향과 학습된
 * 정책도 여기 포함된다. 접두사로 쓸어 내므로 앞으로 키가 늘어도 자동으로 따라온다.
 */
export function clearAllRecords(): void {
  clearRun()
  clearTutorialHistory()
  clearPrefixedStorage()
}
