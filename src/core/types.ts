/**
 * 코어 타입 — 문장 조립 전투.
 * 슬롯 구조는 "가변 길이"다: SentenceTemplate가 순서를 정의하고,
 * 덱/아이템이 슬롯을 더하거나 뺄 수 있다(기본 5칸). 컴파일러는 특정
 * 슬롯 키를 하드코딩하지 않고 이 템플릿을 따라간다.
 */

// 슬롯 키는 확장 가능한 문자열. 기본 세트는 data/slots.ts에 정의.
export type SlotKey = string

// 문장 템플릿: 이 순서대로 단어를 고른다. 슬롯마다 역할(role)이 붙어
// 컴파일러가 base/bonus/조사 처리를 어떻게 할지 결정한다.
export interface SlotDef {
  key: SlotKey
  label: string // UI 탭 라벨 (주어/수식/…)
  role: SlotRole // 컴파일 규칙
  josa?: boolean // 목적어처럼 조사를 붙일지
}

// 슬롯 역할 — 수치를 어느 풀에 넣을지 결정.
export type SlotRole =
  | 'subject' // 주어: bonus 풀 + targetMode
  | 'modifier' // 수식/부사: bonus 풀 + effects
  | 'object' // 목적어: base 위력
  | 'verb' // 동사: base 위력 + kind
  | 'ending' // 어미: bonus 풀 + timing + variance

export interface SentenceTemplate {
  slots: SlotDef[]
}

export type IntentKind = 'attack' | 'guard' | 'heal' | 'debuff'
export type TargetMode = 'enemy' | 'self' | 'both'
export type AoeMode = 'single' | 'all' // 범위: 단일 vs 전체 적

export interface Variance {
  p: number
  hi: number
  lo: number
}

export interface WordEffects {
  guard?: number
  heal?: number
  recoil?: number
  evade?: number
}

export interface Word {
  id: string
  text: string
  slot: SlotKey
  tags: string[]
  power?: number // object/verb: 가산 위력
  bonus?: number // subject/modifier/ending: 배수 풀 기여(가산)
  crit?: number // 대성공 확률(0..1) — 수식 룰렛
  fail?: number // 실패 확률(0..1) — 수식 룰렛
  variance?: Variance
  effects?: WordEffects
  kind?: IntentKind // verb 전용
  timing?: 'immediate' | 'delayed'
  targetMode?: TargetMode // subject 전용
  // 문법 인칭 — 주어 슬롯의 "역할 계약"에 쓰인다. 일기는 1인칭이라 주어는 first만 허용.
  // 미지정은 인칭 중립(주어가 아닌 슬롯 단어). 상대(2인칭)는 주어가 아니라 목적어로 간다.
  person?: 'first' | 'second' | 'third'
  aoe?: AoeMode // subject/verb가 지정 가능
  note: string // UI 한 줄 설명(효과 요약)
  rarity?: Rarity // 보상 티어 표기용(맥락카드 등급제는 폐지 — gradeBonus 없음)
  art?: string // 맥락카드 풀 일러스트 키(assets SKILL_ART: 1xxx 주어·2xxx 수식·3xxx 목적)
  lore?: string // 우측 상세 패널 줄거리
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '흔함',
  rare: '희귀',
  epic: '영웅',
  legendary: '전설',
}

export interface Combo {
  id: string
  name: string
  need: string[] // 필요 tag(멀티셋)
  mult: number // 유일한 곱셈 값
  flavor?: string
}

export interface Conflict {
  a: string
  b: string
  reason: string
}

// 부조화 — 맥락이 안 맞는 태그 쌍. 하드 차단(Conflict)이 아니라 위력을 깎는
// "틀린 문장" 소프트 패널티(penalty < 1). 다양한 단어에 태그로 자연히 섞인다.
export interface Dissonance {
  a: string
  b: string
  penalty: number // 위력 배수(<1)
  reason: string // UI에 뜨는 이유 — "살살 때려선 아프지 않다"
}

export type Selection = Record<SlotKey, Word | undefined>

// 컴파일 결과 — 시뮬이 소비하는 순수 행동 객체.
export interface Intent {
  sentence: string
  targetMode: TargetMode
  aoe: AoeMode
  kind: IntentKind
  base: number
  multiplier: number
  variance: Variance | null
  timing: 'immediate' | 'delayed'
  guard: number
  heal: number
  recoil: number
  evade: number
  tags: string[]
  combos: string[] // 발동 관용구 이름
  coherence: number // 부조화 패널티 곱(1이면 어긋남 없음)
  penalties: string[] // 발동한 부조화 이유
  critP: number // 대성공 확률 합(수식 룰렛) — 스탯 보정 전 기본값
  failP: number // 실패 확률 합(수식 룰렛) — 스탯 보정 전 기본값
}

export interface Tables {
  template: SentenceTemplate
  words: Record<SlotKey, Word[]>
  combos: Combo[]
  conflicts: Conflict[]
  dissonances?: Dissonance[]
  multCap: number
}

// ── 적 ──
export interface EnemyDef {
  id: string
  name: string
  hp: number
  atk: number // 기본 반격 피해
  every: number // n턴마다 공격
  initiative: 'first' | 'second' // 문장 완성 후 플레이어보다 먼저/나중에 행동
  sprite: string // Sprites.ts 키
  note: string
}

// ── 필드(날씨/날짜/제목) 효과 ──
export interface FieldDef {
  id: string
  date: string
  title: string
  weather: string // 'sunny' | 'rain' | 'night' | ...
  theme: 'day' | 'night'
  desc: string // 규칙 설명(화면 노출)
  // 전투 시작 시 적용할 가벼운 수정자
  playerAtkMult?: number
  enemyAtkMult?: number
  extraGuard?: number
}
