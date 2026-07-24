/**
 * 스테이지(하루) 생성 — 날이 지날수록 적이 많아지고(3~6) 강해지며,
 * 날씨/밤낮이 순환하며 필드 효과가 바뀐다.
 */

import type { FieldDef } from '@core/types'
import { FIELDS } from './fields'

export interface Stage {
  day: number
  field: FieldDef
  encounter: string[] // 적 id 목록(3~6)
  hpMult: number
  atkMult: number
}

export function stageFor(day: number): Stage {
  const field = FIELDS[(day - 1) % FIELDS.length] // 맑음 → 비 → 밤 순환
  const count = Math.min(3 + Math.floor((day - 1) / 2), 6)
  const hpMult = 1 + (day - 1) * 0.28
  const atkMult = (1 + (day - 1) * 0.16) * (field.enemyAtkMult ?? 1)
  const encounter: string[] = []
  // 날이 갈수록 단단한 바퀴벌레 비중이 는다.
  for (let i = 0; i < count; i++) encounter.push(i % 3 === 2 ? 'roach' : 'moth')
  return { day, field, encounter, hpMult, atkMult }
}
