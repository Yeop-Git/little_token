import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type Row = Record<string, string>
type Pool = 'early' | 'reward' | 'expansion'

const csvDir = fileURLToPath(new URL('../src/data/csv/', import.meta.url))
const outputDir = fileURLToPath(new URL('../src/data/generated/', import.meta.url))
const outputFile = fileURLToPath(new URL('../src/data/generated/sentenceData.ts', import.meta.url))

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

  return body.map((values, index) => {
    if (values.length !== header.length) {
      throw new Error(`${fileName}:${index + 2}: 열 개수가 ${values.length}개입니다. 헤더는 ${header.length}개입니다.`)
    }
    return Object.fromEntries(header.map((key, column) => [key.replace(/^\uFEFF/, ''), values[column]]))
  })
}

function load(name: string): Row[] {
  return parseCsv(readFileSync(`${csvDir}${name}`, 'utf8'), name)
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

function poolOf(row: Row, file: string, line: number): Pool {
  const pool = required(row, 'pool', file, line)
  if (pool !== 'early' && pool !== 'reward' && pool !== 'expansion') {
    throw new Error(`${file}:${line}: 알 수 없는 pool '${pool}'입니다.`)
  }
  return pool
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

const wordRows = load('words.csv')
const ids = new Set<string>()
const wordsByPool: Record<Pool, Record<string, unknown>[]> = { early: [], reward: [], expansion: [] }

wordRows.forEach((row, index) => {
  const line = index + 2
  const pool = poolOf(row, 'words.csv', line)
  const id = required(row, 'id', 'words.csv', line)
  const uniqueId = `${pool}:${id}`
  if (ids.has(uniqueId)) throw new Error(`words.csv:${line}: ${uniqueId}가 중복되었습니다.`)
  ids.add(uniqueId)

  const effects = compact({
    guard: optionalNumber(row.guard, 'words.csv', line, 'guard'),
    heal: optionalNumber(row.heal, 'words.csv', line, 'heal'),
    recoil: optionalNumber(row.recoil, 'words.csv', line, 'recoil'),
    evade: optionalNumber(row.evade, 'words.csv', line, 'evade'),
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

  wordsByPool[pool].push(compact({
    id,
    text: required(row, 'text', 'words.csv', line),
    slot: required(row, 'slot', 'words.csv', line),
    tags: row.tags ? row.tags.split('|').filter(Boolean) : [],
    power: optionalNumber(row.power, 'words.csv', line, 'power'),
    bonus: optionalNumber(row.bonus, 'words.csv', line, 'bonus'),
    crit: optionalNumber(row.crit, 'words.csv', line, 'crit'),
    fail: optionalNumber(row.fail, 'words.csv', line, 'fail'),
    kind: row.kind || undefined,
    timing: row.timing || undefined,
    targetMode: row.target_mode || undefined,
    aoe: row.aoe || undefined,
    rarity: row.rarity || undefined,
    art: row.art || undefined,
    note: required(row, 'note', 'words.csv', line),
    lore: row.lore || undefined,
    effects: Object.keys(effects).length ? effects : undefined,
    variance: varianceCount ? variance : undefined,
  }))
})

function groupWords(words: Record<string, unknown>[]): Record<string, Record<string, unknown>[]> {
  const grouped: Record<string, Record<string, unknown>[]> = {}
  for (const word of words) {
    const slot = String(word.slot)
    ;(grouped[slot] ??= []).push(word)
  }
  return grouped
}

const comboRows = load('combos.csv')
const combosByPool: Record<Pool, Record<string, unknown>[]> = { early: [], reward: [], expansion: [] }
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
const conflictsByPool: Record<Pool, Record<string, unknown>[]> = { early: [], reward: [], expansion: [] }
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
const dissonancesByPool: Record<Pool, Record<string, unknown>[]> = { early: [], reward: [], expansion: [] }
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

export const EARLY_COMBOS: Combo[] = ${serialize(combosByPool.early)}

export const COMBOS: Combo[] = ${serialize(combosByPool.expansion)}

export const EARLY_CONFLICTS: Conflict[] = ${serialize(conflictsByPool.early)}

export const CONFLICTS: Conflict[] = ${serialize(conflictsByPool.expansion)}

export const EARLY_DISSONANCES: Dissonance[] = ${serialize(dissonancesByPool.early)}

export const DISSONANCES: Dissonance[] = ${serialize(dissonancesByPool.expansion)}
`

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputFile, generated, 'utf8')
console.log(`문장 CSV 생성 완료: 단어 ${wordRows.length}개 · 관용구 ${comboRows.length}개 · 모순 ${conflictRows.length}개 · 부조화 ${dissonanceRows.length}개`)
