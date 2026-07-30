/**
 * 토큰 정책의 장기 검증 — 짧은 계약 검사(`token-mind-check`)가 "부호가 맞는가"를 본다면,
 * 여기서는 **오래 돌렸을 때 어디로 수렴하는가**를 본다.
 *
 * 왜 필요한가. 보상은 설계된 heuristic이고, 그게 실제로 좋은 요정을 만든다는 건 지금까지
 * 내 가정이었지 검증된 사실이 아니었다. 한 스텝의 갱신 방향이 맞다고 해서 수백 스텝 뒤가
 * 멀쩡하다는 보장은 없다 — 한쪽으로 무너지거나(붕괴), 아무 데도 못 가거나(정체) 한다.
 *
 * 그래서 세 가지 가상 플레이어를 두고 각각 오래 돌린다.
 *   위험한 플레이어  토큰이 멀리 있으면 자주 다친다 → 곁을 지키는 쪽으로 가야 한다
 *   느긋한 플레이어  아무 일도 안 일어난다          → 교사 정책에서 크게 벗어나면 안 된다
 *   가리면 싫은 플레이어 손패를 덮으면 결정이 느려진다 → 손패 위를 피하는 쪽으로 가야 한다
 *
 * 여기서 쓰는 난수는 고정 시드다. 검사가 돌 때마다 다른 답을 내면 그건 검사가 아니다.
 */

import assert from 'node:assert/strict'
import {
  POLICY_ACTIONS,
  TokenPolicy,
  type EpisodeOutcome,
  type PolicyAction,
  type TokenContext,
} from '@core/tokenPolicy'

/** 고정 시드 난수(xorshift32). 결과가 매번 같아야 회귀를 잡을 수 있다. */
function seededRandom(seed: number): () => number {
  let state = seed || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
}

class MemoryStorage {
  private readonly map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const BASE: TokenContext = {
  hpRatio: 0.6, recentlyHurt: false, enemyCount: 2, turnProgress: 0.4,
  mood: 0, bond: 0.3, curiosity: 0.5, caution: 0.5, playfulness: 0.5, hesitation: 0,
}

/** 결마다 대략 어디쯤에 있게 되는지. 가상 플레이어가 "곁에 있었나"를 판단할 근거다. */
const TYPICAL_DISTANCE: Record<PolicyAction, number> = {
  orbit: 150,
  wander: 800,
  inspect: 520,
  peer: 420,
}
/** 손패 위를 덮을 만한 결. 가로지르기는 무대 아래까지 훑고 들여다보기는 손패도 본다. */
const OCCLUDES: Record<PolicyAction, boolean> = {
  orbit: false, wander: true, inspect: true, peer: false,
}

type Player = (action: PolicyAction, roll: () => number) => EpisodeOutcome

/** 토큰이 멀리 있으면 자주 다치는 사람. 곁을 지키는 게 정답인 판이다. */
const dangerousPlayer: Player = (action, roll) => {
  const distance = TYPICAL_DISTANCE[action]
  const hurtChance = distance > 400 ? 0.75 : 0.15
  const tookDamage = roll() < hurtChance
  return { tookDamage, distanceWhenHurt: tookDamage ? distance : 0, occludedHand: false, decidedQuickly: !tookDamage }
}

/** 아무 일도 안 일어나는 사람. 배울 신호가 없으니 정책도 크게 움직이면 안 된다. */
const calmPlayer: Player = () => ({
  tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: true,
})

/** 손패를 가리면 결정이 느려지는 사람. 카드 위를 피하는 게 정답인 판이다. */
const blockedPlayer: Player = (action) => ({
  tookDamage: false,
  distanceWhenHurt: 0,
  occludedHand: OCCLUDES[action],
  decidedQuickly: !OCCLUDES[action],
})

interface Run {
  label: string
  player: Player
  context: TokenContext
  episodes: number
  seed: number
}

function train(run: Run) {
  const roll = seededRandom(run.seed)
  const policy = new TokenPolicy(new MemoryStorage(), roll)
  const before = policy.distribution(run.context)
  const chosen: Record<string, number> = {}
  for (let i = 0; i < run.episodes; i++) {
    const action = policy.choose(run.context)
    chosen[action] = (chosen[action] ?? 0) + 1
    policy.learn(run.player(action, roll))
  }
  return { policy, before, after: policy.distribution(run.context), chosen }
}

const share = (distribution: number[], action: PolicyAction) =>
  distribution[POLICY_ACTIONS.indexOf(action)]
const report: string[] = []

// ── 위험한 플레이어: 곁을 지키는 쪽으로 가야 한다 ───────────────────────────

{
  const { before, after } = train({
    label: 'dangerous', player: dangerousPlayer, context: BASE, episodes: 600, seed: 12345,
  })
  const orbitGain = share(after, 'orbit') - share(before, 'orbit')
  const wanderDrop = share(before, 'wander') - share(after, 'wander')
  assert(orbitGain > 0.02, `멀면 다치는 판에서는 곁을 지키는 쪽이 늘어야 한다 (변화 ${orbitGain.toFixed(3)})`)
  assert(wanderDrop > 0, `멀면 다치는 판에서는 가로지르기가 줄어야 한다 (변화 ${(-wanderDrop).toFixed(3)})`)
  // 그렇다고 한 결만 남으면 요정이 아니라 위성이 된다.
  //
  // 이 상한은 **평상시**에만 건다. 프롬이 다쳤을 때 맴돌기가 90%까지 가는 건 교사
  // 정책이 그렇게 정한 것이고 그게 옳다 — 급할 때 한눈파는 요정이 더 나쁘다.
  // 여기서 보는 건 아무 일도 없는 순간에도 한 가지만 하게 되었는가다.
  const top = Math.max(...after)
  const bottom = Math.min(...after)
  assert(top < 0.74, `평상시에 한 결이 화면을 독점하면 안 된다 (최다 ${(top * 100).toFixed(1)}%)`)
  assert(bottom > 0.03, `어떤 결도 완전히 사라지면 안 된다 (최소 ${(bottom * 100).toFixed(1)}%)`)
  report.push(`위험한 플레이어 600판 · 맴돌기 ${(share(before, 'orbit') * 100).toFixed(1)}% → ${(share(after, 'orbit') * 100).toFixed(1)}% · 가로지르기 ${(share(before, 'wander') * 100).toFixed(1)}% → ${(share(after, 'wander') * 100).toFixed(1)}%`)
}

// ── 느긋한 플레이어: 신호가 없으면 교사 정책 곁에 머문다 ────────────────────

{
  const { before, after } = train({
    label: 'calm', player: calmPlayer, context: BASE, episodes: 600, seed: 999,
  })
  const drift = Math.max(...POLICY_ACTIONS.map((a) => Math.abs(share(after, a) - share(before, a))))
  // 늘 같은 보상만 오면 기준선이 그걸 따라잡아 이득이 0에 수렴한다 — 정책이 표류하지
  // 않는다는 뜻이고, 그게 이 갱신식을 고른 이유다.
  assert(drift < 0.12, `배울 게 없는 판에서 정책이 크게 흔들리면 안 된다 (최대 변화 ${drift.toFixed(3)})`)
  report.push(`느긋한 플레이어 600판 · 최대 변화 ${(drift * 100).toFixed(1)}%p`)
}

// ── 가리면 싫어하는 플레이어: 손패 위를 피해야 한다 ─────────────────────────

{
  const { before, after } = train({
    label: 'blocked', player: blockedPlayer, context: { ...BASE, hesitation: 0.8 }, episodes: 600, seed: 4242,
  })
  const blocking = share(after, 'wander') + share(after, 'inspect')
  const blockingBefore = share(before, 'wander') + share(before, 'inspect')
  assert(blocking < blockingBefore,
    `손패를 가리면 싫어하는 판에서는 덮는 결이 줄어야 한다 (${blockingBefore.toFixed(3)} → ${blocking.toFixed(3)})`)
  report.push(`가리면 싫은 플레이어 600판 · 손패 덮는 결 ${(blockingBefore * 100).toFixed(1)}% → ${(blocking * 100).toFixed(1)}%`)
}

// ── 오래 돌려도 손으로 잡은 성격은 뒤집히지 않는다 ──────────────────────────

{
  // 가장 나쁜 경우를 가정한다 — 곁을 지킬 때마다 벌을 주는 판을 2000번.
  const roll = seededRandom(77)
  const policy = new TokenPolicy(new MemoryStorage(), roll)
  for (let i = 0; i < 2000; i++) {
    const action = policy.choose(BASE)
    policy.learn(action === 'orbit'
      ? { tookDamage: true, distanceWhenHurt: 900, occludedHand: true, decidedQuickly: false }
      : { tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: true })
  }
  const hurt = policy.distribution({ ...BASE, recentlyHurt: true, hpRatio: 0.15 })
  assert(share(hurt, 'orbit') > share(hurt, 'wander'),
    '2000판을 거꾸로 배워도 다친 프롬을 두고 가로지르는 쪽이 우세해지지 않는다')
  const delta = policy.snapshot().delta
  assert(delta.every((row) => row.every((v) => Math.abs(v) <= 1.2 + 1e-9)), '학습분은 끝까지 상한 안에 있다')
  report.push(`역보상 2000판 · 다쳤을 때 맴돌기 ${(share(hurt, 'orbit') * 100).toFixed(1)}% vs 가로지르기 ${(share(hurt, 'wander') * 100).toFixed(1)}%`)
}

report.forEach((line) => console.log(`  ${line}`))
console.log('토큰 정책 장기 수렴 통과 — 위험 인지 · 무신호 안정 · 가림 회피 · 역보상에도 지켜지는 성격')
