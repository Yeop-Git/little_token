/**
 * 실제 3슬롯 일반 런 데이터 조립.
 * 원본 단어와 맥락 데이터는 csv/에서 관리하고 generated/는 자동 생성한다.
 */

import type { Tables, Word } from '@core/types'
import type { PlayerState } from '@core/player'
import { currentLocale, type LocaleCode } from '@/localization'
import { hasPassive, slotOrderFor, TWIN_VERB_SCALE } from '@core/passives'
import { buildTemplate } from './slots'
import {
  EARLY_COMBOS,
  EARLY_CONFLICTS,
  EARLY_DISSONANCES,
  EARLY_WORDS,
  GROW_WORDS,
  LOCALE_EARLY_COMBOS,
  PUNCT_WORDS,
  REWARD_WORDS,
} from './generated/sentenceData'
import { SPECIAL_REWARD_WORDS } from './specialWords'

export { EARLY_COMBOS, EARLY_CONFLICTS, EARLY_WORDS, GROW_WORDS, PUNCT_WORDS, REWARD_WORDS, SPECIAL_REWARD_WORDS }

const QUEEN_BEE_TACTIC: Word = {
  ...SPECIAL_REWARD_WORDS.find((word) => word.id === 'spreadTwo')!,
  id: 'queenBeeTactic',
  effects: { summonExecuteCount: 2 },
  note: '토큰의 공략 단어 · 공격 ×0.9 · 일벌 2마리 퇴치',
  lore: '토큰이 벌떼를 보고 급히 빌려준 한 단어.',
}

const ELDER_SPIDER_TACTIC: Word = {
  id: 'elderSpiderTactic',
  text: '빈틈을 고쳐 찔렀다',
  slot: 'verb',
  tags: ['adapt', 'atk'],
  emotion: 'neutral',
  stat: 'atk',
  statMult: 1,
  kind: 'attack',
  targetCount: 1,
  art: '3009',
  rarity: 'common',
  note: '공격 ×1 · 1명 · 현재 다리 약점 적용',
  lore: '거미가 바꾼 문장을 읽고, 필요한 감정을 여백에 빌려 적었다.',
}

/** 덱에 범위 단어가 없어도 여왕벌의 일벌 퇴치가 운에 막히지 않게 해 주는 전투 한정 단어. */
export function tablesForEncounter(tables: Tables, enemyId?: string): Tables {
  if (enemyId === 'elderSpider') {
    const verbs = tables.words.verb ?? []
    if (verbs.some((word) => word.id === ELDER_SPIDER_TACTIC.id)) return tables
    return { ...tables, words: { ...tables.words, verb: [...verbs, ELDER_SPIDER_TACTIC] } }
  }
  if (enemyId !== 'queenBee') return tables
  const verbs = tables.words.verb ?? []
  if (verbs.some((word) => word.id === QUEEN_BEE_TACTIC.id)) return tables
  return {
    ...tables,
    words: { ...tables.words, verb: [...verbs, QUEEN_BEE_TACTIC] },
  }
}

export const EARLY_TEMPLATE = ['subj', 'adv', 'verb']

/**
 * 슬롯을 가리지 않는 카드의 slot 값. 무럭무럭은 특정 성분이 아니라 "어느 칸에나
 * 끼어드는 한 장"이라 CSV에 슬롯별로 적지 않고 이 한 행만 둔다.
 */
export const ANY_SLOT = '*'

/** 무럭무럭 원본 한 장 — 수치(성장량·등급·일러스트)의 유일한 출처. */
const GROW_BASE = GROW_WORDS.find((w) => w.slot === ANY_SLOT) ?? GROW_WORDS[0]

/**
 * 칸마다 다른 너스레. 여기 없는 슬롯은 원본 로어로 떨어지므로 새 칸이 생겨도
 * 데이터를 고칠 필요가 없다 — 맛이 아쉬우면 그때 한 줄 보태면 된다.
 */
const GROW_LORE: Record<string, string> = {
  subj: '주어부터 자란다. 이야기가 키를 잰다.',
  subj2: '둘이 나란히 자란다. 누가 더 컸는지는 안 따진다.',
  adv: '수식하지 않는다. 그냥 자란다.',
  obj: '무엇을 자라게 했느냐 물으면, 그냥 자랐다고 답한다.',
  verb: '때리지도 막지도 않는다. 그냥 자란다.',
  verb2: '그리고 또 자란다. 두 동작 사이에도 숨을 고른다.',
  end: '문장을 맺지 않는다. 맺을 새도 없이 자란다.',
  punct: '문장 끝에 붙어서도 자란다. 숙주는 어디서든 자란다.',
}

/** 이 카드는 성분이 아니라 성장만 하는가? (조사 부착·도감 제외 판정에 쓴다) */
export const isGrowWord = (w: Word): boolean => !!w.growHp

/** 해당 칸에 놓을 무럭무럭 한 장. 원본을 슬롯 이름표만 갈아 끼워 찍어낸다. */
export function growCardFor(slotKey: string): Word {
  return {
    ...GROW_BASE,
    id: `gr_${slotKey}`,
    slot: slotKey,
    lore: GROW_LORE[slotKey] ?? GROW_BASE.lore,
  }
}

/**
 * 일반 보상 전설 스킬 — 기존 규칙 카드인 무럭무럭을 초반 3슬롯에 맞춰 둔다.
 * 저장 복원도 같은 정의를 찾을 수 있도록 전체 보상 카탈로그에 포함한다.
 */
export const LEGENDARY_REWARD_WORDS: Word[] = ['subj', 'adv', 'verb'].map(growCardFor)
export const ALL_REWARD_WORDS: Word[] = [...REWARD_WORDS, ...SPECIAL_REWARD_WORDS, ...LEGENDARY_REWARD_WORDS]

/** 두 번째 동사는 새 행동 갈래를 열되 첫 동사의 연타·반복을 문장 전체에 복제하지 않는다. */
function secondaryVerb(word: Word): Word {
  const effects = word.effects ? { ...word.effects } : undefined
  if (effects) {
    if (typeof effects.guard === 'number') effects.guard *= TWIN_VERB_SCALE
    if (typeof effects.heal === 'number') effects.heal *= TWIN_VERB_SCALE
    delete effects.hitCount
    delete effects.castCount
    delete effects.castScale
    delete effects.overdrawHitCount
  }
  return {
    ...word,
    power: word.power ? word.power * TWIN_VERB_SCALE : word.power,
    statMult: word.statMult != null ? word.statMult * TWIN_VERB_SCALE : word.statMult,
    effects,
  }
}

/**
 * 아이템 패시브가 슬롯을 늘리면 그 칸의 단어 목록도 함께 채워야 한다.
 * 겹동사는 동사 덱을 그대로 다시 쓰고, 문장부호는 전용 풀을 쓴다.
 */
export function makeEarlyTables(
  deck: Record<string, Word[]> = EARLY_WORDS,
  player?: PlayerState,
  locale: LocaleCode = currentLocale,
): Tables {
  const order = slotOrderFor(EARLY_TEMPLATE, player)
  const words: Record<string, Word[]> = { ...deck }
  if (hasPassive(player, 'punct')) words.punct = PUNCT_WORDS
  // 겹슬롯은 원본 칸의 목록을 그대로 다시 쓴다.
  if (hasPassive(player, 'twinSubj')) words.subj2 = words.subj ?? []
  if (hasPassive(player, 'twinVerb')) words.verb2 = (words.verb ?? []).map(secondaryVerb)
  return {
    template: buildTemplate(order),
    words,
    combos: [...EARLY_COMBOS, ...(LOCALE_EARLY_COMBOS[locale] ?? [])],
    conflicts: EARLY_CONFLICTS,
    dissonances: EARLY_DISSONANCES,
  }
}
