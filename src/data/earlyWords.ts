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
  art: '3023',
  // 그림과 감정 태그만 「퍼뜨렸다」에서 물려받고 전용 전투 수치는 여기서 명시한다.
  // 원본을 이미 덱에 넣은
  // 사람에게는 이름도 그림도 같은 두 장이 동사 칸에 나란히 서기 때문이다 —
  // 무엇이 일벌을 확실히 치우는 카드인지 손패에서 바로 읽혀야 한다.
  //
  // 목적어는 붙이지 않는다. 동사 칸의 다른 카드가 전부 한 동작만 적는데 여기만
  // 「일벌을」을 달면 앞에 선 주어·수식어와 이어질 때 문장이 겹쳐 읽힌다.
  text: '퇴치했다',
  stat: 'atk',
  statMult: 0.9,
  inkCost: 3,
  targetCount: 2,
  // 확정 퇴치를 걷고 **일벌에게만 실리는 배수**로 바꿨다. 피해량과 무관하게 지우는
  // 효과는 덱이 약해도 결과가 같아서, 빌려온 한 장이 전투를 대신 풀어 버렸다.
  // 배수는 그 문장이 얼마나 잘 짜였는지를 그대로 반영한다.
  effects: { summonDamageMultiplier: 1.5 },
  note: '토큰의 공략 단어 · 공격 ×0.9 · 2명(100%·70%) · 일벌에게 ×1.5',
  lore: '토큰이 벌떼를 보고 급히 빌려준 한 단어.',
}

const ELDER_SPIDER_TACTIC: Word = {
  id: 'elderSpiderTactic',
  text: '빈틈을 찔렀다',
  slot: 'verb',
  tags: ['adapt', 'atk'],
  emotion: 'neutral',
  stat: 'atk',
  statMult: 1.5,
  kind: 'attack',
  targetCount: 1,
  // 보스전 대여 동사도 연타를 갖지 않고, 높은 공격 계수로 다리 공략을 돕는다.
  art: '3022',
  rarity: 'common',
  note: '공격 ×1.5 · 현재 다리 약점 적용',
  lore: '거미가 바꾼 문장을 읽고, 필요한 감정을 여백에 빌려 적었다.',
}

/**
 * 사마귀 전용 맞딜 카드.
 *
 * 사마귀는 「방어 15를 한 문장에 세울 수 있는가」만 묻는 보스라, 방어 빌드가 아니면
 * 답이 없었다. 이 카드는 다른 종류의 답을 준다 — 막는 대신 마주 선다. 그래서 값이
 * **큰낫이 내려오는 턴**에만 커진다. 상시 배율로 두면 그냥 센 공격 카드가 되고,
 * 보스의 패턴을 읽을 이유가 사라진다.
 */
const MANTIS_TACTIC: Word = {
  id: 'mantisTactic',
  // 동사 칸은 전부 과거형이다(때렸다·막았다·감쌌다). 여기만 기본형이면
  // 「나는 힘껏 희생을 각오하다」로 문장이 끊긴다.
  text: '희생을 각오했다',
  slot: 'verb',
  tags: ['brace', 'atk'],
  emotion: 'neutral',
  stat: 'atk',
  statMult: 1.5,
  kind: 'attack',
  targetCount: 1,
  effects: { heavyTurnMultiplier: 1.5 },
  art: '3021',
  rarity: 'rare',
  note: '토큰의 공략 단어 · 공격 ×1.5 · 강공격 턴이면 ×1.5',
  lore: '큰낫이 내려오는 자리에서 물러서지 않기로 했다.',
}

/**
 * 토큰이 그 전투에만 빌려주는 단어들. 덱에서 온 카드가 아니므로 손패에서 다르게 보여야
 * 한다 — 어디서 왔는지 모르는 카드가 조용히 섞여 있으면 공략이 아니라 사고로 읽힌다.
 *
 * 이 셋은 어느 보상 목록(`ALL_REWARD_WORDS`)에도 들어가지 않는다. 보스를 만나야만
 * 손에 들어오는 전용 카드이며, 그 전투가 끝나면 덱에 남지 않는다.
 */
const LENT_WORD_IDS = new Set([QUEEN_BEE_TACTIC.id, ELDER_SPIDER_TACTIC.id, MANTIS_TACTIC.id])

/** 이 카드는 토큰이 이번 전투에만 빌려준 것인가. 손패의 전용 표시가 이 판정을 쓴다. */
export function isLentWord(word: Pick<Word, 'id'>): boolean {
  return LENT_WORD_IDS.has(word.id)
}

/** 보스별로 토큰이 빌려주는 전용 단어 한 장. 여기 없는 적에게는 아무것도 끼워 넣지 않는다. */
const TACTIC_BY_BOSS: Record<string, Word> = {
  mantis: MANTIS_TACTIC,
  queenBee: QUEEN_BEE_TACTIC,
  elderSpider: ELDER_SPIDER_TACTIC,
}

/**
 * 그 보스를 만난 전투에만 전용 단어 한 장을 동사 단어장에 끼워 넣는다.
 *
 * 손패까지 보장하지는 않는다. 뽑기 후보 한 장이 늘 뿐이라 운이 좋아야 만나고, 만나면
 * 그 판의 답이 된다 — 확정으로 쥐여 주면 보스의 규칙을 읽는 대신 이 한 장을 기다리게 된다.
 */
export function tablesForEncounter(tables: Tables, enemyId?: string): Tables {
  const tactic = enemyId ? TACTIC_BY_BOSS[enemyId] : undefined
  if (!tactic) return tables
  const verbs = tables.words.verb ?? []
  if (verbs.some((word) => word.id === tactic.id)) return tables
  return { ...tables, words: { ...tables.words, verb: [...verbs, tactic] } }
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
