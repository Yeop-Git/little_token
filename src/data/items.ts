/**
 * 아이템 + 감탄사 시스템.
 * 모든 아이템의 고정 기본 스탯은 0이다. 플레이어가 감탄 문장(감탄 / 정도 / 평가)을
 * 조립하면 등급 예산 안에서 선택한 단어에 맞는 스탯이 붙는다.
 * 코어 루프(문장 조립)의 축소판이라 규칙이 일관된다.
 */

import type { PassiveId } from '@core/passives'
import type { Rarity } from '@core/types'
import { RULE_ITEMS, STAT_ITEMS } from './generated/itemData'

export type StatKey = 'hp' | 'atk' | 'guard' | 'heal' | 'luck'

export interface ItemDef {
  id: string
  name: string
  art: string // assets ITEM_ART 일러스트 키(없으면 Icons.itemArt의 SVG 폴백)
  base: Record<StatKey, number>
  flavor: string
  rarity: Rarity
  /**
   * 규칙을 바꾸는 패시브. 영웅·전설 아이템 전용이다.
   * (감탄사로 붙는 소량은 그대로 받는다 — 감탄 화면은 코어 루프라 건너뛰지 않는다.)
   * 고유효과 등급만 모아도 감탄사 예산은 4~5점이라 단어 보상을 계속 골라야 한다.
   */
  passive?: PassiveId
}

// 감탄 문장 슬롯 — 코어와 같은 "가변 슬롯" 사고. 기본 3칸.
export interface ExclaimWord {
  id: string
  text: string
  // 이 단어가 주는 스탯 보정(가산). 정직하게 +1씩, 체력만 +2.
  mods: Partial<Record<StatKey, number>>
  note: string
}

export interface ExclaimSlot {
  key: string
  label: string
  words: ExclaimWord[]
}

// 모든 아이템의 CSV 기본 스탯은 0이다. 스탯은 감탄사 선택에서만 얻고,
// 영웅·전설은 보수적인 등급 보정과 고유효과를 함께 가진다.
export const ITEMS: Record<string, ItemDef> = STAT_ITEMS
export const PASSIVE_ITEMS: Record<string, ItemDef> = RULE_ITEMS
export const ALL_ITEMS: Record<string, ItemDef> = { ...ITEMS, ...PASSIVE_ITEMS }

/** 모든 선택의 기본 1점 위에 무작위 슬롯으로 흩어지는 등급 보너스 총량. */
export const EXCLAIM_RARITY_BONUS: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
}

/** 화면 입장 시 한 번 굴리고, 감탄사를 완성할 때까지 같은 배치를 유지한다. */
export function rollExclaimMultipliers(rarity: Rarity, rng: () => number = Math.random): [number, number, number] {
  const multipliers: [number, number, number] = [1, 1, 1]
  const open = [0, 1, 2]
  for (let i = 0; i < EXCLAIM_RARITY_BONUS[rarity]; i++) {
    const pick = Math.min(open.length - 1, Math.floor(rng() * open.length))
    multipliers[open.splice(pick, 1)[0]]++
  }
  return multipliers
}

export function exclaimModsFor(
  multiplier: number,
  mods: Partial<Record<StatKey, number>>,
): Partial<Record<StatKey, number>> {
  return Object.fromEntries(Object.entries(mods).map(([stat, value]) => [stat, value * multiplier]))
}

// 감탄 슬롯: 감탄(느낌) → 정도(강조) → 평가(가치판단).
// 기본 보정은 스탯 +1씩(체력만 +2). 실제 획득량은 위 등급별 슬롯 배수를 적용한다.
//
// 칸마다 다섯 스탯을 한 장씩 모두 갖춘다. 재련마다 이 중 EXCLAIM_CHOICES장만
// 무작위로 열리므로(rollExclaimChoices), 어느 칸이 비어도 특정 스탯만 계속
// 고르게 되는 편향이 생기지 않는다.
export const EXCLAIM_SLOTS: ExclaimSlot[] = [
  {
    key: 'excl',
    label: '감탄',
    words: [
      { id: 'wow', text: '와!', mods: { atk: 1 }, note: '공격 +1' },
      { id: 'hmm', text: '음?', mods: { guard: 1 }, note: '방어 +1' },
      { id: 'oh', text: '오,', mods: { heal: 1 }, note: '회복 +1' },
      { id: 'gasp', text: '헉!', mods: { hp: 2 }, note: '체력 +2' },
      { id: 'huh', text: '어라?', mods: { luck: 1 }, note: '운 +1' },
    ],
  },
  {
    key: 'deg',
    label: '정도',
    words: [
      { id: 'super', text: '엄청', mods: { atk: 1 }, note: '공격 +1' },
      { id: 'kinda', text: '살짝', mods: { luck: 1 }, note: '운 +1' },
      { id: 'really', text: '정말', mods: { heal: 1 }, note: '회복 +1' },
      { id: 'full', text: '한가득', mods: { hp: 2 }, note: '체력 +2' },
      { id: 'firmly', text: '단단히', mods: { guard: 1 }, note: '방어 +1' },
    ],
  },
  {
    key: 'val',
    label: '평가',
    words: [
      { id: 'sharp', text: '날카로워!', mods: { atk: 1 }, note: '공격 +1' },
      { id: 'strong', text: '튼튼해!', mods: { guard: 1 }, note: '방어 +1' },
      { id: 'pretty', text: '예뻐!', mods: { luck: 1 }, note: '운 +1' },
      { id: 'hearty', text: '든든해!', mods: { hp: 2 }, note: '체력 +2' },
      { id: 'warm', text: '따뜻해!', mods: { heal: 1 }, note: '회복 +1' },
    ],
  },
]

/** 재련 한 번에 칸마다 열리는 감탄사 수. 남는 장은 이번 아이템에서 안 나온다. */
export const EXCLAIM_CHOICES = 3

/**
 * 이번 재련의 선택지를 칸마다 무작위로 뽑는다. 화면 입장에서 한 번만 굴리고
 * 재련이 끝날 때까지 같은 목록을 유지한다 — 같은 아이템을 오가며 다시 굴리면
 * 마음에 드는 조합이 나올 때까지 새로고침하는 게임이 된다.
 */
export function rollExclaimChoices(rng: () => number = Math.random): Record<string, ExclaimWord[]> {
  const out: Record<string, ExclaimWord[]> = {}
  for (const slot of EXCLAIM_SLOTS) {
    const pool = [...slot.words]
    const picked: ExclaimWord[] = []
    while (picked.length < Math.min(EXCLAIM_CHOICES, slot.words.length) && pool.length) {
      picked.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
    }
    // 원본 순서를 되살려 칸마다 감탄사가 늘 같은 자리 감각으로 읽히게 한다.
    out[slot.key] = slot.words.filter((word) => picked.includes(word))
  }
  return out
}

export const STAT_LABEL: Record<StatKey, string> = {
  hp: '체력',
  atk: '공격',
  guard: '방어',
  heal: '회복',
  luck: '운',
}
