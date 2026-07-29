import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { emotionFor } from '../src/data/emotions'

type Row = Record<string, string>
// punct — 올림프의 당근이 여는 문장부호 풀 · grow — 잭과 숙주나물이 뿌리는 무럭무럭 풀.
type Pool = 'early' | 'reward' | 'expansion' | 'punct' | 'grow'
const POOLS: Pool[] = ['early', 'reward', 'expansion', 'punct', 'grow']

const csvDir = fileURLToPath(new URL('../src/data/csv/', import.meta.url))
const outputDir = fileURLToPath(new URL('../src/data/generated/', import.meta.url))
const outputFile = fileURLToPath(new URL('../src/data/generated/sentenceData.ts', import.meta.url))
const itemOutputFile = fileURLToPath(new URL('../src/data/generated/itemData.ts', import.meta.url))

function parseCsv(source: string, fileName: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (quoted) throw new Error(`${fileName}: 닫히지 않은 큰따옴표가 있습니다.`)
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''))
    rows.push(row)
  }

  const [header, ...body] = rows
  if (!header?.length) throw new Error(`${fileName}: 헤더가 없습니다.`)

  // 헤더 키에 공백·CR이 섞이면 그 열이 통째로 조용히 사라진다(예: 'art\r' → row.art 없음).
  // 조용한 데이터 유실이 제일 잡기 어려우므로 여기서 바로 세운다.
  const clean = header.map((key) => key.replace(/^﻿/, '').trim())
  const dirty = header.filter((key, i) => key.replace(/^﻿/, '') !== clean[i])
  if (dirty.length) {
    throw new Error(`${fileName}: 헤더에 공백/CR이 섞였습니다 — ${JSON.stringify(dirty)}. 줄바꿈을 LF로 저장하세요.`)
  }
  const dup = clean.filter((key, i) => clean.indexOf(key) !== i)
  if (dup.length) throw new Error(`${fileName}: 헤더 열 이름이 중복입니다 — ${dup.join(', ')}`)

  return body.map((values, index) => {
    if (values.length !== header.length) {
      throw new Error(`${fileName}:${index + 2}: 열 개수가 ${values.length}개입니다. 헤더는 ${header.length}개입니다.`)
    }
    return Object.fromEntries(clean.map((key, column) => [key, values[column]]))
  })
}

function load(name: string): Row[] {
  // CRLF로 저장된 파일(윈도우·git autocrlf)도 같은 결과를 내야 한다.
  // 줄 끝 CR이 남으면 마지막 열 이름이 오염돼 그 열이 통째로 사라진다.
  const source = readFileSync(`${csvDir}${name}`, 'utf8').replace(/\r\n/g, '\n')
  return parseCsv(source, name)
}

function required(row: Row, key: string, file: string, line: number): string {
  const value = row[key]?.trim()
  if (!value) throw new Error(`${file}:${line}: ${key} 값이 필요합니다.`)
  return value
}

function optionalNumber(value: string | undefined, file: string, line: number, key: string): number | undefined {
  if (value == null || value.trim() === '') return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${file}:${line}: ${key} 값 '${value}'은 숫자가 아닙니다.`)
  return parsed
}

function optionalBoolean(value: string | undefined, file: string, line: number, key: string): boolean | undefined {
  if (value == null || value.trim() === '') return undefined
  if (value === '1' || value.toLowerCase() === 'true') return true
  if (value === '0' || value.toLowerCase() === 'false') return false
  throw new Error(`${file}:${line}: ${key} 값 '${value}'은 0/1 또는 true/false여야 합니다.`)
}

function requiredNumber(row: Row, key: string, file: string, line: number): number {
  return optionalNumber(required(row, key, file, line), file, line, key)!
}

function poolOf(row: Row, file: string, line: number): Pool {
  const pool = required(row, 'pool', file, line)
  if (!POOLS.includes(pool as Pool)) {
    throw new Error(`${file}:${line}: 알 수 없는 pool '${pool}'입니다. (${POOLS.join('/')})`)
  }
  return pool as Pool
}

const emptyByPool = <T>(): Record<Pool, T[]> =>
  Object.fromEntries(POOLS.map((p) => [p, []])) as Record<Pool, T[]>

const STATS = ['atk', 'guard', 'heal', 'luck']
function statOf(row: Row, file: string, line: number): string | undefined {
  const value = row.stat?.trim()
  if (!value) return undefined
  if (!STATS.includes(value)) throw new Error(`${file}:${line}: 알 수 없는 stat '${value}'입니다. (${STATS.join('/')})`)
  return value
}

const ITEM_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
const PASSIVE_IDS = ['echo', 'punct', 'twinVerb', 'retry', 'twinSubj', 'heavyShoe', 'matchFire', 'luckCloak', 'bbq', 'doubt', 'beanstalk'] as const

const PERSONS = ['first', 'second', 'third']
function personOf(row: Row, file: string, line: number): string | undefined {
  const value = row.person?.trim()
  if (!value) return undefined
  if (!PERSONS.includes(value)) throw new Error(`${file}:${line}: 알 수 없는 person '${value}'입니다. (${PERSONS.join('/')})`)
  return value
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

// 기존 CSV는 감정 열이 생기기 전부터 축적됐다. 현재 태그를 기준으로 한 번만
// 안정적으로 분류해 모든 카드가 런타임에서는 단일 감정 속성을 갖게 한다.
const wordRows = load('words.csv')
const tacticRows = load('card_tactics.csv')
const tactics = new Map(tacticRows.map((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'card_tactics.csv', line)
  const id = required(row, 'id', 'card_tactics.csv', line)
  return [`${pool}:${id}`, { row, line }] as const
}))
const ids = new Set<string>()
const wordsByPool = emptyByPool<Record<string, unknown>>()

wordRows.forEach((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'words.csv', line)
  const id = required(row, 'id', 'words.csv', line)
  const uniqueId = `${pool}:${id}`
  if (ids.has(uniqueId)) throw new Error(`words.csv:${line}: ${uniqueId}가 중복되었습니다.`)
  ids.add(uniqueId)

  const tactic = tactics.get(uniqueId)
  const tacticRow = tactic?.row ?? {}
  const tacticLine = tactic?.line ?? line

  const effects = compact({
    guard: optionalNumber(tacticRow.guard ?? row.guard, tacticRow.guard ? 'card_tactics.csv' : 'words.csv', tacticLine, 'guard'),
    heal: optionalNumber(tacticRow.heal ?? row.heal, tacticRow.heal ? 'card_tactics.csv' : 'words.csv', tacticLine, 'heal'),
    recoil: optionalNumber(row.recoil, 'words.csv', line, 'recoil'),
    evade: optionalNumber(row.evade, 'words.csv', line, 'evade'),
    pierceGuard: optionalBoolean(tacticRow.pierce_guard, 'card_tactics.csv', tacticLine, 'pierce_guard'),
    hitCount: optionalNumber(tacticRow.hit_count, 'card_tactics.csv', tacticLine, 'hit_count'),
    castCount: optionalNumber(tacticRow.cast_count, 'card_tactics.csv', tacticLine, 'cast_count'),
    castScale: optionalNumber(tacticRow.cast_scale, 'card_tactics.csv', tacticLine, 'cast_scale'),
    overdrawHitCount: optionalNumber(tacticRow.overdraw_hit_count, 'card_tactics.csv', tacticLine, 'overdraw_hit_count'),
    counterMultiplier: optionalNumber(tacticRow.counter_multiplier, 'card_tactics.csv', tacticLine, 'counter_multiplier'),
    inkDiscount: optionalNumber(tacticRow.ink_discount, 'card_tactics.csv', tacticLine, 'ink_discount'),
    carryInk: optionalNumber(tacticRow.carry_ink, 'card_tactics.csv', tacticLine, 'carry_ink'),
    enemyAttackDown: optionalNumber(tacticRow.enemy_attack_down, 'card_tactics.csv', tacticLine, 'enemy_attack_down'),
    drawCards: optionalNumber(tacticRow.draw_cards, 'card_tactics.csv', tacticLine, 'draw_cards'),
  })
  const variance = compact({
    p: optionalNumber(row.variance_p, 'words.csv', line, 'variance_p'),
    hi: optionalNumber(row.variance_hi, 'words.csv', line, 'variance_hi'),
    lo: optionalNumber(row.variance_lo, 'words.csv', line, 'variance_lo'),
  })
  const varianceCount = Object.keys(variance).length
  if (varianceCount !== 0 && varianceCount !== 3) {
    throw new Error(`words.csv:${line}: variance_p, variance_hi, variance_lo는 모두 함께 입력해야 합니다.`)
  }

  const tags = row.tags ? row.tags.split('|').filter(Boolean) : []
  if (optionalBoolean(tacticRow.preempt, 'card_tactics.csv', tacticLine, 'preempt')) tags.push('preempt')
  wordsByPool[pool].push(compact({
    id,
    text: required(row, 'text', 'words.csv', line),
    slot: required(row, 'slot', 'words.csv', line),
    tags,
    emotion: emotionFor(pool, id),
    inkCost: optionalNumber(tacticRow.ink_cost ?? row.ink_cost, tactic ? 'card_tactics.csv' : 'words.csv', tacticLine, 'ink_cost'),
    power: optionalNumber(row.power, 'words.csv', line, 'power'),
    stat: statOf(row, 'words.csv', line),
    statMult: optionalNumber(row.stat_mult, 'words.csv', line, 'stat_mult'),
    person: personOf(row, 'words.csv', line),
    bonus: optionalNumber(row.bonus, 'words.csv', line, 'bonus'),
    crit: optionalNumber(row.crit, 'words.csv', line, 'crit'),
    fail: optionalNumber(row.fail, 'words.csv', line, 'fail'),
    growHp: optionalNumber(row.grow_hp, 'words.csv', line, 'grow_hp'),
    kind: row.kind || undefined,
    timing: row.timing || undefined,
    targetMode: row.target_mode || undefined,
    aoe: tacticRow.aoe || row.aoe || undefined,
    targetCount: tacticRow.target_count === 'all'
      ? 'all'
      : optionalNumber(tacticRow.target_count, 'card_tactics.csv', tacticLine, 'target_count'),
    rarity: row.rarity || undefined,
    art: row.art || undefined,
    note: required(row, 'note', 'words.csv', line),
    lore: row.lore || undefined,
    effects: Object.keys(effects).length ? effects : undefined,
    variance: varianceCount ? variance : undefined,
  }))
})

for (const key of tactics.keys()) {
  if (!ids.has(key)) throw new Error(`card_tactics.csv: words.csv에 없는 카드 '${key}'입니다.`)
}

function groupWords(words: Record<string, unknown>[]): Record<string, Record<string, unknown>[]> {
  const grouped: Record<string, Record<string, unknown>[]> = {}
  for (const word of words) {
    const slot = String(word.slot)
    ;(grouped[slot] ??= []).push(word)
  }
  return grouped
}

const comboRows = load('combos.csv')
const combosByPool = emptyByPool<Record<string, unknown>>()
comboRows.forEach((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'combos.csv', line)
  combosByPool[pool].push(compact({
    id: required(row, 'id', 'combos.csv', line),
    name: required(row, 'name', 'combos.csv', line),
    need: required(row, 'need', 'combos.csv', line).split('|'),
    mult: optionalNumber(required(row, 'mult', 'combos.csv', line), 'combos.csv', line, 'mult'),
    flavor: row.flavor || undefined,
  }))
})

const conflictRows = load('conflicts.csv')
const conflictsByPool = emptyByPool<Record<string, unknown>>()
conflictRows.forEach((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'conflicts.csv', line)
  conflictsByPool[pool].push({
    a: required(row, 'a', 'conflicts.csv', line),
    b: required(row, 'b', 'conflicts.csv', line),
    reason: required(row, 'reason', 'conflicts.csv', line),
  })
})

const dissonanceRows = load('dissonances.csv')
const dissonancesByPool = emptyByPool<Record<string, unknown>>()
dissonanceRows.forEach((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'dissonances.csv', line)
  dissonancesByPool[pool].push({
    a: required(row, 'a', 'dissonances.csv', line),
    b: required(row, 'b', 'dissonances.csv', line),
    penalty: optionalNumber(required(row, 'penalty', 'dissonances.csv', line), 'dissonances.csv', line, 'penalty'),
    reason: required(row, 'reason', 'dissonances.csv', line),
  })
})

const serialize = (value: unknown) => JSON.stringify(value, null, 2)
const generated = `/**
 * AUTO-GENERATED by scripts/generate-sentence-data.ts.
 * Edit src/data/csv/*.csv instead of this file.
 */
import type { Combo, Conflict, Dissonance, Word } from '@core/types'

export const EARLY_WORDS: Record<string, Word[]> = ${serialize(groupWords(wordsByPool.early))}

export const REWARD_WORDS: Word[] = ${serialize(wordsByPool.reward)}

export const WORDS: Record<string, Word[]> = ${serialize(groupWords(wordsByPool.expansion))}

/** 문장부호 — 아이템 패시브 '올림프의 당근'이 열어 주는 슬롯 전용 풀. */
export const PUNCT_WORDS: Word[] = ${serialize(wordsByPool.punct)}

/** 무럭무럭 — '잭의 하늘나물'이 각 슬롯에 한 장씩 뿌리는 성장 카드. */
export const GROW_WORDS: Word[] = ${serialize(wordsByPool.grow)}

export const EARLY_COMBOS: Combo[] = ${serialize(combosByPool.early)}

export const COMBOS: Combo[] = ${serialize(combosByPool.expansion)}

export const EARLY_CONFLICTS: Conflict[] = ${serialize(conflictsByPool.early)}

export const CONFLICTS: Conflict[] = ${serialize(conflictsByPool.expansion)}

export const EARLY_DISSONANCES: Dissonance[] = ${serialize(dissonancesByPool.early)}

export const DISSONANCES: Dissonance[] = ${serialize(dissonancesByPool.expansion)}
`

const itemRows = load('items.csv')
const itemIds = new Set<string>()
const itemRarityCounts = Object.fromEntries(ITEM_RARITIES.map((rarity) => [rarity, 0])) as Record<(typeof ITEM_RARITIES)[number], number>
const statItems: Record<string, unknown> = {}
const ruleItems: Record<string, unknown> = {}

itemRows.forEach((row, index) => {
  const line = index + 2
  const id = required(row, 'id', 'items.csv', line)
  if (itemIds.has(id)) throw new Error(`items.csv:${line}: id '${id}'가 중복되었습니다.`)
  itemIds.add(id)

  const rarity = required(row, 'rarity', 'items.csv', line)
  if (!ITEM_RARITIES.includes(rarity as (typeof ITEM_RARITIES)[number])) {
    throw new Error(`items.csv:${line}: 알 수 없는 rarity '${rarity}'입니다. (${ITEM_RARITIES.join('/')})`)
  }
  const typedRarity = rarity as (typeof ITEM_RARITIES)[number]
  itemRarityCounts[typedRarity]++

  const base = {
    hp: requiredNumber(row, 'hp', 'items.csv', line),
    atk: requiredNumber(row, 'atk', 'items.csv', line),
    guard: requiredNumber(row, 'guard', 'items.csv', line),
    heal: requiredNumber(row, 'heal', 'items.csv', line),
    luck: requiredNumber(row, 'luck', 'items.csv', line),
  }
  if (Object.values(base).some((value) => value < 0 || !Number.isInteger(value))) {
    throw new Error(`items.csv:${line}: 기본 스탯은 0 이상의 정수여야 합니다.`)
  }

  const passive = row.passive?.trim() || undefined
  const budget = base.hp / 2 + base.atk + base.guard + base.heal + base.luck
  const expectedBudget = typedRarity === 'common' ? 1 : typedRarity === 'rare' ? 2 : 0
  if (budget !== expectedBudget) {
    throw new Error(`items.csv:${line}: ${typedRarity} 기본 스탯 예산은 ${expectedBudget}점이어야 합니다. (현재 ${budget}점)`)
  }
  if (typedRarity === 'common' || typedRarity === 'rare') {
    if (passive) throw new Error(`items.csv:${line}: 노멀·희귀 아이템에는 고유효과를 넣을 수 없습니다.`)
  } else {
    if (!passive || !PASSIVE_IDS.includes(passive as (typeof PASSIVE_IDS)[number])) {
      throw new Error(`items.csv:${line}: 영웅·전설 아이템에는 유효한 passive가 필요합니다.`)
    }
  }

  const item = {
    id,
    name: required(row, 'name', 'items.csv', line),
    rarity: typedRarity,
    art: required(row, 'art', 'items.csv', line),
    base,
    flavor: required(row, 'flavor', 'items.csv', line),
    passive,
  }
  ;(passive ? ruleItems : statItems)[id] = compact(item)
})

if (Math.abs(itemRarityCounts.common - itemRarityCounts.rare) > 1) {
  throw new Error(`items.csv: 노멀·희귀 분포가 고르지 않습니다. (${itemRarityCounts.common}/${itemRarityCounts.rare})`)
}
if (Math.abs(itemRarityCounts.epic - itemRarityCounts.legendary) > 1) {
  throw new Error(`items.csv: 영웅·전설 분포가 고르지 않습니다. (${itemRarityCounts.epic}/${itemRarityCounts.legendary})`)
}

const generatedItems = `/**
 * AUTO-GENERATED by scripts/generate-sentence-data.ts.
 * Edit src/data/csv/items.csv instead of this file.
 */
import type { ItemDef } from '../items'

export const STAT_ITEMS: Record<string, ItemDef> = ${serialize(statItems)}

export const RULE_ITEMS: Record<string, ItemDef> = ${serialize(ruleItems)}
`

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputFile, generated, 'utf8')
writeFileSync(itemOutputFile, generatedItems, 'utf8')
console.log(`CSV 생성 완료: 단어 ${wordRows.length}개 · 관용구 ${comboRows.length}개 · 모순 ${conflictRows.length}개 · 부조화 ${dissonanceRows.length}개 · 아이템 ${itemRows.length}개 (${ITEM_RARITIES.map((rarity) => `${rarity} ${itemRarityCounts[rarity]}`).join(' · ')})`)
