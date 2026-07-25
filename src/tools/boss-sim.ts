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
import { makeEarlyTables, ALL_REWARD_WORDS } from '@data/earlyWords'
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
function candidates(player: ReturnType<typeof playerAtDay>, rng: (() => number) | null): Candidate[] {
  const t = makeEarlyTables(player.deck, player)
  const order = t.template.slots.map((s) => s.key)
  const draw = (pool: Word[]) => {
    if (!rng) return pool
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled.slice(0, 3)
  }
  const hands = order.map((key) => draw((t.words[key] ?? []) as Word[]))
  const out: Candidate[] = []
  const walk = (i: number, sel: Selection) => {
    if (i === order.length) {
      const intent = compile(sel, t, player.stats)
      const m = resolveMultiplier(intent, { luck: player.stats.luck, statBias: statBiasOf(intent, player.stats) }, 0.5).mult
      out.push({
        sel,
        intent,
        dmg: isDamageIntent(intent) ? Math.round(effectiveBase(intent) * m) : 0,
        guard: Math.round(intent.guard * m),
        heal: Math.round(intent.heal * m),
      })
      return
    }
    for (const w of hands[i]) {
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
  const t = makeEarlyTables(player.deck, player)
  const ceiling = candidates(player, null)
  const boss = makeEnemy(ENEMIES[stage.encounter[0]], stage.atkMult, stage.hpMult, stage.bossHealthBars)
  const state: BattleState = {
    playerHp: player.stats.hp, playerMax: player.stats.hp, guard: 0, counterMultiplier: 0,
    turn: 1, enemies: [boss], pending: null,
  }
  engageInitialFront(state)
  const rng = rngSeeded(seed)
  const log: string[] = []
  let turn = 0
  let guardedTelegraph = 0, missedTelegraph = 0, swarmHits = 0, sealPressure = 0
  let weakHits = 0, multiBarHits = 0, partsBroken = 0
  while (turn < 60 && !boss.dead && state.playerHp > 0) {
    turn++
    state.turn = turn
    summonAtTurnStart(state)
    spiderWebAtTurnStart(state)
    const step = nextEnemyAttackStep(boss)
    const telegraphed = !!step && step.damageScale === 0
    // 예고 다음 턴이 강공격이므로, 예고를 본 턴에 방어를 올려 둔다.
    const incoming = !telegraphed && !!nextEnemyAttackStep(boss)?.shatterGuard
    const hand = candidates(player, rng)
    const bestAttack = hand.filter((c) => c.dmg > 0).sort((a, b) => b.dmg - a.dmg)[0]
    const bestGuard = hand.filter((c) => c.guard > 0).sort((a, b) => b.guard - a.guard)[0]
    const bestHeal = hand.filter((c) => c.heal > 0).sort((a, b) => b.heal - a.heal)[0]
    let pick = bestAttack ?? bestGuard ?? bestHeal
    if (policy === 'smart') {
      // 이번 턴에 실제로 맞을 차례인지, 그 한 방이 얼마나 아픈지를 보고 고른다.
      const willBeHit = turn >= boss.nextAttackTurn
      const threat = boss.def.atk * boss.atkMult * (incoming ? 1.2 : 1)
      if (incoming && bestGuard) pick = bestGuard
      else if (state.playerHp < state.playerMax * 0.45 && bestHeal) pick = bestHeal
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
      if (st.summonsReleased > 0) swarmHits++
      if (st.guardShattered) guardedTelegraph++
      else if (st.lifeStolen > 0) missedTelegraph++
    }
    if (state.playerHp <= 0) break
    const res = applyIntent(state, intent, mult, 0)
    res.hits.forEach((hit) => {
      if (hit.weak) weakHits++
      if (hit.barsBroken > 1 && !hit.weak) multiBarHits++
      partsBroken += hit.barsBroken
    })
    log.push(`  T${turn} ${policy} ${res.text}`
      + res.hits.map((h) => ` [${h.partName ?? '몸통'}${h.weak ? ' 약점' : ''} 막${h.barsBroken}]`).join(''))
    for (const st of enemyTurn(state, rng, 'second')) {
      log.push(`  T${turn} 적후공 ${st.text}`)
      if (st.summonsReleased > 0) swarmHits++
      if (st.guardShattered) guardedTelegraph++
      else if (st.lifeStolen > 0) missedTelegraph++
    }
    if (boss.def.webPattern) sealPressure = Math.max(sealPressure, boss.webTurns)
    void before
  }
  return {
    day, policy, turns: turn, won: boss.dead, playerHp: Math.max(0, state.playerHp), playerMax: state.playerMax,
    bossHp: Math.max(0, boss.hp), bossMax: boss.maxHp,
    ceilingAttack: Math.max(0, ...ceiling.map((c) => c.dmg)),
    ceilingGuard: Math.max(0, ...ceiling.map((c) => c.guard)),
    atk: player.stats.atk, guardStat: player.stats.guard, hp: player.stats.hp,
    guardedTelegraph, missedTelegraph, swarmHits, sealPressure, weakHits, multiBarHits, partsBroken, log,
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
      + ` · 피격흡혈 ${runs.reduce((s, r) => s + r.missedTelegraph, 0)} · 벌떼 ${runs.reduce((s, r) => s + r.swarmHits, 0)}`
      + ` · 최대봉인 ${Math.max(...runs.map((r) => r.sealPressure))}`
      + ` · 약점적중 ${runs.reduce((s, r) => s + r.weakHits, 0)} · 약점없이다중파괴 ${runs.reduce((s, r) => s + r.multiBarHits, 0)}`,
    )
    if (verbose) r0.log.forEach((l) => console.log(l))
  }
}
