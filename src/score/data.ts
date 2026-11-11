import {
  SCORE_CARDS, SCORE_FLOORS, SCORE_FORMS, SCORE_RELICS, SCORE_STATS, SCORE_STICKERS, SCORE_WEATHERS,
} from './generated/scoreData'
import type {
  CardDef, FormDef, RelicDef, ScoreStats, StickerDef, WeatherDef,
} from './types'

const index = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))

export const CARD_BY_ID = index(SCORE_CARDS)
export const STICKER_BY_ID = index(SCORE_STICKERS)
export const RELIC_BY_ID = index(SCORE_RELICS)
export const WEATHER_BY_ID = index(SCORE_WEATHERS)
export const FORM_BY_ID = index(SCORE_FORMS)
export { SCORE_CARDS, SCORE_FLOORS, SCORE_FORMS, SCORE_RELICS, SCORE_STATS, SCORE_STICKERS, SCORE_WEATHERS }

function must<T>(map: Map<string, T>, id: string, what: string): T {
  const v = map.get(id)
  if (!v) throw new Error(`알 수 없는 ${what}: ${id}`)
  return v
}

export const card = (id: string): CardDef => must(CARD_BY_ID, id, '카드')
export const sticker = (id: string): StickerDef => must(STICKER_BY_ID, id, '스티커')
export const relic = (id: string): RelicDef => must(RELIC_BY_ID, id, '유물')
export const weather = (id: string): WeatherDef => must(WEATHER_BY_ID, id, '날씨')
export const form = (id: string): FormDef => must(FORM_BY_ID, id, '형태')

/** 시작 스탯(§9): 분노 10, 슬픔·기쁨·즐거움 8, 하트 3개(12조각). */
export function startingStats(): ScoreStats {
  const s = Object.fromEntries(SCORE_STATS.filter((d) => d.id !== 'lowestTwo').map((d) => [d.id, d.start]))
  return s as unknown as ScoreStats
}

// ── 고정 규칙 상수 (§3·§5·§15). 수치 초안이며 시뮬레이션으로 조정한다. ──

/** 대성공 기본 확률과 수렴 상한. */
export const CRIT_BASE = 0.05
export const CRIT_CAP = 0.6
export const CRIT_MULT = 1.5
/** 감정 공명: 같은 감정 2장 ×1.15, 3장 ×1.30. */
export const RESONANCE = [1, 1, 1.15, 1.3] as const
/** §15 새 물감: 스테이지에서 처음 쓰는 감정마다 그 문장에 ×1.15. */
export const NEW_PAINT_MULT = 1.15
/** §15 쉬는 카드: 칸에 단어가 이 수 이상일 때 직전 기회에 쓴 단어가 한 번 쉰다. */
export const REST_MIN_SLOT_CARDS = 3
/** 손패: 칸마다 뽑는 장 수. 기획안에 수치가 없어 초안으로 둔다. */
export const HAND_PER_SLOT = 3
/** 하트(§1·§10). */
export const PIECES_PER_HEART = 4
export const PIECES_PER_SOUL = 3
/** 기회를 다 쓴 뒤 한 문장을 더 쓸 때마다 잃는 하트 조각(§1 "한 대씩"). 기획안에 수치가 없어 초안. */
export const OVERTIME_HIT_PIECES = 4
/** 클리어 돈: 기본 + 남은 기회 1당. 기획안에 기본값이 없어 초안. */
export const CLEAR_MONEY_BASE = 4
export const MONEY_PER_LEFTOVER_CHANCE = 1
