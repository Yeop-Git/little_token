/**
 * 보상 생성 — 문장(단어) 또는 아이템 3택. 전투 보상등급이 희귀도 확률을 정한다:
 * 등급마다 희귀도를 가중치로 굴리므로 높다고 상위만 나오지는 않지만, 잘 나온다.
 * 문장 선택 = 단어장 등록(스킬업), 아이템 선택 = 감탄사로 스탯 상승(스펙업).
 */

import type { Rarity, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import { rollRarity, startGrade } from '@core/grade'
import { REWARD_WORDS } from './earlyWords'
import { ITEMS, type ItemDef } from './items'

export interface RewardOption {
  kind: 'word' | 'item'
  rarity: Rarity
  name: string
  desc: string
  art: string
  reinforce?: boolean // 보유 단어 강화 옵션(신규 등록이 아니라 단계 상승)
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

const RARITY_ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary']

// 굴린 희귀도에 후보가 없으면 한 단계씩 내려가고, 바닥까지 비면 위로 올라간다.
function nearestPool(pools: Map<Rarity, RewardOption[]>, want: Rarity): RewardOption[] | null {
  const wi = RARITY_ORDER.indexOf(want)
  for (let i = wi; i >= 0; i--) {
    const p = pools.get(RARITY_ORDER[i])
    if (p?.length) return p
  }
  for (let i = wi + 1; i < RARITY_ORDER.length; i++) {
    const p = pools.get(RARITY_ORDER[i])
    if (p?.length) return p
  }
  return null
}

export function genRewards(player: PlayerState, grade = startGrade(player.stats.luck)): RewardOption[] {
  const deckWords = Object.values(player.deck).flat()
  const ownedIds = new Set(deckWords.map((w) => w.id))

  // 다양성 — 아직 없는 새 단어(스킬업).
  const newWords: RewardOption[] = REWARD_WORDS
    .filter((w) => !ownedIds.has(w.id))
    .map((w) => ({
      kind: 'word',
      rarity: w.rarity ?? 'common',
      name: w.text,
      desc: `${SLOT_LABEL[w.slot] ?? ''} · 새 단어`,
      art: 'word',
      word: w,
    }))

  // 반복강화 — 보유 단어를 강화(단계 상승). 매번 몇 개만 후보로.
  const reinforce: RewardOption[] = shuffle(deckWords)
    .slice(0, 3)
    .map((w) => {
      const lv = w.level ?? 1
      return {
        kind: 'word',
        reinforce: true,
        rarity: w.rarity ?? 'common',
        name: w.text,
        desc: `${SLOT_LABEL[w.slot] ?? ''} · 강화 Lv.${lv} → ${lv + 1}`,
        art: 'word',
        word: w,
      }
    })

  const items: RewardOption[] = Object.values(ITEMS).map((it) => ({
    kind: 'item',
    rarity: 'common',
    name: it.name,
    desc: '감탄사로 스탯을 올린다',
    art: 'gift',
    item: it,
  }))

  // 희귀도별 풀로 나눠 두고, 칸마다 등급 가중치로 희귀도를 굴려 그 풀에서 뽑는다.
  const pools = new Map<Rarity, RewardOption[]>()
  for (const o of [...newWords, ...reinforce, ...items]) {
    const arr = pools.get(o.rarity) ?? []
    arr.push(o)
    pools.set(o.rarity, arr)
  }
  for (const [r, arr] of pools) pools.set(r, shuffle(arr))

  const picks: RewardOption[] = []
  for (let i = 0; i < 3; i++) {
    const pool = nearestPool(pools, rollRarity(grade))
    if (!pool) break
    picks.push(pool.pop()!) // 섞어 둔 풀이라 pop = 중복 없는 무작위 뽑기
  }
  // 최소 한 칸은 아이템이 뜨도록 보장.
  if (!picks.some((p) => p.kind === 'item') && items.length) {
    picks[picks.length - 1] = items[Math.floor(Math.random() * items.length)]
  }
  return picks
}
