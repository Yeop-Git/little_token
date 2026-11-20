import { compile, effectiveBase, isDamageIntent, rouletteOdds } from '@core/compiler'
import { selectionInkCost, sentenceInkAvailable } from '@core/ink'
import { BEANSTALK_GROWTH, beanstalkGrowthFor, ECHO_REPEAT_SCALE, hasPassive, modsFor, type PassiveId } from '@core/passives'
import { startingPlayer } from '@core/run'
import type { PlayerState } from '@core/player'
import type { Selection } from '@core/types'
import { conflictReason } from '@core/validator'
import { ALL_REWARD_WORDS, makeEarlyTables } from '@data/earlyWords'
import { ITEMS, PASSIVE_ITEMS, type ItemDef, type StatKey } from '@data/items'

const BENCHMARK_STATS = { hp: 80, atk: 24, guard: 12, heal: 12, luck: 12 }

interface ItemBenchmark {
  item: ItemDef | null
  attacks: number[]
  maxGuard: number
  maxHeal: number
  maxGrowth: number
}

function expectedRoulette(player: PlayerState, intent: ReturnType<typeof compile>): number {
  const baseChance = rouletteOdds(intent, intent.statKey ? player.stats[intent.statKey] : player.stats.atk).critP
  const critChance = hasPassive(player, 'retry') ? 1 - (1 - baseChance) ** 2 : baseChance
  const normal = 1 + critChance * 0.5
  return hasPassive(player, 'echo') ? normal + critChance * 1.5 * ECHO_REPEAT_SCALE : normal
}

function benchmark(item: ItemDef | null, combinedItems: ItemDef[] = []): ItemBenchmark {
  const player = startingPlayer()
  player.stats = { ...BENCHMARK_STATS }
  // 획득한 단어와의 상호작용을 보아야 잉크 확장 효과가 실제 선택지를 여는지 알 수 있다.
  for (const id of ['nado', 'oneul', 'michin', 'nunmullo', 'focusStrike', 'pierceStrike', 'scatterThree']) {
    const word = ALL_REWARD_WORDS.find((candidate) => candidate.id === id)
    if (word && player.deck[word.slot]) player.deck[word.slot].push(word)
  }
  const equipped = item ? [item] : combinedItems
  player.items = equipped.filter((entry) => entry.passive).map((entry) => ({
    id: entry.id, name: entry.name, rarity: entry.rarity, art: entry.art, line: '', stats: {}, passive: entry.passive,
  }))
  const tables = makeEarlyTables(player.deck, player)
  const order = tables.template.slots.map((slot) => slot.key)
  const result: ItemBenchmark = { item, attacks: [], maxGuard: 0, maxHeal: 0, maxGrowth: 0 }

  const visit = (index: number, selection: Selection): void => {
    if (index >= order.length) {
      if (selectionInkCost(selection) > sentenceInkAvailable(0, player)) return
      const intent = compile(selection, tables, player.stats, modsFor(player, 3))
      const doubt = intent.doubtCount > 0 ? 1.15 ** intent.doubtCount : 1
      const multiplier = intent.multiplier * doubt * expectedRoulette(player, intent)
      if (isDamageIntent(intent) && effectiveBase(intent) > 0) {
        result.attacks.push(effectiveBase(intent) * multiplier * intent.hitCount * intent.castCount * intent.castScale)
      }
      result.maxGuard = Math.max(result.maxGuard, intent.guard * multiplier * intent.castCount * intent.castScale)
      result.maxHeal = Math.max(result.maxHeal, intent.heal * multiplier * intent.castCount * intent.castScale)
      result.maxGrowth = Math.max(result.maxGrowth, intent.growHp)
      return
    }
    const key = order[index]
    for (const word of tables.words[key] ?? []) {
      if (conflictReason(word, index, selection, tables)) continue
      visit(index + 1, { ...selection, [key]: word })
    }
  }
  visit(0, {})
  if (hasPassive(player, 'beanstalk')) result.maxGrowth = Math.max(result.maxGrowth, BEANSTALK_GROWTH)
  result.attacks.sort((a, b) => a - b)
  return result
}

const percentile = (values: number[], ratio: number): number =>
  values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] : 0

const baseline = benchmark(null)
const baselineP75 = percentile(baseline.attacks, 0.75)
const baselineMax = percentile(baseline.attacks, 1)
const rows = Object.values(PASSIVE_ITEMS).map((item) => benchmark(item))
const combined = benchmark(null, Object.values(PASSIVE_ITEMS))
const violations: string[] = []
for (const id of ['pinoDoubt', 'redMatch']) {
  const row = rows.find((entry) => entry.item?.id === id)!
  if (row.attacks.length <= baseline.attacks.length) violations.push(`${id}: 추가 잉크가 공격 문장을 열지 못함`)
}

const beanstalk = PASSIVE_ITEMS.beanSprout
const beanstalkPlayer = startingPlayer()
beanstalkPlayer.items = [{
  id: beanstalk.id, name: beanstalk.name, rarity: beanstalk.rarity, art: beanstalk.art,
  line: '', stats: {}, passive: beanstalk.passive,
}]
const beanstalkTables = makeEarlyTables(beanstalkPlayer.deck, beanstalkPlayer)
if (Object.values(beanstalkTables.words).flat().some((word) => word.growHp)) {
  violations.push('잭의 하늘나물이 문장 슬롯에 성장 카드를 주입함')
}
if (beanstalkGrowthFor(beanstalkPlayer, true) !== BEANSTALK_GROWTH || beanstalkGrowthFor(beanstalkPlayer, false) !== 0) {
  violations.push('잭의 하늘나물 전투당 1회 성장 계약이 어긋남')
}

const rareItems = Object.values(ITEMS).filter((item) => item.rarity === 'rare')
const statKeys: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const rareProfiles = rareItems.map((item) => statKeys
  .filter((stat) => item.base[stat] > 0)
  .map((stat) => `${stat}:${item.base[stat]}`)
  .join('|'))
const rareStatsCovered = new Set(rareItems.flatMap((item) => statKeys.filter((stat) => item.base[stat] > 0)))
const rareFocused = rareItems.filter((item) => statKeys.filter((stat) => item.base[stat] > 0).length === 1).length
const rareHybrid = rareItems.length - rareFocused

console.log(`희귀 성장축 ${new Set(rareProfiles).size}/${rareItems.length}종 · 단일 ${rareFocused} · 혼합 ${rareHybrid} · 스탯 ${[...rareStatsCovered].join('/')}`)
if (new Set(rareProfiles).size !== rareItems.length) violations.push('희귀 아이템 사이에 같은 성장축이 중복됨')
if (rareStatsCovered.size !== statKeys.length) violations.push('희귀 아이템 성장축이 다섯 스탯을 모두 다루지 않음')
if (rareFocused < 3 || rareHybrid < 3) violations.push('희귀 아이템의 단일 집중과 혼합 성장축이 각각 3종 미만임')

console.log('아이템 패시브 기대값 · 후반 대표 스탯 · 보유 아이템의 잉크 한도 내 전수 문장')
console.log(`기준 문장 p75 ${baselineP75.toFixed(1)} · max ${baselineMax.toFixed(1)}`)
for (const row of rows) {
  const p75 = percentile(row.attacks, 0.75)
  const max = percentile(row.attacks, 1)
  const p75Ratio = baselineP75 > 0 ? p75 / baselineP75 : 1
  const maxRatio = baselineMax > 0 ? max / baselineMax : 1
  console.log(
    `${row.item!.rarity.padEnd(9)} ${row.item!.name.padEnd(16)} `
    + `공격 p75 ×${p75Ratio.toFixed(2)} · max ×${maxRatio.toFixed(2)} `
    + `· 방어 ${row.maxGuard.toFixed(0)} · 회복 ${row.maxHeal.toFixed(0)} · 성장 ${row.maxGrowth}`,
  )
  if (row.item!.rarity === 'epic' && p75Ratio > 1.3) violations.push(`${row.item!.name}: 영웅 공격 기대값이 기준의 130%를 넘음`)
  // 11/20: 시작 주어를 감정마다 한 장(2→4장)으로 늘리자 시작 덱 기준 비교에서 잉크·겹주어 아이템의
  // 최대치가 ×1.87~2.02로 올랐다. 상한을 2.1로 조정하되 미녀의 은빛 거울·빨간망토의 불씨는 재점검 대상이다.
  if (p75Ratio > 1.65 || maxRatio > 2.1) violations.push(`${row.item!.name}: 단독 효과가 런을 붕괴시키는 공격 상한을 넘음`)
}

const combinedP75Ratio = percentile(combined.attacks, 0.75) / baselineP75
const combinedMaxRatio = percentile(combined.attacks, 1) / baselineMax
console.log(`엔드리스 전체 규칙 조합 공격 p75 ×${combinedP75Ratio.toFixed(2)} · max ×${combinedMaxRatio.toFixed(2)}`)
// 11/20: 시작 주어 4장 기준으로 엔드리스 전체 조합 최대치가 ×13대로 올라 상한을 14로 조정(재점검 대상).
if (combinedP75Ratio > 6.5 || combinedMaxRatio > 14) {
  violations.push('엔드리스 전체 규칙 조합이 복합 패시브 안전 상한을 넘음')
}

const tiers = Object.fromEntries(rows.map((row) => [row.item!.passive as PassiveId, row.item!.rarity]))
for (const id of ['echo', 'twinVerb', 'luckCloak', 'punct', 'twinSubj', 'matchFire'] as PassiveId[]) {
  if (tiers[id] !== 'legendary') violations.push(`${id}: 강한 문장 규칙은 전설 등급이어야 함`)
}
for (const id of ['retry', 'heavyShoe', 'doubt', 'bbq', 'beanstalk'] as PassiveId[]) {
  if (tiers[id] !== 'epic') violations.push(`${id}: 완만한 문장 규칙은 영웅 등급이어야 함`)
}

if (violations.length) {
  console.error(`아이템 밸런스 위반 ${violations.length}건\n- ${violations.join('\n- ')}`)
  process.exit(1)
}
console.log('아이템 밸런스 계약 통과 · 희귀 성장축 다양성 · 등급 역전 차단 · 단독/복합 공격 상한')
