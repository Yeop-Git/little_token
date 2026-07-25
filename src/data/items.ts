/**
 * 아이템 + 감탄사 시스템.
 * 획득 시 아이템은 등급에 맞는 "낮은 기본 스탯"으로 나오고, 플레이어가
 * 감탄 문장(감탄 / 정도 / 평가)을 조립하면 그 단어들에 맞는 추가효과가 붙는다.
 * 코어 루프(문장 조립)의 축소판이라 규칙이 일관된다.
 */

import type { PassiveId } from '@core/passives'
import type { Rarity } from '@core/types'

export type StatKey = 'hp' | 'atk' | 'guard' | 'heal' | 'luck'

export interface ItemDef {
  id: string
  name: string
  art: string // assets ITEM_ART 일러스트 키(없으면 Icons.itemArt의 SVG 폴백)
  base: Record<StatKey, number>
  flavor: string
  rarity: Rarity
  /**
   * 규칙을 바꾸는 패시브. 전설 아이템 전용이며 **기본 스탯이 0이다.**
   * (감탄사로 붙는 소량은 그대로 받는다 — 감탄 화면은 코어 루프라 건너뛰지 않는다.)
   * 전설만 모아서는 깡수치가 거의 안 늘어서 단어 보상을 계속 골라야 한다.
   */
  passive?: PassiveId
}

const NO_STATS: Record<StatKey, number> = { hp: 0, atk: 0, guard: 0, heal: 0, luck: 0 }

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

// 기본 스탯 예산: 종합 4점. 체력은 2가 1점 가치다(hp 2 = 다른 스탯 1).
export const ITEMS: Record<string, ItemDef> = {
  // id는 저장된 런이 참조하므로 그대로 둔다 — 바꾸면 이어하기에서 아이템이 사라진다.
  // 보이는 것(이름·그림·문구)만 갈아 끼운다.
  ribbon: {
    id: 'ribbon',
    name: '낡은 책',
    rarity: 'common',
    art: 'book',
    base: { hp: 2, atk: 0, guard: 2, heal: 0, luck: 1 },
    flavor: '표지의 잠금쇠는 진작 헐거워졌다.',
  },
  candle: {
    id: 'candle',
    name: '짜리몽땅 연필',
    rarity: 'common',
    art: 'pencil',
    base: { hp: 0, atk: 2, guard: 0, heal: 1, luck: 1 },
    flavor: '심이 짧아도 쓰는 데는 지장 없다.',
  },
}

/**
 * 전설 아이템 — 스탯이 0이고 규칙만 바꾼다.
 * 초반에는 잠겨 있고 층이 오를수록 등장 확률이 높아진다. 15층 사이클마다
 * 한 번은 선택할 수 있도록 특정 후반 날짜에 확정 후보를 둔다(rewards.ts).
 */
export const LEGENDARY_ITEMS: Record<string, ItemDef> = {
  echoChime: {
    id: 'echoChime',
    name: '누댕의 메아리',
    art: 'chime',
    rarity: 'legendary',
    passive: 'echo',
    base: { ...NO_STATS },
    flavor: '한 번 부른 이름이 두 번 돌아온다.',
  },
  olymCarrot: {
    id: 'olymCarrot',
    name: '올림프의 당근',
    art: 'carrot',
    rarity: 'legendary',
    passive: 'punct',
    base: { ...NO_STATS },
    flavor: '끝을 어떻게 맺느냐가 문장을 정한다.',
  },
  tastyVerb: {
    id: 'tastyVerb',
    name: '맛동사',
    art: 'snack',
    rarity: 'legendary',
    passive: 'twinVerb',
    base: { ...NO_STATS },
    flavor: '한 번에 두 가지를 한다. 문법이 좀 이상해도 통한다.',
  },
  goldenApple: {
    id: 'goldenApple',
    name: '신데렐라의 황금사과',
    art: 'apple',
    rarity: 'legendary',
    passive: 'retry',
    base: { ...NO_STATS },
    flavor: '자정을 놓쳐도 한 번은 더 기회가 온다.',
  },
  beautyMirror: {
    id: 'beautyMirror',
    name: '미녀의 거울',
    art: 'mirror',
    rarity: 'legendary',
    passive: 'twinSubj',
    base: { ...NO_STATS },
    flavor: '거울 속에도 내가 있다. 둘이서 쓴 문장은 두 배로 힘이 실린다.',
  },
  snowShoe: {
    id: 'snowShoe',
    name: '백설공주의 구두',
    art: 'shoe',
    rarity: 'legendary',
    passive: 'heavyShoe',
    base: { ...NO_STATS },
    flavor: '무겁다. 그래서 밟으면 확실하다.',
  },
  redMatch: {
    id: 'redMatch',
    name: '빨간망토의 성냥',
    art: 'match',
    rarity: 'legendary',
    passive: 'matchFire',
    base: { ...NO_STATS },
    flavor: '망토는 붉고 성냥은 뜨겁다. 칸마다 조금씩 옮겨붙는다.',
  },
  matchCloak: {
    id: 'matchCloak',
    name: '성냥팔이 소녀의 망토',
    art: 'cloak',
    rarity: 'legendary',
    passive: 'luckCloak',
    base: { ...NO_STATS },
    flavor: '성냥은 다 팔았고 망토만 남았다. 남은 건 운뿐이다.',
  },
  pigBbq: {
    id: 'pigBbq',
    name: '아기돼지 바베큐',
    art: 'bbq',
    rarity: 'legendary',
    passive: 'bbq',
    base: { ...NO_STATS },
    flavor: '늑대 대신 돼지가 구워졌다. 잡을수록 불이 세진다.',
  },
  pinoDoubt: {
    id: 'pinoDoubt',
    name: '피노키오의 미아핑',
    art: 'pino',
    rarity: 'legendary',
    passive: 'doubt',
    base: { ...NO_STATS },
    flavor: '문장을 다 쓰고 나면 코가 길어진다. 근데?',
  },
  beanSprout: {
    id: 'beanSprout',
    name: '잭과 숙주나물',
    art: 'beanstalk',
    rarity: 'legendary',
    passive: 'beanstalk',
    base: { ...NO_STATS },
    flavor: '콩이 아니라 숙주였다. 그래도 자라긴 자란다.',
  },
}

export const ALL_ITEMS: Record<string, ItemDef> = { ...ITEMS, ...LEGENDARY_ITEMS }

// 감탄 슬롯: 감탄(느낌) → 정도(강조) → 평가(가치판단).
// 보정은 정직하게 스탯 +1씩(체력만 +2). 슬롯마다 체력 선택지가 있어
// 세 번 전부 체력에 몰면 +6 — 한 아이템 몰빵의 상한이다.
export const EXCLAIM_SLOTS: ExclaimSlot[] = [
  {
    key: 'excl',
    label: '감탄',
    words: [
      { id: 'wow', text: '와!', mods: { atk: 1 }, note: '공격 +1' },
      { id: 'hmm', text: '음?', mods: { guard: 1 }, note: '방어 +1' },
      { id: 'oh', text: '오,', mods: { heal: 1 }, note: '회복 +1' },
      { id: 'gasp', text: '헉!', mods: { hp: 2 }, note: '체력 +2' },
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
    ],
  },
]

export const STAT_LABEL: Record<StatKey, string> = {
  hp: '체력',
  atk: '공격',
  guard: '방어',
  heal: '회복',
  luck: '운',
}
