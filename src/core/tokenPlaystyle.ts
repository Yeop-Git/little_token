/**
 * tokenPlaystyle — 토큰이 "이 사람이 어떻게 쓰는가"를 지켜본 기록.
 *
 * `tokenPolicy`와 배우는 축이 다르다. 정책은 **거리감**을 배운다(곁에 있을까 비켜 줄까).
 * 여기는 **취향**을 배운다 — 어떤 감정의 단어를 고르고, 때리는 쪽인지 막는 쪽인지,
 * 여백 밖까지 밀어붙이는 사람인지, 오래 고민하는 사람인지.
 *
 * 학습이랄 것도 없이 그냥 세는 것이다. 그게 맞다. 취향은 추론할 게 아니라 관찰할
 * 것이고, 세어 둔 숫자가 곧 근거가 된다 — 유대 창에 그대로 펴 보일 수 있고,
 * 토큰의 대사도 "그렇게 느꼈다"가 아니라 "27번 중 19번 그랬다"에서 나온다.
 *
 * DOM에 의존하지 않는다. 저장소를 주입받아 검사 스크립트가 node에서 그대로 돌린다.
 */

import type { Emotion } from './types'
import type { MindStorage } from './tokenMind'

export const TOKEN_STYLE_VERSION = 1
export const TOKEN_STYLE_KEY = 'little-token.playstyle.v1'

/** 문장의 마지막 동사가 무엇을 했는가. 전투 성향의 단일 출처다. */
export type ActionKind = 'attack' | 'guard' | 'heal'

/** 이 사람을 한마디로 부르면. 토큰의 대사와 유대 창이 같은 값을 읽는다. */
export type PlayerArchetype = 'striker' | 'keeper' | 'mender' | 'balanced'

/** 굳히기 전에 최소 이만큼은 봐야 한다. 세 판 보고 사람을 규정하지 않는다. */
const ARCHETYPE_MIN_SENTENCES = 12
/** 한 갈래가 이 비율을 넘으면 그 사람의 색으로 본다. */
const ARCHETYPE_SHARE = 0.45
/** 이 안에 골랐으면 망설이지 않은 것으로 친다(tokenPolicy와 같은 기준). */
const QUICK_MS = 2500

export interface TokenStyleSnapshot {
  version: number
  /** 감정별 사용 횟수. 희·노·애·락 + 무감정. */
  emotions: Record<string, number>
  /** 행동 종류별 횟수. */
  actions: Record<ActionKind, number>
  /** 단어별 사용 횟수. 가장 아끼는 한 장을 뽑는 데 쓴다. */
  words: Record<string, number>
  /** 완성한 문장 수. 모든 비율의 분모다. */
  sentences: number
  /** 관용구가 맞물린 문장 수. */
  combos: number
  /** 여백 밖까지 밀어붙인 횟수. */
  overdraws: number
  /** 결정 시간 누적(ms)과 횟수. 평균을 내려고 둘 다 센다. */
  decisionMs: number
  decisions: number
  /** 망설임 없이 고른 횟수. */
  quickDecisions: number
}

const emptySnapshot = (): TokenStyleSnapshot => ({
  version: TOKEN_STYLE_VERSION,
  emotions: {},
  actions: { attack: 0, guard: 0, heal: 0 },
  words: {},
  sentences: 0,
  combos: 0,
  overdraws: 0,
  decisionMs: 0,
  decisions: 0,
  quickDecisions: 0,
})

/** 토큰이 사람 말로 옮길 수 있게 정리한 관찰 결과. 유대 창과 대사가 같은 걸 읽는다. */
export interface StyleReading {
  /** 아직 규정하기엔 이른가. 그렇다면 토큰도 단정하지 않는다. */
  tentative: boolean
  archetype: PlayerArchetype
  /** 가장 자주 고른 감정. 한 번도 안 골랐으면 null. */
  favoriteEmotion: Emotion | null
  /** 그 감정이 차지하는 비율 0~1. */
  favoriteEmotionShare: number
  /** 가장 자주 쓴 단어 id. */
  favoriteWord: string | null
  favoriteWordCount: number
  /** 관용구 성사율 0~1. */
  comboRate: number
  /** 여백 밖으로 밀어붙인 비율 0~1. 무모함의 척도다. */
  boldness: number
  /** 평균 결정 시간(ms). 한 번도 안 쟀으면 0. */
  averageDecisionMs: number
  /** 망설임 없이 고른 비율 0~1. */
  decisiveness: number
  sentences: number
  actions: Record<ActionKind, number>
}

const readNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback

const readCounter = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    const n = readNumber(count, -1)
    if (n >= 0) out[key] = n
  }
  return out
}

export class TokenPlaystyle {
  private data = emptySnapshot()

  constructor(private readonly storage: MindStorage | null = defaultStorage()) {
    this.load()
  }

  /**
   * 문장 하나가 완성됐다. 토큰이 지켜본 것 전부가 이 한 번에 들어온다.
   * 저장은 여기서만 한다 — 카드 한 장 고를 때마다 쓰면 손패가 뻑뻑해진다.
   */
  noteSentence(entry: {
    words: Array<{ id: string; emotion?: Emotion }>
    action: ActionKind
    combo: boolean
    overdraw: boolean
  }) {
    this.data.sentences += 1
    this.data.actions[entry.action] = (this.data.actions[entry.action] ?? 0) + 1
    if (entry.combo) this.data.combos += 1
    if (entry.overdraw) this.data.overdraws += 1
    for (const word of entry.words) {
      this.data.words[word.id] = (this.data.words[word.id] ?? 0) + 1
      const emotion = word.emotion ?? 'neutral'
      this.data.emotions[emotion] = (this.data.emotions[emotion] ?? 0) + 1
    }
    this.save()
  }

  /** 카드 한 장을 고르는 데 걸린 시간. 문장이 끝날 때 한꺼번에 저장된다. */
  noteDecision(elapsedMs: number) {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return
    // 창을 내려놨다 온 경우까지 평균에 넣으면 숫자가 뜻을 잃는다. 넉넉한 상한에서 자른다.
    this.data.decisionMs += Math.min(elapsedMs, 60_000)
    this.data.decisions += 1
    if (elapsedMs < QUICK_MS) this.data.quickDecisions += 1
  }

  /** 지켜본 것을 사람 말로 옮길 수 있는 모양으로 정리한다. */
  read(): StyleReading {
    const d = this.data
    const total = d.sentences || 0
    const actionTotal = d.actions.attack + d.actions.guard + d.actions.heal
    const emotionEntries = Object.entries(d.emotions).filter(([key]) => key !== 'neutral')
    const emotionTotal = emotionEntries.reduce((sum, [, n]) => sum + n, 0)
    const topEmotion = emotionEntries.sort((a, b) => b[1] - a[1])[0]
    const topWord = Object.entries(d.words).sort((a, b) => b[1] - a[1])[0]

    let archetype: PlayerArchetype = 'balanced'
    if (actionTotal > 0) {
      const share = (kind: ActionKind) => d.actions[kind] / actionTotal
      if (share('attack') >= ARCHETYPE_SHARE) archetype = 'striker'
      else if (share('guard') >= ARCHETYPE_SHARE) archetype = 'keeper'
      else if (share('heal') >= ARCHETYPE_SHARE) archetype = 'mender'
    }

    return {
      tentative: total < ARCHETYPE_MIN_SENTENCES,
      archetype,
      favoriteEmotion: (topEmotion?.[0] as Emotion) ?? null,
      favoriteEmotionShare: topEmotion && emotionTotal > 0 ? topEmotion[1] / emotionTotal : 0,
      favoriteWord: topWord?.[0] ?? null,
      favoriteWordCount: topWord?.[1] ?? 0,
      comboRate: total > 0 ? d.combos / total : 0,
      boldness: total > 0 ? d.overdraws / total : 0,
      averageDecisionMs: d.decisions > 0 ? d.decisionMs / d.decisions : 0,
      decisiveness: d.decisions > 0 ? d.quickDecisions / d.decisions : 0,
      sentences: total,
      actions: { ...d.actions },
    }
  }

  snapshot(): TokenStyleSnapshot {
    return {
      ...this.data,
      emotions: { ...this.data.emotions },
      actions: { ...this.data.actions },
      words: { ...this.data.words },
    }
  }

  private load() {
    const raw = this.storage?.getItem(TOKEN_STYLE_KEY)
    if (!raw) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const data = parsed as Partial<TokenStyleSnapshot>
    if (data.version !== TOKEN_STYLE_VERSION) return
    const actions = readCounter(data.actions)
    this.data = {
      version: TOKEN_STYLE_VERSION,
      emotions: readCounter(data.emotions),
      actions: {
        attack: readNumber(actions.attack),
        guard: readNumber(actions.guard),
        heal: readNumber(actions.heal),
      },
      words: readCounter(data.words),
      sentences: readNumber(data.sentences),
      combos: readNumber(data.combos),
      overdraws: readNumber(data.overdraws),
      decisionMs: readNumber(data.decisionMs),
      decisions: readNumber(data.decisions),
      quickDecisions: readNumber(data.quickDecisions),
    }
  }

  private save() {
    try {
      this.storage?.setItem(TOKEN_STYLE_KEY, JSON.stringify(this.snapshot()))
    } catch {
      // 저장이 막혀도 이번 런의 관찰은 메모리 안에서 계속 산다.
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
 * 취향도 런을 넘어 사는 기록이라 한 벌만 들고 나눠 쓴다(TokenMind와 같은 이유).
 */
let shared: TokenPlaystyle | null = null

export function sharedTokenPlaystyle(): TokenPlaystyle {
  shared ??= new TokenPlaystyle()
  return shared
}
