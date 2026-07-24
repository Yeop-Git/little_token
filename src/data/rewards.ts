/**
 * 보상 생성 — 문장(단어) 또는 아이템 3택. 운이 낮으면 낮은 등급만 뜬다.
 * 문장 선택 = 단어장 등록(스킬업), 아이템 선택 = 감탄사로 스탯 상승(스펙업).
 */

import type { Rarity, Word } from '@core/types'
import { luckRarityCap, rarityAllowed } from '@core/run'
import { REWARD_WORDS } from './earlyWords'
import { ITEMS, type ItemDef } from './items'

export interface RewardOption {
  kind: 'word' | 'item'
  rarity: Rarity
  name: string
  desc: string
  art: string
  word?: Word
  item?: ItemDef
}

const SLOT_LABEL: Record<string, string> = { subj: '주어', adv: '수식', verb: '동사', obj: '목적어', end: '어미' }

function shuffle<T>(a: T[]): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

export function genRewards(luck: number): RewardOption[] {
  const cap = luckRarityCap(luck)
  const words: RewardOption[] = REWARD_WORDS.filter((w) => rarityAllowed(w.rarity ?? 'common', cap)).map((w) => ({
    kind: 'word',
    rarity: w.rarity ?? 'common',
    name: w.text,
    desc: `${SLOT_LABEL[w.slot] ?? ''} · ${w.note}`,
    art: 'word',
    word: w,
  }))
  const items: RewardOption[] = Object.values(ITEMS).map((it) => ({
    kind: 'item',
    rarity: 'common',
    name: it.name,
    desc: '감탄사로 스탯을 올린다',
    art: 'gift',
    item: it,
  }))

  const picks = shuffle([...words, ...items]).slice(0, 3)
  // 최소 한 칸은 아이템이 뜨도록 보장.
  if (!picks.some((p) => p.kind === 'item') && items.length) {
    picks[picks.length - 1] = items[Math.floor(Math.random() * items.length)]
  }
  return picks
}
