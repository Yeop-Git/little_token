/**
 * 운 계수 정본 — 운이 영향을 주는 모든 확률·배율 상수를 여기서 함께 관리한다.
 * 전투 판정(성공·대성공)과 보상·상점 희귀도가 같은 운 수치를 서로 다른 세기로 쓰므로
 * 한 파일에서 비교하며 다듬는다.
 */

/** 새 런의 기본 운. 이 값을 넘는 운부터 보상 희귀도 보정이 붙는다. */
export const LUCK_BASE = 3

/** 운 1당 기본 배율 +2% (그리 드라마틱하지 않게). */
export const LUCK_MULT = 0.02

/** 기본 운을 넘는 운 1당 보상·상점 영웅 가중치 +1.5%p, 전설 +0.75%p. */
export const LUCK_RARITY_EPIC_PER = 1.5
export const LUCK_RARITY_LEGENDARY_PER = 0.75
/** 운 보정 상한 — 운 11에서 꽉 찬다(영웅 +12%p, 전설 +6%p). */
export const LUCK_RARITY_EPIC_CAP = 12
export const LUCK_RARITY_LEGENDARY_CAP = 6

/** 보상·상점 희귀도에 더할 운 보정(%p). 기본 운 이하는 0. */
export function luckRarityShift(luck: number): { epic: number; legendary: number } {
  const extra = Math.max(0, (Number.isFinite(luck) ? luck : LUCK_BASE) - LUCK_BASE)
  return {
    epic: Math.min(LUCK_RARITY_EPIC_CAP, extra * LUCK_RARITY_EPIC_PER),
    legendary: Math.min(LUCK_RARITY_LEGENDARY_CAP, extra * LUCK_RARITY_LEGENDARY_PER),
  }
}
