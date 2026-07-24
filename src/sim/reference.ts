/**
 * 레퍼런스 전투 시뮬 — SPEC 6장 경로 C. 기존 헤드리스 시뮬을 붙일 땐 이 파일만
 * 교체한다(View/Compiler 불변). 다중 적 + 범위(aoe)를 지원한다.
 */

import { effectiveBase, isDamageIntent } from '@core/compiler'
import type { EnemyDef, Intent } from '@core/types'

export interface EnemyInst {
  def: EnemyDef
  hp: number
  maxHp: number
  atkMult: number
  dead: boolean
  initiativePhase: 'first' | 'second'
  nextAttackTurn: number
}

export interface BattleState {
  playerHp: number
  playerMax: number
  guard: number
  turn: number
  enemies: EnemyInst[]
  pending: { dmg: number; sentence: string; aoe: boolean; target: number } | null
}

export function makeEnemy(def: EnemyDef, atkMult = 1, hpMult = 1): EnemyInst {
  const maxHp = Math.max(1, Math.round(def.hp * hpMult))
  return {
    def,
    hp: maxHp,
    maxHp,
    atkMult,
    dead: false,
    initiativePhase: def.initiative,
    nextAttackTurn: 1,
  }
}

export interface HitFx {
  target: number // 적 인덱스
  dmg: number
}
export interface ApplyResult {
  text: string
  combos: string[]
  hits: HitFx[]
  selfDmg: number
  heal: number
  killed: number[]
  overflow: number // 단일 공격이 최전방 적을 넘겨 죽였을 때 남는 초과 피해
}

export interface PreparationResult {
  guardGain: number // 이번 문장으로 선공 전에 얻은 방어(임시 체력)
}

// 살아있는 적 인덱스 목록.
export const aliveIdx = (s: BattleState): number[] =>
  s.enemies.map((e, i) => (e.dead ? -1 : i)).filter((i) => i >= 0)

// 준비 효과는 적 선공보다 먼저 적용한다. 이전 문장의 미사용 방어는 다음 문장의
// 준비 단계까지만 유지되며, 새 방어와 중첩하지 않고 이번 문장의 값으로 교체한다.
export function applyPreparation(state: BattleState, intent: Intent, mult = 1): PreparationResult {
  const guardGain = intent.tags.includes('enemy') ? 0 : Math.max(0, Math.round(intent.guard * mult))
  state.guard = guardGain
  return { guardGain }
}

export function applyIntent(
  state: BattleState,
  intent: Intent,
  mult: number, // BattleView에서 확정한 최종 배율(운·룰렛·variance 포함)
  target: number,
): ApplyResult {
  const dealsDamage = isDamageIntent(intent)
  const dmg = Math.round(effectiveBase(intent) * mult)
  const healAmt = Math.round(intent.heal * mult) // 회복도 배율을 받는다

  // 지연 발동은 예약만 한다.
  if (intent.timing === 'delayed') {
    state.pending = { dmg, sentence: intent.sentence, aoe: intent.aoe === 'all', target }
    return {
      text: `${intent.sentence} → 다음 턴에 ${dmg} 예약`,
      combos: intent.combos,
      hits: [],
      selfDmg: 0,
      heal: 0,
      killed: [],
      overflow: 0,
    }
  }

  const hits: HitFx[] = []
  const killed: number[] = []
  const targets = !dealsDamage ? [] : intent.aoe === 'all' ? aliveIdx(state) : [target]

  let overflow = 0
  for (const ti of targets) {
    const e = state.enemies[ti]
    if (!e || e.dead) continue
    const before = e.hp
    e.hp -= dmg
    hits.push({ target: ti, dmg })
    if (e.hp <= 0) {
      e.dead = true
      killed.push(ti)
      // 단일 공격만 초과 피해를 다음 적으로 넘긴다(범위는 각자 처리).
      if (intent.aoe !== 'all') overflow = dmg - before
    }
  }

  // 자해 + 공멸(both) 되받음.
  let selfDmg = intent.recoil
  if (intent.targetMode === 'both') selfDmg += Math.round(dmg * 0.4)
  state.playerHp = Math.min(state.playerMax, state.playerHp - selfDmg + healAmt)

  const label = dealsDamage ? `${dmg} 피해` : healAmt > 0 ? `${healAmt} 회복` : '준비 완료'
  return {
    text: `${intent.sentence} → ${label}` + (selfDmg ? ` · 자신 ${selfDmg}` : ''),
    combos: intent.combos,
    hits,
    selfDmg,
    heal: healAmt,
    killed,
    overflow: Math.max(0, overflow),
  }
}

export interface EnemyStrike {
  text: string
  dealt: number
  idx: number // 공격한 적 인덱스(연출용)
}

// 적 행동 페이즈 — 최전방 적이 현재 선/후공 페이즈이며 쿨다운이 끝났을 때만 행동한다.
// 기본 선공 적은 행동할 때마다 후공→선공으로 교대하고, 기본 후공 적은 계속 후공이다.
export function enemyTurn(state: BattleState, rng: () => number, phase: 'first' | 'second'): EnemyStrike[] {
  const strikes: EnemyStrike[] = []
  const front = frontIdx(state)
  if (front < 0) return strikes
  const e = state.enemies[front]
  if (e.initiativePhase === phase && state.turn >= e.nextAttackTurn) {
    const raw = Math.round((e.def.atk + Math.floor(rng() * 3)) * e.atkMult)
    const dealt = Math.max(0, raw - state.guard)
    const absorbed = Math.min(state.guard, raw)
    state.playerHp -= dealt
    strikes.push({
      text: `${e.def.name}의 습격 → ${dealt} 피해` + (absorbed ? ` (방어 ${absorbed} 흡수)` : ''),
      dealt,
      idx: front,
    })
    state.guard = 0
    e.nextAttackTurn = state.turn + e.def.every
    if (e.def.initiative === 'first') {
      e.initiativePhase = phase === 'first' ? 'second' : 'first'
    }
  }
  return strikes
}

// 레일 최전방(살아있는 첫 번째) 적 인덱스. 없으면 -1.
export const frontIdx = (s: BattleState): number => s.enemies.findIndex((e) => !e.dead)

export const allDead = (s: BattleState): boolean => s.enemies.every((e) => e.dead)
