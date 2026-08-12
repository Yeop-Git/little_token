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
  CARD_POOL_RARITY_QUOTA,
  MULT_BUDGET,
  expectedMult,
  hasBudget,
  hasModifierTactic,
  hasModifierActionTactic,
  hasStrongModifierScale,
  hasVerbTactic,
  modifierKeywordCount,
  verbCoefBudget,
} from '@core/budget'
import { numericNoteParts, wordNoteText } from '@core/wordText'
import { wordKeywords } from '@core/wordKeywords'
import { recommendedWordInkCost } from '@core/ink'
import { defaultPlayer, type OwnedItem } from '@core/player'
import type { PassiveId } from '@core/passives'
import { RARITY_LABEL, type Tables, type Word } from '@core/types'
import {
  EARLY_WORDS,
  GROW_WORDS,
  isLentWord,
  LEGENDARY_REWARD_WORDS,
  makeEarlyTables,
  PUNCT_WORDS,
  REWARD_WORDS,
  tablesForEncounter,
} from '@data/earlyWords'
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
  const lentWords = ['mantis', 'queenBee', 'elderSpider']
    .flatMap((enemyId) => tablesForEncounter(makeEarlyTables(), enemyId).words.verb ?? [])
    .filter(isLentWord)
  // 전투 규칙 카드와 보스 대여 카드도 실제 화면에 나온다. CSV 바깥에서 정의되므로
  // 여기서 명시적으로 합쳐 새 전용 일러스트의 누락을 함께 잡는다.
  const words = [
    ...Object.values(EARLY_WORDS).flat(),
    ...REWARD_WORDS,
    ...SPECIAL_REWARD_WORDS,
    ...PUNCT_WORDS,
    ...GROW_WORDS,
    ...lentWords,
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

/** 일반 런 동사는 서술어 하나, 뜻이 흐려질 때만 목적어 하나까지 허용한다. */
function checkVerbWording(): string[] {
  const lentWords = ['mantis', 'queenBee', 'elderSpider']
    .flatMap((enemyId) => tablesForEncounter(makeEarlyTables(), enemyId).words.verb ?? [])
    .filter(isLentWord)
  const seen = new Set<string>()
  const verbs = [
    ...(EARLY_WORDS.verb ?? []),
    ...REWARD_WORDS.filter((word) => word.slot === 'verb'),
    ...SPECIAL_REWARD_WORDS.filter((word) => word.slot === 'verb'),
    ...LEGENDARY_REWARD_WORDS.filter((word) => word.slot === 'verb'),
    ...lentWords,
  ].filter((word) => {
    if (seen.has(word.id)) return false
    seen.add(word.id)
    return true
  })
  const verbose = verbs.filter((word) => word.text.trim().split(/\s+/).length > 2)
  console.log(`\n동사 문구 — 서술어 단독 또는 목적어+서술어 ${verbs.length - verbose.length}/${verbs.length}장`)
  for (const word of verbose) console.log(`  위반  ${word.id} → 「${word.text}」`)
  if (!verbose.length) console.log('  통과  불필요한 부사·연결절이 붙은 동사 없음')
  return verbose.map((word) => word.id)
}

/**
 * 등급 예산 검사 — 등급은 상한이 아니라 **예산**이라는 계약(`src/core/budget.ts`)을
 * 실제 데이터로 검증한다. 셋을 본다.
 *   ① 주어 배율은 등급 예산 ±오차, 수식어는 공개 전술만 가지며 고비용은 강계수·복합형이다.
 *   ② 일반 동사는 행동 종류·참조 스탯·등급 계수·잉크 비용만 가진다.
 *   ③ 초기 덱의 일반 정원(주어 1 · 수식 3 · 동사 3) — 일반 쌍둥이 방지.
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
  console.log(`\n등급 예산 검사 — 일반 ${MULT_BUDGET.common} · 희귀 ${MULT_BUDGET.rare} · 영웅 ${MULT_BUDGET.epic}`)

  for (const { slot, w, pool } of [...early, ...reward, ...special]) {
    const rarity = w.rarity ?? 'common'
    if (w.inkCost != null) {
      const recommendedCost = recommendedWordInkCost(w)
      if (w.inkCost !== recommendedCost) {
        out.push(`${pool}/${w.text}: ink cost ${w.inkCost}, formula requires ${recommendedCost}`)
        console.log(`  위반  ${pool} · ${w.text} — 잉크 ${w.inkCost}, 기능 공식은 ${recommendedCost}`)
      }
    }
    if (slot === 'adv') {
      const keywordCount = modifierKeywordCount(w)
      const minRequired = rarity === 'common' ? 1 : rarity === 'rare' ? 1 : 2
      const maxAllowed = rarity === 'common' ? 1 : 2
      if (keywordCount < minRequired || keywordCount > maxAllowed) {
        out.push(`${pool}/${w.text}: ${rarity} modifier has ${keywordCount} functions, requires ${minRequired}-${maxAllowed}`)
        console.log(`  위반  ${pool} · ${w.text} — ${RARITY_LABEL[rarity]} 수식어는 기능 ${minRequired}~${maxAllowed}개여야 하지만 ${keywordCount}개다`)
      }
    }
    if (!hasBudget(rarity)) continue // 전설 = 규칙 카드. 수치 예산이 없다.
    if (slot === 'adv') {
      const staleStats = w.stat != null
      if (staleStats) {
        out.push(`${pool}/${w.text}: 수식어에 대성공·룰렛 스탯이 남아 있다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어는 대성공·룰렛 스탯을 가질 수 없다`)
      }
      if (!hasModifierTactic(w)) {
        out.push(`${pool}/${w.text}: 공개 전술 기능이 없다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어에는 전술 기능이 최소 하나 필요하다`)
      }
      if (hasModifierActionTactic(w)) {
        out.push(`${pool}/${w.text}: modifier contains a verb-only action keyword`)
        console.log(`  위반  ${pool} · ${w.text} — 직접 행동 키워드는 동사에만 둘 수 있다`)
      }
      if ((w.effects?.guard ?? 0) > 0 || (w.effects?.heal ?? 0) > 0) {
        out.push(`${pool}/${w.text}: 수식어가 방어·회복 수치를 직접 만든다`)
        console.log(`  위반  ${pool} · ${w.text} — 방어·회복 수치는 동사만 만들 수 있다`)
      }
      if (w.inkCost == null) {
        out.push(`${pool}/${w.text}: 명시 잉크 비용이 없다`)
        console.log(`  위반  ${pool} · ${w.text} — 수식어 전술에는 명시 잉크 비용이 필요하다`)
      }
      if ((w.inkCost ?? 0) >= 3 && modifierKeywordCount(w) < 2 && !hasStrongModifierScale(w)) {
        out.push(`${pool}/${w.text}: 고비용인데 복합 키워드나 높은 계수가 없다`)
        console.log(`  위반  ${pool} · ${w.text} — 3잉크 수식어는 복합 키워드 또는 높은 계수가 필요하다`)
      }
      if (modifierKeywordCount(w) > 2) {
        out.push(`${pool}/${w.text}: modifier has more than two functions`)
        console.log(`  VIOLATION  ${pool} · ${w.text} — modifiers may have at most two functions`)
      }
      if ((w.effects?.magicShield ?? 0) > 0 && (w.inkCost ?? 0) < 4) {
        out.push(`${pool}/${w.text}: magic shield modifier costs less than 4 ink`)
        console.log(`  VIOLATION  ${pool} · ${w.text} — magic shield modifiers cost at least 4 ink`)
      }
      if ((w.effects?.inkDiscount ?? 0) > 0 && (w.inkCost ?? 0) >= (w.effects?.inkDiscount ?? 0)) {
        out.push(`${pool}/${w.text}: ink discount does not exceed its own cost`)
        console.log(`  VIOLATION  ${pool} · ${w.text} — ink discount must exceed its own ink cost`)
      }
      continue
    }
    if (slot === 'verb' || slot === 'verb2') {
      if (w.statMult == null) continue
      if (hasVerbTactic(w)) {
        out.push(`${pool}/${w.text}: 일반 동사에 수식어 전술 기능이 남아 있다`)
        console.log(`  위반  ${pool} · ${w.text} — 일반 동사는 행동·스탯·계수·비용만 가져야 한다`)
      }
      if (!w.stat || !w.kind || w.inkCost == null) {
        out.push(`${pool}/${w.text}: 동사 정체성 필드가 빠졌다`)
        console.log(`  위반  ${pool} · ${w.text} — stat · kind · inkCost를 모두 명시해야 한다`)
      }
      const got = w.statMult
      const want = verbCoefBudget(rarity, w)
      const canonicalStat = w.kind === 'guard' ? 'guard' : w.kind === 'heal' ? 'heal' : 'atk'
      if (w.stat !== canonicalStat) {
        out.push(`${pool}/${w.text}: verb uses ${String(w.stat)} instead of ${canonicalStat}`)
        console.log(`  VIOLATION  ${pool} · ${w.text} — ${w.kind} verbs must use ${canonicalStat}`)
      }
      const off = Math.max(0, got - want)
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

  // 성장·대여 카드를 빼고 실제 보상에 쓰는 풀의 등급 비율을 4:3:2:1 근사로 고정한다.
  const catalog = [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...SPECIAL_REWARD_WORDS]
  for (const [slot, quota] of Object.entries(CARD_POOL_RARITY_QUOTA)) {
    const slotWords = catalog.filter((word) => word.slot === slot)
    for (const rarity of ['common', 'rare', 'epic', 'legendary'] as const) {
      const count = slotWords.filter((word) => (word.rarity ?? 'common') === rarity).length
      const mark = count === quota[rarity] ? '통과' : '위반'
      console.log(`  ${mark}  카드풀 · ${slot} ${RARITY_LABEL[rarity]} ${count}/${quota[rarity]}장`)
      if (count !== quota[rarity]) out.push(`카드풀/${slot}: ${rarity} ${count}장 (목표 ${quota[rarity]}장)`)
    }
  }

  const emotions = ['joy', 'anger', 'sorrow', 'pleasure'] as const
  for (const slot of ['subj', 'adv', 'verb'] as const) {
    const slotWords = catalog.filter((word) => word.slot === slot)
    const counts = emotions.map((emotion) => slotWords.filter((word) => word.emotion === emotion).length)
    const balanced = Math.max(...counts) - Math.min(...counts) <= 1
    console.log(`  ${balanced ? '통과' : '위반'}  카드풀 · ${slot} 감정 ${emotions.map((emotion, i) => `${emotion} ${counts[i]}`).join(' · ')}`)
    if (!balanced) out.push(`카드풀/${slot}: 감정 분포 ${counts.join('/')}`)
  }

  const verbs = catalog.filter((word) => word.slot === 'verb')
  const actionKinds = ['attack', 'guard', 'heal'] as const
  const actionCounts = actionKinds.map((kind) => verbs.filter((word) => word.kind === kind).length)
  if (Math.max(...actionCounts) - Math.min(...actionCounts) > 1) {
    out.push(`카드풀/verb: 행동 분포 ${actionCounts.join('/')}`)
  }
  console.log(`  ${Math.max(...actionCounts) - Math.min(...actionCounts) <= 1 ? '통과' : '위반'}  동사 행동 · ${actionKinds.map((kind, i) => `${kind} ${actionCounts[i]}`).join(' · ')}`)
  for (const kind of actionKinds) {
    const counts = emotions.map((emotion) => verbs.filter((word) => word.kind === kind && word.emotion === emotion).length)
    const balanced = Math.min(...counts) > 0 && Math.max(...counts) - Math.min(...counts) <= 1
    console.log(`  ${balanced ? '통과' : '위반'}  ${kind} 감정 · ${emotions.map((emotion, i) => `${emotion} ${counts[i]}`).join(' · ')}`)
    if (!balanced) out.push(`카드풀/${kind}: 감정 분포 ${counts.join('/')}`)
  }

  const keywordCounts = new Map<string, number>()
  for (const word of catalog) {
    const keywords = wordKeywords(word)
    for (const keyword of keywords) keywordCounts.set(keyword.id, (keywordCounts.get(keyword.id) ?? 0) + 1)
    const effects = word.effects as Record<string, unknown> | undefined
    for (const removed of ['bonusDraws', 'overdrawHitCount', 'carryInk', 'enemyAttackRank']) {
      if (effects?.[removed] != null) out.push(`카드풀/${word.text}: 폐지된 효과 ${removed}가 남아 있다`)
    }
    for (const keyword of keywords.filter((entry) => entry.id === 'empower' || entry.id === 'guardEmpower')) {
      if (!keyword.detail.includes('현재 스테이지 동안')) {
        out.push(`카드풀/${word.text}: 랭크 툴팁에 현재 스테이지 지속 범위가 없다`)
      }
    }
  }
  const singletonKeywords = [...keywordCounts].filter(([, count]) => count < 2).map(([keyword]) => keyword)
  console.log(`  ${singletonKeywords.length ? '위반' : '통과'}  기능 키워드 재사용 · ${[...keywordCounts].map(([keyword, count]) => `${keyword} ${count}`).join(' · ')}`)
  if (singletonKeywords.length) out.push(`카드풀: 한 번만 쓰인 기능 키워드 ${singletonKeywords.join(', ')}`)

  for (const word of catalog.filter((entry) => entry.rarity === 'epic' || entry.rarity === 'legendary')) {
    const distinctive = word.slot === 'subj'
      ? !!word.variance || wordKeywords(word).length > 0
      : word.slot === 'adv'
        ? modifierKeywordCount(word) >= 2
        : wordKeywords(word).length > 0
          || (word.targetCount !== undefined && word.targetCount !== 1)
          || (word.statMult ?? 0) >= 3
    if (!distinctive) out.push(`카드풀/${word.text}: ${word.rarity} 카드에 고유 규칙이 없다`)
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
const verboseVerbs = checkVerbWording()
const budget = checkBudget()
const grow = checkGrowthRules()

if (violations.length || brokenArt.length || verboseVerbs.length || budget.length || grow.length) {
  if (violations.length) console.log(`\n위반 ${violations.length}건 — 해당 슬롯에 태그 없는 중립 단어를 추가하라.`)
  if (brokenArt.length) console.log(`일러스트 위반 ${brokenArt.length}건 — assets/index.ts의 SKILL_ART에 키를 등록하라.`)
  if (verboseVerbs.length) console.log(`동사 문구 위반 ${verboseVerbs.length}건 — 서술어 하나 또는 목적어+서술어로 줄여라.`)
  if (budget.length) console.log(`예산 위반 ${budget.length}건 — words.csv의 수치나 rarity를 고쳐라(기준: src/core/budget.ts).`)
  if (grow.length) console.log(`무럭무럭 위반 ${grow.length}건 — 하늘나물 패시브와 보상 카드 분리를 확인하라.`)
  process.exit(1)
}
console.log('\n모든 슬롯에 중립 바닥 확보 · 일러스트 키 전부 연결됨 · 등급 예산 일치 · 성장 패시브/보상 분리.')
