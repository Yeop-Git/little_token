/**
 * 스테이지(하루) 생성 — 날이 지날수록 적이 많아지고(2~8) 강해지며,
 * 날씨/밤낮이 순환하며 필드 효과가 바뀐다.
 *
 * 초반은 둘 → 셋으로 짧게 끊어 매 라운드 보상(상점 칸)으로 빠르게 스펙업하고,
 * 그 뒤부터 넷·다섯으로 불어나며 무리를 쓸어담는 맛이 붙는다.
 */

import type { FieldDef } from '@core/types'
import { FIELDS } from './fields'

// 레일에 한 번에 세울 수 있는 최대 마릿수.
export const MAX_ENCOUNTER = 8
export const STORY_FLOORS = 15
const ENEMY_ORDER = ['termite', 'moth', 'flea', 'roach', 'pillbug', 'mosquito'] as const

/** 15층짜리 한 권 안의 보스 배치. 엔드리스에서는 이 한 권을 더 강하게 반복한다. */
export const BOSS_BY_FLOOR: Record<number, string> = {
  5: 'mantis',
  10: 'queenBee',
  15: 'elderSpider',
}

/** 보스별 고정 체력 막 수. 엔드리스에서도 막은 늘리지 않고 hpMult로 막당 체력만 키운다. */
export function bossHealthBarsForFloor(floor: number): number {
  if (floor >= 15) return 5
  if (floor >= 10) return 3
  return 2
}

export function bossForDay(day: number): string | null {
  if (day <= 0) return null
  return BOSS_BY_FLOOR[floorInCycle(day)] ?? null
}

/** 현재 15층 묶음 안의 층(1~15). */
export function floorInCycle(day: number): number {
  return ((Math.max(1, Math.floor(day)) - 1) % STORY_FLOORS) + 1
}

/** 0은 본편, 1부터 엔드리스 회차다. */
export function endlessCycleFor(day: number): number {
  return Math.floor((Math.max(1, Math.floor(day)) - 1) / STORY_FLOORS)
}

export interface Stage {
  day: number
  field: FieldDef
  encounter: string[] // 적 id 목록(2~8)
  hpMult: number
  atkMult: number
  isBoss: boolean
  bossHealthBars: number
  floor: number
  endlessCycle: number
}

export function stageFor(day: number): Stage {
  const floor = floorInCycle(day)
  const endlessCycle = endlessCycleFor(day)
  const field = FIELDS[(day - 1) % FIELDS.length] // 맑음 → 비 → 밤 순환
  const boss = bossForDay(day)
  const isBoss = boss != null
  // 이중 레벨 곡선 — 마릿수도 늘고(2→8) 개체 체력도 오른다.
  // 둘이 동시에 뚫리면 "웬만한 콤보"로는 필드가 안 비고, 진짜 잭팟만 올클을 낸다.
  // 그래도 개체 하나하나는 계속 물어서(한 방에 여럿 관통) 파바바박 손맛은 남긴다.
  const count = Math.min(1 + floor, MAX_ENCOUNTER)
  const hpMult = 1 + (day - 1) * 0.26
  // 압력은 뒤로 갈수록 가팔라진다(초반은 완만, 후반에 조여든다).
  const atkMult = (1 + Math.pow(day - 1, 1.3) * 0.1) * (field.enemyAtkMult ?? 1)
  if (boss) return {
    day,
    field,
    encounter: [boss],
    hpMult,
    atkMult,
    isBoss,
    bossHealthBars: bossHealthBarsForFloor(floor),
    floor,
    endlessCycle,
  }

  const encounter: string[] = []
  // 1일차 무능력 2종에서 시작해 날짜마다 능력 적을 하나씩 소개한다.
  const available = ENEMY_ORDER.slice(0, Math.min(ENEMY_ORDER.length, floor + 1))
  for (let i = 0; i < count; i++) {
    encounter.push(available[(floor - 1 + i) % available.length])
  }
  return { day, field, encounter, hpMult, atkMult, isBoss, bossHealthBars: 1, floor, endlessCycle }
}
