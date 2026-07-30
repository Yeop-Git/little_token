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
import { ECHO_REPEAT_SCALE, hasPassive, modsFor } from '@core/passives'
import { registerWord } from '@core/run'
import { makeEarlyTables, ALL_REWARD_WORDS, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { stageFor } from '@data/stages'
import { ITEMS, ITEM_STAT_PER_POINT, PASSIVE_ITEMS, type StatKey } from '@data/items'
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

type BossBuild = 'average' | 'topDamage' | 'reinforced'

/** 보스층 전까지 매 층 아이템 1개 + 단어 2장을 받은 런을 흉내낸다. */
function playerAtDay(day: number, build: BossBuild = 'average') {
  const p = startingPlayer()
  const statItems = Object.values(ITEMS)
  const ruleItems = Object.values(PASSIVE_ITEMS)
  const items = Array.from({ length: Math.max(statItems.length, ruleItems.length) }, (_, index) =>
    [statItems[index], ruleItems[index]].filter(Boolean),
  ).flat()
  const statOrder: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
  const words = ALL_REWARD_WORDS.filter((w) => w.slot === 'subj' || w.slot === 'adv' || w.slot === 'verb')
  for (let d = 1; d < day; d++) {
    const item = items[(d - 1) % items.length]
    const stats = { ...item.base }
    for (let slot = 0; slot < 3; slot++) {
      const stat = statOrder[(d + slot) % statOrder.length]
      stats[stat] += ITEM_STAT_PER_POINT[stat]
    }
    applyItemReward(p, {
      id: item.id, name: item.name, rarity: item.rarity, art: item.art, line: '', stats, passive: item.passive,
    })
    registerWord(p, words[(d * 2) % words.length])
    registerWord(p, words[(d * 2 + 1) % words.length])
  }
  if (build === 'topDamage') {
    // 풀런 상위 피해 꼬리의 공격·운 편향을 재현한다. 덱 구성은 같게 두어
    // 순수 스탯 고점만으로 보스 패턴이 삭제되는지를 본다.
    p.stats.atk += day
    p.stats.luck += Math.ceil(day / 3)
  } else if (build === 'reinforced') {
    const favorites = ['naman', 'michin', 'ureojyeot']
      .map((id) => words.find((word) => word.id === id))
      .filter((word): word is Word => !!word)
    const repeats = Math.max(2, Math.floor((day - 1) / 3))
    for (let i = 0; i < repeats; i++) for (const word of favorites) registerWord(p, word)
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
      const intent = compile(sel, t, player.stats, modsFor(player, 3))
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

function simulate(day: number, policy: Policy, seed: number, build: BossBuild = 'average') {
  const stage = stageFor(day)
  const player = playerAtDay(day, build)
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
  let telegraphs = 0, heavyAttacks = 0, summonWaves = 0, webTurns = 0
  while (turn < 60 && !boss.dead && state.playerHp > 0) {
    turn++
    state.turn = turn
    const summoned = summonAtTurnStart(state)
    if (summoned.length > 0) summonWaves++
    const web = spiderWebAtTurnStart(state)
    if (web) webTurns++
    const step = nextEnemyAttackStep(boss)
    const telegraphed = !!step && step.damageScale === 0
    // 예고 다음 턴이 강공격이므로, 예고를 본 턴에 방어를 올려 둔다.
    const incoming = !telegraphed && !!nextEnemyAttackStep(boss)?.shatterGuard
    const sealSlotKey = web ? spiderSealSlotForTurn(t.template.slots.map((slot) => slot.key), turn) : null
    const needsWide = boss.def.id === 'queenBee' && summonCount(boss) > 0
    const hand = candidates(player, rng, sealedWordIds, sealSlotKey, boss.def.webPattern?.maxSealedCards ?? 0, boss.def.id, needsWide)
    const bestAttack = hand.filter((c) => c.dmg > 0).sort((a, b) => b.dmg - a.dmg)[0]
    const bestGuard = hand
      .filter((c) => c.guard > 0 || c.intent.magicShield > 0)
      .sort((a, b) => (b.guard + b.intent.magicShield * state.playerMax * .6) - (a.guard + a.intent.magicShield * state.playerMax * .6))[0]
    const bestHeal = hand.filter((c) => c.heal > 0).sort((a, b) => b.heal - a.heal)[0]
    let pick = bestAttack ?? bestGuard ?? bestHeal
    if (policy === 'smart') {
      // 이번 턴에 실제로 맞을 차례인지, 그 한 방이 얼마나 아픈지를 보고 고른다.
      const willBeHit = turn >= boss.nextAttackTurn
      const threat = boss.def.atk * boss.atkMult * (incoming ? 1.2 : 1)
      const escorts = summonCount(boss)
      const workerClearCount = (candidate: Candidate) => {
        if (candidate.intent.summonExecuteCount > 0) return Math.min(escorts, candidate.intent.summonExecuteCount)
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
    const intent = compile(pick.sel, t, player.stats, modsFor(player, workersDispersed))
    const firstRoll = rng()
    const rouletteRoll = hasPassive(player, 'retry') ? Math.min(firstRoll, rng()) : firstRoll
    const resolved = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, rouletteRoll, intent.variance ? rng() : null, Array.from({ length: intent.doubtCount }, () => rng()))
    const mult = resolved.mult
    applyPreparation(state, intent, mult)
    const before = state.playerHp
    for (const st of enemyTurn(state, rng, 'first')) {
      log.push(`  T${turn} 적선공 ${st.text}`)
      if (st.telegraphText) telegraphs++
      if (boss.def.id === 'mantis' && st.animationStage === 3) heavyAttacks++
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
    if (resolved.outcome === 'crit' && hasPassive(player, 'echo') && !boss.dead) {
      const echo = applyIntent(state, intent, mult * ECHO_REPEAT_SCALE, 0)
      workersDispersed += echo.summonsDispersed
      queenBacklash += echo.summonBacklashDamage
      if (echo.summonGroggyTriggered) queenGroggies++
      echo.hits.forEach((hit) => {
        if (hit.weak) weakHits++
        if (boss.parts.length > 0 && hit.barsBroken > 1 && hit.weak) multiBarHits++
        if (boss.parts.length > 0) partsBroken += hit.barsBroken
      })
    }
    log.push(`  T${turn} ${policy} ${res.text}`
      + res.hits.map((h) => ` [${h.partName ?? '몸통'}${h.weak ? ' 약점' : ''} 막${h.barsBroken}]`).join(''))
    for (const st of enemyTurn(state, rng, 'second')) {
      log.push(`  T${turn} 적후공 ${st.text}`)
      if (st.telegraphText) telegraphs++
      if (boss.def.id === 'mantis' && st.animationStage === 3) heavyAttacks++
      if (st.guardShattered) guardedTelegraph++
      else if (st.lifeStolen > 0) missedTelegraph++
    }
    if (boss.def.webPattern) sealPressure = Math.max(sealPressure, sealedWordIds.size)
    void before
  }
  return {
    day, policy, build, turns: turn, won: boss.dead, playerHp: Math.max(0, state.playerHp), playerMax: state.playerMax,
    bossHp: Math.max(0, boss.hp), bossMax: boss.maxHp,
    ceilingAttack: Math.max(0, ...ceiling.map((c) => c.dmg)),
    ceilingGuard: Math.max(0, ...ceiling.map((c) => c.guard)),
    atk: player.stats.atk, guardStat: player.stats.guard, hp: player.stats.hp,
    guardedTelegraph, missedTelegraph, workersDispersed, queenGroggies, queenBacklash,
    sealPressure, weakHits, multiBarHits, partsBroken, telegraphs, heavyAttacks, summonWaves, webTurns, log,
    activePart: activeEnemyPart(boss)?.def.name, summons: summonCount(boss),
  }
}

const verbose = process.argv.includes('--verbose')
const failures: string[] = []
const total = <T>(runs: T[], value: (run: T) => number) => runs.reduce((sum, run) => sum + value(run), 0)
type SimResult = ReturnType<typeof simulate>

for (const day of [5, 10, 15]) {
  const byPolicy = new Map<Policy, SimResult[]>()
  for (const policy of ['greedy', 'smart'] as Policy[]) {
    const runs = Array.from({ length: 20 }, (_, i) => simulate(day, policy, (i + 1) * 7919))
    byPolicy.set(policy, runs)
    const wins = runs.filter((r) => r.won).length
    const avgTurns = (runs.reduce((s, r) => s + r.turns, 0) / runs.length).toFixed(1)
    const avgHp = (runs.reduce((s, r) => s + r.playerHp, 0) / runs.length).toFixed(1)
    const r0 = runs[0]
    console.log(
      `day ${String(day).padStart(2)} ${policy.padEnd(6)} 승 ${wins}/${runs.length} · 평균 ${avgTurns}턴 · 잔여HP ${avgHp}/${r0.playerMax}`
      + ` · 보스HP ${r0.bossMax} · 덱상한 공${r0.ceilingAttack}/방${r0.ceilingGuard}`
      + ` · 방어성공 ${runs.reduce((s, r) => s + r.guardedTelegraph, 0)}`
      + ` · 피격흡혈 ${runs.reduce((s, r) => s + r.missedTelegraph, 0)}`
      + ` · 예고 ${total(runs, (r) => r.telegraphs)} · 강공 ${total(runs, (r) => r.heavyAttacks)}`
      + ` · 일벌퇴치 ${runs.reduce((s, r) => s + r.workersDispersed, 0)} · 여왕그로기 ${runs.reduce((s, r) => s + r.queenGroggies, 0)}`
      + ` · 소환웨이브 ${total(runs, (r) => r.summonWaves)} · 거미줄턴 ${total(runs, (r) => r.webTurns)}`
      + ` · 최대봉인 ${Math.max(...runs.map((r) => r.sealPressure))}`
      + ` · 약점적중 ${runs.reduce((s, r) => s + r.weakHits, 0)} · 약점관용구관통 ${runs.reduce((s, r) => s + r.multiBarHits, 0)}`
      + ` · 부위파괴 ${runs.reduce((s, r) => s + r.partsBroken, 0)}`,
    )
    if (verbose) r0.log.forEach((l) => console.log(l))
  }

  const greedy = byPolicy.get('greedy')!
  const smart = byPolicy.get('smart')!
  const greedyWins = greedy.filter((run) => run.won).length
  const smartWins = smart.filter((run) => run.won).length
  const averageTurns = [...greedy, ...smart].reduce((sum, run) => sum + run.turns, 0) / (greedy.length + smart.length)
  if (averageTurns < 8) failures.push(`${day}층: 평균 ${averageTurns.toFixed(1)}턴으로 보스 패턴을 읽기 전에 끝납니다.`)
  if (smartWins < greedyWins) failures.push(`${day}층: 패턴 대응 정책 승리 ${smartWins}회가 최대 피해 정책 ${greedyWins}회보다 적습니다.`)

  if (day === 5) {
    for (const [policy, runs] of byPolicy) {
      const telegraphs = total(runs, (run) => run.telegraphs)
      const heavyAttacks = total(runs, (run) => run.heavyAttacks)
      if (telegraphs < runs.length * 2) failures.push(`5층 ${policy}: 강공격 예고가 런당 2회 미만입니다 (${telegraphs}/${runs.length}).`)
      if (heavyAttacks < runs.length * 2) failures.push(`5층 ${policy}: 예고 강공격이 런당 2회 미만입니다 (${heavyAttacks}/${runs.length}).`)
    }
    const greedyGuardRate = total(greedy, (run) => run.guardedTelegraph) / Math.max(1, total(greedy, (run) => run.heavyAttacks))
    const smartGuardRate = total(smart, (run) => run.guardedTelegraph) / Math.max(1, total(smart, (run) => run.heavyAttacks))
    if (smartGuardRate <= greedyGuardRate) failures.push(`5층: 정확 방어 정책의 파훼율 ${(smartGuardRate * 100).toFixed(0)}%가 최대 피해 정책 ${(greedyGuardRate * 100).toFixed(0)}%보다 높지 않습니다.`)
  }

  if (day === 10) {
    for (const [policy, runs] of byPolicy) {
      const waves = total(runs, (run) => run.summonWaves)
      const groggies = total(runs, (run) => run.queenGroggies)
      if (waves < runs.length * 2) failures.push(`10층 ${policy}: 일벌 소환 웨이브가 런당 2회 미만입니다 (${waves}/${runs.length}).`)
      if (groggies < runs.length * 2) failures.push(`10층 ${policy}: 호위 전멸 그로기가 런당 2회 미만입니다 (${groggies}/${runs.length}).`)
    }
    const greedyGroggyRate = total(greedy, (run) => run.queenGroggies) / Math.max(1, total(greedy, (run) => run.summonWaves))
    const smartGroggyRate = total(smart, (run) => run.queenGroggies) / Math.max(1, total(smart, (run) => run.summonWaves))
    if (smartGroggyRate + 0.03 < greedyGroggyRate) failures.push(`10층: 호위 대응 정책의 파훼율 ${(smartGroggyRate * 100).toFixed(0)}%가 최대 피해 정책 ${(greedyGroggyRate * 100).toFixed(0)}%보다 3%p 넘게 낮습니다.`)
  }

  if (day === 15) {
    for (const [policy, runs] of byPolicy) {
      const webs = total(runs, (run) => run.webTurns)
      const broken = total(runs, (run) => run.partsBroken)
      const penetrations = total(runs, (run) => run.multiBarHits)
      if (webs < runs.length * 8) failures.push(`15층 ${policy}: 거미줄 압력이 런당 8턴 미만입니다 (${webs}/${runs.length}).`)
      if (broken < runs.length * 4) failures.push(`15층 ${policy}: 평균 네 부위도 파괴되지 않습니다 (${broken}/${runs.length}).`)
      if (penetrations === 0) failures.push(`15층 ${policy}: 약점+관용구 관통이 한 번도 발동하지 않습니다.`)
    }
    const greedyWeakRate = total(greedy, (run) => run.weakHits) / Math.max(1, total(greedy, (run) => run.webTurns))
    const smartWeakRate = total(smart, (run) => run.weakHits) / Math.max(1, total(smart, (run) => run.webTurns))
    if (smartWeakRate <= greedyWeakRate) failures.push(`15층: 약점 대응 정책의 적중률 ${(smartWeakRate * 100).toFixed(0)}%가 최대 피해 정책 ${(greedyWeakRate * 100).toFixed(0)}%보다 높지 않습니다.`)
  }
}

const STRESS_RUNS = 12
console.log('\n강한 빌드 보스 스트레스')
for (const day of [5, 10, 15]) {
  for (const build of ['topDamage', 'reinforced'] as BossBuild[]) {
    const runs = Array.from({ length: STRESS_RUNS }, (_, i) => simulate(day, 'greedy', (i + 1) * 104729, build))
    const avgTurns = total(runs, (run) => run.turns) / runs.length
    const patternCount = day === 5
      ? total(runs, (run) => run.telegraphs)
      : day === 10
        ? total(runs, (run) => run.summonWaves)
        : total(runs, (run) => run.webTurns)
    const requiredPerRun = day === 15 ? 4 : 2
    console.log(`day ${day} ${build.padEnd(10)} 평균 ${avgTurns.toFixed(1)}턴 · 패턴 ${patternCount}/${runs.length} · 승 ${runs.filter((run) => run.won).length}/${runs.length}`)
    if (patternCount < runs.length * requiredPerRun) {
      failures.push(`${day}층 ${build}: 강한 빌드에서 핵심 패턴이 런당 ${requiredPerRun}회 미만입니다 (${patternCount}/${runs.length}).`)
    }
  }
}

if (failures.length) {
  console.error(`\n보스 재미·패턴 계약 위반 ${failures.length}건:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('\n보스 재미·패턴 계약 통과 — 세 보스 모두 패턴 2회 이상 · 대응 정책 우위 · 상위 피해/반복강화 스트레스')
