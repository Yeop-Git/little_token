/**
 * Headless combat simulation. Rendering reads the results returned here; no battle
 * rule is defined in BattleView.
 */
import { effectiveBase, isDamageIntent } from '@core/compiler'
import type { Emotion, EnemyDef, EnemyPartDef, Intent, TargetCount } from '@core/types'

export interface EnemyPartInst {
  def: EnemyPartDef
  hp: number
  maxHp: number
  broken: boolean
}

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
  /** attackPattern에서 다음 기술을 고르는 누적 공격 횟수. */
  attacksMade: number
  /** 다음 attackPattern 인덱스와 이번 사이클에서 1회 반복을 이미 썼는지 저장한다. */
  attackPatternIndex: number
  attackStepRepeated: boolean
  /** 이 턴까지 플레이어 공격으로 받는 피해가 groggyDamageMult만큼 증가한다. */
  groggyUntilTurn: number
  groggyDamageMult: number
  /** 보스 좌우에 현재 남아 있는 호위 소환물 수. */
  summonsLeft: number
  summonsRight: number
  /** 같은 전투 턴에 턴 시작 소환을 두 번 처리하지 않기 위한 표식. */
  lastSummonTurn: number
  /** 거미 다리와 본체처럼 순서대로 피해를 받는 보스 부위. */
  parts: EnemyPartInst[]
  webTurns: number
  lastWebTurn: number
}

export type BossAttackStage = 1 | 2 | 3

/** 보스는 남은 체력이 2/3, 1/3 경계를 지날 때 공격 동작과 피해가 함께 강해진다. */
export const BOSS_ATTACK_MULTIPLIER: Record<BossAttackStage, number> = {
  1: 1,
  2: 1.25,
  3: 1.5,
}

export function bossAttackStage(enemy: Pick<EnemyInst, 'def' | 'hp' | 'maxHp'>): BossAttackStage {
  if (!enemy.def.boss || enemy.maxHp <= 0) return 1
  const hpRatio = Math.max(0, enemy.hp) / enemy.maxHp
  if (hpRatio <= 1 / 3) return 3
  if (hpRatio <= 2 / 3) return 2
  return 1
}

export interface PendingAttack {
  dmg: number
  sentence: string
  target: number
  targetCount: TargetCount
  hitCount: number
  pierceGuard: boolean
  emotions: Emotion[]
  tags: string[]
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
  // 부위 보스는 부위 하나가 곧 체력 한 줄이다. 호출부의 막 수와 어긋나더라도
  // 부위 배열을 기준으로 잡아 총 체력·HUD·실제 피해 풀이 항상 일치하게 한다.
  const bars = def.parts?.length
    ? def.parts.length
    : def.boss
      ? Math.max(1, Math.floor(healthBars))
      : 1
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
    attacksMade: 0,
    attackPatternIndex: 0,
    attackStepRepeated: false,
    groggyUntilTurn: 0,
    groggyDamageMult: 1,
    summonsLeft: 0,
    summonsRight: 0,
    lastSummonTurn: 0,
    parts: (def.parts ?? []).map((part) => ({
      def: part,
      hp: hpPerBar,
      maxHp: hpPerBar,
      broken: false,
    })),
    webTurns: 0,
    lastWebTurn: 0,
  }
}

export const activeEnemyPart = (enemy: Pick<EnemyInst, 'parts'>): EnemyPartInst | null =>
  enemy.parts.find((part) => !part.broken) ?? null

export const brokenSpiderLegs = (enemy: Pick<EnemyInst, 'parts'>): number =>
  enemy.parts.filter((part) => part.def.kind === 'leg' && part.broken).length

/** 끊어진 다리 수를 기준점으로 삼아, 큰 파훼 시 webTurns를 이 값에 맞추면 장력이 0이 된다. */
export function spiderWebTension(enemy: Pick<EnemyInst, 'webTurns' | 'parts'>): number {
  return Math.min(4, Math.max(0, enemy.webTurns - brokenSpiderLegs(enemy)))
}

export function spiderWebAttackBonus(enemy: Pick<EnemyInst, 'def' | 'webTurns' | 'parts'>): number {
  const pattern = enemy.def.webPattern
  if (!pattern) return 0
  return Math.min(pattern.maxAttackBonus, Math.floor(spiderWebTension(enemy) / 2) * pattern.attackPerTension)
}

export interface SpiderWebTurn {
  idx: number
  tension: number
  attackBonus: number
  brokenLegs: number
}

/** View가 카드 한 장을 고르기 전에 거미줄의 전투 압력을 한 번만 확정한다. */
export function spiderWebAtTurnStart(state: BattleState): SpiderWebTurn | null {
  const idx = state.enemies.findIndex((enemy) => !enemy.dead && !!enemy.def.webPattern)
  if (idx < 0) return null
  const enemy = state.enemies[idx]
  if (enemy.lastWebTurn === state.turn) return null
  enemy.lastWebTurn = state.turn
  enemy.webTurns++
  return {
    idx,
    tension: spiderWebTension(enemy),
    attackBonus: spiderWebAttackBonus(enemy),
    brokenLegs: brokenSpiderLegs(enemy),
  }
}

export const summonCount = (enemy: Pick<EnemyInst, 'summonsLeft' | 'summonsRight'>): number =>
  enemy.summonsLeft + enemy.summonsRight

export interface TurnSummon {
  idx: number
  name: string
  side: 'left' | 'right'
  slot: number
  count: number
  max: number
}

/** 턴 시작 소환은 순수 전투 상태에서 확정하고, View는 반환값으로 연출만 한다. */
export function summonAtTurnStart(state: BattleState): TurnSummon[] {
  const summoned: TurnSummon[] = []
  state.enemies.forEach((enemy, idx) => {
    const pattern = enemy.def.summonPattern
    if (!pattern || enemy.dead || enemy.lastSummonTurn === state.turn) return
    enemy.lastSummonTurn = state.turn
    for (let i = 0; i < pattern.perTurn && summonCount(enemy) < pattern.max; i++) {
      const canLeft = enemy.summonsLeft < pattern.maxPerSide
      const canRight = enemy.summonsRight < pattern.maxPerSide
      if (!canLeft && !canRight) break
      const side = canLeft && (!canRight || enemy.summonsLeft <= enemy.summonsRight) ? 'left' : 'right'
      if (side === 'left') enemy.summonsLeft++
      else enemy.summonsRight++
      const slot = side === 'left' ? enemy.summonsLeft : enemy.summonsRight
      summoned.push({ idx, name: pattern.name, side, slot, count: summonCount(enemy), max: pattern.max })
    }
  })
  return summoned
}

export function nextEnemyAttackStep(enemy: EnemyInst): NonNullable<EnemyDef['attackPattern']>[number] | null {
  const pattern = enemy.def.attackPattern
  if (!pattern?.length) return null
  return pattern[enemy.attackPatternIndex % pattern.length]
}

function advanceEnemyAttackPattern(enemy: EnemyInst, rng: () => number): void {
  const pattern = enemy.def.attackPattern
  if (!pattern?.length) return
  const current = pattern[enemy.attackPatternIndex % pattern.length]
  if (!enemy.attackStepRepeated && (current.repeatOnceChance ?? 0) > 0 && rng() < current.repeatOnceChance!) {
    enemy.attackStepRepeated = true
    return
  }
  enemy.attackPatternIndex = (enemy.attackPatternIndex + 1) % pattern.length
  enemy.attackStepRepeated = false
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
  /** 부위 보스에서 이 타격이 시작된 다리 또는 본체. */
  partId?: string
  partName?: string
  /** 공개 약점을 맞혀 거미줄 장력을 끊었는가. */
  webCut?: boolean
  /** 부위 체력 한 칸 파괴 또는 감정 공명으로 거미줄을 전부 날렸는가. */
  webBurst?: boolean
  webBurstReason?: 'part' | 'emotion'
  tensionReduced?: number
}

export interface ApplyResult {
  text: string
  combos: string[]
  hits: HitFx[]
  selfDmg: number
  heal: number
  killed: number[]
  overflow: number
  /** 다대상 문장이 보스 곁에서 흩어 낸 호위 소환물 수. */
  summonsDispersed: number
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
  tags: string[]
}

const TARGET_FALLOFF = [1, 0.7, 0.5] as const

function activePartWeak(enemy: EnemyInst, emotions: readonly Emotion[], tags: readonly string[]): boolean {
  const weakness = activeEnemyPart(enemy)?.def.weakness
  if (!weakness) return false
  return weakness.kind === 'emotion'
    ? emotions.includes(weakness.value as Emotion)
    : tags.includes(weakness.value)
}

function damageEnemy(
  state: BattleState,
  target: number,
  dmg: number,
  pierceGuard: boolean,
  emotions: Emotion[],
  tags: string[] = [],
): HitFx | null {
  const enemy = state.enemies[target]
  if (!enemy || enemy.dead) return null
  const tensionBefore = spiderWebTension(enemy)
  const part = activeEnemyPart(enemy)
  const weak = part
    ? activePartWeak(enemy, emotions, tags)
    : !!enemy.def.weakEmotion && emotions.includes(enemy.def.weakEmotion)
  const groggyMult = state.turn <= enemy.groggyUntilTurn ? enemy.groggyDamageMult : 1
  const raw = Math.max(0, Math.round(dmg * (weak ? (part ? 1.5 : 1.25) : 1) * groggyMult))
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
      partId: part?.def.id,
      partName: part?.def.name,
      webCut: false,
      webBurst: false,
      tensionReduced: 0,
    }
  }
  const guardAbsorbed = pierceGuard ? 0 : Math.min(enemy.guard, raw)
  if (!pierceGuard) enemy.guard -= guardAbsorbed
  const dealt = Math.max(0, raw - guardAbsorbed)
  const barsBefore = enemy.parts.length
    ? enemy.parts.filter((candidate) => !candidate.broken).length
    : Math.ceil(Math.max(0, enemy.hp) / enemy.hpPerBar)
  if (part) {
    // 강한 문장은 한 다리의 남은 체력에서 멈추지 않는다. 다음 다리와 본체까지
    // 순차 관통시켜 기존 다중 체력막의 폭발적인 상한 판타지를 보존한다.
    let remaining = dealt
    for (const candidate of enemy.parts.slice(enemy.parts.indexOf(part))) {
      if (remaining <= 0) break
      const applied = Math.min(candidate.hp, remaining)
      candidate.hp -= applied
      remaining -= applied
      if (candidate.hp <= 0) candidate.broken = true
    }
    enemy.hp = enemy.parts.reduce((sum, candidate) => sum + Math.max(0, candidate.hp), 0)
  } else {
    enemy.hp -= dealt
  }
  const barsAfter = enemy.parts.length
    ? enemy.parts.filter((candidate) => !candidate.broken).length
    : Math.ceil(Math.max(0, enemy.hp) / enemy.hpPerBar)
  if (enemy.hp <= 0) enemy.dead = true
  const barsBroken = barsBefore - barsAfter
  const emotionBurst = (['joy', 'anger', 'sorrow', 'pleasure'] as const).some(
    (emotion) => emotions.filter((entry) => entry === emotion).length >= 2,
  )
  const webBurst = !!enemy.def.webPattern && dealt > 0 && (barsBroken > 0 || emotionBurst)
  const webCut = !!enemy.def.webPattern && weak && dealt > 0 && !webBurst
  if (webBurst) {
    // 부위 한 칸 파괴와 감정 공명은 쌓인 거미줄을 전부 걷어 내는 큰 파훼다.
    enemy.webTurns = brokenSpiderLegs(enemy)
  } else if (webCut) {
    // 약점만 맞힌 경우에는 작은 파훼로 한 겹을 끊는다.
    enemy.webTurns = Math.max(brokenSpiderLegs(enemy), enemy.webTurns - 1)
  }
  return {
    target,
    dmg: dealt,
    guardAbsorbed,
    magicShieldBroken: false,
    magicShieldRemaining: enemy.magicShield,
    weak,
    barsBroken,
    partId: part?.def.id,
    partName: part?.def.name,
    webCut,
    webBurst,
    webBurstReason: webBurst ? (emotionBurst ? 'emotion' : 'part') : undefined,
    tensionReduced: Math.max(0, tensionBefore - spiderWebTension(enemy)),
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
      record(damageEnemy(state, plan.target, plan.dmg, plan.pierceGuard, plan.emotions, plan.tags))
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
    const hit = damageEnemy(state, target, Math.round(plan.dmg * scale), plan.pierceGuard, plan.emotions, plan.tags)
    record(hit)
    if (plan.targetCount === 1 && hit && state.enemies[target].dead) {
      return { hits, killed, overflow: Math.max(0, hit.dmg - before) }
    }
  }
  return { hits, killed, overflow: 0 }
}

function disperseTargetSummons(state: BattleState, target: number, targetCount: TargetCount): number {
  const enemy = state.enemies[target]
  if (!enemy || enemy.dead || !enemy.def.summonPattern || targetCount === 1) return 0
  const available = summonCount(enemy)
  const requested = targetCount === 'all' ? available : Math.max(0, targetCount - 1)
  let remaining = Math.min(available, requested)
  const dispersed = remaining
  // 최근에 들어온 오른쪽 호위부터 번갈아 걷어 내 좌우 실루엣이 한쪽으로 쏠리지 않게 한다.
  while (remaining > 0) {
    if (enemy.summonsRight >= enemy.summonsLeft && enemy.summonsRight > 0) enemy.summonsRight--
    else if (enemy.summonsLeft > 0) enemy.summonsLeft--
    remaining--
  }
  return dispersed
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
    tags: intent.tags,
  }
  if (intent.timing === 'delayed') {
    state.pending = { ...plan, sentence: intent.sentence }
    return { text: `${intent.sentence} → 다음 턴에 ${dmg} 예약`, combos: intent.combos, hits: [], selfDmg: 0, heal: 0, killed: [], overflow: 0, summonsDispersed: 0 }
  }

  const attack = dealsDamage ? resolveAttack(state, plan) : { hits: [], killed: [], overflow: 0 }
  const summonsDispersed = dealsDamage ? disperseTargetSummons(state, target, intent.targetCount) : 0
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
    summonsDispersed,
  }
}

export function applyPendingAttack(state: BattleState): ApplyResult | null {
  const pending = state.pending
  if (!pending) return null
  state.pending = null
  const attack = resolveAttack(state, pending)
  const summonsDispersed = disperseTargetSummons(state, pending.target, pending.targetCount)
  return {
    text: `${pending.sentence} → 예약 발동`,
    combos: [],
    hits: attack.hits,
    selfDmg: 0,
    heal: 0,
    killed: attack.killed,
    overflow: attack.overflow,
    summonsDispersed,
  }
}

export interface EnemyStrike {
  text: string
  dealt: number
  idx: number
  /** 보스의 현재 체력 구간에 맞춘 피해 단계. 일반 적은 1이다. */
  attackStage: BossAttackStage
  /** 실제 재생할 공격 클립 단계. 패턴 지정이 없으면 체력 기반 attackStage를 따른다. */
  animationStage: BossAttackStage
  absorbed: number
  /** 강한 기술이 플레이어의 남은 방어를 수치와 무관하게 전부 지웠는가. */
  guardShattered: boolean
  /** 실제 체력 피해에 비례해 적이 회복한 양. */
  lifeStolen: number
  /** 공격 직후 다음 플레이어 턴까지 받는 피해 증가 상태에 들어갔는가. */
  groggyEntered: boolean
  groggyDamageMult: number
  telegraphText: string | null
  webFinisher: boolean
  webReleased: boolean
  /** 벌떼 돌격으로 이번 공격에 참가한 뒤 사라진 호위 수. */
  summonsReleased: number
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

  const attackStep = nextEnemyAttackStep(enemy)
  const attackStage = bossAttackStage(enemy)
  const animationStage = attackStep?.animationStage ?? attackStage
  const attackMultiplier = BOSS_ATTACK_MULTIPLIER[attackStage]
  const summonPattern = enemy.def.summonPattern
  const escorts = summonCount(enemy)
  const summonAttackBonus = escorts * (summonPattern?.attackBonusPerUnit ?? 0)
  const webAttackBonus = spiderWebAttackBonus(enemy)
  const webFinisher = !!enemy.def.webPattern && spiderWebTension(enemy) >= 4
  const summonsReleased = summonPattern && escorts >= summonPattern.releaseAt ? escorts : 0
  const uncappedRaw = Math.round(
    (enemy.def.atk + (attackStep?.bonusAtk ?? 0) + summonAttackBonus + webAttackBonus + Math.floor(rng() * 3))
      * enemy.atkMult
      * attackMultiplier
      * (attackStep?.damageScale ?? 1),
  )
  // 피니셔는 큰 쇼를 만들되 즉사기가 아니다. 일반 조임도 최대 체력 비례로 눌러
  // 15스테이지의 높은 공격 배율보다 기믹의 읽기와 파훼를 앞세운다.
  const webShowCap = Math.max(1, Math.round(state.playerMax * (webFinisher ? .55 : .35)))
  const finisherNonlethalCap = state.guard + Math.max(0, state.playerHp - 1)
  const raw = enemy.def.webPattern
    ? Math.min(uncappedRaw, webShowCap, webFinisher ? finisherNonlethalCap : Infinity)
    : uncappedRaw
  const piercedGuard = !!enemy.def.pierceGuard
  const guardShattered = !!attackStep?.shatterGuard && state.guard > 0
  const absorbed = guardShattered ? state.guard : piercedGuard ? 0 : Math.min(state.guard, raw)
  const dealt = guardShattered ? 0 : piercedGuard ? raw : Math.max(0, raw - state.guard)
  state.playerHp -= dealt
  const lifeStolen = Math.min(
    Math.max(0, enemy.maxHp - enemy.hp),
    Math.max(0, Math.round(dealt * (attackStep?.lifeStealRate ?? 0))),
  )
  enemy.hp += lifeStolen
  const counterHit = absorbed > 0 && state.counterMultiplier > 0
    ? damageEnemy(state, front, Math.round(absorbed * state.counterMultiplier), false, [])
    : null
  const groggyEntered = !!attackStep?.groggyDamageMult
    && (!attackStep.groggyRequiresGuardShatter || guardShattered)
    && !enemy.dead
  if (groggyEntered) {
    enemy.groggyUntilTurn = state.turn + 1
    enemy.groggyDamageMult = attackStep.groggyDamageMult!
  }
  strikes.push({
    text: `${enemy.def.name}의 ${webFinisher ? '사방 거미줄 조임' : summonsReleased > 0 ? '벌떼 돌격' : attackStep?.name ?? '습격'} → ${dealt} 피해`
      + (enemy.def.boss && attackStage > 1 ? ` (공격 ${attackStage}단계 ×${attackMultiplier.toFixed(2)})` : '')
      + (summonAttackBonus > 0 ? ` (호위 공격 +${summonAttackBonus})` : '')
      + (webAttackBonus > 0 ? ` (거미줄 장력 +${webAttackBonus})` : '')
      + (guardShattered ? ` (방어 ${absorbed} 전량 파괴)` : '')
      + (lifeStolen > 0 ? ` (흡혈 ${lifeStolen})` : '')
      + (groggyEntered ? ` (그로기 · 받는 피해 ×${enemy.groggyDamageMult.toFixed(1)})` : '')
      + (piercedGuard ? ' (방어 관통)' : absorbed && !guardShattered ? ` (방어 ${absorbed} 흡수)` : ''),
    dealt,
    idx: front,
    attackStage,
    animationStage,
    absorbed,
    guardShattered,
    lifeStolen,
    groggyEntered,
    groggyDamageMult: enemy.groggyDamageMult,
    telegraphText: attackStep?.telegraphText ?? null,
    webFinisher,
    webReleased: webFinisher,
    summonsReleased,
    piercedGuard,
    counterHit,
  })
  if (summonsReleased > 0) {
    enemy.summonsLeft = 0
    enemy.summonsRight = 0
  }
  if (webFinisher) enemy.webTurns = brokenSpiderLegs(enemy)
  enemy.attacksMade++
  advanceEnemyAttackPattern(enemy, rng)
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
