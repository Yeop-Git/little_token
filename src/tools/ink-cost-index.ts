/**
 * 잉크 비용 지표 — 카드 하나를 다른 칸 카드와 마구 섞어 쓸 때의 평균 기여도로 비용을 매긴다.
 *
 * 1) 주어 × 수식어 × 동사 전 조합(모순 조합 제외)을 실제 컴파일러로 돌려 문장 가치를 낸다.
 *    가치 = 주행동 기대 점수(맥락·감정 공명·도박 확률·대성공 확률·대상 수·연타·반복 반영)
 *         + 부가 효과 환산(흡혈·방패치기·생명력 폭발·매직실드·반격·관통·랭크·선공·성장).
 * 2) 카드의 기여도 = 그 카드가 든 조합들에서 "같은 칸 기준 카드로 바꿨을 때 대비 가치 차이"의
 *    절사 평균(위아래 10%를 버려 특정 조합에서만 튀는 극단값을 평균에서 뺀다).
 * 3) 기준 카드(나는 0 · 살짝 1 · 때렸다 2)의 비용을 고정하고, 시작 문장 가치/잉크를 1잉크의 값으로
 *    삼아 기여도를 잉크로 환산한다. 시작 잉크 5에 세 칸을 모두 채워야 하므로 칸별 상한
 *    (주어 1 · 수식어 2 · 동사 3)으로 자른다.
 * 4) 단(보스 공략 카드 제외), 상한보다 PREMIUM_MARGIN(3)잉크 이상 값어치가 큰 카드는 상한에 눌려 너무 싸지므로
 *    한 단계 위(주어 2 · 수식어 3 · 동사 4)로 매긴다. 이런 카드를 쓰면 나머지 두 칸은
 *    기본 카드로 채워야 시작 잉크 5에 들어간다(2026-11-20 재점검).
 *
 * 실행: npx tsx src/tools/ink-cost-index.ts [--md]
 */
import { compile, effectiveBase, rouletteOdds, statBiasOf } from '@core/compiler'
import { TARGET_FALLOFF } from '@core/combatRules'
import { wordInkCost } from '@core/ink'
import { luckMultiplier } from '@core/luck'
import { startingPlayer } from '@core/run'
import { conflictReason } from '@core/validator'
import type { Intent, Selection, Word } from '@core/types'
import { ALL_REWARD_WORDS, BOSS_TACTIC_WORDS, EARLY_COMBOS, EARLY_WORDS, makeEarlyTables } from '@data/earlyWords'

export const SLOT_CAP = { subj: 1, adv: 2, verb: 3 } as const
export const SLOT_FLOOR = { subj: 0, adv: 0, verb: 1 } as const
/** 상한을 이만큼 넘는 값어치의 카드는 상한 +1 단계로 매긴다. */
export const PREMIUM_MARGIN = 3
const REFERENCE = { subj: 'na', adv: 'saljjak', verb: 'ttaeryeot' } as const
type Slot = keyof typeof REFERENCE

const stats = startingPlayer().stats
const tables = { ...makeEarlyTables(), combos: EARLY_COMBOS }

const seen = new Set<string>()
const catalog: Word[] = []
for (const word of [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS, ...BOSS_TACTIC_WORDS]) {
  if (seen.has(word.id) || !(word.slot in REFERENCE)) continue
  seen.add(word.id)
  catalog.push(word)
}
const BOSS_TACTIC_IDS = new Set(BOSS_TACTIC_WORDS.map((word) => word.id))
const bySlot = (slot: Slot) => catalog.filter((word) => word.slot === slot)

function targetWeight(intent: Intent): number {
  const count = intent.aoe === 'all' || intent.targetCount === 'all' ? TARGET_FALLOFF.length : Number(intent.targetCount ?? 1)
  return TARGET_FALLOFF.slice(0, Math.max(1, count)).reduce((sum, value) => sum + value, 0)
}

/** 한 문장의 기대 가치(점수 단위). */
export function sentenceValue(selection: Selection): number | null {
  const intent = compile(selection, tables, stats)
  const variance = intent.variance ? intent.variance.p * intent.variance.hi + (1 - intent.variance.p) * intent.variance.lo : 1
  const { critP } = rouletteOdds(intent, statBiasOf(intent, stats))
  const mult = intent.multiplier * variance * luckMultiplier(stats.luck) * (1 + critP * .5)
  const casts = intent.castCount * intent.castScale
  const damage = intent.kind === 'attack' ? effectiveBase(intent) * mult * casts * intent.hitCount * targetWeight(intent) : 0
  const guard = intent.guard * mult * casts
  const heal = intent.heal * mult * casts
  // 방어·회복은 시작 스탯이 달라(공격 5 · 방어 3 · 회복 5) 같은 ×1 동사라도 점수가 다르다.
  // 칸 비용은 계수(×1, ×1.5…)를 사는 것이므로 스탯 1점당 가치로 맞춰 비교한다.
  let value = damage + guard * (stats.atk / Math.max(1, stats.guard)) + heal * (stats.atk / Math.max(1, stats.heal))
  value += damage * intent.lifeStealRate
  value += damage * (intent.pierceGuard ? .2 : 0)
  value += guard * intent.guardAttackMultiplier * .8
  value += heal * intent.overhealDamageMultiplier * .5
  value += intent.magicShield * 8
  value += intent.counter ? stats.atk : 0
  value += (Math.max(0, intent.attackRank) + Math.max(0, intent.guardRank)) * 3
  value += intent.preempt ? 2 : 0
  value += (intent.growHp ?? 0) * 3
  return Number.isFinite(value) ? value : null
}

const valid = (s: Word, a: Word, v: Word): boolean => {
  const order = tables.template.slots
  const chosen: Selection = {}
  for (const [index, word] of [s, a, v].entries()) {
    if (conflictReason(word, index, chosen, tables)) return false
    chosen[order[index].key] = word
  }
  return true
}

const trimmedMean = (values: number[], trim = .1): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const cut = Math.floor(sorted.length * trim)
  const kept = sorted.slice(cut, sorted.length - cut)
  return kept.reduce((sum, value) => sum + value, 0) / Math.max(1, kept.length)
}

const subjs = bySlot('subj'), advs = bySlot('adv'), verbs = bySlot('verb')
const ref = { subj: subjs.find((w) => w.id === REFERENCE.subj)!, adv: advs.find((w) => w.id === REFERENCE.adv)!, verb: verbs.find((w) => w.id === REFERENCE.verb)! }
const sel = (s: Word, a: Word, v: Word): Selection => ({ subj: s, adv: a, verb: v })

const starterValue = sentenceValue(sel(ref.subj, ref.adv, ref.verb))!
const starterInk = wordInkCost(ref.subj) + wordInkCost(ref.adv) + wordInkCost(ref.verb)
/** 1잉크가 사는 점수 — 시작 문장 가치를 그 문장의 잉크로 나눈 값. */
export const VALUE_PER_INK = starterValue / starterInk

export interface CardIndex { word: Word; slot: Slot; samples: number; contribution: number; raw: number; current: number; proposed: number }

export function cardIndex(): CardIndex[] {
  const out: CardIndex[] = []
  for (const slot of ['subj', 'adv', 'verb'] as const) {
    for (const word of bySlot(slot)) {
      const deltas: number[] = []
      for (const s of slot === 'subj' ? [word] : subjs) for (const a of slot === 'adv' ? [word] : advs) for (const v of slot === 'verb' ? [word] : verbs) {
        if (!valid(s, a, v)) continue
        const swapped = slot === 'subj' ? sel(ref.subj, a, v) : slot === 'adv' ? sel(s, ref.adv, v) : sel(s, a, ref.verb)
        const swappedWords = [swapped.subj!, swapped.adv!, swapped.verb!]
        if (!valid(swappedWords[0], swappedWords[1], swappedWords[2])) continue
        const withCard = sentenceValue(sel(s, a, v))
        const without = sentenceValue(swapped)
        if (withCard == null || without == null) continue
        deltas.push(withCard - without)
      }
      const contribution = trimmedMean(deltas)
      const raw = wordInkCost(ref[slot]) + contribution / VALUE_PER_INK
      const refund = Math.max(0, word.effects?.inkDiscount ?? 0)
      // 보스 공략 카드는 기믹의 정답으로 빌려주는 카드라 한 단계 위로 올리지 않는다.
      const premium = raw >= SLOT_CAP[slot] + PREMIUM_MARGIN && !BOSS_TACTIC_IDS.has(word.id) ? 1 : 0
      const proposed = Math.max(SLOT_FLOOR[slot], Math.min(SLOT_CAP[slot], Math.round(raw))) + premium + (refund > 0 ? 0 : 0)
      out.push({ word, slot, samples: deltas.length, contribution, raw, current: wordInkCost(word), proposed })
    }
  }
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = cardIndex()
  console.log(`1잉크 = ${VALUE_PER_INK.toFixed(2)}점 (시작 문장 ${starterValue.toFixed(1)}점 / ${starterInk}잉크)`)
  for (const row of rows) {
    console.log([row.slot, row.word.rarity, row.word.id, row.word.text, row.samples, row.contribution.toFixed(1), row.raw.toFixed(2), row.current, row.proposed].join('\t'))
  }
}
