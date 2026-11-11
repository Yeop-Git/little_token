/**
 * 점수 재기획안 헤드리스 시뮬레이터 (SCORE_REDESIGN.md §14-3, §15).
 *
 *   npm run score:sim -- --runs=20 --seed=1          # 봇별 런 시뮬레이션
 *   npm run score:sim -- --curves --runs=20          # 감정 × 스테이지 형태 점수 곡선
 *   npm run score:sim -- --bots=tryout,mono-anger    # 일부 봇만
 *   npm run score:sim -- --json=artifacts/score-sim.json
 *
 * 봇은 같은 엔진(src/score)을 쓰고 상점에서는 「써 보기」(tryout.ts)로 값을 매긴다.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  OVERTIME_HIT_PIECES, PIECES_PER_HEART, SCORE_CARDS, SCORE_FORMS, SCORE_STATS, card as cardDef, relic as relicDef,
  startingStats, sticker as stickerDef,
} from '../score/data'
import { afterSentence, newHand, redraw, swapOne, type Hand } from '../score/hand'
import { expectedScore, rngRoller, scoreSentence, validatePick } from '../score/scoring'
import {
  FORGE_SLOTS, HEAL_PRICE, RELIC_SLOTS, REROLL_PRICE, applyStatPoints, bonusSpread, forgeChoices, rollStock,
  RARITY_BASE_POINTS, type Rarity, type ShopOffer,
} from '../score/shop'
import { applySentence, clearMoney, planStage, startStage } from '../score/stage'
import { tryoutBaseline, tryoutCard, tryoutLoadout, type TryoutBaseline } from '../score/tryout'
import type {
  DeckCard, ScoreEmotion, ScoreLoadout, ScoreStats, SentencePick, StageContext, StatDef,
} from '../score/types'
import { SCORE_EMOTIONS, STAT_EMOTIONS } from '../score/types'

// ── 인자 ──

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? 'true'] as const
}))
const RUNS = Number(args.get('runs') ?? 20)
const SEED = Number(args.get('seed') ?? 1)
const FLOORS = 15

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 런 상태 ──

interface RunState {
  floor: number
  deck: DeckCard[]
  stats: ScoreStats
  relics: string[]
  pieces: number
  guard: number
  money: number
  cleared: number
  nextUid: number
}

const loadoutOf = (r: RunState): ScoreLoadout => ({ stats: r.stats, relics: r.relics })

function newRun(): RunState {
  let uid = 0
  const deck = SCORE_CARDS.filter((c) => c.start).map((c) => ({ uid: ++uid, cardId: c.id, level: 0 }))
  const stats = startingStats()
  return { floor: 1, deck, stats, relics: [], pieces: stats.mind, guard: 0, money: 0, cleared: 0, nextUid: uid + 1 }
}

// ── 통계 ──

interface Tally {
  runs: number
  wins: number
  floorReached: number[]
  heartsLost: number
  overtime: number
  softlocks: number
  cardPlays: Record<string, number>
  latePlays: Record<string, number>
  bought: Record<string, number>
  statPicks: Record<string, number>
  formClears: Record<string, { stages: number; noOvertime: number; leftover: number }>
  finalStats: Record<string, number>
  finalDeckEmotions: Record<string, number>
  floors: Record<number, { n: number; target: number; scored: number; sentences: number; money: number; deck: number; relics: number }>
}

const newTally = (): Tally => ({
  runs: 0, wins: 0, floorReached: [], heartsLost: 0, overtime: 0, softlocks: 0, cardPlays: {}, latePlays: {},
  bought: {}, statPicks: {}, formClears: {}, finalStats: {}, finalDeckEmotions: {}, floors: {},
})
const bump = (m: Record<string, number>, k: string, n = 1) => { m[k] = (m[k] ?? 0) + n }

// ── 봇 ──

interface Bot {
  name: string
  /** 상점에서 이 물건을 볼 수 있는가(편향 봇의 필터). */
  allows(o: ShopOffer): boolean
  /** 써 보기 값에 곱하는 가중치. */
  weight?(o: ShopOffer, run: RunState): number
  /** 재련 칸 선택. 기본은 써 보기. */
  forgeBias?(s: StatDef): number
  random?: boolean
}

const emotionOfOffer = (o: ShopOffer): ScoreEmotion | undefined => (o.kind === 'word' ? cardDef(o.id).emotion : undefined)

const BOTS: Bot[] = [
  { name: 'tryout', allows: () => true },
  ...SCORE_EMOTIONS.map((e): Bot => ({
    name: `mono-${e}`,
    allows: (o) => o.kind !== 'word' || emotionOfOffer(o) === e || !!o.guaranteed,
    forgeBias: (s) => (s.id === e ? 1.5 : 1),
  })),
  {
    name: 'mixer',
    allows: () => true,
    weight: (o, run) => {
      if (o.kind !== 'word') return 1
      const c = cardDef(o.id)
      const have = run.deck.filter((d) => cardDef(d.cardId).slot === c.slot && cardDef(d.cardId).emotion === c.emotion).length
      return have === 0 ? 1.5 : 1
    },
  },
  { name: 'items-only', allows: (o) => o.kind === 'item' },
  { name: 'no-items', allows: (o) => o.kind !== 'item' },
  { name: 'random', allows: () => true, random: true },
]

// ── 문장 고르기 ──

function handPicks(hand: Hand, ctx: StageContext): SentencePick[] {
  const advs: (DeckCard | undefined)[] = ctx.weatherIds.includes('drowsy') ? [undefined, ...hand.adv.hand] : hand.adv.hand
  const out: SentencePick[] = []
  for (const s of hand.subj.hand) for (const a of advs) for (const v of hand.verb.hand) {
    const p = { subj: s, adv: a, verb: v }
    if (validatePick(p, ctx).ok) out.push(p)
  }
  return out
}

/**
 * 목표에 닿는 문장이 있으면 가장 싼 것(기회를 남기면 돈), 없으면 기회당 기댓값 최고.
 * 눈물은 남은 기회가 있을 때 미래 가치로 조금 쳐 준다(슬픔 저축이 근시안 봇에게도 보이게).
 */
function choosePick(picks: SentencePick[], ctx: StageContext, loadout: ScoreLoadout, need: number, bot: Bot, rng: () => number): SentencePick {
  if (bot.random) return picks[Math.floor(rng() * picks.length)]
  let best: SentencePick | undefined
  let bestKey = -Infinity
  const finishers: { p: SentencePick; ev: number; cost: number }[] = []
  for (const p of picks) {
    const ev = expectedScore(p, ctx, loadout)
    const cost = cardDef(p.verb.cardId).cost
    if (ev >= need) finishers.push({ p, ev, cost })
    const res = scoreSentence(p, ctx, loadout, { pick: (q, a, b) => q * a + (1 - q) * b, range: (a, b) => (a + b) / 2 }, 1)
    const later = Math.max(0, ctx.chancesLeft - cost)
    const tearValue = later > 0 ? (res.tearsAfter - ctx.tears) * 0.04 * ev : 0
    const key = (ev + tearValue) / Math.max(1, cost)
    if (key > bestKey) { bestKey = key; best = p }
  }
  if (finishers.length) {
    finishers.sort((a, b) => a.cost - b.cost || b.ev - a.ev)
    return finishers[0].p
  }
  return best!
}

// ── 스테이지 ──

interface StageOutcome { cleared: boolean; dead: boolean; leftover: number; overtime: number; scored: number; target: number; sentences: number }

function playStage(run: RunState, bot: Bot, tally: Tally, rng: () => number): StageOutcome {
  const plan = planStage(run.floor, STAT_EMOTIONS[Math.floor(rng() * 4)])
  const loadout = loadoutOf(run)
  let ctx = startStage(plan, loadout)
  let hand = newHand(run.deck, rng)
  let scored = 0
  let overtime = 0
  for (let guard = 0; guard < 60; guard++) {
    if (scored >= plan.target) break
    if (ctx.chancesLeft <= 0) {
      overtime++
      let hit = OVERTIME_HIT_PIECES
      const absorbed = Math.min(run.guard, hit)
      run.guard -= absorbed
      hit -= absorbed
      run.pieces -= hit
      tally.heartsLost += hit / PIECES_PER_HEART
      if (run.pieces <= 0) { tally.overtime += overtime; return { cleared: false, dead: true, leftover: 0, overtime, scored, target: plan.target, sentences: ctx.sentencesUsed } }
    }
    let picks = handPicks(hand, ctx)
    if (!picks.length) {
      // 손패로 문장을 못 만들면 한 번 새로 뽑고, 덱 전체로도 못 만들면 소프트락(런 종료로 기록).
      hand = redraw(hand, rng)
      picks = handPicks(hand, ctx)
      if (!picks.length) {
        tally.softlocks++
        tally.overtime += overtime
        return { cleared: false, dead: true, leftover: 0, overtime, scored, target: plan.target, sentences: ctx.sentencesUsed }
      }
    }
    const pick = choosePick(picks, ctx, loadout, plan.target - scored, bot, rng)
    const res = scoreSentence(pick, ctx, loadout, rngRoller(rng), rng())
    scored += res.score
    for (const id of res.record.wordIds) {
      bump(tally.cardPlays, id)
      if (run.floor >= 10) bump(tally.latePlays, id)
    }
    ctx = applySentence(ctx, res)
    hand = afterSentence(hand, { subj: pick.subj, adv: pick.adv, verb: pick.verb }, rng)
    if (res.redrawHand) hand = redraw(hand, rng)
    if (res.freeSwaps > 0 && hand.adv.hand.length) hand = swapOne(hand, 'adv', hand.adv.hand[0], rng)
  }
  if (scored < plan.target) { tally.overtime += overtime; return { cleared: false, dead: true, leftover: 0, overtime, scored, target: plan.target, sentences: ctx.sentencesUsed } }
  const f = (tally.formClears[plan.formId] ??= { stages: 0, noOvertime: 0, leftover: 0 })
  f.stages++
  if (!overtime) f.noOvertime++
  f.leftover += Math.max(0, ctx.chancesLeft)
  tally.overtime += overtime
  run.money += clearMoney(ctx, loadout)
  return { cleared: true, dead: false, leftover: Math.max(0, ctx.chancesLeft), overtime, scored, target: plan.target, sentences: ctx.sentencesUsed }
}

// ── 상점 ──

function offerValue(o: ShopOffer, run: RunState, base: TryoutBaseline): { value: number; apply: () => void } | undefined {
  const lo = loadoutOf(run)
  if (o.kind === 'word') {
    const nc: DeckCard = { uid: run.nextUid, cardId: o.id, level: 0 }
    const value = tryoutCard(base, run.deck, nc, lo) - base.value
    return { value, apply: () => { run.nextUid++; run.deck.push(nc) } }
  }
  if (o.kind === 'sticker') {
    const slot = stickerDef(o.id).slot
    let best: { value: number; target: DeckCard } | undefined
    for (const c of run.deck) {
      if (cardDef(c.cardId).slot !== slot || c.sticker) continue
      const v = tryoutCard(base, run.deck, { ...c, sticker: o.id }, lo) - base.value
      if (!best || v > best.value) best = { value: v, target: c }
    }
    if (!best) return undefined
    const target = best.target
    return { value: best.value, apply: () => { target.sticker = o.id } }
  }
  if (o.kind === 'relic') {
    if (run.relics.length >= RELIC_SLOTS) return undefined
    let best = { value: -Infinity, at: 0 }
    for (let at = 0; at <= run.relics.length; at++) {
      const relics = [...run.relics.slice(0, at), o.id, ...run.relics.slice(at)]
      const v = tryoutLoadout(base, { stats: run.stats, relics }) - base.value
      if (v > best.value) best = { value: v, at }
    }
    // 점수 밖에서 작동하는 유물(경제·생존·눈물 시작)은 써 보기에 안 잡히므로 작은 기본값을 준다.
    const kind = relicDef(o.id).kind
    const floorValue = kind === 'economy' || o.id === 'beanstalk' || o.id === 'diary' || o.id === 'bookmark' || o.id === 'quote' ? base.value * 0.06 : 0
    const at = best.at
    return { value: Math.max(best.value, floorValue), apply: () => { run.relics.splice(at, 0, o.id) } }
  }
  // 아이템: 재련 기댓값을 근사한다(가장 센 감정 1점 + 가장 센 정도 1점, 등급 보너스 포함 점수 비례).
  const pts = 3 + RARITY_BASE_POINTS[o.rarity] + (o.rarity === 'common' ? 0 : o.rarity === 'rare' ? 1 : o.rarity === 'epic' ? 2 : 3)
  const probe = applyStatPoints(applyStatPoints(run.stats, bestEmotionStat(run.stats), 1), 'baseAdd', 1)
  const v = (tryoutLoadout(base, { stats: probe, relics: run.relics }) - base.value) * (pts / 2)
  return { value: v, apply: () => forgeItem(run, o.rarity, base) }
}

const bestEmotionStat = (s: ScoreStats) => STAT_EMOTIONS.reduce((a, b) => (s[b] > s[a] ? b : a))

let currentBot: Bot = BOTS[0]
let currentTally: Tally = newTally()
let currentRng: () => number = Math.random

function forgeItem(run: RunState, rarity: Rarity, base: TryoutBaseline) {
  const rng = currentRng
  // 기본 스탯: 일반 1점·희귀 2점(무작위 감정).
  const basePts = RARITY_BASE_POINTS[rarity]
  if (basePts) {
    const e = STAT_EMOTIONS[Math.floor(rng() * 4)]
    run.stats = applyStatPoints(run.stats, e, basePts)
    bump(currentTally.statPicks, `base:${e}`, basePts)
  }
  const choices = forgeChoices(run.stats, rng)
  const bonus = bonusSpread(rarity, rng)
  FORGE_SLOTS.forEach((slot, i) => {
    const pts = 1 + bonus[i]
    const opts = choices[i]
    let pick: StatDef
    if (currentBot.random) pick = opts[Math.floor(rng() * opts.length)]
    else if (slot === 'verdict') {
      const pref = run.pieces <= 8 ? ['mind', 'guard', 'allowance', 'luck', 'freeReroll'] : ['allowance', 'mind', 'guard', 'luck', 'freeReroll']
      pick = [...opts].sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id))[0]
    } else {
      pick = opts
        .map((s) => ({ s, v: (tryoutLoadout(base, { stats: applyStatPoints(run.stats, s.id, pts), relics: run.relics }) - base.value + (s.id === 'startTears' ? base.value * 0.02 : 0)) * (currentBot.forgeBias?.(s) ?? 1) }))
        .sort((a, b) => b.v - a.v)[0].s
    }
    run.stats = applyStatPoints(run.stats, pick.id, pts)
    if (pick.id === 'mind') run.pieces += pick.perPoint * pts
    if (pick.id === 'guard') run.guard += pick.perPoint * pts
    bump(currentTally.statPicks, pick.id, pts)
  })
}

function shop(run: RunState, bot: Bot, tally: Tally, rng: () => number, afterBoss: boolean) {
  // 하트가 1개 이하면 먼저 회복(돈 10 = 하트 1개).
  while (run.pieces <= PIECES_PER_HEART && run.money >= HEAL_PRICE && run.pieces < run.stats.mind) {
    run.money -= HEAL_PRICE
    run.pieces = Math.min(run.stats.mind, run.pieces + PIECES_PER_HEART)
    bump(tally.bought, 'heal')
  }
  let stock = rollStock({ deck: run.deck, relics: run.relics, luck: run.stats.luck, afterBoss, nextWeathers: planStage(run.floor + 1).weatherIds }, rng)
  let freeRerolls = run.stats.freeReroll
  for (let round = 0; round < 8; round++) {
    const affordable = stock.filter((o) => o.price <= run.money && bot.allows(o))
    if (!affordable.length) break
    if (bot.random) {
      const o = affordable[Math.floor(rng() * affordable.length)]
      const base = tryoutBaseline(run.deck, loadoutOf(run))
      const v = offerValue(o, run, base)
      if (v) { run.money -= o.price; v.apply(); bump(tally.bought, offerKey(o)) }
      stock = stock.filter((x) => x !== o)
      continue
    }
    const base = tryoutBaseline(run.deck, loadoutOf(run))
    let best: { o: ShopOffer; v: number; apply: () => void } | undefined
    for (const o of affordable) {
      const r = offerValue(o, run, base)
      if (!r) continue
      const v = (r.value * (bot.weight?.(o, run) ?? 1)) / o.price
      if (r.value > 0 && (!best || v > best.v)) best = { o, v, apply: r.apply }
    }
    if (!best) {
      // 살 것이 없으면 새로고침 한 번(무료 우선).
      if (freeRerolls > 0 || run.money >= REROLL_PRICE + 4) {
        if (freeRerolls > 0) freeRerolls--
        else run.money -= REROLL_PRICE
        bump(tally.bought, 'reroll')
        stock = rollStock({ deck: run.deck, relics: run.relics, luck: run.stats.luck, afterBoss, nextWeathers: planStage(run.floor + 1).weatherIds }, rng)
        continue
      }
      break
    }
    run.money -= best.o.price
    best.apply()
    bump(tally.bought, offerKey(best.o))
    stock = stock.filter((x) => x !== best!.o)
  }
}

const offerKey = (o: ShopOffer) => (o.kind === 'item' ? `item:${o.rarity}` : `${o.kind}:${o.id}`)

// ── 런 ──

function playRun(bot: Bot, tally: Tally, rng: () => number) {
  const run = newRun()
  tally.runs++
  for (run.floor = 1; run.floor <= FLOORS; run.floor++) {
    const moneyIn = run.money
    const out = playStage(run, bot, tally, rng)
    const fl = (tally.floors[run.floor] ??= { n: 0, target: 0, scored: 0, sentences: 0, money: 0, deck: 0, relics: 0 })
    fl.n++; fl.target += out.target; fl.scored += out.scored; fl.sentences += out.sentences
    fl.money += moneyIn; fl.deck += run.deck.length; fl.relics += run.relics.length
    if (out.dead) { tally.floorReached.push(run.floor); finish(run, tally); return }
    run.cleared++
    const isBoss = !!planStage(run.floor).boss
    if (isBoss) run.pieces = Math.min(run.stats.mind, run.pieces + PIECES_PER_HEART)
    if (run.relics.includes('beanstalk') && run.cleared % relicDef('beanstalk').a === 0 && run.stats.mind < relicDef('beanstalk').b * PIECES_PER_HEART) {
      run.stats = { ...run.stats, mind: run.stats.mind + PIECES_PER_HEART }
      run.pieces += PIECES_PER_HEART
    }
    if (run.floor < FLOORS) shop(run, bot, tally, rng, isBoss)
  }
  tally.wins++
  tally.floorReached.push(FLOORS + 1)
  finish(run, tally)
}

function finish(run: RunState, tally: Tally) {
  for (const k of Object.keys(run.stats)) bump(tally.finalStats, k, (run.stats as unknown as Record<string, number>)[k])
  for (const c of run.deck) bump(tally.finalDeckEmotions, cardDef(c.cardId).emotion)
}

// ── 감정 × 형태 곡선 ──

function curves() {
  const rng = mulberry32(SEED)
  const stats: ScoreStats = { ...startingStats(), anger: 24, sorrow: 24, joy: 24, pleasure: 24, baseAdd: 0.7 }
  console.log('\n## 감정 × 스테이지 형태 점수 곡선 (한 감정 덱 5장×3칸, 감정 스탯 24, 맑음, 목표 없음)\n')
  const header = ['형태(기회)', ...SCORE_EMOTIONS]
  const rows: string[][] = []
  const table: Record<string, Record<string, number>> = {}
  for (const f of SCORE_FORMS) {
    const row = [`${f.name}(${f.chances})`]
    table[f.id] = {}
    for (const e of SCORE_EMOTIONS) {
      const deck = SCORE_CARDS.filter((c) => c.emotion === e).map((c, i) => ({ uid: i + 1, cardId: c.id, level: 0 }))
      const loadout = { stats, relics: [] }
      let total = 0
      for (let n = 0; n < RUNS; n++) {
        let ctx = startStage({ floor: 0, formId: f.id, weatherIds: ['clear'], target: Infinity, chances: f.chances }, loadout)
        let hand = newHand(deck, rng)
        while (ctx.chancesLeft > 0) {
          const picks = handPicks(hand, ctx)
          if (!picks.length) break
          const pick = choosePick(picks, ctx, loadout, Infinity, BOTS[0], rng)
          const res = scoreSentence(pick, ctx, loadout, rngRoller(rng), rng())
          total += res.score
          ctx = applySentence(ctx, res)
          hand = afterSentence(hand, { subj: pick.subj, adv: pick.adv, verb: pick.verb }, rng)
        }
      }
      table[f.id][e] = total / RUNS
      row.push(String(Math.round(total / RUNS)))
    }
    rows.push(row)
  }
  printTable(header, rows)
  console.log('\n슬픔/분노 점수비:', SCORE_FORMS.map((f) => `${f.name} ${(table[f.id].sorrow / table[f.id].anger).toFixed(2)}`).join(' · '))
  console.log('(기획안 §2 모델값: 기회 2번 0.63, 3번 1.06, 5번 1.43, 10번 1.93)')
  return table
}

// ── 출력 ──

function printTable(header: string[], rows: string[][]) {
  console.log(`| ${header.join(' | ')} |`)
  console.log(`|${header.map(() => '---').join('|')}|`)
  for (const r of rows) console.log(`| ${r.join(' | ')} |`)
}

const pct = (n: number, d: number) => `${d ? Math.round((n / d) * 100) : 0}%`
const top = (m: Record<string, number>, n: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n)

function report(results: Record<string, Tally>) {
  console.log(`\n## 봇별 결과 (봇마다 ${RUNS}판, 시드 ${SEED})\n`)
  printTable(
    ['봇', '승률', '평균 도달층', '잃은 하트/판', '초과 문장/판', '소프트락'],
    Object.entries(results).map(([name, t]) => [
      name, pct(t.wins, t.runs), (t.floorReached.reduce((a, b) => a + b, 0) / t.runs).toFixed(1),
      (t.heartsLost / t.runs).toFixed(2), (t.overtime / t.runs).toFixed(2), String(t.softlocks),
    ]),
  )

  const all = newTally()
  for (const t of Object.values(results)) {
    for (const [k, v] of Object.entries(t.cardPlays)) bump(all.cardPlays, k, v)
    for (const [k, v] of Object.entries(t.latePlays)) bump(all.latePlays, k, v)
    for (const [k, v] of Object.entries(t.bought)) bump(all.bought, k, v)
    for (const [k, v] of Object.entries(t.statPicks)) bump(all.statPicks, k, v)
    for (const [k, v] of Object.entries(t.formClears)) {
      const f = (all.formClears[k] ??= { stages: 0, noOvertime: 0, leftover: 0 })
      f.stages += v.stages; f.noOvertime += v.noOvertime; f.leftover += v.leftover
    }
  }

  for (const t of Object.values(results)) for (const [k, v] of Object.entries(t.floors)) {
    const f = (all.floors[Number(k)] ??= { n: 0, target: 0, scored: 0, sentences: 0, money: 0, deck: 0, relics: 0 })
    f.n += v.n; f.target += v.target; f.scored += v.scored; f.sentences += v.sentences; f.money += v.money; f.deck += v.deck; f.relics += v.relics
  }
  console.log('\n## 층별 (전체 봇, 그 층에 들어간 판 평균)\n')
  printTable(['층', '판', '목표', '낸 점수', '점수/목표', '문장 수', '입장 돈', '덱', '유물'], Object.entries(all.floors).map(([k, f]) => [
    k, String(f.n), String(Math.round(f.target / f.n)), String(Math.round(f.scored / f.n)), (f.scored / f.target).toFixed(2),
    (f.sentences / f.n).toFixed(1), (f.money / f.n).toFixed(1), (f.deck / f.n).toFixed(1), (f.relics / f.n).toFixed(1),
  ]))

  console.log('\n## 형태별 (전체 봇)\n')
  printTable(['형태', '스테이지', '기회 안에 클리어', '평균 남은 기회'], Object.entries(all.formClears).map(([k, f]) => [
    k, String(f.stages), pct(f.noOvertime, f.stages), (f.leftover / f.stages).toFixed(2),
  ]))

  const unused = SCORE_CARDS.filter((c) => !all.cardPlays[c.id])
  console.log(`\n## 카드 사용\n\n쓰이지 않은 카드 ${unused.length}장: ${unused.map((c) => c.name).join(', ') || '없음'}`)
  console.log(`10층 이후 가장 많이 쓴 카드: ${top(all.latePlays, 10).map(([k, v]) => `${cardDef(k).name} ${v}`).join(', ')}`)
  const lateTotal = Object.values(all.latePlays).reduce((a, b) => a + b, 0)
  const starters = SCORE_CARDS.filter((c) => c.start)
  console.log(`10층 이후 시작 카드 비중: ${starters.map((c) => `${c.name} ${pct(all.latePlays[c.id] ?? 0, lateTotal / 3)}`).join(', ')}`)

  console.log('\n## 구매\n')
  const kinds = ['word', 'sticker', 'relic', 'item', 'heal', 'reroll']
  console.log(kinds.map((k) => `${k} ${Object.entries(all.bought).filter(([x]) => x === k || x.startsWith(k + ':')).reduce((a, [, v]) => a + v, 0)}`).join(' · '))
  console.log(`스티커: ${top(Object.fromEntries(Object.entries(all.bought).filter(([k]) => k.startsWith('sticker:')).map(([k, v]) => [k.slice(8), v])), 15).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`유물: ${top(Object.fromEntries(Object.entries(all.bought).filter(([k]) => k.startsWith('relic:')).map(([k, v]) => [relicDef(k.slice(6)).name, v])), 24).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  console.log(`재련 스탯 점수: ${top(all.statPicks, 20).map(([k, v]) => `${SCORE_STATS.find((s) => s.id === k)?.name ?? k} ${v}`).join(', ')}`)
}

// ── 실행 ──

if (args.has('curves')) {
  const table = curves()
  if (args.get('json')) writeJson(args.get('json')!, { curves: table })
} else {
  const only = args.get('bots')?.split(',')
  const results: Record<string, Tally> = {}
  const t0 = Date.now()
  for (const bot of BOTS.filter((b) => !only || only.includes(b.name))) {
    const tally = newTally()
    currentBot = bot
    currentTally = tally
    for (let i = 0; i < RUNS; i++) {
      const rng = mulberry32(SEED * 10007 + i)
      currentRng = rng
      playRun(bot, tally, rng)
    }
    results[bot.name] = tally
    process.stderr.write(`${bot.name} ${pct(tally.wins, tally.runs)} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`)
  }
  report(results)
  if (args.get('json')) writeJson(args.get('json')!, results)
}

function writeJson(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2))
  console.log(`\nJSON: ${path}`)
}
