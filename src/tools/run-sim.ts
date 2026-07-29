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
import { modsFor } from '@core/passives'
import { bumpGrade, decayGrade, overkillGain, startGrade } from '@core/grade'
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
import { makeEarlyTables, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { STORY_FLOORS, stageFor } from '@data/stages'
import { genRewards, rewardPrice, type RewardOption } from '@data/rewards'
import { EXCLAIM_SLOTS, exclaimModsFor, rollExclaimChoices, rollExclaimMultipliers, type StatKey } from '@data/items'
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
function deckScore(player: PlayerState): number {
  const t = makeEarlyTables(player.deck, player)
  const order = t.template.slots.map((s) => s.key)
  const mods = modsFor(player, 0)
  const dmgs: number[] = []
  const walk = (i: number, sel: Selection) => {
    if (i === order.length) {
      const intent = compile(sel, t, player.stats, mods)
      if (!isDamageIntent(intent)) return
      const m = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, 0.5).mult
      dmgs.push(effectiveBase(intent) * m * intent.hitCount * intent.castCount * intent.castScale)
      return
    }
    for (const w of (t.words[order[i]] ?? []) as Word[]) {
      if (conflictReason(w, i, sel, t)) continue
      walk(i + 1, { ...sel, [order[i]]: w })
    }
  }
  walk(0, {})
  if (!dmgs.length) return player.stats.hp
  dmgs.sort((a, b) => a - b)
  const med = dmgs[Math.floor(dmgs.length / 2)]
  const max = dmgs[dmgs.length - 1]
  // 체력·회복은 문장 분포에 잡히지 않으니 생존 축을 따로 얹는다.
  return med + max * 0.25 + player.stats.hp * 0.35 + player.stats.heal * 0.4 + player.stats.guard * 0.3
}

// ─────────────────────────────────────────── 보상

/** 감탄사 선택 정책 — 스탯 1점의 가치. 체력은 +2씩 붙으므로 점당으로 환산된다. */
const EXCLAIM_WEIGHT: Record<RewardSkill, Record<StatKey, number>> = {
  random: { atk: 1, hp: 1, guard: 1, heal: 1, luck: 1 }, // 아무거나 고른다
  ok: { atk: 1.6, hp: 0.7, guard: 0.9, heal: 0.9, luck: 1.0 },
  best: { atk: 2.0, hp: 0.75, guard: 1.0, heal: 1.0, luck: 1.2 },
}

function exclaimStats(rarity: Rarity, skill: RewardSkill, rng: () => number): Partial<PlayerStats> {
  const mults = rollExclaimMultipliers(rarity, rng)
  const openChoices = rollExclaimChoices(rng)
  const out: Partial<PlayerStats> = {}
  const weight = EXCLAIM_WEIGHT[skill]
  EXCLAIM_SLOTS.forEach((slot, i) => {
    const choices = openChoices[slot.key] ?? []
    if (!choices.length) return
    const pick = skill === 'random'
      ? choices[Math.floor(rng() * choices.length)]
      : [...choices].sort((a, b) => scoreMods(b.mods, weight) - scoreMods(a.mods, weight))[0]
    const mods = exclaimModsFor(mults[i], pick.mods)
    for (const [k, v] of Object.entries(mods)) {
      out[k as keyof PlayerStats] = (out[k as keyof PlayerStats] ?? 0) + (v ?? 0)
    }
  })
  return out
}

const scoreMods = (mods: Partial<Record<StatKey, number>>, weight: Record<StatKey, number>): number =>
  Object.entries(mods).reduce((s, [k, v]) => s + (v ?? 0) * weight[k as StatKey], 0)

function applyOption(player: PlayerState, opt: RewardOption, skill: RewardSkill, rng: () => number): void {
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
  const gained = exclaimStats(opt.rarity, skill, rng)
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
function takeRewards(player: PlayerState, grade: number, day: number, skill: RewardSkill, rng: () => number, wallet: { inspiration: number }): void {
  wallet.inspiration += Math.max(0, Math.round(grade))
  for (const phase of ['subject', 'item', 'verb'] as const) {
    const options = genRewards(player, grade, day, phase).filter((option) => rewardPrice(option) <= wallet.inspiration)
    if (!options.length) continue
    let chosen = options[Math.floor(rng() * options.length)]
    if (skill !== 'random') {
      // 세 장을 각각 적용해 보고 덱 점수가 가장 높은 쪽을 고른다.
      let best = -Infinity
      for (const opt of options) {
        const trial = clonePlayer(player)
        applyOption(trial, opt, skill, rngSeeded(1))
        const score = deckScore(trial)
        if (score > best) {
          best = score
          chosen = opt
        }
      }
      // ok는 최선을 늘 알아보지는 못한다 — 3할은 아무거나 고른다.
      if (skill === 'ok' && rng() < 0.3) chosen = options[Math.floor(rng() * options.length)]
    }
    wallet.inspiration -= rewardPrice(chosen)
    applyOption(player, chosen, skill, rng)
  }
}

// ─────────────────────────────────────────── 전투

function drawHands(
  player: PlayerState,
  enemyId: string | undefined,
  rng: () => number,
  sealed: Set<string>,
  preferWide: boolean,
  openingHandBonus = 0,
): { hands: Word[][]; tables: ReturnType<typeof makeEarlyTables> } {
  const t = tablesForEncounter(makeEarlyTables(player.deck, player), enemyId)
  const order = t.template.slots.map((s) => s.key)
  const hands = order.map((key, slotIndex) => {
    const pool = [...((t.words[key] ?? []) as Word[])]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    const size = (key.startsWith('verb') ? VERB_HAND_SIZE : HAND_SIZE) + (slotIndex === 0 ? openingHandBonus : 0)
    const hand = pool.slice(0, size)
    if (hand.every((w) => sealed.has(w.id))) {
      const replacement = pool.slice(size).find((w) => !sealed.has(w.id))
      if (replacement) hand[hand.length - 1] = replacement
    }
    return hand
  })
  if (preferWide) {
    const vi = order.findIndex((k) => k.startsWith('verb'))
    const wide = vi >= 0
      ? ((t.words[order[vi]] ?? []) as Word[]).find((w) =>
        w.kind === 'attack' && (!!w.effects?.pierceGuard || w.targetCount === 'all' || (w.targetCount ?? 1) >= 2))
      : undefined
    if (vi >= 0 && wide && !hands[vi].some((w) => w.id === wide.id)) hands[vi][hands[vi].length - 1] = wide
  }
  return { hands, tables: t }
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
  if (c.dmg <= 0) return 0
  const alive = aliveIdx(state)
  if (!alive.length) return 0
  const hpOf = (i: number) => Math.max(0, state.enemies[i].hp)
  if (c.intent.targetCount === 'all') {
    return alive.reduce((s, i) => s + Math.min(c.dmg, hpOf(i)), 0)
  }
  const n = c.intent.targetCount as number
  if (n > 1) {
    return alive.slice(0, n).reduce((s, i, r) => s + Math.min(Math.round(c.dmg * (TARGET_FALLOFF[r] ?? 0.5)), hpOf(i)), 0)
  }
  // 단일은 오버킬이 뒤로 이어지므로 레일 총 체력까지 인정한다.
  const railHp = alive.reduce((s, i) => s + hpOf(i), 0)
  return Math.min(c.dmg * c.intent.hitCount * c.intent.castCount, railHp)
}

function candidateValue(c: Candidate, state: BattleState): number {
  return railValue(c, state)
    + c.guard * 0.55
    + c.heal * 0.7
    + c.intent.enemyAttackDown * 2.5
    + c.intent.drawCards * 2
    + c.intent.counterMultiplier * 2
    + selectionCarryInk(c.sel) * 1.5
}

interface StageResult {
  won: boolean
  killedBy: string | null
  hp: number
  guard: number
  grade: number
  turns: number
  maxHp: number
}

function fightStage(
  player: PlayerState,
  day: number,
  carried: { hp: number; guard: number },
  skill: CombatSkill,
  rng: () => number,
  log: string[] | null,
): StageResult {
  const stage = stageFor(day)
  const enemies = stage.encounter.map((id) =>
    makeEnemy(ENEMIES[id], stage.atkMult, stage.hpMult, stage.isBoss ? stage.bossHealthBars : 1))
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
  let turn = 0
  let carriedInk = 0
  let openingHandBonus = 0

  while (turn < MAX_TURNS_PER_STAGE && state.playerHp > 0 && !allDead(state)) {
    turn++
    state.turn = turn
    if (turn > 1) summonAtTurnStart(state)
    const boss = state.enemies[Math.max(0, frontIdx(state))]
    const web = spiderWebAtTurnStart(state)

    const escorts = summonCount(boss)
    const preferWide = !!boss.def.summonPattern && escorts > 0
    const { hands, tables } = drawHands(player, stage.encounter[0], rng, sealed, preferWide, openingHandBonus)
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

    const availableInk = sentenceInkAvailable(carriedInk)
    const hand = enumerate(player, tables, hands, sealed, killsThisBattle, availableInk)
    if (!hand.length) break
    const attackScore = (candidate: Candidate) => skill === 'average'
      ? candidateValue(candidate, state)
      : railValue(candidate, state)
    const rankedAttacks = hand
      .filter((candidate) => candidate.dmg > 0)
      .sort((a, b) => attackScore(b) - attackScore(a) || b.dmg - a.dmg)
    // 평균 플레이는 손패의 상위 25% 안에서 자연스러운 문장을 고른다. 매번 전 조합의
    // 수학적 최댓값을 집는 모델은 실제 플레이어가 아니라 솔버라 완주율을 과대평가한다.
    const attackPool = skill === 'average' ? Math.max(1, Math.ceil(rankedAttacks.length * 0.25)) : 1
    const bestAttack = rankedAttacks[skill === 'average' ? Math.floor(rng() * attackPool) : 0]
    const bestGuard = hand.filter((c) => c.guard > 0).sort((a, b) => b.guard - a.guard)[0]
    const bestHeal = hand.filter((c) => c.heal > 0).sort((a, b) => b.heal - a.heal)[0]
    let pick = (bestAttack?.dmg ?? 0) > 0 ? bestAttack : bestGuard ?? bestHeal ?? bestAttack

    const readsSituation = skill === 'smart' || (skill === 'average' && rng() < 0.7)
    if (readsSituation) {
      const step = nextEnemyAttackStep(boss)
      const telegraphed = !!step && step.damageScale === 0
      const incoming = !telegraphed && !!nextEnemyAttackStep(boss)?.shatterGuard
      const willBeHit = turn >= boss.nextAttackTurn
      const threat = boss.def.atk * boss.atkMult * (incoming ? 1.2 : 1)
      const workerClear = (c: Candidate) => {
        const reachable = c.intent.pierceGuard || c.intent.targetCount === 'all'
          ? escorts
          : Math.min(escorts, c.intent.targetCount as number)
        return Math.min(reachable, Math.floor(c.dmg / (boss.def.summonPattern?.hp ?? 1)))
      }
      const queenAnswer = boss.def.summonPattern && escorts > 0
        ? hand.filter((c) => c.dmg > 0).sort((a, b) => workerClear(b) - workerClear(a) || b.dmg - a.dmg)[0]
        : null
      const weakness = activeEnemyPart(boss)?.def.weakness
      const matchesWeak = (c: Candidate) => !weakness
        || (weakness.kind === 'emotion'
          ? c.intent.emotions.includes(weakness.value as typeof c.intent.emotions[number])
          : c.intent.tags.includes(weakness.value))
      const weakAnswer = boss.def.webPattern
        ? hand.filter(matchesWeak).sort((a, b) => (b.dmg > 0 ? 1 : 0) - (a.dmg > 0 ? 1 : 0) || b.dmg - a.dmg || (b.heal + b.guard) - (a.heal + a.guard))[0]
        : null
      const lowHp = state.playerHp < state.playerMax * 0.5
      if (incoming && bestGuard) pick = bestGuard
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
        .sort((a, b) => candidateValue(b, state) - candidateValue(a, state))[0]
      if (safe && candidateValue(safe, state) >= candidateValue(pick, state) * 0.75) pick = safe
    }
    if (!pick) break

    applyInkOverdraw(state, pick.inkCost, availableInk)
    carriedInk = carryInkAfterSpend(pick.inkCost, availableInk, selectionCarryInk(pick.sel))
    if (state.playerHp <= 0) break

    const intent = withOverdrawEffects(
      compile(pick.sel, tables, player.stats, modsFor(player, killsThisBattle)),
      pick.overdraw,
    )
    const resolved = resolveMultiplier(
      intent,
      { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) },
      rng(),
      intent.variance ? rng() : null,
      [],
    )
    const mult = resolved.mult

    applyPreparation(state, intent, mult)
    for (const st of enemyTurn(state, rng, 'first')) log?.push(`    T${turn} 선공 ${st.text}`)
    if (state.playerHp <= 0) break

    if (intent.growHp > 0) {
      player.stats.hp += intent.growHp
      state.playerMax += intent.growHp
      state.playerHp += intent.growHp
    }

    const target = Math.max(0, frontIdx(state))
    const res = applyIntent(state, intent, mult, target)
    let kills = res.killed.length
    let overflow = res.overflow
    while (overflow > 0 && !allDead(state)) {
      const front = frontIdx(state)
      if (front < 0) break
      const transfer = applyOverkillTransfer(state, front, overflow)
      if (transfer.killed) kills++
      overflow = transfer.overflow
      if (!transfer.killed) break
    }
    if (kills > 0) engageFront(state)
    killsThisBattle += kills
    log?.push(`    T${turn} ${res.text}`)
    grade = bumpGrade(grade, overkillGain(kills, allDead(state)))
    if (allDead(state)) break

    for (const st of enemyTurn(state, rng, 'second')) log?.push(`    T${turn} 후공 ${st.text}`)
    if (state.pending) {
      const pending = applyPendingAttack(state)
      if (pending) {
        grade = bumpGrade(grade, overkillGain(pending.killed.length, allDead(state)))
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
}

function playRun(seed: number, reward: RewardSkill, combat: CombatSkill, verbose: boolean): RunResult {
  const rng = rngSeeded(seed)
  const realRandom = Math.random
  Math.random = rng // genRewards의 shuffle까지 시드에 묶는다
  try {
    const player = startingPlayer()
    const wallet = { inspiration: 0 }
    const carried = { hp: player.stats.hp, guard: 0 }
    const hpTrace: RunResult['hpTrace'] = []
    const log: string[] = []
    for (let day = 1; day <= STORY_FLOORS; day++) {
      const hpBefore = Math.min(carried.hp, player.stats.hp)
      const result = fightStage(player, day, carried, combat, rng, verbose ? log : null)
      hpTrace.push({ floor: day, hpBefore, hpAfter: result.hp, max: result.maxHp, turns: result.turns })
      if (verbose) {
        log.push(`  ${String(day).padStart(2)}층 ${result.won ? '승' : '패'} · ${result.turns}턴 · HP ${hpBefore}→${result.hp}/${result.maxHp}`)
      }
      if (!result.won) {
        return { reachedFloor: day - 1, diedOn: day, killedBy: result.killedBy, hpTrace, finalStats: { ...player.stats }, log }
      }
      carried.hp = result.hp
      carried.guard = result.guard
      takeRewards(player, result.grade, day, reward, rng, wallet)
    }
    return { reachedFloor: STORY_FLOORS, diedOn: null, killedBy: null, hpTrace, finalStats: { ...player.stats }, log }
  } finally {
    Math.random = realRandom
  }
}

// ─────────────────────────────────────────── 리포트

const verbose = process.argv.includes('--verbose')
const check = process.argv.includes('--check')
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
    (_, i) => playRun((i + 1) * 7919 + 13, profile.reward, profile.combat, verbose),
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
  if (expert.cleared < average.cleared) violations.push('숙련 플레이가 평균 플레이보다 낮은 클리어율을 보인다')
  if (average.avgFloor - naive.avgFloor < 4) violations.push('선택 기량에 따른 평균 도달층 차이가 4층 미만이다')
  if (average.avgTurns < 1.4) violations.push('평균 전투 길이가 1.4턴 미만이라 문장 선택이 의미를 잃는다')
  if (violations.length) {
    console.error(`밸런스 계약 위반 ${violations.length}건:\n- ${violations.join('\n- ')}`)
    process.exit(1)
  }
  console.log('밸런스 계약 통과 — 초반 생존 · 평균 완주 가능성 · 기량 격차 · 전투 길이')
}
