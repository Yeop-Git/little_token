/**
 * 전투 보상등급 — 운이 바닥을 깔고, 오버킬이 천장을 당긴다.
 * 전투 시작 등급은 운에서 나오고, 턴이 길어질수록 1씩 내려가되 운이 보장하는
 * 바닥 아래로는 떨어지지 않는다. 한 턴에 두 마리 이상을 쓸어담으면 처치 수만큼
 * 튀어오르고(전멸 마무리면 +1), 최종 등급은 보상 희귀도의 "확률 가중치"가 된다 —
 * 상한 캡이 아니므로 높다고 반드시 좋은 것만 나오지는 않는다.
 */

import type { Rarity } from './types'

export const GRADE_MAX = 10

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** 운이 보장하는 최소 등급 — 아무리 오래 끌어도 여기까지만 내려간다. */
export const gradeFloor = (luck: number): number => clamp(Math.round(luck), 0, GRADE_MAX)

/** 전투 시작 등급 — 바닥 위에 여유 2를 얹고 시작해, 끌수록 잃을 게 있게 한다. */
export const startGrade = (luck: number): number => clamp(gradeFloor(luck) + 2, 0, GRADE_MAX)

/** 턴 경과 감쇠 — 턴마다 1씩, 운의 바닥까지만. */
export const decayGrade = (grade: number, luck: number): number => Math.max(gradeFloor(luck), grade - 1)

export const bumpGrade = (grade: number, n: number): number => clamp(grade + n, 0, GRADE_MAX)

/** 한 턴(한 문장)의 처치 수 → 등급 상승량. 2마리부터 인정, 전멸 마무리면 +1 보너스. */
export const overkillGain = (kills: number, wipedAll: boolean): number =>
  kills >= 2 ? kills + (wipedAll ? 1 : 0) : 0

/** 등급 → 희귀도 가중치. 등급이 오르면 흔함이 줄고 상위 희귀도 확률이 열린다. */
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
