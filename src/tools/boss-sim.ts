/**
 * 보스 검수 — `npm run boss:sim`(`-- --verbose`로 턴별 기록).
 *
 * 보스는 자기 패턴이 실제로 재생돼야 보스다. 이 도구는 5·10·15층 보스를 그 층에
 * 도착한 평균적인 런(층마다 아이템 1개 + 단어 2장)으로 스무 번씩 치러 보고,
 * 전투 길이·승률과 함께 **패턴이 몇 번이나 발동했는지**를 센다. 손패도 실제와
 * 같이 슬롯마다 세 장만 뽑아 그 안에서 고른다.
 *
 * greedy는 패턴을 무시하고 늘 최대 피해를, smart는 예고·체력·위협을 보고 방어와
 * 회복을 섞는 플레이어다. 둘의 차이가 곧 "패턴을 읽을 이유"의 크기다.
 *
 * 실게임과 같은 compile/resolveMultiplier/applyIntent/enemyTurn을 그대로 호출한다.
 */
import { compile, effectiveBase, isDamageIntent, resolveMultiplier, statBiasOf } from '@core/compiler'
import { conflictReason } from '@core/validator'
import type { Intent, Selection, Word } from '@core/types'
import { startingPlayer, applyItemReward } from '@core/run'
import { registerWord } from '@core/run'
import { makeEarlyTables, ALL_REWARD_WORDS, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { stageFor } from '@data/stages'
import { ALL_ITEMS } from '@data/items'
import {
  makeEnemy,
  applyIntent,
  applyPreparation,
  enemyTurn,
  engageInitialFront,
  nextEnemyAttackStep,
  summonAtTurnStart,
  spiderWebAtTurnStart,
  spiderSealSlotForTurn,
  activeEnemyPart,
  summonCount,
  type BattleState,
} from '../sim/reference'

const rngSeeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

/** 보스층 전까지 매 층 아이템 1개 + 단어 2장을 받은 평균적인 런을 흉내낸다. */
function playerAtDay(day: number) {
  const p = startingPlayer()
  const items = Object.values(ALL_ITEMS).filter((it) => !it.passive)
  const words = ALL_REWARD_WORDS.filter((w) => w.slot === 'subj' || w.slot === 'adv' || w.slot === 'verb')
  for (let d = 1; d < day; d++) {
    const item = items[(d - 1) % items.length]
    // 감탄 문장은 슬롯마다 +1(체력만 +2)이라 평균적인 3칸 감탄을 함께 얹는다.
    applyItemReward(p, {
      id: item.id, name: item.name, rarity: 'common', art: item.art, line: '',
      stats: {
        hp: item.base.hp + 2, atk: item.base.atk + 1, guard: item.base.guard + 1,
        heal: item.base.heal, luck: item.base.luck,
      },
    })
    registerWord(p, words[(d * 2) % words.length])
    registerWord(p, words[(d * 2 + 1) % words.length])
  }
  return p
}

interface Candidate { sel: Selection; intent: Intent; dmg: number; guard: number; heal: number }

/**
 * 실제 손패와 같은 조건 — 슬롯마다 덱에서 3장만 무작위로 뽑고, 그 안에서
 * 만들 수 있는 문장만 후보로 둔다. `all`이면 덱 전체를 본 상한을 잰다.
 */
function candidates(
  player: ReturnType<typeof playerAtDay>,
  rng: (() => number) | null,
  sealedWordIds: Set<string> = new Set(),
  sealSlotKey: string | null = null,
  maxSealed = 0,
  enemyId?: string,
  preferWide = false,
): Candidate[] {
  const t = tablesForEncounter(makeEarlyTables(player.deck, player), enemyId)
  const order = t.template.slots.map((s) => s.key)
  const draw = (pool: Word[]) => {
    if (!rng) return pool
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const hand = shuffled.slice(0, 3)
    if (hand.every((word) => sealedWordIds.has(word.id))) {
      const replacement = shuffled.slice(3).find((word) => !sealedWordIds.has(word.id))
      if (replacement) hand[hand.length - 1] = replacement
    }
    return hand
  }
  const hands = order.map((key) => draw((t.words[key] ?? []) as Word[]))
  if (preferWide) {
    const verbIndex = order.findIndex((key) => key === 'verb' || key === 'verb2')
    const wide = verbIndex >= 0
      ? (t.words[order[verbIndex]] ?? []).find((word) =>
        word.kind === 'attack' && (!!word.effects?.pierceGuard || word.targetCount === 'all' || (word.targetCount ?? 1) >= 2),
      )
      : undefined
    if (verbIndex >= 0 && wide && !hands[verbIndex].some((word) => word.id === wide.id)) {
      hands[verbIndex][hands[verbIndex].length - 1] = wide
    }
  }
  if (rng && sealSlotKey && sealedWordIds.size < maxSealed) {
    const sealIndex = order.indexOf(sealSlotKey)
    const sealable = sealIndex < 0 ? [] : hands[sealIndex].filter((word) => !sealedWordIds.has(word.id))
    if (sealable.length > 1) {
      sealedWordIds.add(sealable[Math.floor(rng() * sealable.length)].id)
    }
  }
  const out: Candidate[] = []
  const walk = (i: number, sel: Selection) => {
    if (i === order.length) {
      const intent = compile(sel, t, player.stats)
      const m = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, 0.5).mult
      out.push({
        sel,
        intent,
        dmg: isDamageIntent(intent) ? Math.round(effectiveBase(intent) * m * intent.castScale) : 0,
        guard: Math.round(intent.guard * m * intent.castCount * intent.castScale),
        heal: Math.round(intent.heal * m * intent.castCount * intent.castScale),
      })
      return
    }
    for (const w of hands[i]) {
      if (sealedWordIds.has(w.id)) continue
      if (conflictReason(w, i, sel, t)) continue
      walk(i + 1, { ...sel, [order[i]]: w })
    }
  }
  walk(0, {})
  return out
}

type Policy = 'greedy' | 'smart'

function simulate(day: number, policy: Policy, seed: number) {
  const stage = stageFor(day)
  const player = playerAtDay(day)
  const boss = makeEnemy(ENEMIES[stage.encounter[0]], stage.atkMult, stage.hpMult, stage.bossHealthBars)
  const t = tablesForEncounter(makeEarlyTables(player.deck, player), boss.def.id)
  const ceiling = candidates(player, null, new Set(), null, 0, boss.def.id)
  const state: BattleState = {
    playerHp: player.stats.hp, playerMax: player.stats.hp, guard: 0, counterMultiplier: 0,
    turn: 1, enemies: [boss], pending: null,
  }
  engageInitialFront(state)
  const rng = rngSeeded(seed)
  const log: string[] = []
  const sealedWordIds = new Set<string>()
  let turn = 0
  let guardedTelegraph = 0, missedTelegraph = 0, sealPressure = 0
  let workersDispersed = 0, queenGroggies = 0, queenBacklash = 0
  let weakHits = 0, multiBarHits = 0, partsBroken = 0
  while (turn < 60 && !boss.dead && state.playerHp > 0) {
    turn++
    state.turn = turn
    summonAtTurnStart(state)
    const web = spiderWebAtTurnStart(state)
    const step = nextEnemyAttackStep(boss)
    const telegraphed = !!step && step.damageScale === 0
    // 예고 다음 턴이 강공격이므로, 예고를 본 턴에 방어를 올려 둔다.
    const incoming = !telegraphed && !!nextEnemyAttackStep(boss)?.shatterGuard
    const sealSlotKey = web ? spiderSealSlotForTurn(t.template.slots.map((slot) => slot.key), turn) : null
    const needsWide = boss.def.id === 'queenBee' && summonCount(boss) > 0
    const hand = candidates(player, rng, sealedWordIds, sealSlotKey, boss.def.webPattern?.maxSealedCards ?? 0, boss.def.id, needsWide)
    const bestAttack = hand.filter((c) => c.dmg > 0).sort((a, b) => b.dmg - a.dmg)[0]
    const bestGuard = hand.filter((c) => c.guard > 0).sort((a, b) => b.guard - a.guard)[0]
    const bestHeal = hand.filter((c) => c.heal > 0).sort((a, b) => b.heal - a.heal)[0]
    let pick = bestAttack ?? bestGuard ?? bestHeal
    if (policy === 'smart') {
      // 이번 턴에 실제로 맞을 차례인지, 그 한 방이 얼마나 아픈지를 보고 고른다.
      const willBeHit = turn >= boss.nextAttackTurn
      const threat = boss.def.atk * boss.atkMult * (incoming ? 1.2 : 1)
      const escorts = summonCount(boss)
      const workerClearCount = (candidate: Candidate) => {
        const reachable = candidate.intent.pierceGuard || candidate.intent.targetCount === 'all'
          ? escorts
          : Math.min(escorts, candidate.intent.targetCount)
        return Math.min(reachable, Math.floor(candidate.dmg / (boss.def.summonPattern?.hp ?? 1)))
      }
      const queenAnswer = boss.def.id === 'queenBee' && escorts > 0
        ? hand.filter((c) => c.dmg > 0)
          .sort((a, b) => workerClearCount(b) - workerClearCount(a) || b.dmg - a.dmg)[0]
        : null
      const weakness = activeEnemyPart(boss)?.def.weakness
      const matchesWeakness = (candidate: Candidate) => !weakness
        || (weakness.kind === 'emotion'
          ? candidate.intent.emotions.includes(weakness.value as typeof candidate.intent.emotions[number])
          : candidate.intent.tags.includes(weakness.value))
      const weakAnswer = boss.def.webPattern
        ? hand.filter(matchesWeakness).sort((a, b) => (b.dmg > 0 ? 1 : 0) - (a.dmg > 0 ? 1 : 0) || b.dmg - a.dmg || b.heal + b.guard - a.heal - a.guard)[0]
        : null
      if (incoming && bestGuard) pick = bestGuard
      else if (queenAnswer) pick = queenAnswer
      else if (state.playerHp < state.playerMax * 0.55 && bestHeal) pick = bestHeal
      else if (weakAnswer) pick = weakAnswer
      else if (willBeHit && threat > state.guard + state.playerHp * 0.4 && bestGuard) pick = bestGuard
    }
    if (!pick) break
    const intent = compile(pick.sel, t, player.stats)
    const resolved = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, rng(), intent.variance ? rng() : null, [])
    const mult = resolved.mult
    applyPreparation(state, intent, mult)
    const before = state.playerHp
    for (const st of enemyTurn(state, rng, 'first')) {
      log.push(`  T${turn} 적선공 ${st.text}`)
      if (st.guardShattered) guardedTelegraph++
      else if (st.lifeStolen > 0) missedTelegraph++
    }
    if (state.playerHp <= 0) break
    const res = applyIntent(state, intent, mult, 0)
    workersDispersed += res.summonsDispersed
    queenBacklash += res.summonBacklashDamage
    if (res.summonGroggyTriggered) queenGroggies++
    const releaseOldestSeal = () => {
      const oldest = sealedWordIds.values().next().value
      if (oldest) sealedWordIds.delete(oldest)
    }
    if (res.supportWebCut?.tensionReduced) releaseOldestSeal()
    if (res.hits.some((hit) => hit.webBurst)) sealedWordIds.clear()
    else if (res.hits.some((hit) => hit.webCut)) releaseOldestSeal()
    res.hits.forEach((hit) => {
      if (hit.weak) weakHits++
      if (boss.parts.length > 0 && hit.barsBroken > 1 && hit.weak) multiBarHits++
      if (boss.parts.length > 0) partsBroken += hit.barsBroken
    })
    log.push(`  T${turn} ${policy} ${res.text}`
      + res.hits.map((h) => ` [${h.partName ?? '몸통'}${h.weak ? ' 약점' : ''} 막${h.barsBroken}]`).join(''))
    for (const st of enemyTurn(state, rng, 'second')) {
      log.push(`  T${turn} 적후공 ${st.text}`)
      if (st.guardShattered) guardedTelegraph++
      else if (st.lifeStolen > 0) missedTelegraph++
    }
    if (boss.def.webPattern) sealPressure = Math.max(sealPressure, sealedWordIds.size)
    void before
  }
  return {
    day, policy, turns: turn, won: boss.dead, playerHp: Math.max(0, state.playerHp), playerMax: state.playerMax,
    bossHp: Math.max(0, boss.hp), bossMax: boss.maxHp,
    ceilingAttack: Math.max(0, ...ceiling.map((c) => c.dmg)),
    ceilingGuard: Math.max(0, ...ceiling.map((c) => c.guard)),
    atk: player.stats.atk, guardStat: player.stats.guard, hp: player.stats.hp,
    guardedTelegraph, missedTelegraph, workersDispersed, queenGroggies, queenBacklash,
    sealPressure, weakHits, multiBarHits, partsBroken, log,
    activePart: activeEnemyPart(boss)?.def.name, summons: summonCount(boss),
  }
}

const verbose = process.argv.includes('--verbose')
for (const day of [5, 10, 15]) {
  for (const policy of ['greedy', 'smart'] as Policy[]) {
    const runs = Array.from({ length: 20 }, (_, i) => simulate(day, policy, (i + 1) * 7919))
    const wins = runs.filter((r) => r.won).length
    const avgTurns = (runs.reduce((s, r) => s + r.turns, 0) / runs.length).toFixed(1)
    const avgHp = (runs.reduce((s, r) => s + r.playerHp, 0) / runs.length).toFixed(1)
    const r0 = runs[0]
    console.log(
      `day ${String(day).padStart(2)} ${policy.padEnd(6)} 승 ${wins}/${runs.length} · 평균 ${avgTurns}턴 · 잔여HP ${avgHp}/${r0.playerMax}`
      + ` · 보스HP ${r0.bossMax} · 덱상한 공${r0.ceilingAttack}/방${r0.ceilingGuard}`
      + ` · 방어성공 ${runs.reduce((s, r) => s + r.guardedTelegraph, 0)}`
      + ` · 피격흡혈 ${runs.reduce((s, r) => s + r.missedTelegraph, 0)}`
      + ` · 일벌퇴치 ${runs.reduce((s, r) => s + r.workersDispersed, 0)} · 여왕그로기 ${runs.reduce((s, r) => s + r.queenGroggies, 0)}`
      + ` · 최대봉인 ${Math.max(...runs.map((r) => r.sealPressure))}`
      + ` · 약점적중 ${runs.reduce((s, r) => s + r.weakHits, 0)} · 약점관용구관통 ${runs.reduce((s, r) => s + r.multiBarHits, 0)}`
      + ` · 부위파괴 ${runs.reduce((s, r) => s + r.partsBroken, 0)}`,
    )
    if (verbose) r0.log.forEach((l) => console.log(l))
  }
}
