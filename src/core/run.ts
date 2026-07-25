/**
 * 런 상태 — 낮게 시작한 스탯을 아이템/문장 보상으로 키워 나간다.
 * 하루(레벨)를 클리어하면 보상 → 다음날. 운이 낮으면 낮은 등급 보상만 뜬다.
 */

import { STARTING_COMBAT_STATS, type OwnedItem, type PlayerState, type PlayerStats } from './player'
import type { Word } from './types'
import { EARLY_WORDS } from '@data/earlyWords'

/**
 * 런 한 판의 기록 — 결과 화면의 찢어진 종이에 촘촘히 적히는 값들이다.
 * 전투 단위 수치(killsThisBattle, grade 등)와 달리 런 내내 누적되며 저장에도 실린다.
 */
export interface RunRecord {
  /** 종류별 처치 수. 종이에 "흰개미 ×7"처럼 늘어놓는다. */
  kills: Record<string, number>
  /** 가장 센 한 방과 그때 조립한 문장. */
  bestHit: { dmg: number; sentence: string } | null
  /** 이 런에서 한 문장에 실린 최고 배율. */
  bestMult: number
  /** 한 방으로 이어 낸 최고 관통 콤보. */
  bestCombo: number
  /** 조립해서 꽂은 문장 수. */
  sentences: number
  /** 넘긴 날짜 수 — 전투를 이겨 다음 장으로 넘어간 횟수. */
  daysCleared: number
}

export function emptyRunRecord(): RunRecord {
  return { kills: {}, bestHit: null, bestMult: 0, bestCombo: 0, sentences: 0, daysCleared: 0 }
}

/**
 * 무엇에게 일기장을 잃었는지. 결과 화면이 "나를 갉아먹은 것"으로 크게 보여 준다.
 * 자기 문장의 자해로 쓰러지는 경우도 있어서 벌레로만 두지 않았다.
 */
export type DefeatCause =
  /** sprite는 Sprites.ts 키, note는 그 벌레의 한 줄 소개 — 종이에 초상과 함께 적는다. */
  | { kind: 'enemy'; enemyId: string; name: string; sprite: string; note: string }
  | { kind: 'self'; sentence: string }

export interface RunState {
  player: PlayerState
  /** 스테이지를 넘어 유지되는 현재 생존 자원. 최대 체력은 player.stats.hp가 기준이다. */
  combat: RunCombatState
  day: number
  /** 결과 화면에 보여 줄 이 런의 누적 기록. */
  record: RunRecord
  /** 저장된 전투 시작 스탯 보정의 적용 버전. 구 저장은 loadRun에서 한 번만 올린다. */
  balanceVersion: number
  /** 장로거미를 쓰러뜨리고 첫 15층 이야기 뒤의 반복 구간에 진입했는가. */
  endless: boolean
  /** 첫 장로거미 승리 뒤 엔딩 컷씬을 끝까지 본 런인지 저장한다. */
  endingSeen: boolean
  /** 전투를 다시 치러 보상을 중복 획득하지 않도록 3단계 보상 진행을 저장한다. */
  reward: PendingReward | null
  /**
   * 보스 조우 컷을 이미 본 날짜들. 같은 보스를 다시 만날 때(이어하기·재도전)
   * 7초짜리 영상을 매번 다시 보여 줄 이유는 없다.
   */
  bossCinematicSeen?: number[]
}

export interface RunCombatState {
  hp: number
  guard: number
}

export type RewardPhase = 'subject' | 'item' | 'verb'

/** 보상 완료 화면을 새로고침해도 방금 고른 세 장을 복원하기 위한 최소 참조값. */
export interface RewardPickRef {
  kind: 'word' | 'item'
  id: string
  reinforce?: boolean
}

export interface PendingReward {
  day: number
  grade: number
  phase: RewardPhase | 'complete'
  picks: RewardPickRef[]
}

export const DECK_LIMITS: Readonly<Record<string, number>> = { subj: 6, adv: 6, verb: 8 }
export const COMBAT_BALANCE_VERSION = 1

function cloneDeck(d: Record<string, Word[]>): Record<string, Word[]> {
  const out: Record<string, Word[]> = {}
  for (const k of Object.keys(d)) out[k] = [...d[k]]
  return out
}

// 시작 스탯 — 세 행동(공격·방어·회복)을 같은 값으로 열어 두고 아이템으로 성장한다.
export function startingPlayer(): PlayerState {
  return {
    stats: { ...STARTING_COMBAT_STATS },
    items: [],
    deck: cloneDeck(EARLY_WORDS),
  }
}

export function newRun(): RunState {
  const player = startingPlayer()
  return {
    player,
    combat: { hp: player.stats.hp, guard: 0 },
    day: 1,
    record: emptyRunRecord(),
    balanceVersion: COMBAT_BALANCE_VERSION,
    endless: false,
    endingSeen: false,
    reward: null,
  }
}

// 아이템 보상 = 스탯 수치 상승(스펙업).
export function applyItemReward(player: PlayerState, item: OwnedItem): void {
  for (const k of Object.keys(item.stats) as (keyof PlayerStats)[]) {
    player.stats[k] = (player.stats[k] ?? 0) + (item.stats[k] ?? 0)
  }
  player.items.push(item)
}

// 단어 깊은 복제 — 덱 단어는 EARLY_WORDS와 참조를 공유하므로 강화 전 복제해 오염을 막는다.
function cloneWord(w: Word): Word {
  return {
    ...w,
    tags: [...w.tags],
    effects: w.effects ? { ...w.effects } : undefined,
    variance: w.variance ? { ...w.variance } : undefined,
  }
}

// 반복강화 — 중복 단어를 먹으면 단계가 오르고 핵심 수치가 강해진다.
const REINFORCE_STEP = { power: 2, statMult: 0.15, bonus: 0.15, guard: 2, heal: 2, crit: 0.05, counter: 0.25 }
export function reinforceWord(w: Word): void {
  w.level = (w.level ?? 1) + 1
  if (w.power != null) w.power += REINFORCE_STEP.power
  if (w.statMult != null) w.statMult = Math.round((w.statMult + REINFORCE_STEP.statMult) * 100) / 100
  if (w.bonus != null) w.bonus = Math.round((w.bonus + REINFORCE_STEP.bonus) * 100) / 100
  if (w.effects?.guard) w.effects.guard += REINFORCE_STEP.guard
  if (w.effects?.heal) w.effects.heal += REINFORCE_STEP.heal
  if (w.effects?.counterMultiplier) {
    w.effects.counterMultiplier = Math.round((w.effects.counterMultiplier + REINFORCE_STEP.counter) * 100) / 100
  }
  if (w.crit != null) w.crit = Math.min(0.6, Math.round((w.crit + REINFORCE_STEP.crit) * 100) / 100)
}

// 문장 보상 = 단어장 등록. 이미 있으면 새로 넣지 않고 그 단어를 강화한다(반복강화).
export type RegisterWordResult =
  | { kind: 'added' | 'reinforced' }
  | { kind: 'needs-discard'; candidates: Word[] }

/** 상한을 넘기면 같은 문법으로 보유한 모든 카드 중에서 교체 대상을 고른다. */
export function discardCandidates(player: PlayerState, slotKey: string): Word[] {
  return [...(player.deck[slotKey] ?? [])]
}

export function registerWord(player: PlayerState, word: Word, discardId?: string): RegisterWordResult {
  const slot = player.deck[word.slot] ?? (player.deck[word.slot] = [])
  const idx = slot.findIndex((w) => w.id === word.id)
  if (idx >= 0) {
    const upgraded = cloneWord(slot[idx])
    reinforceWord(upgraded)
    slot[idx] = upgraded
    return { kind: 'reinforced' }
  } else {
    const limit = DECK_LIMITS[word.slot]
    if (limit != null && slot.length >= limit) {
      const candidates = discardCandidates(player, word.slot)
      const discardIndex = discardId ? slot.findIndex((w) => w.id === discardId) : -1
      if (discardIndex < 0 || !candidates.some((w) => w.id === discardId)) {
        return { kind: 'needs-discard', candidates }
      }
      slot.splice(discardIndex, 1)
    }
    slot.push({ ...cloneWord(word), level: 1 })
    return { kind: 'added' }
  }
}
