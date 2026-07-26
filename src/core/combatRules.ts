/**
 * 화면에 그대로 설명되는 전투 규칙 상수.
 *
 * 시뮬레이션(`sim/reference.ts`)과 컴파일러가 실제로 계산에 쓰는 값이자,
 * 도움말(`views/CombatGuideView.ts`)이 읽어서 표시하는 값이다. 규칙 설명과
 * 실제 결과가 어긋나지 않도록 두 곳이 같은 상수를 본다 — 숫자를 바꾸면
 * 설명서도 같이 바뀐다.
 */

/** 다중 대상 공격의 앞줄부터의 피해 비율. 배열 길이를 넘는 대상은 마지막 값을 쓴다. */
export const TARGET_FALLOFF = [1, 0.7, 0.5] as const

/** 적 HP바 옆 감정을 문장에 실었을 때의 피해 배율. */
export const WEAKNESS_MULT = 1.25

/** 부위 보스(장로거미)의 지금 드러난 부위 약점을 맞혔을 때의 피해 배율. */
export const PART_WEAKNESS_MULT = 1.5

/** 같은 감정 카드가 모였을 때의 공명 배율. 무감정 카드는 세지 않는다. */
export const EMOTION_RESONANCE = { pair: 1.15, triple: 1.3, perExtra: 0.15 } as const

/** 겹주어·겹동사로 슬롯이 늘어나도 같은 감정 한 장마다 공명이 계속 자란다. */
export function emotionResonanceFor(count: number): number {
  return count >= 2 ? 1 + (count - 1) * EMOTION_RESONANCE.perExtra : 1
}

export type BossAttackStage = 1 | 2 | 3

/** 보스는 남은 체력이 2/3, 1/3 경계를 지날 때 공격 동작과 피해가 함께 강해진다. */
export const BOSS_ATTACK_MULTIPLIER: Record<BossAttackStage, number> = {
  1: 1,
  2: 1.25,
  3: 1.5,
}

/** 보스전이 늘어질 때만 적용되는 상한 없는 장기전 압박. 초반 패턴을 읽을 시간은 준다. */
export const BOSS_TURN_PRESSURE = {
  graceTurns: 6,
  perTurn: 0.05,
} as const

/** 일반 적은 항상 1이며, 보스만 유예 턴 뒤부터 전투 턴마다 공격이 누적 상승한다. */
export function bossTurnPressureMultiplier(
  enemy: { def: { boss?: boolean } },
  turn: number,
): number {
  if (!enemy.def.boss) return 1
  const pressuredTurns = Math.max(0, Math.floor(turn) - BOSS_TURN_PRESSURE.graceTurns)
  return 1 + pressuredTurns * BOSS_TURN_PRESSURE.perTurn
}

/** 방어막은 최대 체력 한 줄까지만 비축할 수 있다. */
export function playerGuardLimit(playerMax: number): number {
  return Math.max(0, Math.round(playerMax))
}
