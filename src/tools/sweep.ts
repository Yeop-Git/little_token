/**
 * 전수 밸런스 검사 — SPEC 8장. `npm run sweep`.
 * 모순 제외 전 조합을 순회해 즉발 데미지 분포와 불변식을 검사한다.
 * 컴파일러를 실게임과 동일 함수로 호출해 결과가 어긋나지 않게 한다(천장 없음).
 */

import { compile, finalMultiplier, isDamageIntent } from '@core/compiler'
import { conflictReason } from '@core/validator'
import type { Selection, Word } from '@core/types'
import { TABLES } from '@data/tables'

// 밸런스 기준 HP: 데모 벌레는 빠른 무리전을 위해 HP가 낮지만, 단일 즉발
// 상한 검사는 스펙 원본의 "듀얼 기준 적 HP"(90)로 잡는다(원형 튜닝 계승).
const ENEMY_MAX = 90
const order = TABLES.template.slots.map((s) => s.key)

interface Row {
  dmg: number
  dealsDamage: boolean
  sentence: string
  combos: string[]
  timing: string
  aoe: string
}
const rows: Row[] = []
let blocked = 0
let deadEnds = 0

function walk(i: number, sel: Selection) {
  if (i === order.length) {
    const it = compile(sel, TABLES)
    const push = (m: number) =>
      rows.push({
        dmg: isDamageIntent(it) ? Math.round(it.base * m) : 0,
        dealsDamage: isDamageIntent(it),
        sentence: it.sentence,
        combos: it.combos,
        timing: it.timing,
        aoe: it.aoe,
      })
    if (it.variance) {
      push(finalMultiplier(it, 0))
      push(finalMultiplier(it, 1))
    } else push(finalMultiplier(it))
    return
  }
  const key = order[i]
  let any = false
  for (const w of TABLES.words[key] as Word[]) {
    if (conflictReason(w, i, sel, TABLES)) {
      blocked++
      continue
    }
    any = true
    walk(i + 1, { ...sel, [key]: w })
  }
  if (!any) deadEnds++
}
walk(0, {})

// 단일 대상 즉발만으로 밸런스 기준을 잡는다(범위는 대상당 낮음).
const imm = rows
  .filter((r) => r.dealsDamage && r.timing === 'immediate' && r.aoe === 'single')
  .map((r) => r.dmg)
  .sort((a, b) => a - b)
const q = (p: number) => imm[Math.floor(imm.length * p)]
const max = imm[imm.length - 1]
const med = q(0.5)
const noCombo = rows
  .filter((r) => r.dealsDamage && !r.combos.length && r.timing === 'immediate' && r.aoe === 'single')
  .map((r) => r.dmg)
  .sort((a, b) => b - a)

console.log(`유효 문장 ${rows.length} · 차단된 선택 ${blocked} · 막다른 길 ${deadEnds}`)
console.log(`즉발(단일) min ${imm[0]} / p25 ${q(0.25)} / med ${med} / p75 ${q(0.75)} / max ${max}`)
console.log(`예상 전투 길이 ${(ENEMY_MAX / med).toFixed(1)}턴\n`)

// 천장 없음 — 최대 스파이크는 설계상 허용(폭발). 캡 기반 상한/비율 검사 대신
// "전형(median)이 즉사가 아님 + 관용구 없이도 성장 + 막다른 길 없음"만 지킨다.
const inv: [string, boolean, string][] = [
  ['INV-1  전형(median)이 즉사 아님 (med ≤ 적HP)', med <= ENEMY_MAX, `${med} vs ${ENEMY_MAX}`],
  ['INV-2  관용구 없이 p75 도달', noCombo[0] >= q(0.75), `${noCombo[0]} vs ${q(0.75)}`],
  ['INV-3  막다른 길 없음', deadEnds === 0, String(deadEnds)],
]
for (const [name, ok, detail] of inv) console.log(`${ok ? '통과' : '위반'}  ${name}  (${detail})`)

console.log('\n상위 8:')
;[...rows]
  .sort((a, b) => b.dmg - a.dmg)
  .slice(0, 8)
  .forEach((r) => console.log(`  ${String(r.dmg).padStart(3)}  ${r.sentence}${r.combos.length ? '  · ' + r.combos.join(', ') : ''}`))

if (inv.some(([, ok]) => !ok)) process.exit(1)
