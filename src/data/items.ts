/**
 * 아이템 + 감탄사 시스템.
 * 획득 시 아이템은 등급에 맞는 "낮은 기본 스탯"으로 나오고, 플레이어가
 * 감탄 문장(감탄 / 정도 / 평가)을 조립하면 그 단어들에 맞는 추가효과가 붙는다.
 * 코어 루프(문장 조립)의 축소판이라 규칙이 일관된다.
 */

export type StatKey = 'atk' | 'guard' | 'heal' | 'luck'

export interface ItemDef {
  id: string
  name: string
  grade: string // 등급 라벨
  art: string // Sprites.ts 아이콘 키
  base: Record<StatKey, number>
  flavor: string
}

// 감탄 문장 슬롯 — 코어와 같은 "가변 슬롯" 사고. 기본 3칸.
export interface ExclaimWord {
  id: string
  text: string
  // 이 단어가 주는 스탯 보정(가산). 감탄사는 배수 느낌으로 크게.
  mods: Partial<Record<StatKey, number>>
  note: string
}

export interface ExclaimSlot {
  key: string
  label: string
  words: ExclaimWord[]
}

export const ITEMS: Record<string, ItemDef> = {
  ribbon: {
    id: 'ribbon',
    name: '낡은 리본',
    grade: '흔함',
    art: 'ribbon',
    base: { atk: 1, guard: 1, heal: 0, luck: 1 },
    flavor: '어제 주운 것 같은데 기억이 안 난다.',
  },
  candle: {
    id: 'candle',
    name: '몽당 양초',
    grade: '흔함',
    art: 'candle',
    base: { atk: 2, guard: 0, heal: 1, luck: 0 },
    flavor: '심지가 아직 살아 있다.',
  },
}

// 감탄 슬롯: 감탄(느낌) → 정도(강조) → 평가(가치판단).
export const EXCLAIM_SLOTS: ExclaimSlot[] = [
  {
    key: 'excl',
    label: '감탄',
    words: [
      { id: 'wow', text: '와!', mods: { atk: 2, luck: 1 }, note: '공격 +2 · 운 +1' },
      { id: 'hmm', text: '음?', mods: { guard: 2 }, note: '방어 +2' },
      { id: 'oh', text: '오,', mods: { heal: 2 }, note: '회복 +2' },
    ],
  },
  {
    key: 'deg',
    label: '정도',
    words: [
      { id: 'really', text: '정말', mods: { atk: 1, guard: 1, heal: 1, luck: 1 }, note: '전 스탯 +1' },
      { id: 'kinda', text: '살짝', mods: { luck: 2 }, note: '운 +2' },
      { id: 'super', text: '엄청', mods: { atk: 2 }, note: '공격 +2' },
    ],
  },
  {
    key: 'val',
    label: '평가',
    words: [
      { id: 'pretty', text: '예뻐!', mods: { luck: 3 }, note: '운 +3 (좋은 보상)' },
      { id: 'strong', text: '튼튼해!', mods: { guard: 3 }, note: '방어 +3' },
      { id: 'sharp', text: '날카로워!', mods: { atk: 3 }, note: '공격 +3' },
      { id: 'meh', text: '별로…', mods: { luck: 1 }, note: '운 +1 · 판매가 2배' },
    ],
  },
]

export const STAT_LABEL: Record<StatKey, string> = {
  atk: '공격',
  guard: '방어',
  heal: '회복',
  luck: '운',
}
