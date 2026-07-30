/**
 * 전투 보상등급 — 운이 시작값과 바닥을 정하고, 빠른 클리어가 높은 값을 지킨다.
 * 전투 시작 등급은 운에서 나오고, 전투가 끝나지 않은 채 턴이 길어질수록 1씩 내려가되
 * 운이 보장하는 바닥 아래로는 떨어지지 않는다. 전투 중 등급을 다시 올리는 경로는 없다.
 * 최종 등급은 보상 희귀도의 "확률 가중치"가 된다 —
 * 상한 캡이 아니므로 높다고 반드시 좋은 것만 나오지는 않는다.
 */

import type { Rarity } from './types'

export const GRADE_MAX = 10
/** 방어·회복 전개가 한 문장 길다는 이유만으로 매번 보상을 잃지 않게 하는 완충 구간. */
export const GRADE_DECAY_INTERVAL = 3

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 운이 보장하는 최소 등급 — 아무리 오래 끌어도 여기까지만 내려간다. */
export const gradeFloor = (luck: number): number => clamp(Math.round(luck), 0, GRADE_MAX)

/** 전투 시작 등급 — 바닥 위에 여유 2를 얹고 시작해, 끌수록 잃을 게 있게 한다. */
export const startGrade = (luck: number): number => clamp(gradeFloor(luck) + 2, 0, GRADE_MAX)

/** 턴 경과 감쇠 — 턴마다 1씩, 운의 바닥까지만. */
export const decayGrade = (grade: number, luck: number): number => Math.max(gradeFloor(luck), grade - 1)

/** 첫 턴을 0으로 센 경과 턴에서 확정되는 속도 등급. */
export const gradeForElapsedTurns = (luck: number, elapsedTurns: number): number =>
  Math.max(
    gradeFloor(luck),
    startGrade(luck) - Math.floor(Math.max(0, elapsedTurns) / GRADE_DECAY_INTERVAL),
  )

/** 희귀도용 속도 등급과 별개로, 남긴 무료 드로우를 최종 영감 획득량에 더한다. */
export const clearRewardValue = (grade: number, unusedDraws: number): number =>
  Math.max(0, Math.round(grade)) + Math.max(0, Math.floor(unusedDraws))

/** 등급 → 희귀도 가중치. 등급이 오르면 노멀이 줄고 상위 희귀도 확률이 열린다. */
export function rarityWeights(grade: number): Record<Rarity, number> {
  const g = clamp(grade, 0, GRADE_MAX)
  return {
    common: Math.max(8, 70 - g * 6),
    rare: 24 + g * 2,
    epic: Math.max(0, (g - 2) * 3),
    legendary: Math.max(0, (g - 5) * 3),
  }
}

export function rollRarity(grade: number, rng: () => number = Math.random): Rarity {
  const w = rarityWeights(grade)
  const entries = Object.entries(w) as [Rarity, number][]
  const total = entries.reduce((s, [, v]) => s + v, 0)
  let roll = rng() * total
  for (const [rarity, weight] of entries) {
    roll -= weight
    if (roll < 0) return rarity
  }
  return 'common'
}

/** 표기용 티어 — 지금 등급이면 대략 어느 희귀도를 노려볼 만한지(색 클래스에 사용). */
export function gradeTier(grade: number): Rarity {
  return grade >= 9 ? 'legendary' : grade >= 6 ? 'epic' : grade >= 3 ? 'rare' : 'common'
}
