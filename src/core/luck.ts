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
/**
 * 운 효과량 1당 보상등급 바닥 +0.5(2026-11-20, 1 → 0.5).
 * 1일 때는 시작 운 2만으로 바닥 5·시작 7, 운 8이면 이미 최고 등급 10에 닿아 운이 등급을 너무 빨리 채웠다.
 */
export const LUCK_GRADE_PER = 0.5

/** 운 효과량 1당 보상·상점 영웅 가중치 +1%p, 전설 +0.5%p(2026-11-20, 1.5·0.75에서 낮춤). */
export const LUCK_RARITY_EPIC_PER = 1
export const LUCK_RARITY_LEGENDARY_PER = 0.5

/** 보상·상점 희귀도에 더할 운 보정(%p). 상한 없이 곡선을 따라 둔화된다. */
export function luckRarityShift(luck: number): { epic: number; legendary: number } {
  const value = luckValue(luck)
  return {
    epic: value * LUCK_RARITY_EPIC_PER,
    legendary: value * LUCK_RARITY_LEGENDARY_PER,
  }
}

/**
 * 카드 확률(도박 성공·대성공)에 더하는 운 보정 — 운 효과량(luckValue 곡선) 1당 +1%p.
 * 2026-11-20 플레이테스트에서 확률이 너무 많이 오른다는 피드백으로 2%p → 1%p로 낮췄다
 * (운 4 → +4%p, 운 8 → +6%p, 운 16 → +9%p).
 * 운 자체에는 상한이 없고 곡선이 둔화를 맡는다. 확률 쪽 천장은 아래 상한이 맡는다.
 * 확률이 없는 카드(0%)는 운으로 새로 생기지 않는다 — 확률을 쓰는 카드만 오른다.
 */
export const LUCK_CHANCE_PER = 1
/** 도박 성공 확률은 운이 아무리 높아도 90%에서 멈춘다(실패 가능성은 남긴다). 카드 기본값이 이미 더 높으면 기본값을 지킨다. */
export const LUCK_SUCCESS_CAP = 0.9

/** 운 보정 확률. 모두 0~1 비율이고 bonus는 상한까지 실제로 더해진 몫이다. */
export interface LuckChance {
  base: number
  bonus: number
  final: number
}

export function luckChance(base: number, luck: number, ceiling = LUCK_SUCCESS_CAP): LuckChance {
  const safeBase = Number.isFinite(base) ? Math.max(0, base) : 0
  if (safeBase <= 0) return { base: 0, bonus: 0, final: 0 }
  const want = (luckValue(luck) * LUCK_CHANCE_PER) / 100
  const final = Math.max(safeBase, Math.min(ceiling, safeBase + want))
  return { base: safeBase, bonus: final - safeBase, final }
}

/**
 * 카드 문구가 쓸 현재 운. 카드 앞면·상세·보상 문구는 플레이어 상태를 모르므로
 * 전투·보상 화면이 열릴 때 지금 운을 한 번 알려 준다(전투 판정은 이 값을 쓰지 않는다).
 */
let cardLuck = LUCK_BASE
export function setCardLuck(luck: number): void {
  cardLuck = Number.isFinite(luck) ? luck : LUCK_BASE
}
export function getCardLuck(): number {
  return cardLuck
}
