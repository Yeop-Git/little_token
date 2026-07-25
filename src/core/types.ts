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
  /** 앞 단어에 공백 없이 붙여 쓴다(문장부호). */
  attach?: boolean
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
/** 카드와 적이 공유하는 감정 속성. 한 카드는 하나만, 한 적은 약점 하나만 가진다. */
export type Emotion = 'joy' | 'sadness' | 'anger' | 'anxiety'
export const EMOTION_LABEL: Record<Emotion, string> = { joy: '기쁨', sadness: '슬픔', anger: '분노', anxiety: '불안' }
export const EMOTION_ICON: Record<Emotion, string> = { joy: '☀', sadness: '☂', anger: '✦', anxiety: '◌' }
/** 전체 공격은 기존 aoe와 호환하고, 나머지는 적 레일 앞쪽부터 세는 타격 수다. */
export type TargetCount = 1 | 2 | 3 | 'all'

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
  /** 일반 방어막을 건너뛴다. 매직실드는 절대 건너뛰지 못한다. */
  pierceGuard?: boolean
  /** 같은 최전방 적에게 가하는 개별 타격 횟수. */
  hitCount?: number
  /** 막아 낸 피해에 곱할 즉시 반격 계수. */
  counterMultiplier?: number
}

// 문장이 기대는 플레이어 스탯 — 동사의 깡수치와 수식 룰렛 보정이 여기서 나온다.
export type StatName = 'atk' | 'guard' | 'heal' | 'luck'
export interface StatBlock {
  atk: number
  guard: number
  heal: number
  luck: number
}

export interface Word {
  id: string
  text: string
  slot: SlotKey
  tags: string[]
  power?: number // object/verb: 가산 위력(스탯 비례가 아닌 고정 위력)
  // 스탯 비례 — 동사의 깡수치는 "공격×1 · 방어×1 · 회복×1"처럼 스탯에서 나온다.
  // 수식에서는 룰렛(대성공/실패) 확률을 밀어 주는 기준 스탯을 가리킨다.
  stat?: StatName
  statMult?: number // 동사 전용 계수. 깡수치 = stat × statMult
  bonus?: number // subject/modifier/ending: 배수 풀 기여(가산)
  crit?: number // 대성공 확률(0..1) — 수식 룰렛
  fail?: number // 실패 확률(0..1) — 수식 룰렛
  /** 무럭무럭 — 최대 체력을 이만큼 영구히 올린다. 배율을 받지 않는 고정 수치. */
  growHp?: number
  variance?: Variance
  effects?: WordEffects
  kind?: IntentKind // verb 전용
  timing?: 'immediate' | 'delayed'
  targetMode?: TargetMode // subject 전용
  // 문법 인칭 — 주어 슬롯의 "역할 계약"에 쓰인다. 일기는 1인칭이라 주어는 first만 허용.
  // 미지정은 인칭 중립(주어가 아닌 슬롯 단어). 상대(2인칭)는 주어가 아니라 목적어로 간다.
  person?: 'first' | 'second' | 'third'
  aoe?: AoeMode // subject/verb가 지정 가능
  targetCount?: TargetCount
  emotion: Emotion
  note: string // UI 한 줄 설명(효과 요약)
  rarity?: Rarity // 보상 티어 표기용(맥락카드 등급제는 폐지 — gradeBonus 없음)
  art?: string // 맥락카드 풀 일러스트 키(assets SKILL_ART: 1xxx 주어·2xxx 수식·3xxx 목적)
  level?: number // 반복강화 단계(1=기본). 중복 보상을 먹으면 오른다.
  lore?: string // 우측 상세 패널 줄거리
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

export const RARITY_LABEL: Record<Rarity, string> = {
  common: '노멀',
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
  targetCount: TargetCount
  kind: IntentKind
  /** 선공 상대보다 먼저 행동한다(문장부호 '!'). */
  preempt: boolean
  base: number
  multiplier: number
  variance: Variance | null
  timing: 'immediate' | 'delayed'
  guard: number
  heal: number
  recoil: number
  evade: number
  pierceGuard: boolean
  hitCount: number
  counterMultiplier: number
  emotions: Emotion[]
  emotionResonance: number
  tags: string[]
  combos: string[] // 발동 관용구 이름
  coherence: number // 부조화 패널티 곱(1이면 어긋남 없음)
  penalties: string[] // 발동한 부조화 이유
  critP: number // 대성공 확률 합(수식 룰렛) — 스탯 보정 전 기본값
  failP: number // 실패 확률 합(수식 룰렛) — 스탯 보정 전 기본값
  statKey: StatName | null // 룰렛을 밀어 줄 스탯(수식이 지정). 없으면 맥락(kind)으로 결정
  /** 무럭무럭 총합 — 이 문장으로 자라는 최대 체력. 배율을 받지 않는다. */
  growHp: number
  /** 피노키오의 미아핑이 이번 문장에서 굴릴 "근데?" 개수(완성한 문장이면 1). */
  doubtCount: number
  /** 화면에 그대로 늘어놓을 계산 내역 — 깡수치와 배율의 출처. */
  breakdown: { flats: IntentPart[]; mults: IntentPart[] }
}

export interface IntentPart {
  label: string // 화면 표기 이름(단어/스탯/관용구)
  value: number // 깡수치는 더할 값, 배율은 곱할 값
  source: 'word' | 'stat' | 'combo' | 'coherence' | 'emotion'
  hint?: string // "공격 ×1" 처럼 어디서 나온 수치인지
  /**
   * 이 깡수치가 들어간 풀. 동사가 둘일 수 있어(맛동사) 한 문장 안에서
   * 피해·방어·회복이 동시에 생기므로, 집계판이 자기 풀만 골라 쓴다.
   */
  lane?: 'damage' | 'guard' | 'heal'
}

/**
 * 아이템 패시브가 컴파일에 주는 수정자. 컴파일러는 순수함수라 플레이어를 모르므로
 * `core/passives.ts`의 `modsFor()`가 보유 아이템을 이 데이터로 바꿔 넘긴다.
 */
export interface CompileMods {
  /** 백설공주의 구두 — 피해 동사가 있으면 깡수치에 한 번 가산. */
  verbFlat?: number
  /** 성냥팔이 소녀의 망토 — 모든 동사가 운 스탯만큼 깡수치를 더 받는다. */
  verbLuck?: boolean
  /** 빨간망토의 성냥 — 배율 역할 칸마다 보너스를 더 얹는다. */
  bonusEach?: number
  /** 아기돼지 바베큐 — 이번 전투 처치 수에서 나온 배율(1이면 없음). */
  stageMult?: number
  /** 피노키오의 미아핑 — 완성한 문장 끝에 "…근데?" 한 번을 굴린다(굴림은 resolveMultiplier). */
  doubt?: boolean
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
  /** 피해를 먼저 흡수하는 일반 방어막. 관통 공격은 소모시키지 않고 지나간다. */
  guard?: number
  /** 한 타격을 통째로 지우는 매직실드 횟수. */
  magicShield?: number
  weakEmotion?: Emotion
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
