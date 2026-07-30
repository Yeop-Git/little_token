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
import {
  BUDGET_TOLERANCE,
  COMMON_QUOTA,
  MULT_BUDGET,
  expectedMult,
  hasBudget,
  hasModifierTactic,
  tacticalVerbBudget,
  tacticalVerbPower,
  verbCoefBudget,
} from '@core/budget'
import { numericNoteParts, wordNoteText } from '@core/wordText'
import { defaultPlayer, type OwnedItem } from '@core/player'
import type { PassiveId } from '@core/passives'
import { RARITY_LABEL, type Tables, type Word } from '@core/types'
import { EARLY_WORDS, GROW_WORDS, LEGENDARY_REWARD_WORDS, makeEarlyTables, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
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
 * assets/index.ts는 이미지 파일을 import하므로 tsx로 못 읽는다. 키만 텍스트로 뽑아 대조한다.
 * (CSV 헤더가 깨져 art 열이 통째로 사라진 적이 있어 이 검사를 남긴다.)
 */
function checkArt(): string[] {
  const src = readFileSync(new URL('../assets/index.ts', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('export const SKILL_ART'), src.indexOf('export const FONT_URL'))
  const keys = new Set([...block.matchAll(/'(\d+)':/g)].map((m) => m[1]))
  // 전투 규칙 카드(SPECIAL_REWARD_WORDS)도 보상으로 실제 나오는 카드다. 예전엔 여기서
  // 빠져 있어서 동사 열두 장이 일러스트 없이 도는 걸 이 검사가 못 잡았다.
  const words = [
    ...Object.values(EARLY_WORDS).flat(),
    ...REWARD_WORDS,
    ...SPECIAL_REWARD_WORDS,
    ...PUNCT_WORDS,
    ...GROW_WORDS,
  ]

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

/**
 * 등급 예산 검사 — 등급은 상한이 아니라 **예산**이라는 계약(`src/core/budget.ts`)을
 * 실제 데이터로 검증한다. 셋을 본다.
 *   ① 주어 배율은 등급 예산 ±오차, 수식어는 배율·대성공 없이 전술 기능만 가진다.
 *   ② 동사 칸: 스탯 계수가 등급 계수(전체 적중이면 깎인 값)와 같다.
 *   ③ 초기 덱의 노멀 정원(주어 1 · 수식 3 · 동사 3) — 노멀 쌍둥이 방지.
 * 여기에 카드 문구(`note`)가 실제 수치를 빠뜨리지 않았는지도 함께 본다.
 * 5슬롯 확장 데이터는 고정 위력 등 옛 규칙이 남아 있어 대상에서 뺀다(보존 자료).
 */
/** 화면에 나올 수 있는 모든 카드 — 문구 조립 규칙은 확장·규칙 카드까지 전부 지켜야 한다. */
function allWords(): { w: Word; pool: string }[] {
  const seen = new Set<string>()
  return [
    ...Object.values(EARLY_WORDS).flat().map((w) => ({ w, pool: '초기' })),
    ...REWARD_WORDS.map((w) => ({ w, pool: '보상' })),
    ...SPECIAL_REWARD_WORDS.map((w) => ({ w, pool: '규칙' })),
    ...GROW_WORDS.map((w) => ({ w, pool: '성장' })),
    ...PUNCT_WORDS.map((w) => ({ w, pool: '문장부호' })),
    ...Object.values(TABLES.words).flat().map((w) => ({ w, pool: '확장' })),
  ].filter(({ w }) => {
    const key = `${w.slot}:${w.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function checkBudget(): string[] {
  const out: string[] = []
  const early = Object.entries(EARLY_WORDS).flatMap(([slot, list]) => list.map((w) => ({ slot, w, pool: '초기' })))
  const reward = REWARD_WORDS.map((w) => ({ slot: w.slot, w, pool: '보상' }))
  const special = SPECIAL_REWARD_WORDS.map((w) => ({ slot: w.slot, w, pool: '규칙' }))
  console.log(`\n등급 예산 검사 — 노멀 ${MULT_BUDGET.common} · 희귀 ${MULT_BUDGET.rare} · 영웅 ${MULT_BUDGET.epic}`)

  for (const { slot, w, pool } of [...early, ...reward, ...special]) {
    const rarity = w.rarity ?? 'common'
    if (!hasBudget(rarity)) continue // 전설 = 규칙 카드. 수치 예산이 없다.
    if (slot === 'adv') {
      const staleStats = w.bonus != null || w.crit != null || w.stat != null
      if (staleStats) {
        out.push(`${pool}/${w.text}: 수식어에 배율·대성공·룰렛 스탯이 남아 있다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어는 배율·대성공·룰렛 스탯을 가질 수 없다`)
      }
      if (!hasModifierTactic(w)) {
        out.push(`${pool}/${w.text}: 공개 전술 기능이 없다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어에는 전술 기능이 최소 하나 필요하다`)
      }
      if ((w.effects?.guard ?? 0) > 0 || (w.effects?.heal ?? 0) > 0) {
        out.push(`${pool}/${w.text}: 수식어가 방어·회복 수치를 직접 만든다`)
        console.log(`  위반  ${pool} · ${w.text} — 방어·회복 수치는 동사만 만들 수 있다`)
      }
      if (w.inkCost == null) {
        out.push(`${pool}/${w.text}: 명시 잉크 비용이 없다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어 전술에는 명시 잉크 비용이 필요하다`)
      }
      continue
    }
    if (slot === 'verb' || slot === 'verb2') {
      if (w.statMult == null) continue
      const isTactical = pool === '규칙'
      const got = isTactical ? tacticalVerbPower(w) : w.statMult
      const want = isTactical ? tacticalVerbBudget(w, rarity) : verbCoefBudget(rarity, w.aoe)
      const off = Math.abs(got - want)
      if (off > BUDGET_TOLERANCE) {
        out.push(`${pool}/${w.text}: 실전 총량 ×${got.toFixed(3)} ≠ ${RARITY_LABEL[rarity]} 예산 ×${want}`)
        console.log(`  위반  ${pool} · ${w.text} — 실전 총량 ×${got.toFixed(3)}, ${RARITY_LABEL[rarity]} 예산은 ×${want}`)
      }
      continue
    }
    if (slot === 'obj') continue // 목적어는 고정 위력 슬롯이라 배율 예산 대상이 아니다.
    const got = expectedMult(w)
    const want = MULT_BUDGET[rarity]
    if (Math.abs(got - want) > BUDGET_TOLERANCE) {
      out.push(`${pool}/${w.text}: 기대 배율 ${got.toFixed(3)} ≠ ${RARITY_LABEL[rarity]} 예산 ${want}`)
      console.log(`  위반  ${pool} · ${w.text} — 기대 배율 ${got.toFixed(3)}, ${RARITY_LABEL[rarity]} 예산은 ${want}`)
    }
  }

  // ③ 노멀 정원 — 초기 덱에 노멀이 정원보다 많으면 수치가 같은 쌍둥이가 생긴다.
  for (const [slot, quota] of Object.entries(COMMON_QUOTA)) {
    const commons = (EARLY_WORDS[slot] ?? []).filter((w) => (w.rarity ?? 'common') === 'common')
    const mark = commons.length === quota ? '통과' : '위반'
    console.log(`  ${mark}  초기 · ${slot} 노멀 ${commons.length}/${quota}장 (${commons.map((w) => w.text).join(' · ') || '없음'})`)
    if (commons.length !== quota) out.push(`초기/${slot}: 노멀 ${commons.length}장 (정원 ${quota}장)`)
  }

  // 카드 문구가 수치를 빠뜨리면 화면과 실제가 어긋난다 — 표기도 계약이다.
  for (const { w, pool } of [...early, ...reward, ...special]) {
    const missing = numericNoteParts(w).filter((part) => !w.note.includes(part))
    if (missing.length) {
      out.push(`${pool}/${w.text}: note에 ${missing.join(' · ')} 없음`)
      console.log(`  위반  ${pool} · ${w.text} — note "${w.note}"에 ${missing.join(' · ')}가 없다`)
    }
  }

  // 화면은 note 원문이 아니라 wordNoteText(카드의 현재 값)를 읽는다. 반복강화로
  // 수치가 올라도 문구가 따라오게 하는 장치라, 1단계 원문과 한 글자도 달라지면
  // 조립 규칙이 데이터에서 벗어났다는 뜻이다.
  for (const { w, pool } of allWords()) {
    const derived = wordNoteText(w)
    if (derived !== w.note) {
      out.push(`${pool}/${w.text}: 조립 문구 "${derived}" ≠ note "${w.note}"`)
      console.log(`  위반  ${pool} · ${w.text} — 조립 문구 "${derived}"가 note "${w.note}"와 다르다`)
    }
  }
  if (!out.length) console.log('  통과  모든 카드가 등급 예산·정원·표기 계약을 지킨다')
  return out
}

/** 하늘나물의 전투당 패시브와 보상으로 등록되는 무럭무럭 카드를 서로 섞지 않는다. */
function checkGrowthRules(): string[] {
  const out: string[] = []
  const items: OwnedItem[] = (['beanstalk', 'punct', 'twinSubj', 'twinVerb'] as PassiveId[]).map(
    (passive, i) => ({
      id: `chk${i}`,
      name: passive,
      rarity: 'legendary',
      art: 'gift',
      line: '',
      stats: { hp: 0, atk: 0, guard: 0, heal: 0, luck: 0 },
      passive,
    }),
  )
  const player = { ...defaultPlayer(), items }
  const t = makeEarlyTables(player.deck, player)
  console.log('\n무럭무럭 성장 규칙')
  const injected = t.template.slots.flatMap((s) => (t.words[s.key] ?? []).filter((w) => w.growHp))
  console.log(`  ${injected.length === 0 ? '통과' : '위반'}  하늘나물 아이템이 슬롯에 유령 카드를 넣지 않음`)
  if (injected.length > 0) out.push(`하늘나물이 유령 카드 ${injected.length}장을 주입함`)

  const rewardSlots = new Set(LEGENDARY_REWARD_WORDS.map((word) => word.slot))
  const expectedSlots = ['subj', 'adv', 'verb']
  const rewardCoverage = expectedSlots.every((slot) => rewardSlots.has(slot)) && rewardSlots.size === expectedSlots.length
  console.log(`  ${rewardCoverage ? '통과' : '위반'}  보상 카드가 초반 세 슬롯을 각각 담당`)
  if (!rewardCoverage) out.push(`보상 무럭무럭 슬롯 ${[...rewardSlots].join('/')}`)

  const shapes = new Set(LEGENDARY_REWARD_WORDS.map((w) => `${w.growHp}|${w.rarity}|${w.art}|${w.note}`))
  if (shapes.size > 1) {
    out.push(`보상 무럭무럭 수치가 슬롯마다 다르다(${shapes.size}종)`)
    console.log(`  위반  보상 카드 수치가 다르다 — ${[...shapes].join(' / ')}`)
  }
  return out
}

console.log('슬롯 중립 바닥 검사 (막다른 슬롯 방지)\n')
const violations = [
  ...checkTables('초기', makeEarlyTables()),
  ...checkTables('전체', TABLES),
]
const brokenArt = checkArt()
const budget = checkBudget()
const grow = checkGrowthRules()

if (violations.length || brokenArt.length || budget.length || grow.length) {
  if (violations.length) console.log(`\n위반 ${violations.length}건 — 해당 슬롯에 태그 없는 중립 단어를 추가하라.`)
  if (brokenArt.length) console.log(`일러스트 위반 ${brokenArt.length}건 — assets/index.ts의 SKILL_ART에 키를 등록하라.`)
  if (budget.length) console.log(`예산 위반 ${budget.length}건 — words.csv의 수치나 rarity를 고쳐라(기준: src/core/budget.ts).`)
  if (grow.length) console.log(`무럭무럭 위반 ${grow.length}건 — 하늘나물 패시브와 보상 카드 분리를 확인하라.`)
  process.exit(1)
}
console.log('\n모든 슬롯에 중립 바닥 확보 · 일러스트 키 전부 연결됨 · 등급 예산 일치 · 성장 패시브/보상 분리.')
