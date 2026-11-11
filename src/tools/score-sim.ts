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
  FLOORS_TOTAL, PIECES_PER_HEART, SCORE_CARDS, SCORE_FORMS, SCORE_STATS, card as cardDef, relic as relicDef,
  startingStats, sticker as stickerDef,
} from '../score/data'
import { afterSentence, newHand, type Hand } from '../score/hand'
import { ScoreRun } from '../score/run'
import { expectedRoller, expectedScore, pickCost, rngRoller, scoreSentence, validatePick } from '../score/scoring'
import {
  FORGE_SLOTS, RARITY_BASE_POINTS, RARITY_BONUS, REROLL_PRICE, applyStatPoints, highestEmotion, type ShopOffer,
} from '../score/shop'
import { applySentence, startStage } from '../score/stage'
import { tryoutBaseline, tryoutCard, tryoutLoadout, type TryoutBaseline } from '../score/tryout'
import type {
  DeckCard, ScoreEmotion, ScoreLoadout, ScoreStats, SentencePick, StageContext, StatDef,
} from '../score/types'
import { SCORE_EMOTIONS } from '../score/types'

// ── 인자 ──

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? 'true'] as const
}))
const RUNS = Number(args.get('runs') ?? 20)
const SEED = Number(args.get('seed') ?? 1)
const FLOORS = FLOORS_TOTAL
/** --god: 하트가 닳지 않는다. 모든 층의 점수 여력을 재서 목표 곡선을 맞출 때 쓴다. */
const GOD = args.has('god')
/** --cap: 목표를 무시하고 기회를 다 쓰면 넘어간다(목표는 표에만 남긴다). 층별 점수 여력을 잰다. */
const CAP = args.has('cap')
/** 봇이 눈물 1개의 미래 가치를 이번 문장 기댓값의 몇 배로 보는지. */
const TEAR_FORESIGHT = 0.04

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
  floors: Record<number, { n: number; target: number; scored: number; inChance: number; sentences: number; money: number; deck: number; relics: number }>
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
  weight?(o: ShopOffer, run: ScoreRun): number
  /** 재련 칸 선택. 기본은 써 보기. */
  forgeBias?(s: StatDef): number
  random?: boolean
  /** 하트 거래를 쓰는 봇. */
  trades?: boolean
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
  { name: 'trader', allows: () => true, trades: true },
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
    const cost = pickCost(p)
    if (ev >= need) finishers.push({ p, ev, cost })
    const res = scoreSentence(p, ctx, loadout, expectedRoller, 1)
    const later = Math.max(0, ctx.chancesLeft - cost)
    const tearValue = later > 0 ? (res.tearsAfter - ctx.tears) * TEAR_FORESIGHT * ev : 0
    const carryValue = later > 0 ? (res.carry.mult - 1) * ev + res.carry.add * ev * 0.3 : 0
    const key = (ev + tearValue + carryValue) / Math.max(1, cost)
    if (key > bestKey) { bestKey = key; best = p }
  }
  if (finishers.length) {
    finishers.sort((a, b) => a.cost - b.cost || b.ev - a.ev)
    return finishers[0].p
  }
  return best!
}

// ── 상점 ──

interface Valued { value: number; apply: () => void }

function offerValue(o: ShopOffer, run: ScoreRun, base: TryoutBaseline): Valued | undefined {
  const lo = run.loadout
  if (o.kind === 'word') {
    const owned = o.upgradeUid != null ? run.deck.find((c) => c.uid === o.upgradeUid) : undefined
    const probe: DeckCard = owned ? { ...owned, level: owned.level + 1 } : { uid: -1, cardId: o.id, level: 0 }
    const value = tryoutCard(base, run.deck, probe, lo) - base.value
    return { value, apply: () => { run.buy(o) } }
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
    return { value: best.value, apply: () => { run.buy(o, { targetUid: target.uid }) } }
  }
  if (o.kind === 'relic') {
    if (run.relics.length >= run.relicSlots) return undefined
    const r = relicValue(o.id, run, base)
    return { value: r.value, apply: () => { run.buy(o, { relicAt: r.at }) } }
  }
  // 아이템: 재련 기댓값을 근사한다(가장 센 감정 1점 + 기본 가산 1점, 등급 보너스 포함 점수 비례).
  const pts = 3 + RARITY_BASE_POINTS[o.rarity] + RARITY_BONUS[o.rarity]
  const probe = applyStatPoints(applyStatPoints(run.stats, highestEmotion(run.stats), 1), 'baseAdd', 1)
  const v = (tryoutLoadout(base, { stats: probe, relics: run.relics }) - base.value) * (pts / 2)
  return { value: v, apply: () => { if (run.buy(o)) forge(run) } }
}

function relicValue(id: string, run: ScoreRun, base: TryoutBaseline): { value: number; at: number } {
  let best = { value: -Infinity, at: 0 }
  for (let at = 0; at <= run.relics.length; at++) {
    const relics = [...run.relics.slice(0, at), id, ...run.relics.slice(at)]
    const v = tryoutLoadout(base, { stats: run.stats, relics }) - base.value
    if (v > best.value) best = { value: v, at }
  }
  // 써 보기(표준 3문장, 겹칸 없음)에 안 잡히는 유물은 기본값을 준다.
  const kind = relicDef(id).kind
  const share = id === 'twinSubj' || id === 'twinVerb' ? 0.15
    : kind === 'economy' || ['beanstalk', 'diary', 'bookmark', 'quote', 'echo', 'retry'].includes(id) ? 0.06 : 0
  return { value: Math.max(best.value, base.value * share), at: best.at }
}

let currentBot: Bot = BOTS[0]
let currentTally: Tally = newTally()

function forge(run: ScoreRun) {
  const bot = currentBot
  if (run.forge?.baseStat) bump(currentTally.statPicks, `base:${run.forge.baseStat}`, RARITY_BASE_POINTS[run.forge.rarity])
  while (run.phase === 'forge' && run.forge) {
    const f = run.forge
    const opts = f.choices[f.step]
    const pts = 1 + f.bonus[f.step]
    let pick: StatDef
    if (bot.random) pick = opts[Math.floor(run.rng() * opts.length)]
    else if (FORGE_SLOTS[f.step] === 'verdict') {
      const pref = run.pieces <= 8 ? ['mind', 'guard', 'allowance', 'luck', 'freeReroll'] : ['allowance', 'mind', 'guard', 'luck', 'freeReroll']
      pick = [...opts].sort((a, b) => pref.indexOf(a.id) - pref.indexOf(b.id))[0]
    } else {
      const base = tryoutBaseline(run.deck, run.loadout)
      pick = opts
        .map((s) => ({ s, v: (tryoutLoadout(base, { stats: applyStatPoints(run.stats, s.id, pts), relics: run.relics }) - base.value + (s.id === 'startTears' ? base.value * 0.02 : 0)) * (bot.forgeBias?.(s) ?? 1) }))
        .sort((a, b) => b.v - a.v)[0].s
    }
    bump(currentTally.statPicks, pick.id, pts)
    run.forgeChoose(pick.id)
  }
}

const offerKey = (o: ShopOffer) => (o.kind === 'item' ? `item:${o.rarity}` : o.kind === 'word' && o.upgradeUid != null ? `upgrade:${o.id}` : `${o.kind}:${o.id}`)

function shop(run: ScoreRun, bot: Bot, tally: Tally) {
  // 하트가 1개 이하면 먼저 회복(돈 10 = 하트 1개).
  while (run.pieces <= PIECES_PER_HEART && run.heal()) bump(tally.bought, 'heal')
  // 거래 봇: 하트가 가득하면 하트 1개를 돈 15로 바꾼다(§10 환전).
  if (bot.trades && run.pieces >= run.maxPieces && run.pieces >= 3 * PIECES_PER_HEART && run.trade('exchange')) bump(tally.bought, 'trade:exchange')
  for (let round = 0; round < 10 && run.phase === 'shop'; round++) {
    const affordable = run.shop!.stock.filter((o) => o.price <= run.money && bot.allows(o))
    const base = tryoutBaseline(run.deck, run.loadout)
    let best: { o: ShopOffer; v: number; apply: () => void } | undefined
    if (bot.random) {
      const o = affordable[Math.floor(run.rng() * affordable.length)]
      const r = o && offerValue(o, run, base)
      if (r) best = { o, v: 1, apply: r.apply }
      else break
    } else {
      for (const o of affordable) {
        const r = offerValue(o, run, base)
        if (!r || r.value <= 0) continue
        const v = (r.value * (bot.weight?.(o, run) ?? 1)) / o.price
        if (!best || v > best.v) best = { o, v, apply: r.apply }
      }
    }
    if (!best) {
      // 살 것이 없으면 새로고침(무료 우선, 유료는 여윳돈이 있을 때).
      if ((run.shop!.freeRerolls > 0 || run.money >= REROLL_PRICE + 5) && run.reroll()) { bump(tally.bought, 'reroll'); continue }
      break
    }
    const key = offerKey(best.o)
    best.apply()
    bump(tally.bought, key)
  }
  run.leaveShop()
}

// ── 런 ──

function playRun(bot: Bot, tally: Tally, seed: number) {
  const run = new ScoreRun(seed)
  tally.runs++
  let floorSeen = 0
  for (let guard = 0; guard < 2000 && (run.phase === 'battle' || run.phase === 'shop'); guard++) {
    if (run.phase === 'shop') { shop(run, bot, tally); continue }
    const st = run.stage
    if (run.floor !== floorSeen) {
      floorSeen = run.floor
      const fl = (tally.floors[run.floor] ??= newFloor())
      fl.n++; fl.target += st.plan.target; fl.money += run.money; fl.deck += run.deck.length; fl.relics += run.relics.length
      if (CAP) st.plan = { ...st.plan, target: Number.MAX_SAFE_INTEGER }
    }
    if (!run.rescueHand()) { tally.softlocks++; break }
    const picks = run.handPicks()
    const pick = choosePick(picks, st.ctx, run.loadout, st.plan.target - st.scored, bot, run.rng)
    const floor = run.floor
    const hit = run.overtimeHit()
    const res = run.play(pick)
    const fl = tally.floors[floor]
    fl.scored += res.score; fl.sentences++
    if (!hit) fl.inChance += res.score
    if (CAP && run.phase === 'battle' && run.floor === floor && run.stage.ctx.chancesLeft <= 0) run.forceClear()
    if (GOD && (run.phase as string) === 'lost') { run.phase = 'battle' }
    if (GOD) run.pieces = Math.max(run.pieces, run.maxPieces)
    if (hit) { tally.overtime++; tally.heartsLost += hit / PIECES_PER_HEART }
    for (const id of res.record.wordIds) {
      bump(tally.cardPlays, id)
      if (floor >= 10) bump(tally.latePlays, id)
    }
    if (run.phase !== 'battle' || run.floor !== floor) {
      // 스테이지가 끝났다(클리어 또는 패배).
      if ((run.phase as string) !== 'lost') {
        const f = (tally.formClears[st.plan.formId] ??= { stages: 0, noOvertime: 0, leftover: 0 })
        f.stages++
        if (!st.overtime) f.noOvertime++
        f.leftover += Math.max(0, st.ctx.chancesLeft)
      }
    }
  }
  if (run.phase === 'won') tally.wins++
  tally.floorReached.push(run.phase === 'won' ? FLOORS + 1 : run.floor)
  for (const k of Object.keys(run.stats)) bump(tally.finalStats, k, (run.stats as unknown as Record<string, number>)[k])
  for (const c of run.deck) bump(tally.finalDeckEmotions, cardDef(c.cardId).emotion)
  bump(tally.finalStats, 'deckSize', run.deck.length)
  bump(tally.finalStats, 'relicCount', run.relics.length)
}

const newFloor = () => ({ n: 0, target: 0, scored: 0, inChance: 0, sentences: 0, money: 0, deck: 0, relics: 0 })

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
    const f = (all.floors[Number(k)] ??= newFloor())
    f.inChance += v.inChance; f.n += v.n; f.target += v.target; f.scored += v.scored; f.sentences += v.sentences; f.money += v.money; f.deck += v.deck; f.relics += v.relics
  }
  console.log('\n## 층별 (전체 봇, 그 층에 들어간 판 평균)\n')
  printTable(['층', '판', '목표', '기회 안 점수', '기회 안 점수/목표', '문장 수', '입장 돈', '덱', '유물'], Object.entries(all.floors).map(([k, f]) => [
    k, String(f.n), String(Math.round(f.target / f.n)), String(Math.round(f.inChance / f.n)), (f.inChance / f.target).toFixed(2),
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
  const kinds = ['word', 'upgrade', 'sticker', 'relic', 'item', 'heal', 'reroll', 'trade']
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
    for (let i = 0; i < RUNS; i++) playRun(bot, tally, SEED * 10007 + i)
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
