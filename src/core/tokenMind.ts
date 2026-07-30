/**
 * tokenMind — 요정 토큰의 자아.
 *
 * 토큰이 "무엇을 하는가"(비행·대사)는 TokenActor와 BattleView가 갖고, 이 파일은
 * **왜 그러고 싶은가**만 갖는다. 기분과 유대, 타고난 성향, 그리고 지난 런들의 기억이다.
 *
 * 세 층은 시간 축이 다르다.
 *   mood   런 안에서만 산다. 맞으면 가라앉고 이기면 들뜬다. 매 턴 0으로 조금씩 돌아온다
 *   bond   런을 넘어 남고 **줄지 않는다**. 함께 보낸 시간이 되돌아가지는 않는다
 *   traits 런이 끝날 때만 아주 조금 움직인다. 성격이 하루아침에 바뀌면 성격이 아니다
 *
 * 언멜팅의 에나(`CompanionSystem`·`EnaDisposition`)에서 이 3층 구조를 가져왔다. 다만
 * 에나는 손패를 골라 주는 조력자라 성향이 "무엇을 건네줄까"로 쓰이고, 토큰은 곁에 있는
 * 요정이라 "얼마나 가까이, 얼마나 자주 끼어들까"로 쓰인다.
 *
 * DOM에 의존하지 않는다. 저장소를 주입받으므로 검사 스크립트가 node에서 그대로 돌린다.
 */

/** 저장 형식이 바뀌면 올린다. 구버전은 조용히 버리고 기본값에서 다시 시작한다. */
export const TOKEN_MIND_VERSION = 1
/** 진행도 키는 전부 `little-token.` 접두사를 쓴다 — 초기화 대상에서 빠지지 않게. */
export const TOKEN_MIND_KEY = 'little-token.mind.v1'

/** 기분을 흔드는 사건. 값은 한 번에 움직이는 폭이다. */
const MOOD_EVENTS = {
  /** 프롬이 맞았다. 요정이 가장 크게 흔들리는 사건이라 폭이 제일 크다. */
  playerHurt: -0.3,
  /** 프롬이 쓰러질 뻔했다. */
  playerNearDeath: -0.45,
  enemyKilled: 0.22,
  comboFired: 0.3,
  rewardTaken: 0.26,
  healed: 0.18,
  /** 잉크를 넘겨 써 제 몸을 깎았다. 이겨도 마음이 좋지는 않다. */
  overdraw: -0.16,
  bossDown: 0.6,
  runCleared: 0.8,
  runLost: -0.8,
} as const

export type MoodEvent = keyof typeof MOOD_EVENTS

/** 유대를 올리는 사건. 줄어드는 항목은 없다 — 그게 유대의 정의다. */
const BOND_EVENTS = {
  /** 토큰의 조언을 실제로 읽었다(말풍선이 끝까지 떠 있었다). */
  adviceHeard: 0.012,
  /** 위험한 순간에 곁을 지켰다. */
  stoodBy: 0.02,
  bossDown: 0.05,
  runFinished: 0.03,
} as const

export type BondEvent = keyof typeof BOND_EVENTS

/**
 * 타고난 성향. 셋 다 0~1이고 기본은 한가운데다.
 *   curiosity   낯선 것을 들여다보고 싶은 마음 — 훑어보기·화면 너머 보기를 민다
 *   caution     곁을 지키고 싶은 마음 — 맴돌기를 좁히고 가로지르기를 줄인다
 *   playfulness 그냥 신나서 날고 싶은 마음 — 가로지르기를 민다
 */
export interface TokenTraits {
  curiosity: number
  caution: number
  playfulness: number
}

/** 지난 런 한 번의 기억. 회상 대사의 사실 출처다. */
export interface TokenRunMemory {
  day: number
  outcome: 'clear' | 'defeat'
  /** 무엇에 당했는지. 회상에서 이름으로 불러 준다. */
  cause?: string
}

export interface TokenMindSnapshot {
  version: number
  bond: number
  traits: TokenTraits
  runs: TokenRunMemory[]
  /** 함께 끝낸 런 수. 회상과 유대 곡선의 분모다. */
  runsTogether: number
}

/** 저장소 계약. 브라우저에서는 localStorage, 검사에서는 Map 한 장이면 된다. */
export interface MindStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 기억은 12개까지만 남긴다. 그보다 오래된 런은 토큰도 흐릿하게 기억한다. */
const MEMORY_LIMIT = 12
/** 매 턴 기분이 0으로 돌아오는 폭. 사건이 없으면 평정으로 수렴한다. */
const MOOD_RECOVERY_PER_TURN = 0.02
/** 런이 끝날 때 성향이 움직일 수 있는 최대 폭. 성격은 천천히 변한다. */
const TRAIT_STEP = 0.04

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const clampMood = (value: number) => Math.min(1, Math.max(-1, value))

export const defaultTraits = (): TokenTraits => ({ curiosity: 0.5, caution: 0.5, playfulness: 0.5 })

/** 숫자가 아니거나 범위를 벗어난 저장값은 조용히 기본값으로 되돌린다. */
const readNumber = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback

export class TokenMind {
  /** 런 안에서만 사는 기분. 새 런마다 0에서 시작한다. */
  private moodValue = 0
  private bondValue = 0
  private traitValues: TokenTraits = defaultTraits()
  private memories: TokenRunMemory[] = []
  private runsTogether = 0
  /** 이번 런에서 최근에 일어난 일. 정책의 관측과 회상 대사가 함께 읽는다. */
  private recentHurtTurns = 0
  private recentWinTurns = 0
  private lastRecallIndex = -1

  constructor(private readonly storage: MindStorage | null = defaultStorage()) {
    this.load()
  }

  get mood() {
    return this.moodValue
  }

  get bond() {
    return this.bondValue
  }

  get traits(): Readonly<TokenTraits> {
    return this.traitValues
  }

  /** 최근에 프롬이 다쳤는가. 정책이 "곁을 지켜야 할 때"를 아는 신호다. */
  get isWorried() {
    return this.recentHurtTurns > 0
  }

  get isElated() {
    return this.recentWinTurns > 0 && this.moodValue > 0.35
  }

  /** 사건 하나가 기분을 흔든다. 진폭은 유대가 깊을수록 커진다 — 남 일이 아니게 된다. */
  feel(event: MoodEvent) {
    const amount = MOOD_EVENTS[event]
    this.moodValue = clampMood(this.moodValue + amount * (1 + this.bondValue * 0.5))
    if (amount < 0) this.recentHurtTurns = 2
    else this.recentWinTurns = 2
  }

  /** 유대는 오직 오른다. 저장까지 함께 한다 — 런 도중에 창을 닫아도 남아야 한다. */
  bindCloser(event: BondEvent) {
    const next = clamp01(this.bondValue + BOND_EVENTS[event])
    if (next === this.bondValue) return
    this.bondValue = next
    this.save()
  }

  /** 턴이 넘어갈 때마다 기분이 평정으로 조금 돌아오고, 최근 사건 표시가 바랜다. */
  passTurn() {
    if (this.moodValue > 0) this.moodValue = Math.max(0, this.moodValue - MOOD_RECOVERY_PER_TURN)
    else if (this.moodValue < 0) this.moodValue = Math.min(0, this.moodValue + MOOD_RECOVERY_PER_TURN)
    this.recentHurtTurns = Math.max(0, this.recentHurtTurns - 1)
    this.recentWinTurns = Math.max(0, this.recentWinTurns - 1)
  }

  /** 새 런의 시작. 기분과 최근 사건만 지운다 — 유대와 성향과 기억은 남는다. */
  beginRun() {
    this.moodValue = 0
    this.recentHurtTurns = 0
    this.recentWinTurns = 0
  }

  /**
   * 런이 끝났다. 결과를 기억에 넣고 성향을 아주 조금 민다.
   * 자주 죽으면 조심스러워지고, 잘 풀리면 대담해진다 — 그 사람의 플레이가 요정을 만든다.
   */
  endRun(memory: TokenRunMemory) {
    this.memories.unshift(memory)
    if (this.memories.length > MEMORY_LIMIT) this.memories.length = MEMORY_LIMIT
    this.runsTogether += 1

    const survived = memory.outcome === 'clear'
    const step = TRAIT_STEP * (survived ? 1 : -1)
    this.traitValues = {
      // 살아남은 런은 겁을 덜어 주고, 무너진 런은 곁을 지키게 만든다.
      caution: clamp01(this.traitValues.caution - step),
      playfulness: clamp01(this.traitValues.playfulness + step),
      // 호기심은 승패가 아니라 함께한 시간으로 자란다. 익숙해질수록 멀리 나가 본다.
      curiosity: clamp01(this.traitValues.curiosity + (survived ? TRAIT_STEP * 0.5 : TRAIT_STEP * 0.2)),
    }
    this.bindCloser('runFinished')
    this.save()
  }

  /**
   * 회상거리 하나. 직전에 꺼낸 기억은 연달아 다시 꺼내지 않는다 —
   * 같은 말을 두 번 하는 순간 사람 말이 아니게 된다.
   */
  recall(): TokenRunMemory | null {
    const usable = this.memories.filter((_, i) => i !== this.lastRecallIndex)
    if (!usable.length) return null
    const pick = Math.floor(Math.random() * usable.length)
    const memory = usable[pick]
    this.lastRecallIndex = this.memories.indexOf(memory)
    return memory
  }

  get runCount() {
    return this.runsTogether
  }

  snapshot(): TokenMindSnapshot {
    return {
      version: TOKEN_MIND_VERSION,
      bond: this.bondValue,
      traits: { ...this.traitValues },
      runs: this.memories.map((m) => ({ ...m })),
      runsTogether: this.runsTogether,
    }
  }

  private load() {
    const raw = this.storage?.getItem(TOKEN_MIND_KEY)
    if (!raw) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // 손상된 저장은 버리고 처음부터 시작한다. 요정 하나 때문에 게임이 막히지 않는다.
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const data = parsed as Partial<TokenMindSnapshot>
    if (data.version !== TOKEN_MIND_VERSION) return
    this.bondValue = readNumber(data.bond, 0, 0, 1)
    this.runsTogether = readNumber(data.runsTogether, 0, 0, Number.MAX_SAFE_INTEGER)
    const traits: Partial<TokenTraits> = data.traits ?? {}
    this.traitValues = {
      curiosity: readNumber(traits.curiosity, 0.5, 0, 1),
      caution: readNumber(traits.caution, 0.5, 0, 1),
      playfulness: readNumber(traits.playfulness, 0.5, 0, 1),
    }
    this.memories = Array.isArray(data.runs)
      ? data.runs
          .filter((run): run is TokenRunMemory =>
            !!run && typeof run.day === 'number' && (run.outcome === 'clear' || run.outcome === 'defeat'))
          .slice(0, MEMORY_LIMIT)
          .map((run) => ({ day: run.day, outcome: run.outcome, cause: run.cause }))
      : []
  }

  private save() {
    try {
      this.storage?.setItem(TOKEN_MIND_KEY, JSON.stringify(this.snapshot()))
    } catch {
      // 저장 실패(사생활 보호 모드·용량 초과)는 이번 런의 기분까지 망치지 않는다.
    }
  }
}

function defaultStorage(): MindStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 런 하나를 넘어 사는 마음은 하나뿐이다. 전투 뷰는 전투마다 새로 만들어지지만 토큰의
 * 유대와 성향과 기억은 그 경계를 모른다 — 그래서 여기서 한 벌만 들고 나눠 쓴다.
 */
let shared: TokenMind | null = null

export function sharedTokenMind(): TokenMind {
  shared ??= new TokenMind()
  return shared
}
