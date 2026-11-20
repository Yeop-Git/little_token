/**
 * 운 계수 정본 — 운이 영향을 주는 모든 확률·배율 상수를 여기서 함께 관리한다.
 * 전투 판정(성공·대성공)과 보상·상점 희귀도가 같은 운 수치를 서로 다른 세기로 쓰므로
 * 한 파일에서 비교하며 다듬는다.
 *
 * 운은 0에서 시작하고 상한이 없다. 대신 `luckValue` 곡선을 거쳐 쓰여서
 * 쌓을수록 한 점당 효율이 줄어든다(운 4 → 4, 8 → 6.3, 12 → 8, 28 → 12).
 */

/** 새 런의 기본 운. */
export const LUCK_BASE = 0

/** 곡선의 굽는 지점 — 운이 이 값만큼 쌓일 때마다 효율이 대략 절반씩 줄어든다. */
export const LUCK_CURVE_KNEE = 4

/** 운 원수치를 실제 효과량으로 바꾸는 체감 곡선. 상한은 없지만 점점 덜 오른다. */
export function luckValue(luck: number): number {
  const raw = Number.isFinite(luck) ? Math.max(0, luck) : 0
  return LUCK_CURVE_KNEE * Math.log2(1 + raw / LUCK_CURVE_KNEE)
}

/** 운 효과량 1당 기본 배율 +3% — 곡선이 고운에서 둔화되므로 초반 한 점을 조금 더 무겁게 둔다. */
export const LUCK_MULT = 0.03

/** 운이 곱하는 기본 배율. */
export function luckMultiplier(luck: number): number {
  return 1 + luckValue(luck) * LUCK_MULT
}

/** 운 0에서도 예전 시작 운 3과 같은 보상등급 바닥을 주는 기준값. */
export const LUCK_GRADE_OFFSET = 3

/** 운 효과량 1당 보상·상점 영웅 가중치 +1.5%p, 전설 +0.75%p. */
export const LUCK_RARITY_EPIC_PER = 1.5
export const LUCK_RARITY_LEGENDARY_PER = 0.75

/** 보상·상점 희귀도에 더할 운 보정(%p). 상한 없이 곡선을 따라 둔화된다. */
export function luckRarityShift(luck: number): { epic: number; legendary: number } {
  const value = luckValue(luck)
  return {
    epic: value * LUCK_RARITY_EPIC_PER,
    legendary: value * LUCK_RARITY_LEGENDARY_PER,
  }
}
