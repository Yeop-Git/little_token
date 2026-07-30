/**
 * tokenPolicy — 토큰이 "지금 어떻게 있을까"를 고르는 정책.
 *
 * 언멜팅의 `EnaPolicyNetwork`를 이 문제 크기로 줄여 왔다. 거기서는 336개 관측으로
 * 27개 손패 행동을 고르는 MLP였고, 여기서는 12개 관측으로 자율 비행 4결을 고르는
 * 선형 소프트맥스다. 갱신 방식(기준선을 뺀 REINFORCE)과 저장 규약(차원이 어긋난
 * 정책은 거부하고 교사 정책으로 폴백)은 같은 것을 따른다.
 *
 * **무엇을 배우는가.** 이 정책은 게임을 잘하는 법을 배우지 않는다. 토큰은 카드를
 * 골라 주지 않으므로 그럴 게 없다. 배우는 건 하나다 — *지금 이 사람은 곁에 있어 주길
 * 원하는가, 비켜 주길 원하는가.* 그래서 보상도 승패가 아니라 아래 네 가지 관찰에서
 * 나온다: 프롬이 다쳤는데 멀리 있었는가 / 고르는 동안 손패를 가렸는가 / 곁에 있을 때
 * 무사했는가 / 사람이 망설임 없이 골랐는가.
 *
 * 이 보상은 **설계된 heuristic이지 정답이 아니다.** 사람이 실제로 무엇을 원했는지는
 * 알 수 없고, 위 네 신호는 그 대리물이다. 그래서 학습분을 따로 묶어 상한을 두었다
 * (아래 `DELTA_LIMIT`) — 잘못 배워도 손으로 잡은 결의 감각을 완전히 덮지는 못한다.
 */

/** 저장 형식·차원이 바뀌면 올린다. 구버전 정책은 거부하고 사전 성향에서 다시 시작한다. */
export const TOKEN_POLICY_VERSION = 1
export const TOKEN_POLICY_KEY = 'little-token.token-policy.v1'

/** 정책이 고르는 자율 결. `attend`·`alert`는 바깥이 부르는 것이라 여기 없다. */
export const POLICY_ACTIONS = ['orbit', 'wander', 'inspect', 'peer'] as const
export type PolicyAction = (typeof POLICY_ACTIONS)[number]

/** 관측 벡터의 길이. 이 값이 바뀌면 저장된 정책은 폐기된다. */
export const TOKEN_FEATURE_COUNT = 12

/** 지금 무대에서 벌어지는 일 — 정책이 읽는 그대로. */
export interface TokenContext {
  /** 프롬의 체력 비율 0~1. */
  hpRatio: number
  /** 최근 두 턴 안에 맞았는가. */
  recentlyHurt: boolean
  /** 살아 있는 적 수(0~3 이상). */
  enemyCount: number
  /** 전투가 얼마나 진행됐는가 0~1. */
  turnProgress: number
  mood: number
  bond: number
  curiosity: number
  caution: number
  playfulness: number
  /** 사람이 지금 손패 앞에서 얼마나 오래 망설이고 있는가 0~1. */
  hesitation: number
}

/**
 * 한 결이 끝났을 때 돌아보는 그 구간의 기록. 보상은 전적으로 여기서 나온다.
 */
export interface EpisodeOutcome {
  /** 이 구간에 프롬이 맞았는가. */
  tookDamage: boolean
  /** 맞던 순간 토큰이 프롬에게서 얼마나 떨어져 있었는가(무대 px). */
  distanceWhenHurt: number
  /** 사람이 카드를 고르는 동안 토큰이 손패 위를 덮고 있었는가. */
  occludedHand: boolean
  /** 이 구간에 사람이 망설임 없이 골랐는가. */
  decidedQuickly: boolean
}

export type PolicyMatrix = number[][]

export interface TokenPolicyWeights {
  version: number
  features: number
  actions: number
  /** 사전 성향 위에 얹는 학습분. 사전 성향 자체는 저장하지 않는다 — 코드가 원본이다. */
  delta: PolicyMatrix
  baseline: number
}

/** 학습분이 움직일 수 있는 한계. 손으로 잡은 결의 감각을 지키는 안전대다. */
const DELTA_LIMIT = 1.2
const LEARNING_RATE = 0.035
/** 기준선이 최근 보상을 따라가는 속도. 느려야 초반 몇 번에 휘둘리지 않는다. */
const BASELINE_RATE = 0.05
/** 이보다 멀리 있을 때 프롬이 맞으면 "곁에 없었다"로 친다(무대 px). */
const FAR_FROM_PLAYER = 420

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * 관측을 벡터로 편다. 순서는 저장된 정책과 함께 굳는 계약이라 가운데에 끼워 넣지 않는다.
 * 새 관측은 항상 뒤에 붙이고 `TOKEN_FEATURE_COUNT`를 올린다.
 */
export function tokenFeatures(context: TokenContext): number[] {
  const mood = clamp(context.mood, -1, 1)
  return [
    1, // 0 상수항 — 사전 성향의 기본 비율이 여기 실린다
    clamp(context.hpRatio, 0, 1), // 1
    context.recentlyHurt ? 1 : 0, // 2
    clamp(context.enemyCount / 3, 0, 1), // 3
    clamp(context.turnProgress, 0, 1), // 4
    Math.max(0, mood), // 5 들뜬 정도
    Math.max(0, -mood), // 6 가라앉은 정도
    clamp(context.bond, 0, 1), // 7
    clamp(context.curiosity, 0, 1), // 8
    clamp(context.caution, 0, 1), // 9
    clamp(context.playfulness, 0, 1), // 10
    clamp(context.hesitation, 0, 1), // 11
  ]
}

/**
 * 교사 정책 — 손으로 잡은 사전 성향. 학습이 0일 때 이 표만으로 동작하며, 그때의 결
 * 비율이 TokenActor에 적혀 있던 52/18/20/10과 같다(상수항 = ln 가중치).
 *
 * 아래 결합들은 "이렇게 배웠으면 좋겠다"가 아니라 "이건 배우기 전에도 알아야 한다"이다.
 * 프롬이 다쳤는데 요정이 신나서 무대를 가로지르는 첫인상은 학습으로 고칠 게 아니다.
 */
function priorMatrix(): PolicyMatrix {
  const prior: PolicyMatrix = POLICY_ACTIONS.map(() => new Array(TOKEN_FEATURE_COUNT).fill(0))
  const [orbit, wander, inspect, peer] = prior

  // 상수항 — 기본 비율 52 / 18 / 20 / 10.
  orbit[0] = Math.log(52)
  wander[0] = Math.log(18)
  inspect[0] = Math.log(20)
  peer[0] = Math.log(10)

  // 체력이 넉넉할수록 멀리 나가도 된다.
  wander[1] = 0.7
  inspect[1] = 0.3
  // 방금 맞았다면 곁을 지킨다. 이 한 줄이 가장 세다.
  orbit[2] = 1.6
  wander[2] = -1.8
  peer[2] = -1.0
  // 적이 많으면 한눈팔지 않는다.
  wander[3] = -0.7
  peer[3] = -0.5
  // 전투가 길어지면 슬슬 지루해져 돌아다닌다.
  wander[4] = 0.5
  inspect[4] = 0.3
  // 들떴을 때 — 신나서 날고, 화면 너머로 자랑하러 온다.
  wander[5] = 0.8
  peer[5] = 0.5
  // 가라앉았을 때 — 곁에 붙는다.
  orbit[6] = 1.1
  wander[6] = -0.9
  // 유대가 깊을수록 사람 쪽을 자주 본다.
  peer[7] = 0.9
  orbit[7] = 0.2
  // 성향 — 호기심은 들여다보기로, 조심성은 맴돌기로, 장난기는 가로지르기로 나간다.
  inspect[8] = 1.2
  peer[8] = 0.7
  orbit[9] = 1.0
  wander[9] = -1.2
  wander[10] = 1.3
  // 사람이 망설이는 중이면 곁에서 기다린다. 이때 손패 위를 훑는 건 최악이다.
  orbit[11] = 0.9
  inspect[11] = -0.8
  wander[11] = -0.6

  return prior
}

const PRIOR = priorMatrix()

const zeroDelta = (): PolicyMatrix =>
  POLICY_ACTIONS.map(() => new Array(TOKEN_FEATURE_COUNT).fill(0))

export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits)
  const exps = logits.map((value) => Math.exp(value - max))
  const sum = exps.reduce((a, b) => a + b, 0) || 1
  return exps.map((value) => value / sum)
}

/**
 * 구간 하나의 보상. 값은 대략 -1.6 ~ +0.9 사이에 떨어진다.
 * 부호가 뜻하는 바는 하나뿐이다 — 그때 거기 있던 게 옳았는가.
 */
export function episodeReward(outcome: EpisodeOutcome): number {
  let reward = 0
  if (outcome.tookDamage) {
    // 맞은 것 자체는 요정 탓이 아니다. 다만 그 순간 멀리 있었다면 그건 다르다.
    reward -= outcome.distanceWhenHurt > FAR_FROM_PLAYER ? 1 : 0.25
  } else {
    reward += 0.5
  }
  // 고르는 동안 손패를 가린 건 명백한 방해다.
  if (outcome.occludedHand) reward -= 0.6
  // 사람이 거침없이 골랐다면 그 구간의 거리감이 편했다는 뜻이다.
  if (outcome.decidedQuickly) reward += 0.4
  return reward
}

export class TokenPolicy {
  private delta: PolicyMatrix = zeroDelta()
  private baseline = 0
  /** 방금 고른 행동과 그때의 관측. 구간이 끝날 때 이 한 쌍으로 갱신한다. */
  private pending: { action: number; features: number[]; probabilities: number[] } | null = null

  constructor(
    private readonly storage: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null =
      defaultStorage(),
    private readonly random: () => number = Math.random,
  ) {
    this.load()
  }

  /** 지금 관측에서 각 결이 뽑힐 확률. 디버그와 검사에서 정책을 들여다보는 창이다. */
  distribution(context: TokenContext): number[] {
    const x = tokenFeatures(context)
    return softmax(this.logits(x))
  }

  /**
   * 결 하나를 뽑는다. `exclude`는 직전 결로, 같은 결이 연달아 나오면 아무 일도 일어나지
   * 않은 것처럼 보이기 때문에 확률에서 뺀다.
   */
  choose(context: TokenContext, exclude?: PolicyAction): PolicyAction {
    const x = tokenFeatures(context)
    const probabilities = softmax(this.logits(x))
    const excluded = exclude ? POLICY_ACTIONS.indexOf(exclude) : -1

    const usable = probabilities.map((p, i) => (i === excluded ? 0 : p))
    const total = usable.reduce((a, b) => a + b, 0)
    // 직전 결 하나만 남은 극단(확률이 전부 그쪽에 몰린 경우)에서는 그냥 그걸 쓴다.
    const table = total > 1e-6 ? usable.map((p) => p / total) : probabilities

    let roll = this.random()
    let index = table.length - 1
    for (let i = 0; i < table.length; i++) {
      roll -= table[i]
      if (roll <= 0) {
        index = i
        break
      }
    }
    // 갱신은 실제로 뽑힌 행동과 **원래 확률**로 한다 — 제외는 표현이지 정책이 아니다.
    this.pending = { action: index, features: x, probabilities }
    return POLICY_ACTIONS[index]
  }

  /**
   * 방금 끝난 구간을 돌아보고 정책을 민다(기준선을 뺀 REINFORCE).
   * 고른 적이 없으면 아무 일도 하지 않는다 — 바깥이 부른 attend·alert가 그렇다.
   */
  learn(outcome: EpisodeOutcome) {
    const pending = this.pending
    if (!pending) return
    this.pending = null

    const reward = episodeReward(outcome)
    const advantage = reward - this.baseline
    this.baseline += BASELINE_RATE * (reward - this.baseline)

    for (let a = 0; a < POLICY_ACTIONS.length; a++) {
      const chosen = a === pending.action ? 1 : 0
      const grad = (chosen - pending.probabilities[a]) * advantage
      if (grad === 0) continue
      const row = this.delta[a]
      for (let i = 0; i < TOKEN_FEATURE_COUNT; i++) {
        row[i] = clamp(row[i] + LEARNING_RATE * grad * pending.features[i], -DELTA_LIMIT, DELTA_LIMIT)
      }
    }
    this.save()
  }

  /** 학습분만 지운다. 사전 성향은 코드가 원본이라 지울 것이 없다. */
  reset() {
    this.delta = zeroDelta()
    this.baseline = 0
    this.pending = null
    this.save()
  }

  snapshot(): TokenPolicyWeights {
    return {
      version: TOKEN_POLICY_VERSION,
      features: TOKEN_FEATURE_COUNT,
      actions: POLICY_ACTIONS.length,
      delta: this.delta.map((row) => [...row]),
      baseline: this.baseline,
    }
  }

  private logits(x: number[]): number[] {
    return POLICY_ACTIONS.map((_, a) => {
      let sum = 0
      for (let i = 0; i < TOKEN_FEATURE_COUNT; i++) sum += (PRIOR[a][i] + this.delta[a][i]) * x[i]
      return sum
    })
  }

  private load() {
    const raw = this.storage?.getItem(TOKEN_POLICY_KEY)
    if (!raw) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const data = parsed as Partial<TokenPolicyWeights>
    // 차원이 어긋난 정책은 되살리지 않는다. 관측을 하나만 늘려도 예전 가중치는
    // 다른 뜻의 숫자가 되기 때문이다 — 조용히 이상하게 구는 것보다 처음부터가 낫다.
    if (
      data.version !== TOKEN_POLICY_VERSION ||
      data.features !== TOKEN_FEATURE_COUNT ||
      data.actions !== POLICY_ACTIONS.length ||
      !Array.isArray(data.delta) ||
      data.delta.length !== POLICY_ACTIONS.length ||
      data.delta.some((row) => !Array.isArray(row) || row.length !== TOKEN_FEATURE_COUNT)
    ) {
      return
    }
    this.delta = data.delta.map((row) =>
      row.map((value) => (typeof value === 'number' && Number.isFinite(value)
        ? clamp(value, -DELTA_LIMIT, DELTA_LIMIT)
        : 0)),
    )
    this.baseline = typeof data.baseline === 'number' && Number.isFinite(data.baseline) ? data.baseline : 0
  }

  private save() {
    try {
      this.storage?.setItem(TOKEN_POLICY_KEY, JSON.stringify(this.snapshot()))
    } catch {
      // 저장이 막혀도 이번 런의 학습은 메모리 안에서 계속 산다.
    }
  }
}

function defaultStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
