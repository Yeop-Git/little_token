/**
 * 아이템 특성 중첩 점검 — 일반·희귀 아이템의 무작위 특성을 같은 종류로 N개 모았을 때
 * 문장 점수가 어떻게 자라는지 잉크 한도 안의 전수 문장으로 잰다.
 *
 * 실행: npx tsx src/tools/trait-stack-check.ts
 * 기준은 같은 덱·같은 스탯에서 특성 0개일 때의 공격 p75·max, 방어·회복 최대치다.
 * 비교용으로 희귀 아이템 기본 스탯(공격 +1 = 2점) N개를 같이 보여 준다.
 */
import { compile, effectiveBase, isDamageIntent } from '@core/compiler'
import { selectionInkCost, sentenceInkAvailable } from '@core/ink'
import { modsFor } from '@core/passives'
import { startingPlayer } from '@core/run'
import type { OwnedItem, PlayerState, PlayerStats } from '@core/player'
import type { Selection } from '@core/types'
import { conflictReason } from '@core/validator'
import { ALL_REWARD_WORDS, makeEarlyTables } from '@data/earlyWords'
import { ITEM_TRAIT_IDS, type ItemTraitId } from '@core/itemTraits'
import type { Rarity } from '@core/types'

const PROFILES: Record<string, PlayerStats> = {
  early: { hp: 60, atk: 6, guard: 4, heal: 6, luck: 2 },
  late: { hp: 80, atk: 24, guard: 12, heal: 12, luck: 12 },
}
const EXTRA_WORDS = ['nado', 'oneul', 'michin', 'nunmullo', 'focusStrike', 'pierceStrike', 'scatterThree']

interface Result { atkP75: number; atkMax: number; guard: number; heal: number; maxInkUsed: number; inkCap: number }

function run(stats: PlayerStats, items: OwnedItem[]): Result {
  const player: PlayerState = startingPlayer()
  player.stats = { ...stats }
  for (const id of EXTRA_WORDS) {
    const word = ALL_REWARD_WORDS.find((w) => w.id === id)
    if (word && player.deck[word.slot]) player.deck[word.slot].push(word)
  }
  player.items = items
  const tables = makeEarlyTables(player.deck, player)
  const order = tables.template.slots.map((s) => s.key)
  const cap = sentenceInkAvailable(0, player)
  const attacks: number[] = []
  let guard = 0, heal = 0, maxInk = 0
  const visit = (i: number, sel: Selection): void => {
    if (i >= order.length) {
      const cost = selectionInkCost(sel)
      if (cost > cap) return
      maxInk = Math.max(maxInk, cost)
      const intent = compile(sel, tables, player.stats, modsFor(player, 3))
      const m = intent.multiplier
      if (isDamageIntent(intent) && effectiveBase(intent) > 0) attacks.push(effectiveBase(intent) * m * intent.hitCount * intent.castCount * intent.castScale)
      guard = Math.max(guard, intent.guard * m * intent.castCount * intent.castScale)
      heal = Math.max(heal, intent.heal * m * intent.castCount * intent.castScale)
      return
    }
    const key = order[i]
    for (const w of tables.words[key] ?? []) {
      if (conflictReason(w, i, sel, tables)) continue
      visit(i + 1, { ...sel, [key]: w })
    }
  }
  visit(0, {})
  attacks.sort((a, b) => a - b)
  const pct = (r: number) => attacks[Math.min(attacks.length - 1, Math.floor((attacks.length - 1) * r))] ?? 0
  return { atkP75: pct(0.75), atkMax: pct(1), guard, heal, maxInkUsed: maxInk, inkCap: cap }
}

const traitItems = (trait: ItemTraitId, n: number, rarity: Rarity): OwnedItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t-${trait}-${i}`, name: trait, rarity, art: '', line: '', stats: {}, trait }))

const r = (x: number) => x.toFixed(2)
for (const [profileName, stats] of Object.entries(PROFILES)) {
  const base = run(stats, [])
  console.log(`\n== ${profileName} 스탯 ${JSON.stringify(stats)} · 기준 공격 p75 ${base.atkP75.toFixed(1)} max ${base.atkMax.toFixed(1)} · 방어 ${base.guard.toFixed(0)} · 회복 ${base.heal.toFixed(0)} · 잉크 ${base.maxInkUsed}/${base.inkCap}`)
  for (const trait of ITEM_TRAIT_IDS) {
    if (trait === 'extraDraw') continue
    const cells: string[] = []
    for (const n of [1, 3, 5, 8]) {
      const res = run(stats, traitItems(trait, n, 'rare'))
      cells.push(`N${n} 공p75×${r(res.atkP75 / base.atkP75)} max×${r(res.atkMax / base.atkMax)} 방×${r(res.guard / Math.max(1, base.guard))} 회×${r(res.heal / Math.max(1, base.heal))}${trait === 'inkMax' ? ` 잉크${res.maxInkUsed}/${res.inkCap}` : ''}`)
    }
    console.log(`${trait.padEnd(15)} ${cells.join(' | ')}`)
  }
  // 비교: 희귀 기본 스탯 공격 +1(2점) N개
  const cells: string[] = []
  for (const n of [1, 3, 5, 8]) {
    const res = run({ ...stats, atk: stats.atk + n }, [])
    cells.push(`N${n} 공p75×${r(res.atkP75 / base.atkP75)} max×${r(res.atkMax / base.atkMax)}`)
  }
  console.log(`${'(비교)공격+1'.padEnd(15)} ${cells.join(' | ')}`)
}

// 서로 다른 배율 특성끼리는 곱으로 붙는다 — 배율·관용구·공명을 3개씩 섞은 경우.
{
  const stats = PROFILES.late
  const base = run(stats, [])
  const mix = [...traitItems('poolBonus', 3, 'rare'), ...traitItems('comboBoost', 3, 'rare'), ...traitItems('resonanceBoost', 3, 'rare')]
  const res = run(stats, mix)
  console.log(`\n(혼합) 배율3+관용구3+공명3 late 공p75×${r(res.atkP75 / base.atkP75)} max×${r(res.atkMax / base.atkMax)} 방×${r(res.guard / base.guard)} 회×${r(res.heal / base.heal)}`)
}

// 영웅·전설 고유효과 단독 — 초반·후반 스탯에서 각각 기준 대비 배수. (대성공·메아리·재시도 기대값은 item-balance-check가 본다.)
{
  const { PASSIVE_ITEMS } = await import('@data/items')
  const rare = traitItems('poolBonus', 1, 'rare')
  for (const [profileName, stats] of Object.entries(PROFILES)) {
    const base = run(stats, [])
    console.log(`\n== 고유효과 ${profileName}`)
    for (const def of Object.values(PASSIVE_ITEMS)) {
      const res = run(stats, [{ id: def.id, name: def.name, rarity: def.rarity, art: '', line: '', stats: {}, passive: def.passive }])
      console.log(`${def.rarity.padEnd(9)} ${def.name.padEnd(14)} 공p75×${r(res.atkP75 / base.atkP75)} max×${r(res.atkMax / base.atkMax)} 방×${r(res.guard / base.guard)} 회×${r(res.heal / base.heal)} 잉크${res.maxInkUsed}/${res.inkCap}`)
    }
    const pr = run(stats, rare)
    console.log(`(비교) 희귀 배율 특성 1개 공p75×${r(pr.atkP75 / base.atkP75)} max×${r(pr.atkMax / base.atkMax)}`)
  }
}
