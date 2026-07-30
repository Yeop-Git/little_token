/**
 * 풀런 밸런스 검수 — `npm run run:sim`(`-- --verbose`로 층별 기록).
 *
 * `sweep`는 문장 한 방의 분포를, `boss:sim`은 보스 한 판을 본다. 둘 다 "그 층에
 * 만신창이로 도착했는가"를 보지 못한다. 체력은 스테이지를 넘어도 회복되지 않으므로
 * 실제 난이도는 개별 전투 승률이 아니라 **1층부터 누적되는 소모전**에서 나온다.
 *
 * 이 도구는 1층부터 15층까지 한 런을 통째로 굴린다. 보상 3단계(주어·수식어 →
 * 아이템 → 동사)를 실제 `genRewards`로 뽑아 영감 잔액 안에서 사고, 남은 체력과 방어막을 다음
 * 층으로 그대로 넘긴다. 여러 시드를 돌려 **어느 층에서 몇 %가 죽는지**를 센다.
 *
 * 실게임과 같은 compile/resolveMultiplier/applyIntent/enemyTurn을 그대로 호출한다.
 */
import { compile, effectiveBase, isDamageIntent, resolveMultiplier, statBiasOf, withOverdrawEffects } from '@core/compiler'
import { conflictReason } from '@core/validator'
import { beanstalkGrowthFor, ECHO_REPEAT_SCALE, hasPassive, modsFor } from '@core/passives'
import { clearRewardValue, decayGrade, startGrade } from '@core/grade'
import { FREE_DRAWS_PER_STAGE } from '@core/draw'
import type { Intent, Rarity, Selection, Word } from '@core/types'
import type { PlayerState, PlayerStats } from '@core/player'
import { applyItemReward, registerWord, startingPlayer } from '@core/run'
import {
  carryInkAfterSpend,
  inkExceedsLimit,
  inkOverdraw,
  selectionCarryInk,
  selectionInkCost,
  sentenceInkAvailable,
} from '@core/ink'
import { makeEarlyTables, SPECIAL_REWARD_WORDS, tablesForEncounter } from '@data/earlyWords'
import { enemyDefForEncounter } from '@data/enemies'
import { STORY_FLOORS, stageFor } from '@data/stages'
import {
  EARLY_BUILD_REWARD_DAY,
  REWARD_PRICE,
  genRewards,
  rewardPrice,
  type RewardOption,
} from '@data/rewards'
import { isBossTacticalRewardDay, tacticalCardIdsForRewardDay } from '@data/tacticalCards'
import { EXCLAIM_SLOTS, ITEM_BLESS_CHANCE_PER_GRADE, ITEM_BLESS_POOL, exclaimModsFor, rollExclaimChoices, rollExclaimMultipliers, type StatKey } from '@data/items'
import { SUPPORTED_LOCALES, type LocaleCode } from '@/localization'
import {
  aliveIdx,
  allDead,
  applyIntent,
  applyInkOverdraw,
  applyOverkillTransfer,
  applyPendingAttack,
  applyPreparation,
  enemyTurn,
  engageFront,
  engageInitialFront,
  frontIdx,
  makeEnemy,
  nextEnemyAttackStep,
  spiderSealSlotForTurn,
  spiderWebAtTurnStart,
  summonAtTurnStart,
  summonCount,
  activeEnemyPart,
  type BattleState,
} from '../sim/reference'

const rngSeeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

/** CardHand 설정과 같은 손패 크기 — 주어·수식어 3장, 동사 8장 덱이라 4장. */
const HAND_SIZE = 3
const VERB_HAND_SIZE = 4
const MAX_TURNS_PER_STAGE = 80

interface Candidate {
  sel: Selection
  intent: Intent
  dmg: number
  guard: number
  heal: number
  inkCost: number
  overdraw: number
}

/** 보상 기량 — 세 장 중 무엇을 고르는가. */
type RewardSkill = 'random' | 'ok' | 'best'
/** 전투 기량 — 평균 플레이는 매 턴 70% 확률로 위협을 읽고, 숙련자는 항상 읽는다. */
type CombatSkill = 'greedy' | 'average' | 'smart'
type BuildFocus = 'balanced' | 'attack' | 'guard' | 'heal' | 'combo'

interface ActionStats {
  sentences: number
  attack: number
  guard: number
  heal: number
  combo: number
  damage: number
  wide: number
  guardEngine: number
  healEngine: number
}

const emptyActions = (): ActionStats => ({
  sentences: 0,
  attack: 0,
  guard: 0,
  heal: 0,
  combo: 0,
  damage: 0,
  wide: 0,
  guardEngine: 0,
  healEngine: 0,
})
const addActions = (into: ActionStats, from: ActionStats): void => {
  for (const key of Object.keys(into) as (keyof ActionStats)[]) into[key] += from[key]
}

// ─────────────────────────────────────────── 플레이어 복제/평가

function cloneWord(w: Word): Word {
  return {
    ...w,
    tags: [...w.tags],
    effects: w.effects ? { ...w.effects } : undefined,
    variance: w.variance ? { ...w.variance } : undefined,
  }
}

function clonePlayer(p: PlayerState): PlayerState {
  const deck: Record<string, Word[]> = {}
  for (const k of Object.keys(p.deck)) deck[k] = p.deck[k].map(cloneWord)
  return {
    stats: { ...p.stats },
    items: p.items.map((i) => ({ ...i, stats: { ...i.stats } })),
    deck,
  }
}

/** 덱 전체를 본 문장 분포 — 보상 선택의 점수로 쓴다(중앙값 위주 + 상한 약간). */
function deckScore(player: PlayerState, focus: BuildFocus, locale: LocaleCode): number {
  const t = makeEarlyTables(player.deck, player, locale)
  const order = t.template.slots.map((s) => s.key)
  const mods = modsFor(player, 0)
  const dmgs: number[] = []
  const guards: number[] = []
  const heals: number[] = []
  const counters: number[] = []
  const comboValues: number[] = []
  let comboTriggers = 0
  let sentenceCount = 0
  const walk = (i: number, sel: Selection) => {
    if (i === order.length) {
      sentenceCount++
      const intent = compile(sel, t, player.stats, mods)
      const m = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, 0.5).mult
      const directDamage = isDamageIntent(intent) ? effectiveBase(intent) * m * intent.hitCount * intent.castCount * intent.castScale : 0
      const resourceDamage = player.stats.guard * intent.guardAttackMultiplier
        + player.stats.heal * .5 * intent.overhealDamageMultiplier
      const dmg = directDamage + resourceDamage
      const guard = intent.guard * m * intent.castCount * intent.castScale
      const heal = intent.heal * m * intent.castCount * intent.castScale
      const counter = intent.counterMultiplier * guard
      if (dmg > 0) dmgs.push(dmg + directDamage * intent.lifeStealRate * .5)
      if (guard > 0 || intent.magicShield > 0) guards.push(guard + intent.magicShield * player.stats.hp * .25)
      if (heal > 0) heals.push(heal)
      if (counter > 0) counters.push(counter)
      if (intent.combos.length) {
        comboValues.push(dmg + guard + heal + intent.combos.length * 18)
        comboTriggers += intent.combos.length
      }
      return
    }
    for (const w of (t.words[order[i]] ?? []) as Word[]) {
      if (conflictReason(w, i, sel, t)) continue
      walk(i + 1, { ...sel, [order[i]]: w })
    }
  }
  walk(0, {})
  const distribution = (values: number[]) => {
    if (!values.length) return { med: 0, max: 0 }
    values.sort((a, b) => a - b)
    return { med: values[Math.floor(values.length / 2)], max: values[values.length - 1] }
  }
  const attack = distribution(dmgs)
  const guard = distribution(guards)
  const heal = distribution(heals)
  const counter = distribution(counters)
  const combo = distribution(comboValues)
  // 체력·회복은 문장 분포에 잡히지 않으니 생존 축을 따로 얹는다.
  const scores: Record<BuildFocus, number> = {
    balanced: attack.med + attack.max * 0.25 + guard.med * 0.3 + heal.med * 0.4 + player.stats.hp * 0.35,
    attack: attack.med * 1.25 + attack.max * 0.45 + player.stats.atk * 1.2 + player.stats.luck * 0.35,
    guard: guard.med * 0.85 + guard.max * 0.2 + counter.med * 0.65 + counter.max * 0.2
      + attack.med * 0.85 + attack.max * 0.15 + player.stats.guard * 0.95 + player.stats.atk + player.stats.hp * 0.4,
    heal: heal.med * 1.05 + heal.max * 0.3 + attack.med * 0.65 + attack.max * 0.1
      + player.stats.heal * 1.05 + player.stats.atk * 0.65 + player.stats.hp * 0.4,
    combo: (comboTriggers / Math.max(1, sentenceCount)) * 1000
      + combo.med * 0.3 + combo.max * 0.1 + attack.med * 0.1 + player.stats.luck * 0.5,
  }
  return scores[focus]
}

// ─────────────────────────────────────────── 보상

/** 감탄사 선택 정책 — 스탯 1점의 가치. 체력은 +2씩 붙으므로 점당으로 환산된다. */
const EXCLAIM_WEIGHT: Record<RewardSkill, Record<StatKey, number>> = {
  random: { atk: 1, hp: 1, guard: 1, heal: 1, luck: 1 }, // 아무거나 고른다
  ok: { atk: 1.6, hp: 0.7, guard: 0.9, heal: 0.9, luck: 1.0 },
  best: { atk: 2.0, hp: 1.0, guard: 1.0, heal: 1.0, luck: 1.2 },
}

const FOCUS_EXCLAIM_WEIGHT: Record<Exclude<BuildFocus, 'balanced'>, Record<StatKey, number>> = {
  attack: { atk: 2.2, hp: 0.6, guard: 0.5, heal: 0.5, luck: 1.2 },
  // 세 보스 모두 방어 무력화 수단이 있으므로 반격을 마무리할 최소 공격도 함께 산다.
  guard: { atk: 2.0, hp: 1.0, guard: 1.8, heal: 0.8, luck: 0.7 },
  heal: { atk: 1.6, hp: 1.0, guard: 0.7, heal: 1.9, luck: 0.8 },
  combo: { atk: 1.0, hp: 0.8, guard: 0.8, heal: 0.8, luck: 1.7 },
}

function exclaimStats(rarity: Rarity, grade: number, skill: RewardSkill, focus: BuildFocus, rng: () => number): Partial<PlayerStats> {
  const mults = rollExclaimMultipliers(rarity, rng)
  const openChoices = rollExclaimChoices(rng)
  const out: Partial<PlayerStats> = {}
  const weight = focus === 'balanced' ? EXCLAIM_WEIGHT[skill] : FOCUS_EXCLAIM_WEIGHT[focus]
  EXCLAIM_SLOTS.forEach((slot, i) => {
    const choices = openChoices[slot.key] ?? []
    if (!choices.length) return
    const chance = Math.min(0.4, Math.max(0, grade) * ITEM_BLESS_CHANCE_PER_GRADE)
    const offered = choices.map((choice) => ({
      choice,
      bless: rng() < chance ? ITEM_BLESS_POOL[Math.floor(rng() * ITEM_BLESS_POOL.length)] : null,
    }))
    const selected = skill === 'random'
      ? offered[Math.floor(rng() * offered.length)]
      : [...offered].sort((a, b) =>
        scoreMods(b.choice.mods, weight) + (b.bless?.n ?? 0) * weight[b.bless?.stat ?? 'hp']
        - scoreMods(a.choice.mods, weight) - (a.bless?.n ?? 0) * weight[a.bless?.stat ?? 'hp'])[0]
    const pick = selected.choice
    const mods = exclaimModsFor(mults[i], pick.mods)
    for (const [k, v] of Object.entries(mods)) {
      out[k as keyof PlayerStats] = (out[k as keyof PlayerStats] ?? 0) + (v ?? 0)
    }
    if (selected.bless) {
      out[selected.bless.stat] = (out[selected.bless.stat] ?? 0) + selected.bless.n
    }
  })
  return out
}

const scoreMods = (mods: Partial<Record<StatKey, number>>, weight: Record<StatKey, number>): number =>
  Object.entries(mods).reduce((s, [k, v]) => s + (v ?? 0) * weight[k as StatKey], 0)

function applyOption(player: PlayerState, opt: RewardOption, grade: number, skill: RewardSkill, focus: BuildFocus, rng: () => number): void {
  if (opt.kind === 'word' && opt.word) {
    const res = registerWord(player, opt.word)
    if (res.kind === 'needs-discard') {
      // 상한을 넘겼으면 가장 덜 자란 카드를 버린다.
      const worst = [...res.candidates].sort((a, b) => (a.level ?? 1) - (b.level ?? 1))[0]
      registerWord(player, opt.word, worst.id)
    }
    return
  }
  if (!opt.item) return
  const base = opt.item.base
  const gained = exclaimStats(opt.rarity, grade, skill, focus, rng)
  const stats: Partial<PlayerStats> = { ...gained }
  for (const k of Object.keys(base) as StatKey[]) {
    if (base[k]) stats[k] = (stats[k] ?? 0) + base[k]
  }
  applyItemReward(player, {
    id: opt.item.id,
    name: opt.item.name,
    rarity: opt.rarity,
    art: opt.item.art,
    line: '',
    stats,
    passive: opt.item.passive,
  })
}

/** 한 층 클리어 보상 3단계를 실제 genRewards로 뽑아 고른다. */
function takeRewards(player: PlayerState, grade: number, unusedDraws: number, day: number, skill: RewardSkill, focus: BuildFocus, locale: LocaleCode, rng: () => number, wallet: { inspiration: number }): void {
  wallet.inspiration += clearRewardValue(grade, unusedDraws)
  const plannedEngineId = day === EARLY_BUILD_REWARD_DAY
    ? focus === 'guard' ? 'storedResolve' : focus === 'heal' ? 'overflowingHeart' : focus === 'attack' ? 'drinkInk' : null
    : null
  const plannedEngine = plannedEngineId
    ? SPECIAL_REWARD_WORDS.find((word) => word.id === plannedEngineId)
    : null
  const tacticalReserve = isBossTacticalRewardDay(day) ? Math.max(0, ...tacticalCardIdsForRewardDay(day)
    .map((id) => SPECIAL_REWARD_WORDS.find((word) => word.id === id))
    .filter((word): word is Word => !!word)
    .map((word) => REWARD_PRICE[word.rarity ?? 'common'])) : 0
  const engineReserve = Math.max(plannedEngine ? REWARD_PRICE[plannedEngine.rarity ?? 'common'] : 0, tacticalReserve)
  for (const phase of ['subject', 'item', 'verb'] as const) {
    const spendable = phase === 'verb' ? wallet.inspiration : Math.max(0, wallet.inspiration - engineReserve)
    const options = genRewards(player, grade, day, phase, rng).filter((option) => rewardPrice(option) <= spendable)
    if (!options.length) continue
    let chosen = options[Math.floor(rng() * options.length)]
    if (skill !== 'random') {
      const tacticalIds = isBossTacticalRewardDay(day) && phase === 'verb'
        ? new Set(tacticalCardIdsForRewardDay(day))
        : new Set<string>()
      const tacticalOptions = options.filter((option) => option.word && tacticalIds.has(option.word.id))
      // 세 장을 각각 적용해 보고 덱 점수가 가장 높은 쪽을 고른다.
      let best = -Infinity
      for (const opt of options) {
        const trial = clonePlayer(player)
        applyOption(trial, opt, grade, skill, focus, rngSeeded(1))
        const score = deckScore(trial, focus, locale)
        if (score > best) {
          best = score
          chosen = opt
        }
      }
      // 보스 직전에는 공개된 공략 카드를 장기 덱 고점보다 우선한다.
      if (tacticalOptions.length && (skill === 'best' || rng() < 0.8)) {
        chosen = [...tacticalOptions].sort((a, b) => {
          const trialA = clonePlayer(player)
          const trialB = clonePlayer(player)
          applyOption(trialA, a, grade, skill, focus, rngSeeded(1))
          applyOption(trialB, b, grade, skill, focus, rngSeeded(1))
          return deckScore(trialB, focus, locale) - deckScore(trialA, focus, locale)
        })[0]
      }
      const plannedOption = phase === 'verb'
        ? options.find((option) => option.word?.id === plannedEngineId)
        : null
      if (plannedOption) chosen = plannedOption
      // ok는 최선을 늘 알아보지는 못한다 — 10%는 아무거나 고른다.
      if (skill === 'ok' && rng() < 0.1) chosen = options[Math.floor(rng() * options.length)]
    }
    wallet.inspiration -= rewardPrice(chosen)
    applyOption(player, chosen, grade, skill, focus, rng)
  }
}

// ─────────────────────────────────────────── 전투

function ensureVerbRoles(words: Word[], initialCount: number): Word[] {
  const predicates = ['attack', 'guard', 'heal'].map((kind) => (word: Word) => word.kind === kind)
  const guaranteedIndexes: number[] = []
  for (const predicate of predicates.slice(0, initialCount)) {
    const index = words.findIndex((word, wordIndex) => !guaranteedIndexes.includes(wordIndex) && predicate(word))
    if (index >= 0) guaranteedIndexes.push(index)
  }
  const guaranteedSet = new Set(guaranteedIndexes)
  return [
    ...guaranteedIndexes.sort((a, b) => a - b).map((index) => words[index]),
    ...words.filter((_, index) => !guaranteedSet.has(index)),
  ]
}

function ensurePreferredInHand(words: Word[], initialCount: number, predicate: (word: Word) => boolean): Word[] {
  if (words.slice(0, initialCount).some(predicate)) return words
  const index = words.findIndex((word, wordIndex) => wordIndex >= initialCount && predicate(word))
  if (index < 0) return words
  const ordered = [...words]
  ;[ordered[initialCount - 1], ordered[index]] = [ordered[index], ordered[initialCount - 1]]
  return ordered
}

function drawHands(
  player: PlayerState,
  enemyId: string | undefined,
  locale: LocaleCode,
  rng: () => number,
  sealed: Set<string>,
  preferWide: boolean,
  openingHandBonus = 0,
): { hands: Word[][]; piles: Word[][]; tables: ReturnType<typeof makeEarlyTables> } {
  const t = tablesForEncounter(makeEarlyTables(player.deck, player, locale), enemyId)
  const order = t.template.slots.map((s) => s.key)
  const piles: Word[][] = []
  const hands = order.map((key, slotIndex) => {
    let pool = [...((t.words[key] ?? []) as Word[])]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const size = (key.startsWith('verb') ? VERB_HAND_SIZE : HAND_SIZE) + (slotIndex === 0 ? openingHandBonus : 0)
    if (key.startsWith('verb')) pool = ensureVerbRoles(pool, size)
    if (preferWide && key.startsWith('verb')) {
      pool = ensurePreferredInHand(pool, size, (word) =>
        word.kind === 'attack'
        && (!!word.effects?.pierceGuard || word.targetCount === 'all' || (word.targetCount ?? 1) >= 2))
    }
    const hand = pool.slice(0, size)
    piles.push(pool.slice(size))
    if (hand.every((w) => sealed.has(w.id))) {
      const replacement = pool.slice(size).find((w) => !sealed.has(w.id))
      if (replacement) hand[hand.length - 1] = replacement
    }
    return hand
  })
  return { hands, piles, tables: t }
}

function enumerate(
  player: PlayerState,
  tables: ReturnType<typeof makeEarlyTables>,
  hands: Word[][],
  sealed: Set<string>,
  kills: number,
  availableInk: number,
): Candidate[] {
  const order = tables.template.slots.map((s) => s.key)
  const mods = modsFor(player, kills)
  const out: Candidate[] = []
  const walk = (i: number, sel: Selection) => {
    if (i === order.length) {
      const inkCost = selectionInkCost(sel)
      if (inkExceedsLimit(inkCost, availableInk)) return
      const overdraw = inkOverdraw(inkCost, availableInk)
      const intent = withOverdrawEffects(compile(sel, tables, player.stats, mods), overdraw)
      const m = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, 0.5).mult
      out.push({
        sel,
        intent,
        dmg: isDamageIntent(intent) ? Math.round(effectiveBase(intent) * m * intent.castScale) : 0,
        guard: Math.round(intent.guard * m * intent.castCount * intent.castScale),
        heal: Math.round(intent.heal * m * intent.castCount * intent.castScale),
        inkCost,
        overdraw,
      })
      return
    }
    for (const w of hands[i]) {
      if (sealed.has(w.id)) continue
      if (conflictReason(w, i, sel, tables)) continue
      walk(i + 1, { ...sel, [order[i]]: w })
    }
  }
  walk(0, {})
  return out
}

const TARGET_FALLOFF = [1, 0.7, 0.5]

/** 레일 전체에 실제로 꽂히는 총 피해 근사(관통·범위·감쇠 반영). */
function railValue(c: Candidate, state: BattleState): number {
  const damage = candidateDamage(c, state)
  if (damage <= 0) return 0
  const alive = aliveIdx(state)
  if (!alive.length) return 0
  const hpOf = (i: number) => Math.max(0, state.enemies[i].hp)
  if (c.intent.targetCount === 'all') {
    return alive.reduce((s, i) => s + Math.min(damage, hpOf(i)), 0)
  }
  const n = c.intent.targetCount as number
  if (n > 1) {
    return alive.slice(0, n).reduce((s, i, r) => s + Math.min(Math.round(damage * (TARGET_FALLOFF[r] ?? 0.5)), hpOf(i)), 0)
  }
  // 단일은 오버킬이 뒤로 이어지므로 레일 총 체력까지 인정한다.
  const railHp = alive.reduce((s, i) => s + hpOf(i), 0)
  return Math.min(damage * c.intent.hitCount * c.intent.castCount, railHp)
}

function candidateDamage(c: Candidate, state: BattleState): number {
  const missingHp = Math.max(0, state.playerMax - state.playerHp)
  return c.dmg
    + Math.round(state.guard * c.intent.guardAttackMultiplier)
    + Math.round(Math.max(0, c.heal - missingHp) * c.intent.overhealDamageMultiplier)
}

function candidateValue(c: Candidate, state: BattleState, focus: BuildFocus): number {
  const attack = railValue(c, state)
  const utility = c.intent.enemyAttackDown * 2.5
    + c.intent.drawCards * 2
    + c.intent.counterMultiplier * 2
    + c.intent.magicShield * state.playerMax * .3
    + attack * c.intent.lifeStealRate * .5
    + selectionCarryInk(c.sel) * 1.5
  const combo = c.intent.combos.length * 18
  const scores: Record<BuildFocus, number> = {
    balanced: attack + c.guard * 0.55 + c.heal * 0.7 + utility,
    attack: attack * 1.45 + c.guard * 0.25 + c.heal * 0.3 + utility * 0.7,
    guard: attack * 0.6 + c.guard * 1.45 + c.heal * 0.35 + utility * 1.2,
    heal: attack * 0.6 + c.guard * 0.35 + c.heal * 1.5 + utility,
    combo: attack * 0.65 + c.guard * 0.55 + c.heal * 0.65 + utility + combo
      + (c.intent.combos.length ? 24 : 0),
  }
  return scores[focus]
}

interface StageResult {
  won: boolean
  killedBy: string | null
  hp: number
  guard: number
  grade: number
  turns: number
  maxHp: number
  unusedDraws: number
  actions: ActionStats
}

function fightStage(
  player: PlayerState,
  day: number,
  carried: { hp: number; guard: number },
  skill: CombatSkill,
  focus: BuildFocus,
  locale: LocaleCode,
  rng: () => number,
  log: string[] | null,
): StageResult {
  const stage = stageFor(day)
  const enemies = stage.encounter.map((id, index) =>
    makeEnemy(
      enemyDefForEncounter(id, stage.floor, stage.endlessCycle, index, stage.encounter.length),
      stage.atkMult,
      stage.hpMult,
      stage.isBoss ? stage.bossHealthBars : 1,
    ))
  const maxHp = player.stats.hp
  const state: BattleState = {
    playerHp: Math.max(0, Math.min(maxHp, carried.hp)),
    playerMax: maxHp,
    guard: Math.max(0, Math.min(maxHp, carried.guard)),
    counterMultiplier: 0,
    turn: 1,
    enemies,
    pending: null,
  }
  summonAtTurnStart(state)
  engageInitialFront(state)
  let grade = startGrade(player.stats.luck)
  const sealed = new Set<string>()
  let killsThisBattle = 0
  let beanstalkGrownThisBattle = false
  let turn = 0
  let carriedInk = 0
  let openingHandBonus = 0
  let drawsLeft = FREE_DRAWS_PER_STAGE
  const actions = emptyActions()

  while (turn < MAX_TURNS_PER_STAGE && state.playerHp > 0 && !allDead(state)) {
    turn++
    state.turn = turn
    if (turn > 1) summonAtTurnStart(state)
    const boss = state.enemies[Math.max(0, frontIdx(state))]
    const web = spiderWebAtTurnStart(state)

    const escorts = summonCount(boss)
    const preferWide = !!boss.def.summonPattern && escorts > 0
    const { hands, piles, tables } = drawHands(player, stage.encounter[0], locale, rng, sealed, preferWide, openingHandBonus)
    openingHandBonus = 0
    if (web) {
      const slotKey = spiderSealSlotForTurn(tables.template.slots.map((s) => s.key), turn)
      const idx = tables.template.slots.findIndex((s) => s.key === slotKey)
      const max = boss.def.webPattern?.maxSealedCards ?? 0
      if (idx >= 0 && sealed.size < max) {
        const sealable = hands[idx].filter((w) => !sealed.has(w.id))
        if (sealable.length > 1) sealed.add(sealable[Math.floor(rng() * sealable.length)].id)
      }
    }

    const verbIndex = tables.template.slots.findIndex((slot) => slot.key.startsWith('verb'))
    const engineId = focus === 'guard' ? 'storedResolve' : focus === 'heal' ? 'overflowingHeart' : null
    const engineReady = focus === 'guard'
      ? state.guard >= state.playerMax * 0.25
      : focus === 'heal' && state.playerHp >= state.playerMax * 0.8
    const engineOwned = engineId && verbIndex >= 0
      && [...hands[verbIndex], ...piles[verbIndex]].some((word) => word.id === engineId)
    while (
      skill !== 'greedy'
      && stage.isBoss
      && engineReady
      && engineOwned
      && verbIndex >= 0
      && drawsLeft > 0
      && hands[verbIndex].length < 6
      && piles[verbIndex].length > 0
      && !hands[verbIndex].some((word) => word.id === engineId && !sealed.has(word.id))
    ) {
      hands[verbIndex].push(piles[verbIndex].shift()!)
      drawsLeft--
    }

    const availableInk = sentenceInkAvailable(carriedInk)
    const hand = enumerate(player, tables, hands, sealed, killsThisBattle, availableInk)
    if (!hand.length) break
    const attackScore = (candidate: Candidate) => skill === 'average'
      ? candidateValue(candidate, state, focus)
      : railValue(candidate, state)
    const rankedAttacks = hand
      .filter((candidate) => candidateDamage(candidate, state) > 0)
      .sort((a, b) => attackScore(b) - attackScore(a) || candidateDamage(b, state) - candidateDamage(a, state))
    // 평균 플레이는 손패의 상위 25% 안에서 자연스러운 문장을 고른다. 매번 전 조합의
    // 수학적 최댓값을 집는 모델은 실제 플레이어가 아니라 솔버라 완주율을 과대평가한다.
    const attackPool = skill === 'average' ? Math.max(1, Math.ceil(rankedAttacks.length * 0.25)) : 1
    const bestAttack = rankedAttacks[skill === 'average' ? Math.floor(rng() * attackPool) : 0]
    const bestGuard = hand
      .filter((c) => c.guard > 0 || c.intent.magicShield > 0)
      .sort((a, b) => (b.guard + b.intent.magicShield * state.playerMax * .6) - (a.guard + a.intent.magicShield * state.playerMax * .6))[0]
    const bestMagicShield = hand
      .filter((candidate) => candidate.intent.magicShield > 0)
      .sort((a, b) => candidateValue(b, state, focus) - candidateValue(a, state, focus))[0]
    const bestHeal = hand.filter((c) => c.heal > 0).sort((a, b) => b.heal - a.heal)[0]
    const bestOverheal = hand
      .filter((c) => c.intent.overhealDamageMultiplier > 0)
      .sort((a, b) => candidateValue(b, state, 'heal') - candidateValue(a, state, 'heal'))[0]
    const bestGuardEngine = hand
      .filter((candidate) => candidate.intent.guardAttackMultiplier > 0)
      .sort((a, b) => candidateDamage(b, state) - candidateDamage(a, state))[0]
    let pick = bestAttack ?? bestGuard ?? bestHeal

    if (skill !== 'greedy' && focus !== 'balanced') {
      const focused = [...hand].sort((a, b) => candidateValue(b, state, focus) - candidateValue(a, state, focus))[0]
      if (focus === 'attack') pick = bestAttack ?? focused
      else if (focus === 'guard' && state.turn <= boss.groggyUntilTurn) pick = bestAttack ?? focused
      else if (focus === 'guard' && state.guard < state.playerMax * 0.65 && bestGuard) pick = bestGuard
      else if (focus === 'guard' && bestGuardEngine) pick = bestGuardEngine
      else if (focus === 'guard') {
        const guardOffense = hand
          .filter((candidate) => candidate.dmg > 0 || candidate.intent.guardAttackMultiplier > 0)
          .sort((a, b) => candidateValue(b, state, focus) - candidateValue(a, state, focus))[0]
        pick = guardOffense ?? bestAttack ?? focused
      }
      else if (focus === 'heal' && state.playerHp < state.playerMax * 0.85 && bestHeal) pick = bestHeal
      else if (
        focus === 'heal'
        && bestOverheal
        && candidateDamage(bestOverheal, state) >= candidateDamage(bestAttack ?? bestOverheal, state) * 0.55
      ) pick = bestOverheal
      else if (focus === 'heal') pick = bestAttack ?? focused
      else if (focus === 'combo') {
        const comboAnswer = hand
          .filter((candidate) => candidate.intent.combos.length > 0 && (
            candidateDamage(candidate, state) > 0
            || (candidate.heal > 0 && state.playerHp < state.playerMax * 0.8)
            || (candidate.guard > 0 && turn >= boss.nextAttackTurn - 1)
          ))
          .sort((a, b) => b.intent.combos.length - a.intent.combos.length
            || (candidateDamage(b, state) > 0 ? 1 : 0) - (candidateDamage(a, state) > 0 ? 1 : 0)
            || candidateValue(b, state, focus) - candidateValue(a, state, focus))[0]
        pick = comboAnswer ?? bestAttack ?? focused
      }
    }

    const readsSituation = skill === 'smart' || (skill === 'average' && rng() < 0.7)
    if (readsSituation) {
      const step = nextEnemyAttackStep(boss)
      const telegraphed = !!step && step.damageScale === 0
      const incoming = !telegraphed && !!nextEnemyAttackStep(boss)?.shatterGuard
      const willBeHit = turn >= boss.nextAttackTurn
      const incomingPierce = !!boss.def.pierceGuard
        || (!!boss.def.summonPattern?.pierceWhileEscorted && escorts > 0)
      const threat = boss.def.atk * boss.atkMult * (incoming ? 1.2 : 1)
      const workerClear = (c: Candidate) => {
        if (c.intent.summonExecuteCount > 0) return Math.min(escorts, c.intent.summonExecuteCount)
        const reachable = c.intent.pierceGuard || c.intent.targetCount === 'all'
          ? escorts
          : Math.min(escorts, c.intent.targetCount as number)
        return Math.min(reachable, Math.floor(candidateDamage(c, state) / (boss.def.summonPattern?.hp ?? 1)))
      }
      const queenAnswer = boss.def.summonPattern && escorts > 0
        ? hand
          .filter((c) => candidateDamage(c, state) > 0)
          .sort((a, b) => workerClear(b) - workerClear(a) || candidateDamage(b, state) - candidateDamage(a, state))[0]
        : null
      const weakness = activeEnemyPart(boss)?.def.weakness
      const matchesWeak = (c: Candidate) => !weakness
        || (weakness.kind === 'emotion'
          ? c.intent.emotions.includes(weakness.value as typeof c.intent.emotions[number])
          : c.intent.tags.includes(weakness.value))
      const weakAnswer = boss.def.webPattern
        ? hand.filter(matchesWeak).sort((a, b) =>
          (candidateDamage(b, state) > 0 ? 1 : 0) - (candidateDamage(a, state) > 0 ? 1 : 0)
          || candidateDamage(b, state) - candidateDamage(a, state)
          || (b.heal + b.guard) - (a.heal + a.guard))[0]
        : null
      const lowHp = state.playerHp < state.playerMax * 0.5
      const queenClearsEscort = !!queenAnswer && workerClear(queenAnswer) >= escorts
      if (incoming && bestGuard) pick = bestGuard
      else if (queenClearsEscort) pick = queenAnswer
      else if (willBeHit && incomingPierce && bestMagicShield) pick = bestMagicShield
      else if (queenAnswer) pick = queenAnswer
      else if (lowHp && bestHeal) pick = bestHeal
      else if (weakAnswer) pick = weakAnswer
      else if (willBeHit && threat > state.guard + state.playerHp * 0.4 && bestGuard) pick = bestGuard
    }
    // 평균 이상 플레이어는 카드에 공개된 체력 지불을 읽는다. 같은 역할의 무과금 문장이
    // 75% 이상 효율이면 작은 수치 차이 때문에 매 턴 체력을 태우지 않는다.
    if (skill !== 'greedy' && pick?.overdraw) {
      const safe = hand
        .filter((candidate) => candidate.overdraw === 0 && candidate.intent.kind === pick!.intent.kind)
        .sort((a, b) => candidateValue(b, state, focus) - candidateValue(a, state, focus))[0]
      if (safe && candidateValue(safe, state, focus) >= candidateValue(pick, state, focus) * 0.75) pick = safe
    }
    if (!pick) break

    applyInkOverdraw(state, pick.inkCost, availableInk)
    carriedInk = carryInkAfterSpend(pick.inkCost, availableInk, selectionCarryInk(pick.sel))
    if (state.playerHp <= 0) break

    const intent = withOverdrawEffects(
      compile(pick.sel, tables, player.stats, modsFor(player, killsThisBattle)),
      pick.overdraw,
    )
    const firstRouletteRoll = rng()
    const rouletteRoll = hasPassive(player, 'retry') ? Math.min(firstRouletteRoll, rng()) : firstRouletteRoll
    const resolved = resolveMultiplier(
      intent,
      { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) },
      rouletteRoll,
      intent.variance ? rng() : null,
      Array.from({ length: intent.doubtCount }, () => rng()),
    )
    const mult = resolved.mult

    // 성장 효과는 문장을 완성한 직후, 선공 적 행동보다 먼저 적용한다. 화면과 같은 순서다.
    const passiveGrowth = beanstalkGrowthFor(player, !beanstalkGrownThisBattle)
    if (passiveGrowth > 0) beanstalkGrownThisBattle = true
    const totalGrowth = intent.growHp + passiveGrowth
    if (totalGrowth > 0) {
      player.stats.hp += totalGrowth
      state.playerMax += totalGrowth
      state.playerHp += totalGrowth
    }

    actions.sentences++
    if (isDamageIntent(intent)) actions.attack++
    if (intent.guard > 0) actions.guard++
    if (intent.heal > 0) actions.heal++
    actions.combo += intent.combos.length
    if (intent.targetCount === 'all' || (typeof intent.targetCount === 'number' && intent.targetCount > 1)) actions.wide++
    if (intent.guardAttackMultiplier > 0) actions.guardEngine++
    if (intent.overhealDamageMultiplier > 0) actions.healEngine++

    applyPreparation(state, intent, mult)
    for (const st of enemyTurn(state, rng, 'first')) log?.push(`    T${turn} 선공 ${st.text}`)
    if (state.playerHp <= 0) break

    const applyAndRecord = (scale: number) => {
      const target = Math.max(0, frontIdx(state))
      const result = applyIntent(state, intent, scale, target)
      actions.damage += result.hits.reduce((sum, hit) => sum + hit.dmg, 0)
        + result.summonDamage
        + result.summonBacklashDamage
      let kills = result.killed.length
      let overflow = result.overflow
      while (overflow > 0 && !allDead(state)) {
        const front = frontIdx(state)
        if (front < 0) break
        const transfer = applyOverkillTransfer(state, front, overflow, {
          emotions: intent.emotions,
          tags: intent.tags,
          comboMatched: intent.combos.length > 0,
        })
        if (transfer.killed) kills++
        actions.damage += transfer.dealt
        overflow = transfer.overflow
        if (!transfer.killed) break
      }
      if (kills > 0) engageFront(state)
      killsThisBattle += kills
      return { result, kills }
    }
    const { result: res } = applyAndRecord(mult)
    if (resolved.outcome === 'crit' && hasPassive(player, 'echo') && !allDead(state)) {
      applyAndRecord(mult * ECHO_REPEAT_SCALE)
    }
    log?.push(`    T${turn} ${res.text}`)
    if (allDead(state)) break

    for (const st of enemyTurn(state, rng, 'second')) log?.push(`    T${turn} 후공 ${st.text}`)
    if (state.pending) {
      const pending = applyPendingAttack(state)
      if (pending) {
        actions.damage += pending.hits.reduce((sum, hit) => sum + hit.dmg, 0)
          + pending.summonDamage
          + pending.summonBacklashDamage
        if (pending.killed.length) engageFront(state)
      }
    }
    if (state.playerHp > 0 && !allDead(state)) openingHandBonus += intent.drawCards
    if (state.playerHp <= 0 || allDead(state)) break
    grade = decayGrade(grade, player.stats.luck)
  }

  const frontAlive = state.enemies.find((e) => !e.dead)
  return {
    won: allDead(state) && state.playerHp > 0,
    killedBy: frontAlive ? frontAlive.def.name : null,
    hp: Math.max(0, state.playerHp),
    guard: state.guard,
    grade,
    turns: turn,
    maxHp: state.playerMax,
    unusedDraws: drawsLeft,
    actions,
  }
}

// ─────────────────────────────────────────── 런

interface RunResult {
  reachedFloor: number // 도달해서 클리어한 마지막 층(0 = 1층에서 사망)
  diedOn: number | null
  killedBy: string | null
  hpTrace: { floor: number; hpBefore: number; hpAfter: number; max: number; turns: number }[]
  finalStats: PlayerStats
  log: string[]
  actions: ActionStats
}

function playRun(seed: number, reward: RewardSkill, combat: CombatSkill, focus: BuildFocus, verbose: boolean, locale: LocaleCode = 'ko'): RunResult {
  const rng = rngSeeded(seed)
  const realRandom = Math.random
  Math.random = rng // genRewards의 shuffle까지 시드에 묶는다
  try {
    const player = startingPlayer()
    const wallet = { inspiration: 0 }
    const carried = { hp: player.stats.hp, guard: 0 }
    const hpTrace: RunResult['hpTrace'] = []
    const log: string[] = []
    const actions = emptyActions()
    for (let day = 1; day <= STORY_FLOORS; day++) {
      const hpBefore = Math.min(carried.hp, player.stats.hp)
      const result = fightStage(player, day, carried, combat, focus, locale, rng, verbose ? log : null)
      addActions(actions, result.actions)
      hpTrace.push({ floor: day, hpBefore, hpAfter: result.hp, max: result.maxHp, turns: result.turns })
      if (verbose) {
        log.push(`  ${String(day).padStart(2)}층 ${result.won ? '승' : '패'} · ${result.turns}턴 · HP ${hpBefore}→${result.hp}/${result.maxHp}`)
      }
      if (!result.won) {
        return { reachedFloor: day - 1, diedOn: day, killedBy: result.killedBy, hpTrace, finalStats: { ...player.stats }, log, actions }
      }
      carried.hp = result.hp
      carried.guard = result.guard
      takeRewards(player, result.grade, result.unusedDraws, day, reward, focus, locale, rng, wallet)
    }
    return { reachedFloor: STORY_FLOORS, diedOn: null, killedBy: null, hpTrace, finalStats: { ...player.stats }, log, actions }
  } finally {
    Math.random = realRandom
  }
}

// ─────────────────────────────────────────── 리포트

const verbose = process.argv.includes('--verbose')
const check = process.argv.includes('--check')
const traceBuildArg = process.argv.find((argument) => argument.startsWith('--trace-build='))
const traceBuild = traceBuildArg?.split('=')[1] as BuildFocus | undefined
const runsArg = process.argv.find((a) => a.startsWith('--runs='))
const RUNS = runsArg ? Math.max(1, Number(runsArg.split('=')[1])) : 60

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`

console.log(`풀런 시뮬레이션 — 기량별 ${RUNS}회, 1~${STORY_FLOORS}층 (체력·방어막 이월)\n`)

const SKILL_PROFILES: { label: string; reward: RewardSkill; combat: CombatSkill }[] = [
  { label: 'naive', reward: 'random', combat: 'greedy' },
  { label: 'average', reward: 'ok', combat: 'average' },
  { label: 'expert', reward: 'best', combat: 'smart' },
]

interface ProfileMetrics {
  label: string
  cleared: number
  reach5: number
  avgFloor: number
  firstFloorDeaths: number
  avgTurns: number
}
const metrics: ProfileMetrics[] = []

for (const profile of SKILL_PROFILES) {
  const runs = Array.from(
    { length: RUNS },
    (_, i) => playRun((i + 1) * 7919 + 13, profile.reward, profile.combat, 'balanced', verbose),
  )
  const cleared = runs.filter((r) => r.diedOn === null).length
  const reach10 = runs.filter((r) => r.reachedFloor >= 10).length
  const reach5 = runs.filter((r) => r.reachedFloor >= 5).length
  const avgFloor = runs.reduce((s, r) => s + r.reachedFloor, 0) / runs.length

  console.log(`■ ${profile.label}`)
  console.log(
    `  15층 클리어 ${cleared}/${RUNS} (${pct(cleared, RUNS)})`
    + ` · 10층 도달 ${pct(reach10, RUNS)}`
    + ` · 5층 도달 ${pct(reach5, RUNS)}`
    + ` · 평균 도달 ${avgFloor.toFixed(1)}층`,
  )

  // 층별 사망 분포와 "그 층에 도전한 런 중 몇 %가 여기서 죽었나"(조건부 사망률)
  const attempts = new Array(STORY_FLOORS + 1).fill(0)
  const deaths = new Array(STORY_FLOORS + 1).fill(0)
  for (const r of runs) {
    const last = r.diedOn ?? STORY_FLOORS
    for (let f = 1; f <= last; f++) attempts[f]++
    if (r.diedOn) deaths[r.diedOn]++
  }
  const bars = []
  for (let f = 1; f <= STORY_FLOORS; f++) {
    if (!attempts[f]) continue
    const rate = deaths[f] / attempts[f]
    bars.push(`${f}층 ${(rate * 100).toFixed(0)}%${[5, 10, 15].includes(f) ? '*' : ''}`)
  }
  console.log(`  층별 사망률(도전 대비): ${bars.join(' · ')}   (*=보스)`)

  // 층 진입 시 체력 비율 — 소모전 압력을 본다.
  const entering: number[][] = Array.from({ length: STORY_FLOORS + 1 }, () => [])
  for (const r of runs) for (const t of r.hpTrace) entering[t.floor].push(t.hpBefore / t.max)
  const hpLine = []
  for (let f = 1; f <= STORY_FLOORS; f++) {
    if (!entering[f].length) continue
    const avg = entering[f].reduce((s, v) => s + v, 0) / entering[f].length
    hpLine.push(`${f}:${(avg * 100).toFixed(0)}%`)
  }
  console.log(`  진입 시 평균 체력비: ${hpLine.join(' ')}`)

  const survivors = runs.filter((r) => r.diedOn === null)
  const sample = survivors[0] ?? runs.sort((a, b) => b.reachedFloor - a.reachedFloor)[0]
  const s = sample.finalStats
  console.log(`  대표 런 최종 스탯: HP ${s.hp} · 공 ${s.atk} · 방 ${s.guard} · 회 ${s.heal} · 운 ${s.luck}`)
  const turns = runs.flatMap((r) => r.hpTrace.map((t) => t.turns))
  const avgTurns = turns.reduce((a, b) => a + b, 0) / turns.length
  console.log(`  평균 전투 길이 ${avgTurns.toFixed(1)}턴\n`)
  metrics.push({
    label: profile.label,
    cleared,
    reach5,
    avgFloor,
    firstFloorDeaths: runs.filter((r) => r.diedOn === 1).length,
    avgTurns,
  })
  if (verbose) sample.log.forEach((l) => console.log(l))
}

interface BuildMetrics {
  focus: Exclude<BuildFocus, 'balanced'>
  cleared: number
  reach5: number
  avgFloor: number
  actionRates: ActionStats
  damagePerSentence: number
  averageTurns: number
  deathFloors: string
  averageStats: PlayerStats
}

const buildRunsArg = process.argv.find((argument) => argument.startsWith('--build-runs='))
const requestedBuildRuns = buildRunsArg ? Math.max(1, Number(buildRunsArg.split('=')[1])) : null
const BUILD_RUNS = requestedBuildRuns ?? (check ? Math.max(12, Math.ceil(RUNS / 2)) : Math.max(20, Math.ceil(RUNS / 3)))
const BUILD_FOCUSES: Exclude<BuildFocus, 'balanced'>[] = ['attack', 'guard', 'heal', 'combo']
const buildMetrics: BuildMetrics[] = []

console.log(`\nBuild identity (${BUILD_RUNS} seeded smart runs each)`)
for (const focus of BUILD_FOCUSES) {
  const runs = Array.from(
    { length: BUILD_RUNS },
    (_, i) => playRun((i + 1) * 104729 + 97, 'best', 'smart', focus, traceBuild === focus),
  )
  const totals = emptyActions()
  for (const run of runs) addActions(totals, run.actions)
  const sentences = Math.max(1, totals.sentences)
  const actionRates: ActionStats = {
    sentences,
    attack: totals.attack / sentences,
    guard: totals.guard / sentences,
    heal: totals.heal / sentences,
    combo: totals.combo / sentences,
    damage: totals.damage / sentences,
    wide: totals.wide / sentences,
    guardEngine: totals.guardEngine / sentences,
    healEngine: totals.healEngine / sentences,
  }
  const metric: BuildMetrics = {
    focus,
    cleared: runs.filter((run) => run.diedOn === null).length,
    reach5: runs.filter((run) => run.reachedFloor >= 5).length,
    avgFloor: runs.reduce((sum, run) => sum + run.reachedFloor, 0) / runs.length,
    actionRates,
    damagePerSentence: totals.damage / sentences,
    averageTurns: runs.flatMap((run) => run.hpTrace).reduce((sum, trace) => sum + trace.turns, 0)
      / Math.max(1, runs.flatMap((run) => run.hpTrace).length),
    deathFloors: [...new Set(runs.map((run) => run.diedOn).filter((floor): floor is number => floor !== null))]
      .sort((a, b) => a - b)
      .map((floor) => `${floor}:${runs.filter((run) => run.diedOn === floor).length}`)
      .join(', ') || '-',
    averageStats: (['hp', 'atk', 'guard', 'heal', 'luck'] as const).reduce((stats, key) => {
      stats[key] = runs.reduce((sum, run) => sum + run.finalStats[key], 0) / runs.length
      return stats
    }, {} as PlayerStats),
  }
  buildMetrics.push(metric)
  console.log(
    `  ${focus.padEnd(6)} clear ${metric.cleared}/${BUILD_RUNS} (${pct(metric.cleared, BUILD_RUNS)})`
    + ` | reach5 ${pct(metric.reach5, BUILD_RUNS)} | avg ${metric.avgFloor.toFixed(1)}`
    + ` | action A${pct(actionRates.attack, 1)} G${pct(actionRates.guard, 1)}`
    + ` H${pct(actionRates.heal, 1)} C${pct(actionRates.combo, 1)}`
    + ` | dmg/sentence ${metric.damagePerSentence.toFixed(1)} · ${metric.averageTurns.toFixed(1)} turns`,
  )
  console.log(
    `           deaths ${metric.deathFloors} | avg stats`
    + ` HP${metric.averageStats.hp.toFixed(0)} A${metric.averageStats.atk.toFixed(0)}`
    + ` G${metric.averageStats.guard.toFixed(0)} H${metric.averageStats.heal.toFixed(0)}`
    + ` L${metric.averageStats.luck.toFixed(0)}`
    + ` | wide ${pct(actionRates.wide, 1)} guard-engine ${pct(actionRates.guardEngine, 1)}`
    + ` heal-engine ${pct(actionRates.healEngine, 1)}`,
  )
  if (traceBuild === focus) {
    const sample = runs.find((run) => run.diedOn !== null) ?? runs[0]
    console.log(`           trace seed result: died ${sample.diedOn ?? '-'} · reached ${sample.reachedFloor}`)
    sample.log.forEach((line) => console.log(line))
  }
}

const LOCALE_RUNS = check ? 8 : 12
console.log(`\nLocale idiom balance (${LOCALE_RUNS} seeded average runs each)`)
const localeMetrics = SUPPORTED_LOCALES.map((locale) => {
  const runs = Array.from(
    { length: LOCALE_RUNS },
    (_, i) => playRun((i + 1) * 65537 + 211, 'ok', 'average', 'balanced', false, locale),
  )
  const cleared = runs.filter((run) => run.diedOn === null).length
  const reach5 = runs.filter((run) => run.reachedFloor >= 5).length
  const avgFloor = runs.reduce((sum, run) => sum + run.reachedFloor, 0) / runs.length
  console.log(`  locale ${locale.padEnd(7)} clear ${pct(cleared, LOCALE_RUNS)} | reach5 ${pct(reach5, LOCALE_RUNS)} | avg ${avgFloor.toFixed(1)}`)
  return { locale, cleared, reach5, avgFloor, firstFloorDeaths: runs.filter((run) => run.diedOn === 1).length }
})

if (check) {
  const byLabel = Object.fromEntries(metrics.map((metric) => [metric.label, metric]))
  const naive = byLabel.naive
  const average = byLabel.average
  const expert = byLabel.expert
  const violations: string[] = []
  if (metrics.some((metric) => metric.firstFloorDeaths > 0)) violations.push('초반 학습 구간인 1층에서 사망이 발생했다')
  // 수식어의 자동 배율을 없앤 뒤에는 공개 전술을 읽는 선택 자체가 성장 축이다.
  // 무작위 플레이의 최소 생존선과 평균 플레이의 안정적 진전을 따로 보장한다.
  if (naive.reach5 / RUNS < 0.05) violations.push('무작위 보상 플레이의 5층 도달률이 5% 미만이다')
  if (average.cleared / RUNS < 0.65) violations.push('평균 플레이의 15층 클리어율이 65% 미만이다')
  if (average.cleared / RUNS > 0.95) violations.push('평균 플레이의 15층 클리어율이 95%를 넘어 난이도 곡선이 무의미하다')
  if (expert.cleared + Math.ceil(RUNS * 0.1) < average.cleared) {
    violations.push('숙련 플레이가 평균 플레이보다 10%p 넘게 낮은 클리어율을 보인다')
  }
  if (average.avgFloor - naive.avgFloor < 4) violations.push('선택 기량에 따른 평균 도달층 차이가 4층 미만이다')
  if (average.avgTurns < 1.4) violations.push('평균 전투 길이가 1.4턴 미만이라 문장 선택이 의미를 잃는다')
  const builds = Object.fromEntries(buildMetrics.map((metric) => [metric.focus, metric])) as Record<Exclude<BuildFocus, 'balanced'>, BuildMetrics>
  for (const metric of buildMetrics) {
    if (metric.cleared / BUILD_RUNS < 0.25) violations.push(`${metric.focus} build clears the story in fewer than 25% of runs`)
  }
  if (builds.guard.cleared / BUILD_RUNS < 0.4) violations.push('guard build clears the story in fewer than 40% of runs')
  const stableSupportClears = Math.max(builds.guard.cleared, builds.heal.cleared, builds.combo.cleared)
  if (builds.attack.cleared > stableSupportClears + Math.ceil(BUILD_RUNS * 0.15)) {
    violations.push('attack build clears more than 15%p above the most stable support build')
  }
  for (const metric of buildMetrics) {
    if (metric.reach5 / BUILD_RUNS < 0.5) violations.push(`${metric.focus} build reaches floor 5 in fewer than 50% of runs`)
  }
  if (builds.guard.actionRates.guard <= builds.attack.actionRates.guard + 0.03) violations.push('guard build does not use meaningfully more guard sentences than attack build')
  if (builds.heal.actionRates.heal < builds.attack.actionRates.heal + 0.03) violations.push('heal build does not use meaningfully more heal sentences than attack build')
  if (builds.combo.actionRates.combo < builds.attack.actionRates.combo + 0.03) violations.push('combo build does not trigger meaningfully more combos than attack build')
  for (const focus of ['guard', 'heal'] as const) {
    if (builds[focus].damagePerSentence >= builds.attack.damagePerSentence) {
      violations.push(`${focus} build deals as much damage per sentence as the attack build`)
    }
    if (builds[focus].averageTurns <= builds.attack.averageTurns) {
      violations.push(`${focus} build clears encounters as quickly as the attack build`)
    }
  }
  const strongestSupportDamage = Math.max(builds.guard.damagePerSentence, builds.heal.damagePerSentence, builds.combo.damagePerSentence)
  if (builds.attack.damagePerSentence > strongestSupportDamage * 2.5) {
    violations.push('attack build deals more than 2.5x the strongest support build damage per sentence')
  }
  if (builds.attack.averageTurns < 3) violations.push('attack build averages fewer than 3 turns per encounter')
  for (const metric of localeMetrics) {
    if (metric.firstFloorDeaths > 0) violations.push(`${metric.locale} locale has a first-floor death`)
    if (metric.reach5 / LOCALE_RUNS < 0.25) violations.push(`${metric.locale} locale reaches floor 5 in fewer than 25% of runs`)
  }
  const localeFloors = localeMetrics.map((metric) => metric.avgFloor)
  if (Math.max(...localeFloors) - Math.min(...localeFloors) > 3) violations.push('locale-specific idioms create more than a 3-floor average progression gap')
  if (violations.length) {
    console.error(`밸런스 계약 위반 ${violations.length}건:\n- ${violations.join('\n- ')}`)
    process.exit(1)
  }
  console.log('밸런스 계약 통과 — 초반 생존 · 평균 완주 가능성 · 기량 격차 · 전투 길이')
}
