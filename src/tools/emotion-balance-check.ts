import { selectionInkCost } from '@core/ink'
import { compile, effectiveBase, rouletteOdds, statBiasOf } from '@core/compiler'
import { TARGET_FALLOFF } from '@core/combatRules'
import type { Emotion, IntentKind, Selection, Word } from '@core/types'
import { startingPlayer } from '@core/run'
import { EARLY_COMBOS, EARLY_WORDS, makeEarlyTables, REWARD_WORDS } from '@data/earlyWords'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'

const EMOTIONS = ['joy', 'anger', 'sorrow', 'pleasure'] as const satisfies readonly Emotion[]
const ACTION_KINDS = ['attack', 'guard', 'heal'] as const satisfies readonly IntentKind[]

type CheckedEmotion = (typeof EMOTIONS)[number]
type CheckedAction = (typeof ACTION_KINDS)[number]

interface CostSummary {
  min: number
  median: number
  max: number
  atMost6: number
  atMost8: number
  atMost10: number
}

interface PowerSummary {
  emotion: CheckedEmotion
  best: Record<CheckedAction, number>
  bestEfficiency: Record<CheckedAction, number>
}

function uniqueWords(words: Word[]): Word[] {
  const seen = new Set<string>()
  return words.filter((word) => {
    const key = `${word.slot}:${word.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function containsTagMultiset(tags: string[], need: string[]): boolean {
  const rest = [...tags]
  return need.every((tag) => {
    const index = rest.indexOf(tag)
    if (index < 0) return false
    rest.splice(index, 1)
    return true
  })
}

const catalog = uniqueWords([
  ...Object.values(EARLY_WORDS).flat(),
  ...REWARD_WORDS,
  ...SPECIAL_REWARD_WORDS,
])
const tables = { ...makeEarlyTables(), combos: EARLY_COMBOS }

function wordsFor(emotion: CheckedEmotion, slot: 'subj' | 'adv' | 'verb'): Word[] {
  return catalog.filter((word) => word.emotion === emotion && word.slot === slot)
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function summarizeCosts(costs: number[]): CostSummary {
  const sorted = [...costs].sort((a, b) => a - b)
  return {
    min: sorted[0],
    median: median(sorted),
    max: sorted[sorted.length - 1],
    atMost6: sorted.filter((cost) => cost <= 6).length,
    atMost8: sorted.filter((cost) => cost <= 8).length,
    atMost10: sorted.filter((cost) => cost <= 10).length,
  }
}

function modifierTactics(word: Word): string[] {
  const tactics: string[] = []
  const effects = word.effects

  if ((word.bonus ?? 0) > 0) tactics.push('multiplier')
  if ((word.crit ?? 0) > 0) tactics.push('critical')
  if (word.variance) tactics.push('variance')
  if (word.tags.includes('preempt')) tactics.push('preempt')
  if ((effects?.guard ?? 0) > 0) tactics.push('prepare-guard')
  if ((effects?.heal ?? 0) > 0) tactics.push('prepare-heal')
  if ((effects?.evade ?? 0) > 0) tactics.push('evade')
  if (effects?.pierceGuard) tactics.push('pierce-guard')
  if ((effects?.hitCount ?? 1) > 1) tactics.push('multi-hit')
  if ((effects?.castCount ?? 1) > 1) tactics.push('repeat-cast')
  if ((effects?.overdrawHitCount ?? 0) > 0) tactics.push('overdraw-fury')
  if ((effects?.counterMultiplier ?? 0) > 0) tactics.push('counter')
  if ((effects?.inkDiscount ?? 0) > 0) tactics.push('ink-discount')
  if ((effects?.carryInk ?? 0) > 0) tactics.push('carry-ink')
  if ((effects?.enemyAttackRank ?? 0) < 0) tactics.push('enemy-weaken')
  if ((effects?.attackRank ?? 0) > 0) tactics.push('attack-rank')
  if ((effects?.guardRank ?? 0) > 0) tactics.push('guard-rank')
  if ((effects?.bonusDraws ?? 0) > 0) tactics.push('bonus-draw')
  if (word.aoe === 'all' || word.targetCount === 'all' || (word.targetCount ?? 1) > 1) {
    tactics.push('multi-target')
  }

  return tactics
}

function hasEmotionSignature(emotion: CheckedEmotion, modifiers: Word[]): boolean {
  if (emotion === 'anger') {
    return modifiers.some((word) => (word.effects?.overdrawHitCount ?? 0) > 0)
      && modifiers.some((word) => (word.effects?.castCount ?? 1) > 1)
  }
  if (emotion === 'sorrow') {
    return modifiers.some((word) => (word.effects?.counterMultiplier ?? 0) > 0 && (word.effects?.enemyAttackRank ?? 0) < 0)
      && modifiers.some((word) => (word.effects?.carryInk ?? 0) > 0)
  }
  if (emotion === 'joy') {
    return modifiers.some((word) => (word.effects?.carryInk ?? 0) > 0)
      && modifiers.some((word) => (word.targetCount ?? 1) !== 1 && (word.effects?.bonusDraws ?? 0) > 0)
  }
  return modifiers.some((word) => (word.effects?.bonusDraws ?? 0) > 0 && (word.effects?.inkDiscount ?? 0) > 0)
    && modifiers.some((word) => word.tags.includes('preempt'))
}

const baselineStats = startingPlayer().stats

function expectedMultiplier(selection: Selection): number {
  const intent = compile(selection, tables, baselineStats)
  const variance = intent.variance
    ? intent.variance.p * intent.variance.hi + (1 - intent.variance.p) * intent.variance.lo
    : 1
  const { critP } = rouletteOdds(intent, statBiasOf(intent, baselineStats))
  const luck = 1 + baselineStats.luck * 0.02
  return intent.multiplier * variance * luck * (1 + critP * 0.5)
}

function targetWeight(count: number | 'all'): number {
  if (count === 'all') return TARGET_FALLOFF.reduce((sum, value) => sum + value, 0)
  return TARGET_FALLOFF.slice(0, count).reduce((sum, value) => sum + value, 0)
}

function primaryPower(selection: Selection): { kind: CheckedAction; value: number } | null {
  const intent = compile(selection, tables, baselineStats)
  if (!ACTION_KINDS.includes(intent.kind as CheckedAction)) return null
  const mult = expectedMultiplier(selection)
  if (intent.kind === 'attack') {
    return { kind: 'attack', value: effectiveBase(intent) * mult * intent.castScale * targetWeight(intent.targetCount) * intent.hitCount * intent.castCount }
  }
  const castPower = intent.castCount * intent.castScale
  if (intent.kind === 'guard') return { kind: 'guard', value: intent.guard * mult * castPower }
  return { kind: 'heal', value: intent.heal * mult * castPower }
}

let failed = false
const powerSummaries: PowerSummary[] = []

const starterActionCounts: Record<CheckedAction, number> = { attack: 0, guard: 0, heal: 0 }
let starterAngerSentences = 0
for (const subj of EARLY_WORDS.subj) {
  for (const adv of EARLY_WORDS.adv) {
    for (const verb of EARLY_WORDS.verb) {
      if (!ACTION_KINDS.includes(verb.kind as CheckedAction)) continue
      const hasAnger = [subj, adv, verb].some((word) => word.emotion === 'anger')
      if (!hasAnger) continue
      starterAngerSentences++
      starterActionCounts[verb.kind as CheckedAction]++
    }
  }
}
const starterAngerVerbKinds = new Set(
  EARLY_WORDS.verb.filter((word) => word.emotion === 'anger').map((word) => word.kind),
)
const starterAngerAttackRate = starterActionCounts.attack / Math.max(1, starterAngerSentences)
console.log(
  `Starter anger association: ${starterAngerSentences} sentences · attack ${starterActionCounts.attack} (${Math.round(starterAngerAttackRate * 100)}%) · guard ${starterActionCounts.guard} · heal ${starterActionCounts.heal}`,
)
if (starterAngerAttackRate > .5 || !starterAngerVerbKinds.has('attack') || !starterAngerVerbKinds.has('guard')) {
  console.error('  [FAIL] starting anger cards teach a single attack-only action')
  failed = true
}

const selfContainedCombos = EARLY_COMBOS.flatMap((combo) =>
  catalog
    .filter((word) => containsTagMultiset(word.tags, combo.need))
    .map((word) => `${combo.name} <- ${word.text}`),
)
if (selfContainedCombos.length > 0) {
  console.error(`Self-contained context combos: ${selfContainedCombos.join(' · ')}`)
  failed = true
}

console.log('Emotion balance check (same-color subject x modifier x verb)')

for (const emotion of EMOTIONS) {
  const subjects = wordsFor(emotion, 'subj')
  const modifiers = wordsFor(emotion, 'adv')
  const verbs = wordsFor(emotion, 'verb')
  const costs: number[] = []
  const actions = new Set<CheckedAction>()
  let attackCombos = 0
  const best: Record<CheckedAction, number> = { attack: 0, guard: 0, heal: 0 }
  const bestEfficiency: Record<CheckedAction, number> = { attack: 0, guard: 0, heal: 0 }
  const bestLine: Record<CheckedAction, string> = { attack: '', guard: '', heal: '' }

  for (const subj of subjects) {
    for (const adv of modifiers) {
      for (const verb of verbs) {
        const selection: Selection = { subj, adv, verb }
        const inkCost = selectionInkCost(selection)
        costs.push(inkCost)
        if (ACTION_KINDS.includes(verb.kind as CheckedAction)) actions.add(verb.kind as CheckedAction)
        if (verb.kind === 'attack' && compile(selection, tables).combos.length > 0) attackCombos++
        if (inkCost <= 8) {
          const power = primaryPower(selection)
          if (power) {
            if (power.value > best[power.kind]) {
              const intent = compile(selection, tables, baselineStats)
              best[power.kind] = power.value
              bestLine[power.kind] = `${intent.sentence} · cost ${inkCost}${intent.combos.length ? ` · ${intent.combos.join(', ')}` : ''}`
            }
            bestEfficiency[power.kind] = Math.max(bestEfficiency[power.kind], power.value / Math.max(1, inkCost))
          }
        }
      }
    }
  }

  if (costs.length === 0) {
    console.error(`\n[FAIL] ${emotion}: no same-color combinations`)
    failed = true
    continue
  }

  const cost = summarizeCosts(costs)
  const stableSubjects = subjects.filter((word) => !word.variance).length
  const varianceSubjects = subjects.length - stableSubjects
  const tactics = new Set(modifiers.flatMap(modifierTactics))
  const missingActions = ACTION_KINDS.filter((kind) => !actions.has(kind))
  const allWithin10 = cost.atMost10 === costs.length
  const signatureReady = hasEmotionSignature(emotion, modifiers)

  console.log(`\n${emotion}`)
  console.log(`  combinations: ${costs.length} (${subjects.length} x ${modifiers.length} x ${verbs.length})`)
  console.log(`  cost min/median/max: ${cost.min}/${cost.median}/${cost.max}`)
  console.log(`  cost <=6/<=8/<=10: ${cost.atMost6}/${cost.atMost8}/${cost.atMost10}`)
  console.log(`  actions: ${ACTION_KINDS.map((kind) => `${kind}=${actions.has(kind) ? 'yes' : 'no'}`).join(', ')}`)
  console.log(`  subjects: stable=${stableSubjects}, variance=${varianceSubjects}`)
  console.log(`  modifier tactics (${tactics.size}): ${[...tactics].sort().join(', ') || 'none'}`)
  console.log(`  signature: ${signatureReady ? 'yes' : 'missing'}`)
  console.log(`  same-color attack combos: ${attackCombos}`)
  console.log(`  best <=8 power: attack=${best.attack.toFixed(1)}, guard=${best.guard.toFixed(1)}, heal=${best.heal.toFixed(1)}`)
  console.log(`  best <=8 power/ink: attack=${bestEfficiency.attack.toFixed(1)}, guard=${bestEfficiency.guard.toFixed(1)}, heal=${bestEfficiency.heal.toFixed(1)}`)
  for (const kind of ACTION_KINDS) console.log(`    ${kind}: ${bestLine[kind]}`)
  powerSummaries.push({ emotion, best, bestEfficiency })

  if (!allWithin10) {
    console.error(`  [FAIL] ${costs.length - cost.atMost10} combination(s) cost more than 10`)
    failed = true
  }
  if (cost.atMost6 < Math.ceil(costs.length * 0.1)) {
    console.error(`  [FAIL] fewer than 10% of combinations fit the base 6 ink (${cost.atMost6}/${costs.length})`)
    failed = true
  }
  if (cost.atMost8 < Math.ceil(costs.length * 0.5)) {
    console.error(`  [FAIL] only ${cost.atMost8}/${costs.length} combinations fit a fresh turn's 8-point ceiling`)
    failed = true
  }
  if (missingActions.length > 0) {
    console.error(`  [FAIL] missing action kind(s): ${missingActions.join(', ')}`)
    failed = true
  }
  if (stableSubjects === 0 || varianceSubjects === 0) {
    console.error('  [FAIL] both stable and variance subjects are required')
    failed = true
  }
  if (tactics.size < 4) {
    console.error(`  [FAIL] modifier tactics need at least 4 distinct functions (got ${tactics.size})`)
    failed = true
  }
  if (!signatureReady) {
    console.error(`  [FAIL] ${emotion} signature effect is missing`)
    failed = true
  }
  if (attackCombos === 0) {
    console.error('  [FAIL] no same-color attack combo')
    failed = true
  }
}

for (const kind of ACTION_KINDS) {
  const strongest = Math.max(...powerSummaries.map((summary) => summary.best[kind]))
  const weakest = Math.min(...powerSummaries.map((summary) => summary.best[kind]))
  const ratio = strongest > 0 ? weakest / strongest : 0
  console.log(`\n${kind} affordable-answer floor: ${(ratio * 100).toFixed(0)}% (${weakest.toFixed(1)} / ${strongest.toFixed(1)})`)
  // 수식어의 공용 배율을 없앤 뒤에는 감정별 전문 분야가 더 선명하다. 비전문 행동도
  // 초반 적 한 번에 대응할 최소치와 최강 감정의 20%는 남겨 완전한 죽은 선택만 막는다.
  const absoluteFloor: Record<CheckedAction, number> = { attack: 30, guard: 10, heal: 20 }
  if (ratio < 0.2) {
    console.error(`  [FAIL] one emotion's best <=8 ${kind} answer is below 20% of the strongest emotion`)
    failed = true
  }
  if (weakest < absoluteFloor[kind]) {
    console.error(`  [FAIL] one emotion's best <=8 ${kind} answer is below the ${absoluteFloor[kind]}-point starting-stat floor`)
    failed = true
  }
}

if (failed) {
  console.error('\nEmotion balance check failed.')
  process.exitCode = 1
} else {
  console.log('\nEmotion balance check passed.')
}
