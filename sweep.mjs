// tools/sweep.mjs — 전수 밸런스 검사  → SPEC 8장
//
// 사용법:
//   node tools/sweep.mjs
//
// core_loop_reference.html의 <script>에서 데이터·컴파일러 영역을 그대로 떼어
// 이 파일 위에 붙이거나, 실제 구현에서는 core/compiler.ts를 import 한다.
// 중요한 건 배수 캡을 시뮬과 "동일한 함수"로 적용하는 것이다. 따로 계산하면
// 검사 결과와 실제 플레이가 어긋난다. (실제로 한 번 어긋났다)

import { WORDS, SLOT_ORDER, compile, conflictReason, MULT_CAP, ENEMY_MAX } from '../src/core/compiler.js';

// 시뮬과 공유해야 하는 유일한 계산. sim/adapter.ts도 이걸 호출한다.
export function finalMultiplier(intent, roll = null) {
  let m = intent.multiplier;
  if (intent.variance) {
    m *= roll < intent.variance.p ? intent.variance.hi : intent.variance.lo;
  }
  return Math.min(m, MULT_CAP);
}

const rows = [];
let blockedChoices = 0;
let deadEnds = 0;

(function walk(i, sel) {
  if (i === SLOT_ORDER.length) {
    const it = compile(sel);
    const push = m => rows.push({
      dmg: Math.round(it.base * m),
      sentence: it.sentence,
      combos: it.combos,
      timing: it.timing
    });
    if (it.variance) { push(finalMultiplier(it, 0)); push(finalMultiplier(it, 1)); }
    else push(finalMultiplier(it));
    return;
  }
  const key = SLOT_ORDER[i];
  let anyPlayable = false;
  for (const w of WORDS[key]) {
    if (conflictReason(w, i, sel)) { blockedChoices++; continue; }
    anyPlayable = true;
    walk(i + 1, { ...sel, [key]: w });
  }
  if (!anyPlayable) deadEnds++;   // ★ 소프트락. 여기가 0이 아니면 즉시 고친다.
})(0, {});

const imm = rows.filter(r => r.timing === 'immediate').map(r => r.dmg).sort((a, b) => a - b);
const q = p => imm[Math.floor(imm.length * p)];
const max = imm.at(-1), med = q(0.5);
const noCombo = rows.filter(r => !r.combos.length && r.timing === 'immediate').map(r => r.dmg).sort((a, b) => b - a);

console.log(`유효 문장 ${rows.length} · 차단된 선택 ${blockedChoices} · 막다른 길 ${deadEnds}`);
console.log(`즉발 데미지  min ${imm[0]} / p25 ${q(.25)} / med ${med} / p75 ${q(.75)} / max ${max}`);
console.log(`예상 전투 길이  ${(ENEMY_MAX / med).toFixed(1)}턴\n`);

const inv = [
  ['INV-1  max ≤ 적HP 40%',        max <= ENEMY_MAX * 0.4,  `${max} vs ${ENEMY_MAX * 0.4}`],
  ['INV-2  max/med ≤ 3.5',         max / med <= 3.5,        (max / med).toFixed(2)],
  ['INV-3  관용구 없이도 p75 도달', noCombo[0] >= q(.75),    `${noCombo[0]} vs ${q(.75)}`],
  ['INV-4  막다른 길 없음',         deadEnds === 0,          String(deadEnds)]
];
for (const [name, ok, detail] of inv) {
  console.log(`${ok ? '통과' : '위반'}  ${name}  (${detail})`);
}

console.log('\n상위 8:');
[...rows].sort((a, b) => b.dmg - a.dmg).slice(0, 8)
  .forEach(r => console.log(`  ${String(r.dmg).padStart(3)}  ${r.sentence}${r.combos.length ? '  · ' + r.combos.join(', ') : ''}`));

if (inv.some(([, ok]) => !ok)) process.exit(1);
