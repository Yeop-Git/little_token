/**
 * 초기 레벨용 단어 — "처음엔 3단어, 때리거나 막는 간단한 수치"만.
 * 문장 = 나는 + 방식(수식) + 행동(동사). 어떤 조합이든 자연스러운 한국어가 되도록 curate.
 *   나는 힘껏 때렸다 / 나는 단단히 막았다 / 나는 살짝 감쌌다 …
 * 방식(adv)=배수 풀, 행동(verb)=기본 위력·행동 종류. 슬롯 시스템은 가변이라 이후 확장.
 */

import type { Combo, Tables, Word } from '@core/types'
import { buildTemplate } from './slots'

export const EARLY_TEMPLATE = ['subj', 'adv', 'verb']

export const EARLY_WORDS: Record<string, Word[]> = {
  subj: [
    { id: 'na', text: '나는', slot: 'subj', tags: ['self'], bonus: 0, targetMode: 'enemy', rarity: 'common', note: '문장의 시작', lore: '오늘도 일기를 편다.' },
  ],
  adv: [
    { id: 'himkkeot', text: '힘껏', slot: 'adv', tags: ['force'], bonus: 0.6, rarity: 'common', note: '세게 · 위력 +60%', lore: '팔에 힘을 준다.' },
    { id: 'saljjak', text: '살짝', slot: 'adv', tags: ['soft'], bonus: -0.2, effects: { evade: 2 }, rarity: 'common', note: '살살 · 위력 −20% · 회피', lore: '조심스럽게.' },
    { id: 'dandanhi', text: '단단히', slot: 'adv', tags: ['solid'], bonus: 0, effects: { guard: 2 }, rarity: 'common', note: '야무지게 · 방어 +2', lore: '이를 악문다.' },
  ],
  verb: [
    { id: 'ttaeryeot', text: '때렸다', slot: 'verb', tags: ['atk'], power: 6, kind: 'attack', rarity: 'common', note: '공격', lore: '정직한 한 방.' },
    { id: 'makat', text: '막았다', slot: 'verb', tags: ['grd'], power: 1, kind: 'guard', effects: { guard: 6 }, rarity: 'common', note: '방어 +6', lore: '한 발 버틴다.' },
    { id: 'gamssat', text: '감쌌다', slot: 'verb', tags: ['mend'], power: 0, kind: 'heal', effects: { heal: 5 }, rarity: 'common', note: '회복 +5', lore: '상처를 매만진다.' },
  ],
}

// 초기 관용구(맥락) — 방식+행동이 맞물릴 때 발동.
export const EARLY_COMBOS: Combo[] = [
  { id: 'ec1', name: '정면돌파', need: ['force', 'atk'], mult: 1.4, flavor: '망설임 없이' },
  { id: 'ec2', name: '철벽', need: ['solid', 'grd'], mult: 1.3, flavor: '한 치도 안 밀린다' },
]

// 보상으로 단어장에 등록되는 후보(슬롯별).
export const REWARD_WORDS: Word[] = [
  { id: 'jaeppalli', text: '재빨리', slot: 'adv', tags: ['swift'], bonus: 0.2, effects: { evade: 3 }, rarity: 'rare', note: '빠르게 · 위력 +20% · 회피 +3', lore: '숨 돌릴 틈 없이.' },
  { id: 'naedeonjyeot', text: '내던졌다', slot: 'verb', tags: ['atk', 'hurl'], power: 9, kind: 'attack', rarity: 'rare', note: '강공 · 위력 9', lore: '있는 힘껏 내던진다.' },
  { id: 'ureojyeot', text: '웅크렸다', slot: 'verb', tags: ['grd', 'mend'], power: 1, kind: 'guard', effects: { guard: 4, heal: 3 }, rarity: 'rare', note: '방어 +4 · 회복 +3', lore: '몸을 말아 지킨다.' },
]

const MULT_CAP = 2.5

export function makeEarlyTables(deck: Record<string, Word[]> = EARLY_WORDS): Tables {
  return {
    template: buildTemplate(EARLY_TEMPLATE),
    words: deck,
    combos: EARLY_COMBOS,
    conflicts: [],
    multCap: MULT_CAP,
  }
}
