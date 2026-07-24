/**
 * 컴파일러 ★핵심. 순수함수 — RNG 없음, 전역 상태 참조 없음.
 * variance는 적용하지 않고 그대로 넘긴다(시뮬이 굴린다) → 전수 검사 가능.
 *
 * 슬롯을 하드코딩하지 않고 template.slots 순서/역할을 따라 계산하므로
 * 슬롯을 4칸/6칸으로 바꿔도 컴파일러는 그대로 동작한다.
 */

import { eul } from './josa'
import type { Combo, Intent, Rarity, Selection, Tables, Word } from './types'

// 등급이 높은 문장일수록 더 강하게 — 기존 배수 풀에 등급 보너스를 얹는다.
// (새 효과를 늘리지 않고 공격/배율만 강화하는 방향.)
const RARITY_WEIGHT: Record<Rarity, number> = { common: 0, rare: 0.15, epic: 0.3, legendary: 0.5 }

// 선택된 단어들의 tag를 전부 모아 멀티셋으로 관용구를 매칭.
export function matchCombos(sel: Selection, combos: Combo[], order: string[]): Combo[] {
  const pool = order.flatMap((k) => (sel[k] ? sel[k]!.tags : []))
  return combos.filter((c) => {
    const rest = [...pool]
    return c.need.every((n) => {
      const i = rest.indexOf(n)
      if (i < 0) return false
      rest.splice(i, 1)
      return true
    })
  })
}

// 완성 문장 토큰 배열(빈 슬롯은 '____'). josa 슬롯만 조사 부착.
export function sentenceTokens(sel: Selection, t: Tables): string[] {
  return t.template.slots.map((s) => {
    const w = sel[s.key]
    if (!w) return '____'
    return s.josa ? eul(w.text) : w.text
  })
}

const roleOf = (t: Tables, key: string) => t.template.slots.find((s) => s.key === key)?.role

export function compile(sel: Selection, t: Tables): Intent {
  const order = t.template.slots.map((s) => s.key)
  const combos = matchCombos(sel, t.combos, order)

  // base = object/verb power 합, bonusPool = subject/modifier/ending bonus 합.
  let base = 0
  let bonusPool = 0
  let kind: Intent['kind'] = 'attack'
  let targetMode: Intent['targetMode'] = 'enemy'
  let aoe: Intent['aoe'] = 'single'
  let timing: Intent['timing'] = 'immediate'
  let variance: Intent['variance'] = null

  for (const key of order) {
    const w = sel[key]
    if (!w) continue
    const role = roleOf(t, key)
    if (role === 'object' || role === 'verb') base += w.power || 0
    else bonusPool += w.bonus || 0

    if (role === 'verb' && w.kind) kind = w.kind
    if (role === 'subject') {
      if (w.targetMode) targetMode = w.targetMode
    }
    if (w.aoe) aoe = w.aoe // subject/verb 어느 쪽이든 지정하면 채택
    if (role === 'ending') {
      if (w.timing) timing = w.timing
      if (w.variance) variance = w.variance
    }
  }

  // 등급 보너스: 선택 단어들의 희귀도 합. 배수 풀과 상한 둘 다 올린다.
  const gradeBonus = order.reduce((n, k) => n + RARITY_WEIGHT[sel[k]?.rarity ?? 'common'], 0)
  const comboMult = combos.reduce((m, c) => m * c.mult, 1)
  const multiplier = Math.min((1 + bonusPool + gradeBonus) * comboMult, t.multCap + gradeBonus)

  const sumEffect = (k: keyof NonNullable<Word['effects']>) =>
    order.reduce((n, key) => n + (sel[key]?.effects?.[k] || 0), 0)

  return {
    sentence: sentenceTokens(sel, t).join(' '),
    targetMode,
    aoe,
    kind,
    base,
    multiplier,
    variance,
    timing,
    guard: sumEffect('guard'),
    heal: sumEffect('heal'),
    recoil: sumEffect('recoil'),
    evade: sumEffect('evade'),
    tags: order.flatMap((k) => (sel[k] ? sel[k]!.tags : [])),
    combos: combos.map((c) => c.name),
  }
}

// 시뮬과 sweep이 공유하는 유일한 배수 계산(variance 적용 후 캡).
export function finalMultiplier(intent: Intent, multCap: number, roll: number | null = null): number {
  let m = intent.multiplier
  if (intent.variance && roll !== null) {
    m *= roll < intent.variance.p ? intent.variance.hi : intent.variance.lo
  }
  return Math.min(m, multCap)
}
