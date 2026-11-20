/**
 * 화면에 찍는 수치 표기 — 스탯 × 계수처럼 소수가 섞인 값은 부동소수 오차가
 * 그대로 새어 나온다(0.1 + 0.2 = 0.30000000000000004). 계산은 그대로 두고
 * 보여 줄 때만 소수 둘째 자리에서 반올림하고 뒤의 0은 떼어 낸다.
 */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return String(value)
  const scale = 10 ** digits
  const rounded = Math.round(value * scale) / scale
  // -0 이 "-0"으로 찍히지 않게 0으로 정리한다.
  return String(rounded === 0 ? 0 : rounded)
}

/** 배율 표기 — 정수 배율도 "×1.0"처럼 소수 한 자리를 남겨 배율임이 읽히게 한다(11/20 피드백). */
export function formatMult(value: number, digits = 2): string {
  const text = formatNumber(value, digits)
  return /^-?\d+$/.test(text) ? `${text}.0` : text
}
