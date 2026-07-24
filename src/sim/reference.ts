/**
 * 레퍼런스 전투 시뮬 — SPEC 6장 경로 C. 기존 헤드리스 시뮬을 붙일 땐 이 파일만
 * 교체한다(View/Compiler 불변). 다중 적 + 범위(aoe)를 지원한다.
 */

import { finalMultiplier } from '@core/compiler'
import type { EnemyDef, Intent } from '@core/types'

export interface EnemyInst {
  def: EnemyDef
  hp: number
  maxHp: number
  atkMult: number
  dead: boolean
}

export interface BattleState {
  playerHp: number
  playerMax: number
  guard: number
  turn: number
  enemies: EnemyInst[]
  pending: { dmg: number; sentence: string; aoe: boolean; target: number } | null
}

export function makeEnemy(def: EnemyDef, atkMult = 1): EnemyInst {
  return { def, hp: def.hp, maxHp: def.hp, atkMult, dead: false }
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
}

// 살아있는 적 인덱스 목록.
export const aliveIdx = (s: BattleState): number[] =>
  s.enemies.map((e, i) => (e.dead ? -1 : i)).filter((i) => i >= 0)

export function applyIntent(
  state: BattleState,
  intent: Intent,
  multCap: number,
  target: number,
  rng: () => number,
  atkBonus = 0, // 플레이어 공격력 스탯(공격 문장 위력에 가산)
): ApplyResult {
  const roll = intent.variance ? rng() : null
  const mult = finalMultiplier(intent, multCap, roll)
  const effBase = intent.kind === 'heal' ? intent.base : intent.base + atkBonus
  const dmg = Math.round(effBase * mult)
  const note = intent.variance ? (roll! < intent.variance.p ? ' (도박 성공)' : ' (도박 실패)') : ''

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
    }
  }

  const hits: HitFx[] = []
  const killed: number[] = []
  const targets = intent.kind === 'heal' ? [] : intent.aoe === 'all' ? aliveIdx(state) : [target]

  for (const ti of targets) {
    const e = state.enemies[ti]
    if (!e || e.dead) continue
    e.hp -= dmg
    hits.push({ target: ti, dmg })
    if (e.hp <= 0) {
      e.dead = true
      killed.push(ti)
    }
  }

  // 자해 + 공멸(both) 되받음.
  let selfDmg = intent.recoil
  if (intent.targetMode === 'both') selfDmg += Math.round(dmg * 0.4)
  state.playerHp = Math.min(state.playerMax, state.playerHp - selfDmg + intent.heal)

  // 주어가 '너는'(enemy 태그)이면 이번 턴 방어 포기.
  state.guard = intent.tags.includes('enemy') ? 0 : Math.max(0, intent.guard)

  const label = intent.kind === 'heal' ? `${intent.heal} 회복` : `${dmg} 피해${note}`
  return {
    text: `${intent.sentence} → ${label}` + (selfDmg ? ` · 자신 ${selfDmg}` : ''),
    combos: intent.combos,
    hits,
    selfDmg,
    heal: intent.heal,
    killed,
  }
}

export interface EnemyStrike {
  text: string
  dealt: number
  idx: number // 공격한 적 인덱스(연출용)
}

// 적 턴 — every 주기에 맞는 적만 공격. guard로 흡수.
export function enemyTurn(state: BattleState, rng: () => number): EnemyStrike[] {
  const strikes: EnemyStrike[] = []
  let guard = state.guard
  state.enemies.forEach((e, idx) => {
    if (e.dead) return
    if (state.turn % e.def.every !== 0) return
    const raw = Math.round((e.def.atk + Math.floor(rng() * 3)) * e.atkMult)
    const dealt = Math.max(0, raw - guard)
    const absorbed = Math.min(guard, raw)
    guard = Math.max(0, guard - raw)
    state.playerHp -= dealt
    strikes.push({
      text: `${e.def.name}의 습격 → ${dealt} 피해` + (absorbed ? ` (방어 ${absorbed} 흡수)` : ''),
      dealt,
      idx,
    })
  })
  state.guard = 0
  return strikes
}

export const allDead = (s: BattleState): boolean => s.enemies.every((e) => e.dead)
