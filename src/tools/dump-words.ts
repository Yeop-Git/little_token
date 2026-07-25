// 5슬롯 확장 단어/관용구/모순/감탄 데이터를 마크다운 표로 덤프 → WORDS.md
// 주의: 일반 런은 EARLY_WORDS(3슬롯)를 쓴다. 이 덤프는 확장용 보존 자료다.
import { WORDS } from '@data/words'
import { COMBOS, CONFLICTS } from '@data/combos'
import { EXCLAIM_SLOTS } from '@data/items'
import { DEFAULT_TEMPLATE } from '@data/slots'
import { RARITY_LABEL } from '@core/types'
import { gambleText } from '@core/wordText'

const L: string[] = []
L.push('# 단어 · 관용구 데이터 표 — 5슬롯 확장 데이터\n')
L.push('> ⚠ **일반 런의 단어 목록이 아니다.** 실제 런은 `EARLY_WORDS`(3슬롯 `주어→수식→동사`)를')
L.push('> 사용하며, 이 표는 `src/data/words.ts`의 5슬롯 확장·전수검사용 보존 자료다.\n')
L.push('> 현재 데미지 공식: `깡수치(스탯 × 계수) × (1 + 보너스풀) × 관용구배수`.')
L.push('> **배수 상한은 없다.** 최종 배율에 도박·운(+2%/1)·룰렛(대성공 ×1.5)이 추가로 곱해진다.')
L.push('> 실패·자해·부조화는 폐지했다. 자세한 규칙은 `SENTENCE_COMBAT_SPEC.md` 참조.\n')

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
    if (w.variance) nums.push(gambleText(w.variance))
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
