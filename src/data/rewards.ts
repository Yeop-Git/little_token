/**
 * 보상 생성 — 문장(단어) 또는 아이템 3택. 전투 보상등급이 희귀도 확률을 정한다:
 * 등급마다 희귀도를 가중치로 굴리므로 높다고 상위만 나오지는 않지만, 잘 나온다.
 * 문장 선택 = 단어장 등록(스킬업), 아이템 선택 = 감탄사로 스탯 상승(스펙업).
 */

import type { Rarity, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import { rollRarity, startGrade } from '@core/grade'
import { ALL_REWARD_WORDS } from './earlyWords'
import { ITEMS, LEGENDARY_ITEMS, type ItemDef } from './items'

/**
 * 전설(규칙) 아이템을 확정 지급하는 날.
 * 등급 굴림에 맡기면 전설 확률이 등급 6에서도 3.5%라 짧은 런에서는 대부분 못 본다.
 * 규칙을 뒤집는 물건은 모든 플레이어가 한 번은 만나야 의미가 있으므로 날짜로 박는다.
 */
export const LEGENDARY_GIFT_DAY = 3

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

/** 아직 안 가진 전설 아이템. 같은 규칙을 두 번 주지 않는다. */
function freshLegendaries(player: PlayerState): ItemDef[] {
  const owned = new Set(player.items.map((it) => it.id))
  return Object.values(LEGENDARY_ITEMS).filter((it) => !owned.has(it.id))
}

const toOption = (it: ItemDef): RewardOption => ({
  kind: 'item',
  rarity: it.rarity ?? 'common',
  name: it.name,
  desc: it.passive ? '문장의 규칙이 바뀐다' : '감탄사로 스탯을 올린다',
  art: 'gift',
  item: it,
})

export function genRewards(
  player: PlayerState,
  grade = startGrade(player.stats.luck),
  day = 1,
): RewardOption[] {
  const deckWords = Object.values(player.deck).flat()
  const ownedIds = new Set(deckWords.map((w) => w.id))

  // 다양성 — 아직 없는 새 단어(스킬업).
  const newWords: RewardOption[] = ALL_REWARD_WORDS
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

  // 전설 아이템은 확률 풀에 넣지 않는다 — 아래에서 날짜로 확정 지급한다.
  const items: RewardOption[] = Object.values(ITEMS).map(toOption)

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

  // 아직 규칙 아이템이 하나도 없으면 지정일부터 첫 칸을 전설로 덮는다. 나머지 두 칸은
  // 정상 굴림이라 "규칙 하나 vs 성장 둘"의 선택은 남고, 하나를 손에 넣으면 다시 평범한
  // 보상으로 돌아간다 — 매번 전설이 뜨면 나머지 선택지가 무의미해진다.
  const hasRuleItem = player.items.some((it) => it.passive)
  if (day >= LEGENDARY_GIFT_DAY && !hasRuleItem) {
    const fresh = freshLegendaries(player)
    if (fresh.length) picks[0] = toOption(fresh[Math.floor(Math.random() * fresh.length)])
  }
  return picks
}
