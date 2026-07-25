/**
 * 슬롯 무결성 검사 — `npm run check`.
 * "중립 바닥" 불변식: 어떤 필터(역할 계약 + 충돌 태그)를 걸어도 슬롯이 0이 되지 않도록,
 * 모든 슬롯에는 "무슨 일이 있어도 고를 수 있는" 단어가 최소 1개 있어야 한다.
 *
 * 그런 단어의 조건(선택 순서와 무관하게 절대 차단 불가):
 *   ① 슬롯 역할 계약을 만족한다(roleReason === null) — 예: 주어면 1인칭.
 *   ② 어떤 conflict 쌍에도 참여하지 않는 태그만 가진다 — 앞에 뭐가 오든 하드 차단 불가.
 * 이걸 강제하면 "안 맞는 단어뿐이라 아무것도 못 누르는" 막다른 슬롯이 원천 봉쇄된다.
 * (부조화 소프트 감점은 차단이 아니므로 바닥을 위협하지 않는다.)
 */

import { readFileSync } from 'node:fs'
import { roleReason } from '@core/validator'
import type { Tables, Word } from '@core/types'
import { EARLY_WORDS, GROW_WORDS, makeEarlyTables, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { TABLES } from '@data/tables'

// 이 태그가 하나라도 충돌 쌍에 등장하면, 앞 선택에 따라 차단될 여지가 있다.
function tagInAnyConflict(tag: string, t: Tables): boolean {
  return t.conflicts.some((c) => c.a === tag || c.b === tag)
}

// 선택 순서와 무관하게 이 단어가 이 슬롯에서 절대 차단 불가한가?
function alwaysSelectable(word: Word, slotIndex: number, t: Tables): boolean {
  if (roleReason(word, t.template.slots[slotIndex])) return false
  return !word.tags.some((tag) => tagInAnyConflict(tag, t))
}

interface Violation {
  set: string
  slot: string
}

function checkTables(name: string, t: Tables): Violation[] {
  const out: Violation[] = []
  t.template.slots.forEach((s, i) => {
    const pool = t.words[s.key] ?? []
    const floor = pool.filter((w) => alwaysSelectable(w, i, t))
    const mark = floor.length ? '통과' : '위반'
    console.log(
      `  ${mark}  ${name} · ${s.label}(${s.key}) — 중립 바닥 ${floor.length}/${pool.length}` +
        (floor.length ? ` (예: ${floor[0].text})` : ' ← 항상 고를 단어가 없다!'),
    )
    if (!floor.length) out.push({ set: name, slot: s.key })
  })
  return out
}

/**
 * 일러스트 연결 검사 — 단어의 art 키가 실제로 등록돼 있는가.
 * assets/index.ts는 png를 import하므로 tsx로 못 읽는다. 키만 텍스트로 뽑아 대조한다.
 * (CSV 헤더가 깨져 art 열이 통째로 사라진 적이 있어 이 검사를 남긴다.)
 */
function checkArt(): string[] {
  const src = readFileSync(new URL('../assets/index.ts', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('export const SKILL_ART'), src.indexOf('export const FONT_URL'))
  const keys = new Set([...block.matchAll(/'(\d+)':/g)].map((m) => m[1]))
  const words = [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...PUNCT_WORDS, ...GROW_WORDS]

  const broken = words.filter((w) => w.art && !keys.has(w.art))
  const noArt = words.filter((w) => !w.art)
  const used = new Set(words.map((w) => w.art).filter(Boolean))
  const unused = [...keys].filter((k) => !used.has(k))

  console.log(`\n일러스트 연결 — 등록 ${keys.size}개 · 사용 ${used.size}개`)
  for (const w of broken) console.log(`  위반  ${w.slot}/${w.text} → art '${w.art}' 미등록`)
  if (noArt.length) console.log(`  참고  일러스트 없는 단어 ${noArt.length}개: ${noArt.map((w) => w.text).join(' · ')}`)
  if (unused.length) console.log(`  참고  안 쓰이는 키: ${unused.join(' · ')}`)
  if (!broken.length) console.log('  통과  깨진 art 키 없음')
  return broken.map((w) => `${w.slot}/${w.text}`)
}

console.log('슬롯 중립 바닥 검사 (막다른 슬롯 방지)\n')
const violations = [
  ...checkTables('초기', makeEarlyTables()),
  ...checkTables('전체', TABLES),
]
const brokenArt = checkArt()

if (violations.length || brokenArt.length) {
  if (violations.length) console.log(`\n위반 ${violations.length}건 — 해당 슬롯에 태그 없는 중립 단어를 추가하라.`)
  if (brokenArt.length) console.log(`일러스트 위반 ${brokenArt.length}건 — assets/index.ts의 SKILL_ART에 키를 등록하라.`)
  process.exit(1)
}
console.log('\n모든 슬롯에 중립 바닥 확보 · 일러스트 키 전부 연결됨.')
