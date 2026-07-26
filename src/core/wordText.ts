/**
 * 카드 수치 문구 — 손패·집계판·보상·덤프가 같은 문장을 쓰도록 한곳에 모아 둔다.
 * 화면마다 따로 조립하면 같은 카드가 화면마다 다르게 읽힌다(도박 표기가 그랬다).
 */

import { TARGET_FALLOFF } from './combatRules'
import { PREEMPT_TAG, STAT_NAME, wordFlat } from './compiler'
import type { StatBlock, TargetCount, Variance, Word } from './types'

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
  if (!out.length) out.push({ text: wordNoteText(w), cls: 'flat' })
  return out
}

/** 다중 대상 표기 — "2명(100%·70%)". 감쇠율은 실제 전투 규칙에서 읽는다. */
export function targetCountText(count: TargetCount): string {
  if (count === 'all') return '전체'
  if (count <= 1) return '1명'
  const falloff = Array.from({ length: count }, (_, rank) =>
    `${Math.round((TARGET_FALLOFF[rank] ?? TARGET_FALLOFF[TARGET_FALLOFF.length - 1]) * 100)}%`)
  return `${count}명(${falloff.join('·')})`
}

/**
 * 카드 앞면 한 줄 요약을 **지금 이 카드의 값에서** 조립한다.
 *
 * 데이터의 `note`는 1단계 카드를 적어 둔 원문이라, 반복강화로 수치가 오르면
 * 그대로 두는 순간 화면과 실제가 어긋난다(Lv.3인데 "공격 ×1"로 읽히던 문제).
 * 그래서 표시하는 쪽은 전부 이 함수를 거치고, `note`는 원문 검수 기준으로만 남는다.
 * `npm run check`가 1단계 카드에 대해 이 함수의 결과와 `note`가 같은지 확인한다.
 *
 * 수치가 아니라 규칙을 적는 카드(주어로 못 쓰는 카드 등)는 조각이 하나도 나오지
 * 않으므로 원문을 그대로 돌려준다.
 */
export function wordNoteText(w: Word): string {
  const parts = noteParts(w)
  return parts.length ? parts.join(' · ') : w.note
}

function noteParts(w: Word): string[] {
  // 성장 카드와 문장부호는 수치 대신 규칙을 적는다 — 같은 값에서 같은 문구를 다시 만든다.
  if (w.growHp) return [`최대 체력 +${w.growHp}`, '배율을 받지 않는다']
  if (w.slot === 'punct') {
    const punct: string[] = []
    if (w.tags.includes(PREEMPT_TAG)) punct.push('선공 상대보다 먼저 행동한다')
    if (w.bonus) punct.push(`배율 풀 +${w.bonus.toFixed(2)} (안전한 한 수)`)
    if (w.crit) punct.push(`대성공 확률 +${Math.round(w.crit * 100)}%`)
    return punct
  }
  // 일기의 주어는 나·우리뿐이라 다른 인칭은 수치가 아니라 차단 이유를 적는다.
  if (w.person && w.person !== 'first') return []

  const out: string[] = []
  if (w.stat && w.statMult != null) out.push(`${STAT_NAME[w.stat]} ×${w.statMult}`)
  else if (w.power) out.push(`위력 ${w.power}`)
  if (w.variance) out.push(gambleText(w.variance))
  // 배율 풀에 보태는 칸(주어·수식·어미)은 0이어도 "배율 ×1.00"을 적는다.
  else if (w.bonus != null && w.statMult == null && !w.power) out.push(multText(w.bonus))
  else if (w.bonus) out.push(multText(w.bonus))
  if (w.effects?.guard) out.push(`방어 +${w.effects.guard}`)
  if (w.effects?.heal) out.push(`회복 +${w.effects.heal}`)
  if (w.crit) out.push(critText(w.crit))
  // 연타는 그 자체로 단일 대상이라 대상 수를 겹쳐 적지 않는다.
  const hits = w.effects?.hitCount ?? 1
  if (w.targetCount && hits <= 1) out.push(targetCountText(w.targetCount))
  if (w.effects?.pierceGuard) out.push('관통')
  if (hits > 1) out.push(`${hits}연타`)
  if (w.effects?.counterMultiplier) out.push(`카운터 ×${w.effects.counterMultiplier.toFixed(2)}`)
  if (w.aoe === 'all') out.push(w.slot === 'adv' ? '전체 적중' : '전체')
  if (w.timing === 'delayed') out.push('다음 턴 발동')
  else if (w.timing === 'immediate') out.push('즉발')
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
