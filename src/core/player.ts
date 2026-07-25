/**
 * 플레이어 상태 — 스킬(문장)의 배율이 되는 스탯 + 보유 아이템 + 단어장(덱).
 * 공격력/행운 등은 문장 효과에 영향을 준다(예: 공격력은 공격 위력에 가산).
 */

import { RARITY_LABEL, type Rarity, type Word } from '@core/types'
import type { PassiveId } from '@core/passives'
import { WORDS } from '@data/words'

export interface PlayerStats {
  hp: number // 최대 체력
  atk: number // 공격 문장 피해에 가산
  guard: number // 방어 수치에 가산
  heal: number // 회복량에 가산
  luck: number // 고등급 보상·도박 보정
}

export interface OwnedItem {
  id: string
  name: string
  rarity?: Rarity
  /** v0.3.2 이전 저장 호환용. 새 아이템은 rarity만 저장한다. */
  grade?: string
  art: string // Icons.itemArt 키
  line: string // 감탄 문장
  stats: Partial<PlayerStats>
  /** 규칙을 바꾸는 패시브(전설 아이템 전용). 스탯 아이템은 없다. */
  passive?: PassiveId
}

export function ownedItemRarity(item: OwnedItem): Rarity {
  if (item.rarity) return item.rarity
  return item.grade === RARITY_LABEL.legendary ? 'legendary' : 'common'
}

export interface PlayerState {
  stats: PlayerStats
  items: OwnedItem[]
  deck: Record<string, Word[]> // 슬롯별 보유 단어
}

// 스탯 표시 메타(아이콘/설명). 순서 = 표기 순서.
export const STAT_META: { key: keyof PlayerStats; label: string; icon: string; desc: string }[] = [
  { key: 'hp', label: '체력', icon: 'heart', desc: '최대 체력이 늘어난다' },
  { key: 'atk', label: '공격', icon: 'sword', desc: '공격 문장의 피해가 커진다' },
  { key: 'guard', label: '방어', icon: 'shield', desc: '방어(임시 체력) 수치가 커진다' },
  { key: 'heal', label: '회복', icon: 'cross', desc: '회복량이 커진다' },
  { key: 'luck', label: '운', icon: 'clover', desc: '보상등급의 시작·최저치를 올린다 · 도박 보정' },
]

export function defaultPlayer(): PlayerState {
  return {
    stats: { hp: 40, atk: 3, guard: 3, heal: 3, luck: 2 },
    items: [
      { id: 'candle', name: '몽당 양초', rarity: 'common', art: 'candle', line: '와! 정말 예뻐!', stats: { atk: 3, heal: 2, luck: 2 } },
      { id: 'ribbon', name: '낡은 리본', rarity: 'common', art: 'ribbon', line: '음? 살짝 튼튼해!', stats: { hp: 2, guard: 4, luck: 2 } },
    ],
    deck: WORDS,
  }
}
