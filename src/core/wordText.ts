/**
 * 카드 수치 문구 — 손패·집계판·보상·덤프가 같은 문장을 쓰도록 한곳에 모아 둔다.
 * 화면마다 따로 조립하면 같은 카드가 화면마다 다르게 읽힌다(도박 표기가 그랬다).
 */

import type { Variance, Word } from './types'

/**
 * 도박 표기 — "40% 확률로 배율 ×2.50".
 * 저점은 규칙상 항상 ×1.00이다(`variance_lo`를 1 미만으로 내리지 않는다). 그래서
 * 양쪽을 나란히 적을 필요가 없다. `×2.50 / ×1.00`은 "절반은 손해"처럼 읽혀서 폐지했다.
 * 저점이 1이 아닌 데이터가 들어오면 그때만 나머지 쪽을 덧붙인다.
 */
export function gambleText(v: Variance): string {
  const p = Math.round(v.p * 100)
  const hi = `${p}% 확률로 배율 ×${v.hi.toFixed(2)}`
  return v.lo === 1 ? hi : `${hi} · 나머지 ×${v.lo.toFixed(2)}`
}

/** 가산 배율 표기 — "배율 ×1.20". */
export const multText = (bonus: number): string => `배율 ×${(1 + bonus).toFixed(2)}`

/** 대성공 표기 — "대성공 20%". */
export const critText = (crit: number): string => `대성공 ${Math.round(crit * 100)}%`

/**
 * 카드가 화면에 내걸어야 하는 수치 조각 — CSV `note`가 빠뜨리지 않았는지 검사하는
 * 기준이기도 하다(`npm run check`). 규칙 카드(문장부호·무럭무럭)는 수치가 아니라
 * 규칙을 적으므로 빈 배열이 나온다.
 */
export function numericNoteParts(w: Word): string[] {
  const out: string[] = []
  if (w.stat && w.statMult != null) out.push(`×${w.statMult}`)
  if (w.power) out.push(`위력 ${w.power}`)
  if (w.bonus) out.push(multText(w.bonus))
  if (w.variance) out.push(gambleText(w.variance))
  if (w.crit) out.push(critText(w.crit))
  return out
}
