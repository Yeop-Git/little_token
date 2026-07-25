/**
 * Headless combat simulation. Rendering reads the results returned here; no battle
 * rule is defined in BattleView.
 */
import { effectiveBase, isDamageIntent } from '@core/compiler'
import type { Emotion, EnemyDef, Intent, TargetCount } from '@core/types'

export interface EnemyInst {
  def: EnemyDef
  hp: number
  maxHp: number
  /** 보스 체력을 구성하는 막 수. 일반 적은 항상 1이다. */
  healthBars: number
  /** 한 막의 체력. 총 체력은 이 값 × healthBars다. */
  hpPerBar: number
  atkMult: number
  dead: boolean
  initiativePhase: 'first' | 'second'
  nextAttackTurn: number
  engaged: boolean
  guard: number
  magicShield: number
}

export interface PendingAttack {
  dmg: number
  sentence: string
  target: number
  targetCount: TargetCount
  hitCount: number
  pierceGuard: boolean
  emotions: Emotion[]
}

export interface BattleState {
  playerHp: number
  playerMax: number
  guard: number
  counterMultiplier: number
  turn: number
  enemies: EnemyInst[]
  pending: PendingAttack | null
}

export function makeEnemy(def: EnemyDef, atkMult = 1, hpMult = 1, healthBars = 1): EnemyInst {
  const hpPerBar = Math.max(1, Math.round(def.hp * hpMult))
  const bars = def.boss ? Math.max(1, Math.floor(healthBars)) : 1
  const maxHp = hpPerBar * bars
  return {
    def,
    hp: maxHp,
    maxHp,
    healthBars: bars,
    hpPerBar,
    atkMult,
    dead: false,
    initiativePhase: def.initiative,
    nextAttackTurn: 1,
    engaged: false,
    guard: Math.max(0, def.guard ?? 0),
    magicShield: Math.max(0, def.magicShield ?? 0),
  }
}

export const aliveIdx = (state: BattleState): number[] =>
  state.enemies.map((enemy, index) => (enemy.dead ? -1 : index)).filter((index) => index >= 0)

export const frontIdx = (state: BattleState): number => state.enemies.findIndex((enemy) => !enemy.dead)

export const allDead = (state: BattleState): boolean => state.enemies.every((enemy) => enemy.dead)

export function engageInitialFront(state: BattleState): void {
  const front = frontIdx(state)
  if (front >= 0) state.enemies[front].engaged = true
}

export function engageFront(state: BattleState): void {
  const front = frontIdx(state)
  if (front < 0) return
  const enemy = state.enemies[front]
  if (enemy.engaged) return
  enemy.engaged = true
  enemy.nextAttackTurn = state.turn + enemy.def.every
  enemy.initiativePhase = enemy.def.initiative
}

export interface HitFx {
  target: number
  dmg: number
  guardAbsorbed: number
  magicShieldBroken: boolean
  /** 이 타격을 막고 남은 매직실드 겹 수. 실드 타격이 아니면 현재 값과 무관하다. */
  magicShieldRemaining: number
  weak: boolean
  /** 한 번의 타격으로 완전히 소진한 보스 체력 막 수. */
  barsBroken: number
}

export interface ApplyResult {
  text: string
  combos: string[]
  hits: HitFx[]
  selfDmg: number
  heal: number
  killed: number[]
  overflow: number
}

export interface PreparationResult {
  guardGain: number
  counterMultiplier: number
}

export function applyPreparation(state: BattleState, intent: Intent, mult = 1): PreparationResult {
  const guardGain = intent.tags.includes('enemy') ? 0 : Math.max(0, Math.round(intent.guard * mult))
  // 남은 방어막은 피해로 흡수한 만큼만 줄고, 새 방어는 그 위에 누적한다.
  // 방어가 없는 문장을 준비했다는 이유만으로 기존 방어막을 지우지 않는다.
  if (guardGain > 0) {
    state.guard += guardGain
    state.counterMultiplier = intent.counterMultiplier
  }
  return { guardGain, counterMultiplier: state.counterMultiplier }
}

interface AttackPlan {
  dmg: number
  target: number
  targetCount: TargetCount
  hitCount: number
  pierceGuard: boolean
  emotions: Emotion[]
}

const TARGET_FALLOFF = [1, 0.7, 0.5] as const

function damageEnemy(state: BattleState, target: number, dmg: number, pierceGuard: boolean, emotions: Emotion[]): HitFx | null {
  const enemy = state.enemies[target]
  if (!enemy || enemy.dead) return null
  const weak = !!enemy.def.weakEmotion && emotions.includes(enemy.def.weakEmotion)
  const raw = Math.max(0, Math.round(dmg * (weak ? 1.25 : 1)))
  if (enemy.magicShield > 0) {
    enemy.magicShield--
    return {
      target,
      dmg: 0,
      guardAbsorbed: 0,
      magicShieldBroken: true,
      magicShieldRemaining: enemy.magicShield,
      weak,
      barsBroken: 0,
    }
  }
  const guardAbsorbed = pierceGuard ? 0 : Math.min(enemy.guard, raw)
  if (!pierceGuard) enemy.guard -= guardAbsorbed
  const dealt = Math.max(0, raw - guardAbsorbed)
  const barsBefore = Math.ceil(Math.max(0, enemy.hp) / enemy.hpPerBar)
  enemy.hp -= dealt
  const barsAfter = Math.ceil(Math.max(0, enemy.hp) / enemy.hpPerBar)
  if (enemy.hp <= 0) enemy.dead = true
  return {
    target,
    dmg: dealt,
    guardAbsorbed,
    magicShieldBroken: false,
    magicShieldRemaining: enemy.magicShield,
    weak,
    barsBroken: barsBefore - barsAfter,
  }
}

function resolveAttack(state: BattleState, plan: AttackPlan): { hits: HitFx[]; killed: number[]; overflow: number } {
  const hits: HitFx[] = []
  const killed: number[] = []
  const record = (hit: HitFx | null) => {
    if (!hit) return
    hits.push(hit)
    if (state.enemies[hit.target]?.dead && !killed.includes(hit.target)) killed.push(hit.target)
  }

  // 연타는 매직실드를 벗기는 정확한 용도라 대상이 죽어도 다음 적으로 새지 않는다.
  if (plan.hitCount > 1 && plan.targetCount === 1) {
    for (let i = 0; i < plan.hitCount; i++) {
      if (state.enemies[plan.target]?.dead) break
      record(damageEnemy(state, plan.target, plan.dmg, plan.pierceGuard, plan.emotions))
    }
    return { hits, killed, overflow: 0 }
  }

  const targets = plan.targetCount === 'all'
    ? aliveIdx(state)
    : aliveIdx(state).filter((index) => index >= plan.target).slice(0, plan.targetCount)
  for (let rank = 0; rank < targets.length; rank++) {
    const target = targets[rank]
    const before = state.enemies[target].hp
    const scale = plan.targetCount === 1 || plan.targetCount === 'all' ? 1 : TARGET_FALLOFF[rank] ?? TARGET_FALLOFF[2]
    const hit = damageEnemy(state, target, Math.round(plan.dmg * scale), plan.pierceGuard, plan.emotions)
    record(hit)
    if (plan.targetCount === 1 && hit && state.enemies[target].dead) {
      return { hits, killed, overflow: Math.max(0, hit.dmg - before) }
    }
  }
  return { hits, killed, overflow: 0 }
}

export function applyIntent(state: BattleState, intent: Intent, mult: number, target: number): ApplyResult {
  const dealsDamage = isDamageIntent(intent)
  const dmg = Math.round(effectiveBase(intent) * mult)
  const healAmt = Math.round(intent.heal * mult)
  const plan: AttackPlan = {
    dmg,
    target,
    targetCount: intent.targetCount,
    hitCount: intent.hitCount,
    pierceGuard: intent.pierceGuard,
    emotions: intent.emotions,
  }
  if (intent.timing === 'delayed') {
    state.pending = { ...plan, sentence: intent.sentence }
    return { text: `${intent.sentence} → 다음 턴에 ${dmg} 예약`, combos: intent.combos, hits: [], selfDmg: 0, heal: 0, killed: [], overflow: 0 }
  }

  const attack = dealsDamage ? resolveAttack(state, plan) : { hits: [], killed: [], overflow: 0 }
  let selfDmg = intent.recoil
  if (intent.targetMode === 'both') selfDmg += Math.round(dmg * 0.4)
  state.playerHp = Math.min(state.playerMax, state.playerHp - selfDmg + healAmt)
  const label = dealsDamage ? `${dmg} 피해` : healAmt > 0 ? `${healAmt} 회복` : '준비 완료'
  return {
    text: `${intent.sentence} → ${label}` + (selfDmg ? ` · 자신 ${selfDmg}` : ''),
    combos: intent.combos,
    hits: attack.hits,
    selfDmg,
    heal: healAmt,
    killed: attack.killed,
    overflow: attack.overflow,
  }
}

export function applyPendingAttack(state: BattleState): ApplyResult | null {
  const pending = state.pending
  if (!pending) return null
  state.pending = null
  const attack = resolveAttack(state, pending)
  return {
    text: `${pending.sentence} → 예약 발동`,
    combos: [],
    hits: attack.hits,
    selfDmg: 0,
    heal: 0,
    killed: attack.killed,
    overflow: attack.overflow,
  }
}

export interface EnemyStrike {
  text: string
  dealt: number
  idx: number
  absorbed: number
  piercedGuard: boolean
  counterHit: HitFx | null
}

export function enemyTurn(state: BattleState, rng: () => number, phase: 'first' | 'second'): EnemyStrike[] {
  const strikes: EnemyStrike[] = []
  const front = frontIdx(state)
  if (front < 0) return strikes
  engageFront(state)
  const enemy = state.enemies[front]
  if (enemy.initiativePhase !== phase || state.turn < enemy.nextAttackTurn) return strikes

  const raw = Math.round((enemy.def.atk + Math.floor(rng() * 3)) * enemy.atkMult)
  const piercedGuard = !!enemy.def.pierceGuard
  const absorbed = piercedGuard ? 0 : Math.min(state.guard, raw)
  const dealt = piercedGuard ? raw : Math.max(0, raw - state.guard)
  state.playerHp -= dealt
  const counterHit = absorbed > 0 && state.counterMultiplier > 0
    ? damageEnemy(state, front, Math.round(absorbed * state.counterMultiplier), false, [])
    : null
  strikes.push({
    text: `${enemy.def.name}의 습격 → ${dealt} 피해`
      + (piercedGuard ? ' (방어 관통)' : absorbed ? ` (방어 ${absorbed} 흡수)` : ''),
    dealt,
    idx: front,
    absorbed,
    piercedGuard,
    counterHit,
  })
  state.guard -= absorbed
  if (state.guard <= 0) {
    state.guard = 0
    state.counterMultiplier = 0
  }
  enemy.nextAttackTurn = state.turn + enemy.def.every
  if (enemy.def.initiative === 'first') enemy.initiativePhase = phase === 'first' ? 'second' : 'first'
  if (enemy.dead) engageFront(state)
  return strikes
}
