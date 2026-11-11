/**
 * 점수 구조 재기획안(SCORE_REDESIGN.md)의 타입.
 *
 * 이 폴더(`src/score`)는 기존 런(`src/core`, `src/sim`)과 독립이다. 기존 코드를 import하지
 * 않고 기존 코드도 이 폴더를 import하지 않는다. 시뮬레이션으로 수치를 맞춘 뒤에만 화면에 얹는다.
 */

export type ScoreEmotion = 'anger' | 'sorrow' | 'joy' | 'pleasure' | 'chaos'
export const SCORE_EMOTIONS: readonly ScoreEmotion[] = ['anger', 'sorrow', 'joy', 'pleasure', 'chaos']
/** 스탯이 있는 네 감정. 혼돈은 스탯이 따로 없다(§9). */
export type StatEmotion = Exclude<ScoreEmotion, 'chaos'>
export const STAT_EMOTIONS: readonly StatEmotion[] = ['anger', 'sorrow', 'joy', 'pleasure']

export type ScoreSlot = 'subj' | 'adv' | 'verb'
export const SCORE_SLOTS: readonly ScoreSlot[] = ['subj', 'adv', 'verb']

/** CSV 원본에서 생성되는 카드 정의. 효과 로직은 `effects.ts`가 id로 붙인다. */
export interface CardDef {
  id: string
  slot: ScoreSlot
  emotion: ScoreEmotion
  name: string
  grammar: string
  /** 기회 비용. 동사에만 의미가 있고 주어·수식어는 0. */
  cost: number
  a: number
  b: number
  c: number
  d: number
  start: boolean
  /** 반복 구매 강화가 키우는 파라미터. 소문자는 값 전체, 대문자는 1을 넘는 부분(곱셈 배수)만 키운다. 빈 값은 강화 불가. */
  grow: string
  rule: string
  shines: string
}

export interface StickerDef {
  id: string
  slot: ScoreSlot
  name: string
  grammar: string
  price: number
  a: number
  b: number
  rule: string
}

export type RelicKind = 'chip' | 'add' | 'mult' | 'position' | 'emotion' | 'rule' | 'economy'

export interface RelicDef {
  id: string
  kind: RelicKind
  name: string
  price: number
  /** 구현 순서(§8): 1차·2차·3차. */
  tier: number
  a: number
  b: number
  rule: string
}

export type WeatherKind = 'none' | 'ban' | 'restrict' | 'bonus'

export interface WeatherDef {
  id: string
  name: string
  kind: WeatherKind
  emotion: ScoreEmotion | ''
  a: number
  rule: string
}

export interface FormDef {
  id: string
  name: string
  chances: number
  targetMult: number
  a: number
  rule: string
}

export interface FloorDef {
  floor: number
  form: string
  weather: string
  weather2: string
  enemies: number
  hp: number
  boss: string
  note: string
}

export type StatSlot = 'exclaim' | 'degree' | 'verdict'

export interface StatDef {
  id: string
  slot: StatSlot
  name: string
  perPoint: number
  start: number
  rule: string
}

/** 플레이어 스탯(§9). 하트·지킴은 조각 단위. */
export interface ScoreStats {
  anger: number
  sorrow: number
  joy: number
  pleasure: number
  baseChips: number
  baseAdd: number
  crit: number
  startTears: number
  amp: number
  mind: number
  guard: number
  allowance: number
  luck: number
  freeReroll: number
}

/** 덱에 든 카드 한 장. 스티커는 한 장에 하나(§7). */
export interface DeckCard {
  uid: number
  cardId: string
  sticker?: string
  /** 반복 구매 강화 단계(0~MAX_LEVEL). 단계마다 `CardDef.grow`의 파라미터가 LEVEL_STEP만큼 커진다. */
  level: number
}

/** 한 문장에 놓인 단어. 수식어 칸은 한낮의 졸음에서 비어 있을 수 있다. */
export interface SentencePick {
  subj: DeckCard
  adv?: DeckCard
  verb: DeckCard
  /** 유물 「겹주어」가 여는 둘째 주어 칸(선택). */
  subj2?: DeckCard
  /** 유물 「겹동사」가 여는 둘째 동사 칸(선택). 칩만 절반으로 더한다. */
  verb2?: DeckCard
}

/** 직전 문장들의 기록. 이월·예고·의문 같은 문장 사이 효과의 근거. */
export interface SentenceRecord {
  score: number
  chips: number
  addPool: number
  subjectAdd: number
  emotions: ScoreEmotion[]
  /** 칸 순서대로의 감정(주어, 수식어, 동사). */
  slotEmotions: (ScoreEmotion | undefined)[]
  modifierId?: string
  wordIds: string[]
  crit: boolean
  cost: number
}

/** 다음 문장에 넘어가는 값. 문장 계산이 새 값을 돌려준다. */
export interface CarryState {
  /** 다음 문장 가산(안도한 나는, 털어놓았다, -고). */
  add: number
  /** 다음 문장 칩(퍼뜨렸다). */
  chips: number
  /** 다음 문장 배율 곱(-ㄹ 것이다). */
  mult: number
  /** 다음 문장 대성공 확률(-다가). */
  crit: number
  /** 다음 문장 첫 단어가 이 감정이면 ×2(-ㄹ까). */
  askEmotion?: ScoreEmotion
  askMult: number
}

export const EMPTY_CARRY: CarryState = { add: 0, chips: 0, mult: 1, crit: 0, askMult: 1 }

/** 한 스테이지 안에서 문장을 계산할 때 필요한 상태. 순수 계산을 위해 값으로만 전달한다. */
export interface StageContext {
  formId: string
  weatherIds: string[]
  chancesTotal: number
  /** 이 문장을 쓰기 전 남은 기회. */
  chancesLeft: number
  /** 이번 스테이지에서 이미 쓴 문장 수. */
  sentencesUsed: number
  tears: number
  history: SentenceRecord[]
  carry: CarryState
  /** 이번 스테이지에서 이미 쓴 감정(새 물감, 이것저것). */
  emotionsUsed: ScoreEmotion[]
  /** 이번 스테이지에서 이미 쓴 분노 단어 수(힘껏). */
  angerWordsUsed: number
  /** 이번 스테이지에서 각 단어를 쓴 횟수(우박). */
  wordUses: Record<string, number>
  /** 경쾌하게·흩뜨렸다가 쌓은 스테이지 가산. */
  stageAdd: number
  /** 스테이지당 1번 효과를 이미 쓴 카드 id. */
  oncePerStageUsed: string[]
  /** 약점의 날 감정. */
  weakness?: ScoreEmotion
  /** 스테이지 첫 문장 점수(책갈피). */
  firstScore?: number
}

export interface ScoreLoadout {
  stats: ScoreStats
  /** 유물 줄. 왼쪽에서 오른쪽으로 발동한다. */
  relics: string[]
}

/** 무작위 굴림. 실전은 RNG, 미리보기·봇은 기댓값을 쓴다. */
export interface Roller {
  /** 확률 p로 a, 아니면 b. 기댓값 모드에서는 p·a + (1−p)·b. */
  pick(p: number, a: number, b: number): number
  /** lo~hi 균등. 기댓값 모드에서는 평균. */
  range(lo: number, hi: number): number
}

/** 점수 롤업 한 줄. 화면의 띠링 띠링(§0 폭발)과 단위 검사가 같은 값을 본다. */
export interface ScoreStep {
  source: string
  label: string
  chips: number
  mult: number
}

export interface SentenceResult {
  score: number
  chips: number
  mult: number
  amp: number
  crit: boolean
  critChance: number
  critMult: number
  addPool: number
  subjectAdd: number
  steps: ScoreStep[]
  /** 문장 뒤 스테이지 상태 변화. */
  tearsAfter: number
  carry: CarryState
  stageAddGain: number
  /** 실제로 소모한 기회(재빨리·튕겼다 환급 반영). */
  chanceSpent: number
  /** 손패 효과(우연히 만난 나는, 흔들었다). 시뮬레이터가 처리한다. */
  freeSwaps: number
  redrawHand: boolean
  onceUsed: string[]
  record: SentenceRecord
}

export interface ValidationResult {
  ok: boolean
  reason?: string
}
