/**
 * 플레이어 상태 — 스킬(문장)의 배율이 되는 스탯 + 보유 아이템 + 단어장(덱).
 * 공격력/행운 등은 문장 효과에 영향을 준다(예: 공격력은 공격 위력에 가산).
 */

import type { StatKey } from '@data/items'
import type { Word } from '@core/types'
import { WORDS } from '@data/words'

export interface PlayerStats {
  atk: number
  guard: number
  heal: number
  luck: number
}

export interface OwnedItem {
  id: string
  name: string
  grade: string
  art: string // Icons.itemArt 키
  line: string // 감탄 문장
  stats: Partial<PlayerStats>
}

export interface PlayerState {
  stats: PlayerStats
  items: OwnedItem[]
  deck: Record<string, Word[]> // 슬롯별 보유 단어
}

// 스탯 표시 메타(아이콘/설명). 순서 = 표기 순서.
export const STAT_META: { key: StatKey; label: string; icon: string; desc: string }[] = [
  { key: 'atk', label: '공격력', icon: 'sword', desc: '공격 문장의 위력에 더해진다' },
  { key: 'guard', label: '방어', icon: 'shield', desc: '방어 수치에 더해진다' },
  { key: 'heal', label: '회복', icon: 'heart', desc: '회복량에 더해진다' },
  { key: 'luck', label: '행운', icon: 'clover', desc: '도박·보상 확률을 올린다' },
]

export function defaultPlayer(): PlayerState {
  return {
    stats: { atk: 3, guard: 1, heal: 1, luck: 2 },
    items: [
      { id: 'candle', name: '몽당 양초', grade: '흔함', art: 'candle', line: '와! 정말 예뻐!', stats: { atk: 3, luck: 5 } },
      { id: 'ribbon', name: '낡은 리본', grade: '흔함', art: 'ribbon', line: '음? 살짝 튼튼해!', stats: { guard: 3, luck: 2 } },
    ],
    deck: WORDS,
  }
}
