/**
 * 플레이어 상태 — 스킬(문장)의 배율이 되는 스탯 + 보유 아이템 + 단어장(덱).
 * 공격력/행운 등은 문장 효과에 영향을 준다(예: 공격력은 공격 위력에 가산).
 */

import { RARITY_LABEL, type Rarity, type Word } from '@core/types'
import { PASSIVES, type PassiveId } from '@core/passives'
import { itemTraitText, type ItemTraitId } from '@core/itemTraits'
import { STAT_LABEL, type StatKey } from '@data/items'
import { WORDS } from '@data/words'
import { currentLocale } from '@/localization'
import { formatNumber } from '@core/numberFormat'

export interface PlayerStats {
  hp: number // 최대 체력
  atk: number // 공격 문장 피해에 가산
  guard: number // 방어 수치에 가산
  heal: number // 회복량에 가산
  luck: number // 고등급 보상·도박 보정
}

/** 새 런과 전투 폴백이 공유하는 기준 스탯. 방어는 비축하되, 한 번의 충전량은 낮게 잡는다. */
export const STARTING_COMBAT_STATS: Readonly<PlayerStats> = {
  hp: 52,
  atk: 5,
  guard: 3,
  heal: 5,
  luck: 0,
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
  /** 규칙을 바꾸는 패시브(영웅·전설 아이템 전용). 스탯 아이템은 없다. */
  passive?: PassiveId
  /** 일반·희귀 아이템의 무작위 특성. */
  trait?: ItemTraitId
}

export function ownedItemRarity(item: OwnedItem): Rarity {
  if (item.rarity) return item.rarity
  return item.grade === RARITY_LABEL.legendary ? 'legendary' : 'common'
}

export interface PlayerState {
  stats: PlayerStats
  items: OwnedItem[]
  deck: Record<string, Word[]> // 슬롯별 보유 단어
  /** 잭의 하늘나물을 가진 뒤 자란 최대 체력 합(하늘까지 — 5마다 방어·회복 +1). */
  beanstalkGrown?: number
}

// 스탯 표시 메타(아이콘/설명). 순서 = 표기 순서.
export const STAT_META: { key: keyof PlayerStats; label: string; icon: string; desc: string }[] = [
  { key: 'hp', label: '체력', icon: 'heart', desc: '최대 체력이 늘어난다' },
  { key: 'atk', label: '공격', icon: 'sword', desc: '공격 문장의 피해가 커진다' },
  { key: 'guard', label: '방어', icon: 'shield', desc: '방어(임시 체력) 점수가 커진다' },
  { key: 'heal', label: '회복', icon: 'cross', desc: '회복량이 커진다' },
  { key: 'luck', label: '운', icon: 'clover', desc: '보상등급과 영웅·전설 등장 확률을 올린다 · 도박·대성공 확률 보정' },
]

export function defaultPlayer(): PlayerState {
  const starterLines = currentLocale === 'en' ? ['Wow! Truly beautiful!','Hmm? Slightly sturdy!']
    : currentLocale === 'ja' ? ['わあ！ 本当にきれい！','うーん？ ちょっと丈夫！']
      : currentLocale === 'ru' ? ['Ух ты! По-настоящему красиво!','Хм? Немного прочно!']
        : currentLocale === 'zh-Hans' ? ['哇！真的好漂亮！','嗯？有点结实！']
          : currentLocale === 'zh-Hant' ? ['哇！真的好漂亮！','嗯？有點結實！']
            : ['와! 정말 예뻐!','음? 살짝 튼튼해!']
  return {
    stats: { ...STARTING_COMBAT_STATS },
    items: [
      { id: 'candle', name: currentLocale === 'ko' ? '소년의 몽당연필' : currentLocale === 'en' ? "Boy's Pencil Stub" : currentLocale === 'ja' ? '少年のちびた鉛筆' : currentLocale === 'ru' ? 'Огрызок карандаша мальчика' : currentLocale === 'zh-Hans' ? '少年的短铅笔' : '少年的短鉛筆', rarity: 'common', art: 'pencil', line: starterLines[0], stats: { atk: 0.5, heal: 1, luck: 1 } },
      { id: 'ribbon', name: currentLocale === 'ko' ? '아버지의 낡은 이야기책' : currentLocale === 'en' ? "Father's Old Storybook" : currentLocale === 'ja' ? '父の古い物語本' : currentLocale === 'ru' ? 'Старая книга отца' : currentLocale === 'zh-Hans' ? '父亲的旧故事书' : '父親的舊故事書', rarity: 'common', art: 'book', line: starterLines[1], stats: { guard: 2, luck: 1 } },
    ],
    deck: WORDS,
  }
}

/** 아이템 수치를 화면에 늘어놓는 순서. 스탯 표는 어디서나 이 순서를 쓴다. */
export const ITEM_STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']

/** "공격 +2 · 운 +1" — 감탄사로 확정된 실제 상승치. 없으면 빈 문자열. */
export function itemStatsText(item: OwnedItem): string {
  return ITEM_STAT_ORDER
    .filter((key) => item.stats[key])
    .map((key) => `${STAT_LABEL[key]} +${item.stats[key]}`)
    .join(' · ')
}

/**
 * 보유 아이템 쪽지 — 이름 / 고유효과 / 감탄사로 얻은 스탯 순으로 줄을 쌓는다.
 * 규칙(영웅·전설) 아이템도 스탯 줄을 함께 적는다. 고유효과만 보여 주면 감탄사로
 * 실제로 오른 수치가 화면 어디에도 안 남는다 — 쪽지가 길어지는 편이 낫다.
 */
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

/**
 * 보유 아이템 팝업 쪽지 본문 — 특성 한 칸과 올라가는 스탯 칩을 표로 세운다.
 * 제목(이름)과 등급 라벨은 쪽지 머리가 따로 그린다.
 */
/** renderDesc: 특성 설명을 태그·글머리표로 그리는 UI 함수(코어는 기본으로 평문 이스케이프만 한다). */
export function itemTooltipHtml(item: OwnedItem, renderDesc: (desc: string) => string = escapeHtml): string {
  const passive = item.passive ? PASSIVES[item.passive] : null
  const trait = passive ?? (item.trait ? itemTraitText(item.trait, ownedItemRarity(item)) : null)
  const traitLabel = currentLocale === 'ko' ? '특성' : currentLocale === 'en' ? 'Trait' : currentLocale === 'ru' ? 'Черта' : '特性'
  const statsLabel = currentLocale === 'ko' ? '올라가는 스탯' : currentLocale === 'en' ? 'Stats gained' : currentLocale === 'ja' ? '上がる能力値' : currentLocale === 'ru' ? 'Прибавка' : currentLocale === 'zh-Hans' ? '提升属性' : '提升屬性'
  const stats = ITEM_STAT_ORDER
    .filter((key) => item.stats[key])
    .map((key) => `<span class="relic-tip-stat stat-${key}"><small>${escapeHtml(STAT_LABEL[key])}</small><b>+${formatNumber(item.stats[key]!)}</b></span>`)
    .join('')
  return [
    trait ? `<span class="relic-tip-trait"><small>${traitLabel}</small><b>${escapeHtml(trait.name)}</b><em>${renderDesc(trait.desc)}</em></span>` : '',
    stats ? `<span class="relic-tip-stats-label">${statsLabel}</span><span class="relic-tip-stats">${stats}</span>` : '',
    item.line ? `<span class="relic-tip-line">“${escapeHtml(item.line)}”</span>` : '',
  ].join('')
}

export function itemTooltipText(item: OwnedItem): string {
  const passive = item.passive ? PASSIVES[item.passive] : null
  const stats = itemStatsText(item)
  const lines: string[] = []
  if (passive) lines.push(`${passive.name} — ${passive.desc}`)
  if (item.trait) {
    const trait = itemTraitText(item.trait, ownedItemRarity(item))
    lines.push(`${trait.name} — ${trait.desc}`)
  }
  if (stats) lines.push(stats)
  if (!lines.length) lines.push(item.line)
  return [item.name, ...lines].join('\n')
}
