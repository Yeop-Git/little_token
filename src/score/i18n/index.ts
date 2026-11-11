/**
 * 점수 재기획 화면의 여섯 언어. 한국어는 CSV(카드 등)와 ko.ts(화면 문구)가 원본이고,
 * 나머지는 locale 파일이 같은 id·같은 키를 모두 채워야 한다(`npm run score:locale`이 검사).
 * 기존 게임과 같은 저장 키를 읽어 언어 설정을 공유한다.
 */
import {
  SCORE_CARDS, SCORE_FORMS, SCORE_RELICS, SCORE_STATS, SCORE_STICKERS, SCORE_WEATHERS,
} from '../generated/scoreData'
import { UI_KO, type UiKey } from './ko'
import { EN } from './en'
import { JA } from './ja'
import { RU } from './ru'
import { ZH_HANS } from './zhHans'
import { ZH_HANT } from './zhHant'

export const SCORE_LOCALES = ['ko', 'en', 'ja', 'ru', 'zh-Hans', 'zh-Hant'] as const
export type ScoreLocale = typeof SCORE_LOCALES[number]
export const LOCALE_LABEL: Record<ScoreLocale, string> = {
  ko: '한국어', en: 'English', ja: '日本語', ru: 'Русский', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文',
}
const STORAGE_KEY = 'little-token-locale'

export type ContentKind = 'card' | 'sticker' | 'relic' | 'weather' | 'form' | 'stat'
export interface ContentText { name: string; rule: string }
export interface LocalePack {
  ui: Record<UiKey, string>
  card: Record<string, ContentText>
  sticker: Record<string, ContentText>
  relic: Record<string, ContentText>
  weather: Record<string, ContentText>
  form: Record<string, ContentText>
  stat: Record<string, ContentText>
}

const pack = (rows: { id: string; name: string; rule: string }[]) => Object.fromEntries(rows.map((r) => [r.id, { name: r.name, rule: r.rule }]))

export const KO: LocalePack = {
  ui: UI_KO,
  card: pack(SCORE_CARDS),
  sticker: pack(SCORE_STICKERS),
  relic: pack(SCORE_RELICS),
  weather: pack(SCORE_WEATHERS),
  form: pack(SCORE_FORMS),
  stat: pack(SCORE_STATS),
}

export const PACKS: Record<ScoreLocale, LocalePack> = { ko: KO, en: EN, ja: JA, ru: RU, 'zh-Hans': ZH_HANS, 'zh-Hant': ZH_HANT }

function readLocale(): ScoreLocale {
  if (typeof localStorage === 'undefined') return 'ko'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return (SCORE_LOCALES as readonly string[]).includes(saved ?? '') ? saved as ScoreLocale : 'ko'
  } catch { return 'ko' }
}

let locale: ScoreLocale = readLocale()
export const getLocale = () => locale
export function setScoreLocale(next: ScoreLocale) {
  locale = next
  try { localStorage.setItem(STORAGE_KEY, next) } catch { /* 저장소가 막혀 있으면 이번 화면에만 적용 */ }
}

const num = (n: number) => String(Math.round(n * 100) / 100)

/** `{a}` → 수치, `{a%}` → 백분율. 강화 단계가 반영된 값을 넘기면 화면 설명과 실제 수치가 일치한다. */
export function fill(template: string, values: Record<string, number | string>): string {
  return template.replace(/\{(\w+)(%?)\}/g, (_, key: string, pct: string) => {
    const v = values[key]
    if (v == null) return ''
    if (typeof v === 'string') return v
    return pct ? `${num(v * 100)}%` : num(v)
  })
}

export function t(key: UiKey, values: Record<string, number | string> = {}): string {
  return fill(PACKS[locale].ui[key] ?? UI_KO[key], values)
}

export function contentName(kind: ContentKind, id: string): string {
  return (PACKS[locale][kind][id] ?? KO[kind][id]).name
}

export function contentRule(kind: ContentKind, id: string, values: Record<string, number | string>): string {
  return fill((PACKS[locale][kind][id] ?? KO[kind][id]).rule, values)
}
