/**
 * 점수 구조 재기획안 데이터 생성기.
 * 원본: src/score/csv/*.csv → 생성물: src/score/generated/scoreData.ts (직접 수정하지 않는다).
 * 수치 조정은 CSV에서만 한다. 효과 로직은 src/score/effects.ts가 id로 붙인다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

type Row = Record<string, string>

const csvDir = fileURLToPath(new URL('../src/score/csv/', import.meta.url))
const outFile = fileURLToPath(new URL('../src/score/generated/scoreData.ts', import.meta.url))

function parseCsv(fileName: string): Row[] {
  const source = readFileSync(csvDir + fileName, 'utf8').replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some((v) => v.length > 0)) rows.push(row)
      row = []; cell = ''
    } else cell += ch
  }
  if (quoted) throw new Error(`${fileName}: 닫히지 않은 큰따옴표`)
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  const [header, ...body] = rows
  if (!header) throw new Error(`${fileName}: 헤더 없음`)
  const keys = header.map((k) => k.trim())
  return body.map((cells, n) => {
    if (cells.length !== keys.length) {
      throw new Error(`${fileName}:${n + 2} 열 수 ${cells.length} ≠ 헤더 ${keys.length}`)
    }
    const out: Row = {}
    keys.forEach((k, i) => { out[k] = cells[i].trim() })
    return out
  })
}

const num = (v: string, file: string, id: string, key: string): number => {
  if (v === '') return 0
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${file} ${id}.${key}: 숫자가 아님 "${v}"`)
  return n
}

function uniqueIds(rows: Row[], file: string, key = 'id') {
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r[key])) throw new Error(`${file}: 중복 id ${r[key]}`)
    seen.add(r[key])
  }
}

const SLOTS = ['subj', 'adv', 'verb']
const EMOTIONS = ['anger', 'sorrow', 'joy', 'pleasure', 'chaos']

const cards = parseCsv('cards.csv')
uniqueIds(cards, 'cards.csv')
const cardOut = cards.map((r) => {
  if (!SLOTS.includes(r.slot)) throw new Error(`cards.csv ${r.id}: 슬롯 ${r.slot}`)
  if (!EMOTIONS.includes(r.emotion)) throw new Error(`cards.csv ${r.id}: 감정 ${r.emotion}`)
  const cost = r.slot === 'verb' ? num(r.cost, 'cards.csv', r.id, 'cost') : 0
  if (r.slot === 'verb' && cost !== 1 && cost !== 2) throw new Error(`cards.csv ${r.id}: 동사 기회 비용은 1 또는 2`)
  return {
    id: r.id, slot: r.slot, emotion: r.emotion, name: r.name, grammar: r.grammar, cost,
    a: num(r.a, 'cards.csv', r.id, 'a'), b: num(r.b, 'cards.csv', r.id, 'b'),
    c: num(r.c, 'cards.csv', r.id, 'c'), d: num(r.d, 'cards.csv', r.id, 'd'),
    start: r.start === '1', rule: r.rule, shines: r.shines,
  }
})
// §6: 슬롯 3 × 감정 5 × 5장.
for (const s of SLOTS) for (const e of EMOTIONS) {
  const n = cardOut.filter((c) => c.slot === s && c.emotion === e).length
  if (n !== 5) throw new Error(`cards.csv: ${s}/${e} 카드가 ${n}장 (5장이어야 함)`)
}
// §6 동사: 감정마다 기회 2 동사 1장.
for (const e of EMOTIONS) {
  const n = cardOut.filter((c) => c.slot === 'verb' && c.emotion === e && c.cost === 2).length
  if (n !== 1) throw new Error(`cards.csv: ${e} 기회 2 동사가 ${n}장 (1장이어야 함)`)
}

const stickers = parseCsv('stickers.csv')
uniqueIds(stickers, 'stickers.csv')
const stickerOut = stickers.map((r) => ({
  id: r.id, slot: r.slot, name: r.name, grammar: r.grammar,
  price: num(r.price, 'stickers.csv', r.id, 'price'),
  a: num(r.a, 'stickers.csv', r.id, 'a'), b: num(r.b, 'stickers.csv', r.id, 'b'), rule: r.rule,
}))

const relics = parseCsv('relics.csv')
uniqueIds(relics, 'relics.csv')
const relicOut = relics.map((r) => ({
  id: r.id, kind: r.kind, name: r.name, price: num(r.price, 'relics.csv', r.id, 'price'),
  tier: num(r.tier, 'relics.csv', r.id, 'tier'),
  a: num(r.a, 'relics.csv', r.id, 'a'), b: num(r.b, 'relics.csv', r.id, 'b'), rule: r.rule,
}))

const weathers = parseCsv('weathers.csv')
uniqueIds(weathers, 'weathers.csv')
const weatherOut = weathers.map((r) => ({
  id: r.id, name: r.name, kind: r.kind, emotion: r.emotion,
  a: num(r.a, 'weathers.csv', r.id, 'a'), rule: r.rule,
}))

const forms = parseCsv('forms.csv')
uniqueIds(forms, 'forms.csv')
const formOut = forms.map((r) => ({
  id: r.id, name: r.name, chances: num(r.chances, 'forms.csv', r.id, 'chances'),
  targetMult: num(r.target_mult, 'forms.csv', r.id, 'target_mult'),
  a: num(r.a, 'forms.csv', r.id, 'a'), rule: r.rule,
}))

const floors = parseCsv('floors.csv')
const formIds = new Set(formOut.map((f) => f.id))
const weatherIds = new Set(weatherOut.map((w) => w.id))
const floorOut = floors.map((r) => {
  if (!formIds.has(r.form)) throw new Error(`floors.csv ${r.floor}: 형태 ${r.form} 없음`)
  for (const w of [r.weather, r.weather2]) if (w && !weatherIds.has(w)) throw new Error(`floors.csv ${r.floor}: 날씨 ${w} 없음`)
  return {
    floor: num(r.floor, 'floors.csv', r.floor, 'floor'), form: r.form, weather: r.weather, weather2: r.weather2,
    enemies: num(r.enemies, 'floors.csv', r.floor, 'enemies'), hp: num(r.hp, 'floors.csv', r.floor, 'hp'),
    boss: r.boss, note: r.note,
  }
})

const stats = parseCsv('stats.csv')
uniqueIds(stats, 'stats.csv')
const statOut = stats.map((r) => ({
  id: r.id, slot: r.slot, name: r.name, perPoint: num(r.per_point, 'stats.csv', r.id, 'per_point'),
  start: num(r.start, 'stats.csv', r.id, 'start'), rule: r.rule,
}))

const json = (v: unknown) => JSON.stringify(v, null, 2)
const body = `// 자동 생성 파일 — 직접 수정하지 않는다. 원본: src/score/csv/*.csv, 생성: npm run score:data
import type { CardDef, FloorDef, FormDef, RelicDef, StatDef, StickerDef, WeatherDef } from '../types'

export const SCORE_CARDS = ${json(cardOut)} as CardDef[]

export const SCORE_STICKERS = ${json(stickerOut)} as StickerDef[]

export const SCORE_RELICS = ${json(relicOut)} as RelicDef[]

export const SCORE_WEATHERS = ${json(weatherOut)} as WeatherDef[]

export const SCORE_FORMS = ${json(formOut)} as FormDef[]

export const SCORE_FLOORS = ${json(floorOut)} as FloorDef[]

export const SCORE_STATS = ${json(statOut)} as StatDef[]
`
mkdirSync(fileURLToPath(new URL('../src/score/generated/', import.meta.url)), { recursive: true })
writeFileSync(outFile, body)
console.log(`score data: 카드 ${cardOut.length} · 스티커 ${stickerOut.length} · 유물 ${relicOut.length} · 날씨 ${weatherOut.length} · 형태 ${formOut.length} · 층 ${floorOut.length} · 스탯 ${statOut.length}`)
