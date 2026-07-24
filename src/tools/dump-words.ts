// 현재 단어/관용구/모순/감탄 데이터를 마크다운 표로 덤프 → WORDS.md
import { WORDS } from '@data/words'
import { COMBOS, CONFLICTS, MULT_CAP } from '@data/combos'
import { EXCLAIM_SLOTS } from '@data/items'
import { DEFAULT_TEMPLATE } from '@data/slots'
import { RARITY_LABEL } from '@core/types'

const L: string[] = []
L.push('# 단어 · 관용구 데이터 표 (현재 구현 기준)\n')
L.push(`> 배수 상한(MULT_CAP) = **${MULT_CAP}**. 데미지 = (목적어위력+동사위력+공격력) × (1+보너스풀) × 관용구배수, 상한 적용.\n`)

for (const s of DEFAULT_TEMPLATE.slots) {
  L.push(`## ${s.label} (${s.key})\n`)
  L.push('| 단어 | 등급 | 태그 | 수치/효과 | 줄거리 |')
  L.push('|---|---|---|---|---|')
  for (const w of WORDS[s.key]) {
    const nums: string[] = []
    if (w.power != null) nums.push(`위력 ${w.power}`)
    if (w.bonus) nums.push(`배수 ${w.bonus>=0?'+':''}${Math.round(w.bonus*100)}%`)
    if (w.effects?.guard) nums.push(`방어 ${w.effects.guard>=0?'+':''}${w.effects.guard}`)
    if (w.effects?.heal) nums.push(`회복 +${w.effects.heal}`)
    if (w.effects?.recoil) nums.push(`자해 ${w.effects.recoil}`)
    if (w.effects?.evade) nums.push(`회피 +${w.effects.evade}`)
    if (w.variance) nums.push(`도박 ${Math.round(w.variance.p*100)}%: ×${w.variance.hi}/×${w.variance.lo}`)
    if (w.timing==='delayed') nums.push('다음 턴 발동')
    if (w.targetMode==='both') nums.push('대상 적+자신')
    if (w.aoe==='all') nums.push('전체 적중')
    if (w.kind && w.kind!=='attack') nums.push(w.kind==='heal'?'회복형':w.kind)
    L.push(`| **${w.text}** | ${RARITY_LABEL[w.rarity??'common']} | ${w.tags.join(', ')||'—'} | ${nums.join(' · ')||w.note} | ${w.lore??''} |`)
  }
  L.push('')
}

L.push('## 관용구(맥락) — 유일한 곱셈\n')
L.push('| 이름 | 필요 태그 | 배수 |')
L.push('|---|---|---|')
for (const c of COMBOS) L.push(`| 「${c.name}」 | ${c.need.join(', ')} | ×${c.mult} |`)
L.push('')

L.push('## 모순(충돌)\n')
L.push('| A | B | 이유 |')
L.push('|---|---|---|')
for (const c of CONFLICTS) L.push(`| ${c.a} | ${c.b} | ${c.reason} |`)
L.push('')

L.push('## 아이템 감탄사 단어 (감탄/정도/평가)\n')
for (const s of EXCLAIM_SLOTS) {
  L.push(`### ${s.label}\n`)
  L.push('| 단어 | 효과 |')
  L.push('|---|---|')
  for (const w of s.words) L.push(`| **${w.text}** | ${w.note} |`)
  L.push('')
}

console.log(L.join('\n'))
