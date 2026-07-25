/**
 * 카드 수치 문구 — 손패·집계판·보상·덤프가 같은 문장을 쓰도록 한곳에 모아 둔다.
 * 화면마다 따로 조립하면 같은 카드가 화면마다 다르게 읽힌다(도박 표기가 그랬다).
 */

import { PREEMPT_TAG, STAT_NAME, wordFlat } from './compiler'
import { EMOTION_ICON, EMOTION_LABEL, type StatBlock, type Variance, type Word } from './types'

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
export interface ValueLine {
  text: string
  cls: string
}

/**
 * 카드 한 장의 수치 목록 — **화면 전체가 이 한 함수를 쓴다**(체인·카드 상세·보상 상세).
 * 화면마다 따로 조립하니 같은 카드가 "위력 배수 +10%"(대성공 누락)와
 * "배율 ×1.10 · 대성공 20%"로 다르게 읽혔다. 표기 규칙은 하나다.
 *
 *   깡수치  `공격 ×1` — 스탯을 넘기면 `공격 ×1 = 5`까지 (방어·회복도 같은 형식)
 *   배율    `배율 ×1.10`
 *   도박    `40% 확률로 배율 ×2.50`
 *   확률    `대성공 20%`
 *
 * 폐지한 규칙(실패·자해·회피)은 데이터가 0이라 줄을 만들지 않는다.
 */
export function wordValueLines(w: Word, stats?: StatBlock): ValueLine[] {
  const out: ValueLine[] = []
  out.push({ text: `${EMOTION_ICON[w.emotion]} ${EMOTION_LABEL[w.emotion]}`, cls: `emotion ${w.emotion}` })
  const lane = w.kind === 'heal' ? 'heal' : w.kind === 'guard' ? 'guard' : 'dmg'
  // 동사·목적어 — 공격도 방어처럼 "공격 ×1"로 적는다("적을 공격"은 수치가 아니다).
  if (w.stat && w.statMult != null) {
    const applied = stats ? ` = ${wordFlat(w, stats)}` : ''
    out.push({ text: `${STAT_NAME[w.stat]} ×${w.statMult}${applied}`, cls: lane })
  } else if (w.power) {
    out.push({ text: `위력 ${w.power}`, cls: lane })
  }
  if (w.effects?.guard) out.push({ text: `방어 +${w.effects.guard}`, cls: 'guard' })
  if (w.effects?.heal) out.push({ text: `회복 +${w.effects.heal}`, cls: 'heal' })
  if (w.bonus) out.push({ text: multText(w.bonus), cls: 'buff' })
  if (w.variance) out.push({ text: gambleText(w.variance), cls: 'gamble' })
  if (w.crit) out.push({ text: critText(w.crit), cls: 'buff' })
  if (w.growHp) out.push({ text: `최대 체력 +${w.growHp}`, cls: 'heal' })
  if (w.aoe === 'all') out.push({ text: '적 전체 적중', cls: 'dmg' })
  if (w.timing === 'delayed') out.push({ text: '다음 턴 발동', cls: '' })
  if (w.targetMode === 'both') out.push({ text: '피해 40% 나에게 되돌아옴', cls: 'self' })
  if (w.tags.includes(PREEMPT_TAG)) out.push({ text: '선공 상대보다 먼저 행동', cls: 'buff' })
  // 수치가 없는 카드(규칙 카드·차단 안내)는 카드에 적힌 문구를 그대로 쓴다.
  if ((w.kind === 'attack' || w.targetCount) && w.aoe !== 'all') out.push({ text: `${w.targetCount ?? 1}명 공격`, cls: 'dmg' })
  if (w.effects?.pierceGuard) out.push({ text: '방어 관통', cls: 'dmg' })
  if (w.effects?.hitCount && w.effects.hitCount > 1) out.push({ text: `${w.effects.hitCount}연타`, cls: 'dmg' })
  if (w.effects?.counterMultiplier) out.push({ text: `카운터 ×${w.effects.counterMultiplier.toFixed(2)}`, cls: 'guard' })
  if (!out.length) out.push({ text: w.note, cls: 'flat' })
  return out
}

export function numericNoteParts(w: Word): string[] {
  const out: string[] = []
  if (w.stat && w.statMult != null) out.push(`×${w.statMult}`)
  if (w.power) out.push(`위력 ${w.power}`)
  if (w.bonus) out.push(multText(w.bonus))
  if (w.variance) out.push(gambleText(w.variance))
  if (w.crit) out.push(critText(w.crit))
  return out
}
