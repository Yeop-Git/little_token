import { comboLeads, compile } from '@core/compiler'
import { bossTurnPressureMultiplier, PART_WEAKNESS_MULT, rankedStat } from '@core/combatRules'
import { DECK_LIMITS, applyItemReward, emptyRunRecord, newRun, registerWord, reinforceGrows, reinforceWord, startingPlayer, type RunState } from '@core/run'
import { ECHO_REPEAT_SCALE, LUCK_CLOAK_RATE, TWIN_VERB_SCALE } from '@core/passives'
import { defaultPlayer } from '@core/player'
import { migrateCombatBalance } from '@core/save'
import type { EnemyDef, Intent, Word } from '@core/types'
import { wordValueLines } from '@core/wordText'
import { canCompleteSentence } from '@core/validator'
import { canAddItemWithoutLock, hasCompletableDeck, hasDirectAttackDeck, recoverBattleTables } from '@core/deckSafety'
import { wordInkCost } from '@core/ink'
import { CARD_POOL_RARITY_QUOTA } from '@core/budget'
import { ensureCardInInitialDraw } from '@core/hand'
import { ALL_REWARD_WORDS, EARLY_WORDS, REWARD_WORDS, makeEarlyTables, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES, QUEEN_ESCORT_IMMUNITY_LABEL, bossEliteRarityForDay, eliteRarityForEncounter, enemyDefForEncounter, enemyRarityWeightsForDay } from '@data/enemies'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
import { endlessCycleFor, floorInCycle, stageFor } from '@data/stages'
import { bossRewardRarity, genRewards, REWARD_PRICE, rewardGradeForDay, rewardOfferRng, rewardPrice, rewardRarityWeights, rewardRefreshCost } from '@data/rewards'
import { ALL_ITEMS, EXCLAIM_RARITY_BONUS, EXCLAIM_SLOTS, ITEM_BLESS_POOL, itemStatBudget, rollExclaimMultipliers } from '@data/items'
import { tacticalCardIdsForRewardDay, tacticalGuideForEnemy } from '@data/tacticalCards'
import {
  activeEnemyPart,
  applyIntent,
  predictSummonDefeats,
  previewIntentHits,
  applyOverkillTransfer,
  applyPendingAttack,
  applyPreparation,
  enemyAttackForecast,
  enemyTurn,
  engageFront,
  makeEnemy,
  playerGuardLimit,
  stateGuardLimit,
  spiderWebAtTurnStart,
  spiderSealSlotForTurn,
  spiderWebTension,
  summonAtTurnStart,
  summonCount,
  type BattleState,
} from '../sim/reference'
import { enemyDamageRange, enemySentenceFor } from '../sim/enemySentences'

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
// 일벌 규칙 검사는 호위가 선 상태에서 시작한다. 실제 여왕벌은 마지막 페이지에서야 부르므로
// (summonFromBar) 소환 시점 자체는 아래 전용 검사가 따로 본다.
const QUEEN_ESCORTED = { ...ENEMIES.queenBee, summonPattern: { ...ENEMIES.queenBee.summonPattern!, summonFromBar: undefined } }
const foe = (id: string, extra: Partial<EnemyDef> = {}): EnemyDef => ({ id, name: id, hp: 30, atk: 4, every: 2, initiative: 'second', sprite: 'enemy_moth', note: '', weakEmotion: null, ...extra })
const state = (enemies = [makeEnemy(foe('a'))]): BattleState => {
  if (enemies[0]) enemies[0].engaged = true
  return { playerHp: 30, playerMax: 30, guard: 0, counter: false, counterFull: false, turn: 1, enemies, pending: null }
}
const attack = (extra: Partial<Intent> = {}): Intent => ({ sentence: 'check', targetMode: 'enemy', aoe: 'single', targetCount: 1, kind: 'attack', preempt: false, base: 10, multiplier: 1, variance: null, timing: 'immediate', guard: 0, heal: 0, recoil: 0, evade: 0, pierceGuard: false, hitCount: 1, castCount: 1, castScale: 1, counter: false, magicShield: 0, guardAttackMultiplier: 0, overhealDamageMultiplier: 0, lifeStealRate: 0, attackRank: 0, guardRank: 0, emotions: [], emotionResonance: 1, tags: [], combos: [], coherence: 1, penalties: [], critP: 0, failP: 0, statKey: null, growHp: 0, doubtCount: 0, breakdown: { flats: [], mults: [] }, ...extra } as Intent);

{
  const player = startingPlayer()
  const base = makeEarlyTables(player.deck, player)
  const subject = { ...base.words.subj![0], id: 'cheap-subject', inkCost: 0 }
  const costlySubject = { ...subject, id: 'costly-subject', inkCost: 1 }
  const modifier = { ...base.words.adv![0], inkCost: 1 }
  const verb = { ...base.words.verb![0], inkCost: 3 }
  const tables = { ...base, template: { ...base.template, slots: [base.template.slots[0], { ...base.template.slots[0], key: 'subj2' }, ...base.template.slots.slice(1)] },
    words: { ...base.words, subj: [subject, costlySubject], subj2: [subject, costlySubject], adv: [modifier], verb: [verb] } }
  assert(canCompleteSentence(tables, {}, 5, () => false), 'two-subject sentence fits before its cheap card is sealed')
  assert(!canCompleteSentence(tables, {}, 5, (word) => word.id === subject.id), 'sealing the shared cheap subject cannot strand the sentence above its ink limit')
  assert(canCompleteSentence(tables, {}, 5, (word) => word.id === costlySubject.id), 'other cards may still be sealed when a complete sentence remains')
  const healingVerb = { ...base.words.verb!.find((word) => word.kind === 'heal')!, inkCost: 2 }
  const mixed = { ...tables, words: { ...tables.words, verb: [verb, healingVerb] } }
  const attacks = (selection: Record<string, Word | undefined>) => selection.verb?.kind === 'attack'
  assert(canCompleteSentence(mixed, {}, 5, () => false, attacks), 'an attack is possible before the cheap subject is sealed')
  assert(canCompleteSentence(mixed, {}, 5, (word) => word.id === subject.id), 'healing can remain possible even when offense is stranded')
  assert(!canCompleteSentence(mixed, {}, 5, (word) => word.id === subject.id, attacks), 'seal safety detects loss of every attack even if healing still fits')
}
{
  const cards = [{ id: 'sealed', usable: false }, { id: 'blocked', usable: false }, { id: 'valid', usable: true }]
  const restored = ensureCardInInitialDraw(cards, 2, (card) => card.usable)
  assert(restored.slice(0, 2).some((card) => card.id === 'valid'), 'revisited slot restores a usable card from its deck')
  assert(restored.map((card) => card.id).sort().join(',') === cards.map((card) => card.id).sort().join(','), 'restoring a card neither duplicates nor loses a card')
  assert(ensureCardInInitialDraw(cards, 2, (card) => card.id === 'sealed').map((card) => card.id).join(',') === cards.map((card) => card.id).join(','), 'an already playable hand keeps its order')
}
{
  const player = startingPlayer()
  assert(hasCompletableDeck(player) && hasDirectAttackDeck(player), 'starting deck can complete and attack without carried ink')
  for (const slot of ['subj', 'adv', 'verb']) {
    player.deck[slot] = ALL_REWARD_WORDS.filter((word) => word.slot === slot)
      .sort((a, b) => wordInkCost(b) - wordInkCost(a)).slice(0, DECK_LIMITS[slot])
  }
  for (const passive of ['twinSubj', 'twinVerb', 'punct'] as const) {
    player.items.push({ id: `safety-${passive}`, name: passive, rarity: 'legendary', art: '', line: '', stats: {}, passive })
  }
  assert(!hasCompletableDeck(player) && !hasDirectAttackDeck(player), 'expensive valid deck with three added slots is detected as unable to complete a sentence')
  const before = JSON.stringify(player)
  const tables = makeEarlyTables(player.deck, player)
  const recovered = recoverBattleTables(tables, player)
  assert(canCompleteSentence(recovered, {}, 5, () => false), 'a legacy blocked deck can complete a sentence with temporary loans')
  assert(Object.values(recovered.words).flat().some((word) => word.recoveryLoan), 'recovery cards are explicitly marked as borrowed')
  assert(JSON.stringify(player) === before, 'recovery never mutates or persists the player deck')
  const normal = startingPlayer()
  const normalTables = makeEarlyTables(normal.deck, normal)
  assert(recoverBattleTables(normalTables, normal) === normalTables, 'a playable deck receives no recovery cards')
  const healer = startingPlayer()
  const healingWord = healer.deck.verb.find((word) => word.kind === 'heal')!
  healer.deck.verb = [{ ...healingWord, effects: undefined }]
  const healingTables = makeEarlyTables(healer.deck, healer)
  const healingRecovery = recoverBattleTables(healingTables, healer)
  assert(healingRecovery !== healingTables && healingRecovery.words.verb!.some((word) => word.recoveryLoan && word.kind === 'attack'), 'a healing-only deck receives a temporary attack word')
  healer.deck.verb = [{ ...healingWord, effects: { ...healingWord.effects, overhealDamageMultiplier: 1 } }]
  const conversionTables = makeEarlyTables(healer.deck, healer)
  assert(recoverBattleTables(conversionTables, healer) === conversionTables, 'a valid overheal damage build is not treated as a stalled deck')
}
{
  const player = startingPlayer()
  const original = player.deck.subj[0]
  player.deck.subj = [original, ...Array.from({ length: 5 }, (_, i) => ({ ...original, id: `costly-${i}`, inkCost: 4 }))]
  for (const passive of ['twinSubj', 'twinVerb', 'punct'] as const) {
    player.items.push({ id: `protect-${passive}`, name: passive, rarity: 'legendary', art: '', line: '', stats: {}, passive })
  }
  player.deck.verb = player.deck.verb.map((word) => ({ ...word, inkCost: 1 }))
  const incoming = { ...original, id: 'incoming-costly', inkCost: 4 }
  assert(hasCompletableDeck(player), 'the cheap subject keeps the expanded deck playable')
  const choice = registerWord(player, incoming)
  assert(choice.kind === 'needs-discard' && !choice.candidates.some((card) => card.id === original.id), 'replacement protects a card required for any complete sentence')
  const rejected = registerWord(player, incoming, original.id)
  assert(rejected.kind === 'needs-discard' && player.deck.subj.some((card) => card.id === original.id), 'direct requests cannot discard a protected card')
  if (choice.kind === 'needs-discard') assert(choice.candidates.length > 0 && registerWord(player, incoming, choice.candidates[0].id).kind === 'added', 'a safe replacement still succeeds')
  assert(hasCompletableDeck(player), 'successful replacement leaves a complete sentence')
}
{
  const player = startingPlayer()
  player.deck.adv = player.deck.adv.map((word) => ({ ...word, inkCost: 1, effects: undefined }))
  // 같은 카드를 두 칸에 골라도 찍힌 비용만 내므로(숨은 +1 없음) 동사 비용으로 한도를 넘긴다.
  player.deck.verb = player.deck.verb.map((word) => ({ ...word, inkCost: 5 }))
  for (const passive of ['twinSubj', 'punct'] as const) {
    player.items.push({ id: `item-guard-${passive}`, name: passive, rarity: 'legendary', art: '', line: '', stats: {}, passive })
  }
  const twinVerb = Object.values(ALL_ITEMS).find((item) => item.passive === 'twinVerb')!
  assert(hasCompletableDeck(player), 'deck completes a sentence before a third expanded slot')
  assert(!canAddItemWithoutLock(player, twinVerb), 'slot-expanding item is rejected when it would prevent every sentence')
  for (let seed = 0; seed < 10; seed++) {
    const offers = genRewards(player, 10, 10, 'item', rewardOfferRng(seed, 'item', 0))
    assert(!offers.some((option) => option.item?.id === twinVerb.id), 'an unsafe expansion item is not offered as a reward')
  }
  assert(canAddItemWithoutLock(startingPlayer(), twinVerb), 'safe slot expansions remain available')
}
{ const player = startingPlayer(); assert(player.stats.hp === 52 && player.stats.guard === 3, 'new run starts at hp 52 and guard 3') }
{ const run = newRun(); assert(run.combat.hp === run.player.stats.hp && run.combat.guard === 0, 'new run starts with full current hp and no carried guard') }
{ const player = defaultPlayer(); assert(player.stats.hp === 52 && player.stats.guard === 3, 'battle fallback starts at hp 52 and guard 3') }
{
  const expectedBonus = { common: 0, rare: 1, epic: 2, legendary: 3 } as const
  const counts = { common: 0, rare: 0, epic: 0, legendary: 0 }
  for (const item of Object.values(ALL_ITEMS)) {
    counts[item.rarity]++
    const baseBudget = itemStatBudget(item.base)
    const expectedBaseBudget = item.rarity === 'common' ? 1 : item.rarity === 'rare' ? 2 : 0
    assert(baseBudget === expectedBaseBudget, `${item.name} keeps its ${expectedBaseBudget}-point base stat budget`)
    assert((item.rarity === 'epic' || item.rarity === 'legendary') === !!item.passive, `${item.name} passive matches rarity tier`)
  }
  for (const [rarity, bonus] of Object.entries(EXCLAIM_RARITY_BONUS)) {
    const multipliers = rollExclaimMultipliers(rarity as keyof typeof EXCLAIM_RARITY_BONUS, () => 0)
    assert(multipliers.reduce((sum, value) => sum + value, 0) === 3 + bonus, `${rarity} exclaim budget stays fixed`)
    assert(multipliers.every((value) => value >= 1), `${rarity} keeps at least one point on every exclaim choice`)
    assert(multipliers.reduce((sum, value) => sum + value - 1, 0) === expectedBonus[rarity as keyof typeof expectedBonus], `${rarity} exclaim rarity bonus stays fixed`)
  }
  assert(rollExclaimMultipliers('rare', () => 0).join(',') !== rollExclaimMultipliers('rare', () => 0.99).join(','), 'rare exclaim bonus can appear in different slots')
  assert(EXCLAIM_SLOTS.flatMap((slot) => slot.words).filter((choice) => choice.mods.atk).every((choice) => choice.mods.atk === 0.5), 'every regular attack exclaim follows the half-point item rule')
  assert(ITEM_BLESS_POOL.every((bless) => itemStatBudget({ [bless.stat]: bless.n }) === 1), 'every lucky exclaim grants exactly one item-budget point')
  assert(ECHO_REPEAT_SCALE === 0.5 && TWIN_VERB_SCALE === 0.5 && LUCK_CLOAK_RATE === 0.7, 'rule-item numeric contracts stay at echo 50%, twin verb 50%, and luck 70%')
  assert(Math.abs(counts.common - counts.rare) <= 1 && Math.abs(counts.epic - counts.legendary) <= 1, 'item rarities remain evenly distributed')
  const expectedPassiveTiers = {
    retry: 'epic', heavyShoe: 'epic', doubt: 'epic', bbq: 'epic', beanstalk: 'epic',
    echo: 'legendary', twinVerb: 'legendary', luckCloak: 'legendary', punct: 'legendary', twinSubj: 'legendary', matchFire: 'legendary',
  } as const
  for (const item of Object.values(ALL_ITEMS).filter((entry) => entry.passive)) {
    assert(item.rarity === expectedPassiveTiers[item.passive!], `${item.name} passive power matches its rarity tier`)
  }
}
{
  const player = startingPlayer()
  const item = { id: 'duplicate-contract', name: '중복 검사', rarity: 'common' as const, art: '', line: '', stats: { atk: 0.5 } }
  const attackBefore = player.stats.atk
  applyItemReward(player, item)
  applyItemReward(player, item)
  assert(player.items.filter((owned) => owned.id === item.id).length === 1 && player.stats.atk === attackBefore + 0.5, 'item acquisition boundary rejects duplicate stats and entries')
}
{
  const player = startingPlayer()
  player.items.push(...Object.values(ALL_ITEMS).map((item) => ({
    id: item.id, name: item.name, rarity: item.rarity, art: item.art, line: '', stats: {}, passive: item.passive,
  })))
  assert(genRewards(player, 10, 10, 'item', () => 0).length === 0, 'owned items never return as repeat stat purchases')
}
{
  const legacy = { player: { ...startingPlayer(), stats: { hp: 20, atk: 5, guard: 5, heal: 5, luck: 3 } }, day: 4, endless: false, endingSeen: false } as Omit<RunState, 'balanceVersion'>
  assert(migrateCombatBalance(legacy as RunState) && legacy.player.stats.hp === 52 && legacy.player.stats.guard === 3, 'legacy base stats migrate once')
  assert(!migrateCombatBalance(legacy as RunState) && legacy.player.stats.hp === 52 && legacy.player.stats.guard === 3, 'combat balance migration is idempotent')
}
{
  const legacy = {
    schemaVersion: 0,
    player: { ...startingPlayer(), stats: { hp: 68, atk: 5, guard: 9, heal: 5, luck: 3 } },
    combat: { hp: 68, guard: 0 },
    inspiration: 0,
    day: 9,
    record: emptyRunRecord(),
    balanceVersion: 0,
    endless: false,
    endingSeen: false,
    pendingEndingGrade: null,
    pendingEndingEarned: null,
    reward: null,
  }
  migrateCombatBalance(legacy)
  assert(legacy.player.stats.hp === 100 && legacy.player.stats.guard === 7, 'legacy growth survives combat balance migration')
}
{
  const stage = stageFor(5)
  const baseHit = Math.round(ENEMIES.mantis.atk * stage.atkMult)
  assert(startingPlayer().stats.hp > baseHit * 4, 'base hp survives four day-5 mantis baseline strikes')
  const heavy = ENEMIES.mantis.attackPattern!.find((step) => step.shatterGuard)!
  const plain = ENEMIES.mantis.attackPattern!.find((step) => !step.shatterGuard && (step.damageScale ?? 1) > 0)!
  const threeFailedCycles = Math.round(baseHit * (heavy.damageScale ?? 1)) * 3
    + Math.round(baseHit * (plain.damageScale ?? 1)) * 2
  assert(startingPlayer().stats.hp > threeFailedCycles, 'base hp survives three failed first-mantis gimmick cycles')
  assert(heavy.groggyDamageMult === 2.5, 'solving the first-mantis guard gimmick opens a decisive damage window and scheduled attack skip')
}

{ const s = state([makeEnemy(foe('shield', { magicShield: 2, hp: 20 }))]); const r = applyIntent(s, attack({ hitCount: 3 }), 1, 0); assert(r.hits[0].magicShieldBroken && r.hits[0].magicShieldRemaining === 1 && r.hits[1].magicShieldRemaining === 0 && r.hits[2].dmg === 10 && s.enemies[0].hp === 10 && r.text.includes('10(매직실드 막음) + 10(매직실드 막음) + 10 피해') && r.hits[0].shown === 10, 'layered magic shield and multihit log each applied hit') }
{ const s = state([makeEnemy(foe('scaled-multihit', { hp: 20 }))]); const r = applyIntent(s, attack({ castCount: 2, castScale: .65 }), 1, 0); assert(r.hits.map((hit) => hit.dmg).join(',') === '6,6' && s.enemies[0].hp === 8, 'scaled verb casts discard fractional damage per hit') }
{ const s = state([makeEnemy(foe('scaled-guard'))]); const r = applyPreparation(s, attack({ base: 0, kind: 'guard', guard: 10, castCount: 2, castScale: .65 }), 1); assert(r.guardGain === 13, 'scaled verb cast repeats guard at the same disclosed total power') }
{ const s = state(); const r = applyIntent(s, attack({ base: 10.5 }), 1.1, 0); assert(r.hits[0].dmg === 11 && s.enemies[0].hp === 19, 'fractional attack damage is floored before execution') }
{
  const battle = state()
  battle.playerHp = 28
  const result = applyIntent(battle, attack({ kind: 'heal', base: 0, heal: 10 }), 1, 0)
  assert(result.heal === 2 && battle.playerHp === 30 && result.text.includes('2 회복'), 'healing feedback and log show actual HP gained at the cap')
  const full = applyIntent(battle, attack({ kind: 'heal', base: 0, heal: 10 }), 1, 0)
  assert(full.heal === 0 && full.text.includes('0 회복'), 'full HP does not produce a false healing number')
}
{ const s = state([makeEnemy(foe('scaled-heal'))]); s.playerHp = 10; const r = applyIntent(s, attack({ base: 0, kind: 'heal', heal: 10, castCount: 2, castScale: .65 }), 1, 0); assert(r.heal === 13 && s.playerHp === 23, 'scaled verb cast repeats healing at the same disclosed total power') }
{
  const front = makeEnemy(foe('multihit-front', { hp: 15 }))
  const rear = makeEnemy(foe('multihit-rear', { hp: 10 }))
  const s = state([front, rear])
  const r = applyIntent(s, attack({ hitCount: 2 }), 1, 0)
  assert(r.killed.length === 1 && r.overflow === 5, 'multihit exposes the killing strike overkill')
  const transfer = applyOverkillTransfer(s, 1, r.overflow)
  assert(transfer.dealt === 5 && rear.hp === 5 && !rear.dead, 'multihit overkill reaches the rear enemy')
}
{
  const front = makeEnemy(foe('early-multihit-front', { hp: 5 }))
  const rear = makeEnemy(foe('early-multihit-rear', { hp: 20 }))
  const s = state([front, rear])
  const r = applyIntent(s, attack({ hitCount: 2 }), 1, 0)
  assert(r.hits.length === 3 && r.hits[1].transfer && r.hits[1].target === 1 && r.hits[1].dmg === 5, 'first hit finishes its pierce chain before the next hit')
  assert(r.hits[2].target === 1 && !r.hits[2].transfer && r.hits[2].dmg === 10 && rear.hp === 5 && r.overflow === 0, 'next multihit strikes the enemy where the chain stopped')
}
{
  const front = makeEnemy(foe('multihit-shield-front', { hp: 5 }))
  const rear = makeEnemy(foe('multihit-shield-rear', { hp: 20, magicShield: 1 }))
  const s = state([front, rear])
  const r = applyIntent(s, attack({ hitCount: 2 }), 1, 0)
  assert(r.hits[1].transfer && r.hits[1].magicShieldPierced && r.hits[1].dmg === 5 && rear.magicShield === 0 && r.hits[2].dmg === 10 && rear.hp === 5, 'overkill chain breaks the magic shield and lands, then the next hit lands')
}
{
  const front = makeEnemy(foe('range-front', { hp: 5 }))
  const middle = makeEnemy(foe('range-middle', { hp: 5 }))
  const rear = makeEnemy(foe('range-rear', { hp: 20 }))
  const s = state([front, middle, rear])
  const r = applyIntent(s, attack({ targetCount: 2 }), 1, 0)
  assert(r.killed.length === 2 && r.overflow === 7, 'range attack combines contiguous overkill into a chain')
  const transfer = applyOverkillTransfer(s, 2, r.overflow)
  assert(transfer.dealt === 7 && rear.hp === 13, 'range overkill reaches the next enemy')
}
{
  const shieldedFront = makeEnemy(foe('range-shield-front', { hp: 5, magicShield: 1 }))
  const rear = makeEnemy(foe('range-shield-rear', { hp: 5 }))
  const s = state([shieldedFront, rear])
  const r = applyIntent(s, attack({ base: 100, targetCount: 2 }), 1, 0)
  assert(r.hits[0].magicShieldBroken && shieldedFront.hp === 5, 'front magic shield erases the complete incoming hit')
  assert(rear.dead && r.overflow === 0, 'rear overkill cannot flow backward through a surviving shielded front enemy')
}
{ const s = state([makeEnemy(foe('guard', { guard: 8, hp: 20 }))]); const r = applyIntent(s, attack({ pierceGuard: true }), 1, 0); assert(r.hits[0].dmg === 10 && s.enemies[0].guard === 8, 'pierce guard') }
{ const s = state([makeEnemy(foe('magic-pierce', { magicShield: 1, hp: 20 }))]); const r = applyIntent(s, attack({ pierceGuard: true }), 1, 0); assert(r.hits[0].magicShieldBroken && r.hits[0].dmg === 0 && r.hits[0].shown === 10 && s.enemies[0].hp === 20 && s.enemies[0].magicShield === 0, 'pierce cannot bypass magic shield: full damage is computed but the shield eats it') }
{
  const shielded = makeEnemy(foe('overkill-shielded', { guard: 99, magicShield: 3, hp: 15 }))
  const s = state([shielded])
  const r = applyOverkillTransfer(s, 0, 20)
  assert(r.dealt === 15 && r.killed && r.overflow === 5 && r.magicShieldPierced && r.magicShieldRemaining === 2 && shielded.guard === 99, 'overkill transfer breaks one magic shield layer, ignores guard and keeps flowing')
}
{ const s = state([makeEnemy(foe('a')), makeEnemy(foe('b')), makeEnemy(foe('c'))]); const r = applyIntent(s, attack({ targetCount: 3 }), 1, 0); assert(r.hits.map((h) => h.dmg).join(',') === '10,7,5', 'three targets') }
{
  for (const intent of [
    attack({ kind: 'guard', base: 0, guardAttackMultiplier: 1 }),
    attack({ kind: 'heal', base: 0, heal: 10, overhealDamageMultiplier: 1 }),
  ]) {
    const battle = state([makeEnemy(foe('conversion-preview'))])
    battle.guard = 12
    const before = JSON.stringify(battle)
    const predicted = previewIntentHits(battle, intent, 1, 0)
    assert(JSON.stringify(battle) === before, 'resource conversion preview leaves live state untouched')
    const result = applyIntent(battle, intent, 1, 0)
    assert(predicted.join(',') === result.hits.map((hit) => hit.dmg).join(',') && predicted[0] > 0, 'resource conversion preview matches the applied hit')
  }
  for (const enemy of [foe('weak-preview', { weakEmotion: 'joy', hp: 30 }), foe('shield-preview', { magicShield: 1, hp: 30 }), QUEEN_ESCORTED]) {
    const battle = state([makeEnemy(enemy)])
    if (enemy.summonPattern) summonAtTurnStart(battle)
    const intent = attack({ emotions: ['joy'], targetCount: 2 })
    const before = JSON.stringify(battle)
    const predicted = previewIntentHits(battle, intent, 1, 0)
    assert(JSON.stringify(battle) === before, 'preview never changes the live battle')
    const actual = applyIntent(battle, intent, 1, 0)
    assert(predicted.join(',') === [...(actual.summonHits ?? []), ...actual.hits.map((hit) => hit.dmg)].join(','), 'preview hits equal applied hits for weaknesses, shields and escorts')
  }
}
{ const s = state([makeEnemy(foe('weak', { weakEmotion: 'joy', hp: 20 }))]); const r = applyIntent(s, attack({ emotions: ['joy'] }), 1, 0); assert(r.hits[0].dmg === 12 && r.text.includes('12 피해'), 'weak emotion and battle log use the same applied damage') }
{ const s = state([makeEnemy(foe('counter-no-shield'))]); s.counter = true; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 4 && r.counterHit?.dmg === 2 && s.counter, 'counter returns half of received damage without shield'); applyPreparation(s, attack(), 1); assert(!s.counter, 'counter expires when the next sentence turn begins') }
{ const s = state([makeEnemy(foe('counter-shield'))]); s.guard = 4; s.counter = true; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.absorbed === 4 && r.counterHit?.dmg === 2, 'an attack-action counter stays at half even when shield absorbs the hit') }
{ const s = state([makeEnemy(foe('mosquito', { pierceGuard: true }))]); s.guard = 7; s.counter = true; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.piercedGuard && r.dealt === 4 && r.absorbed === 0 && s.guard === 7 && r.counterHit?.dmg === 2, 'shield presence does not change an attack-action counter') }
{ const s = state([makeEnemy(foe('counter-guard'))]); applyPreparation(s, attack({ kind: 'guard', base: 0, guard: 4, counter: true }), 1); const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.counterHit?.dmg === 4 && s.counterFull, 'guard action returns all received damage regardless of shield') }
{ const s = state([makeEnemy(foe('counter-heal'))]); applyPreparation(s, attack({ kind: 'heal', base: 0, heal: 2, counter: true }), 1); const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 4 && r.counterHit?.dmg === 4 && s.counterFull, 'heal action returns all received damage without requiring shield') }
{ const s = state([makeEnemy(foe('guard-remains'))]); s.guard = 7; s.counter = true; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.absorbed === 4 && s.guard === 3 && s.counter, 'guard and counter remain through the rest of the current sentence turn'); applyPreparation(s, attack(), 1); assert(s.guard === 3 && !s.counter, 'a sentence without counter clears the previous turn counter') }
{ const s = state([makeEnemy(foe('guard-stacks'))]); s.guard = 3; const r = applyPreparation(s, attack({ guard: 5 }), 1); assert(r.guardGain === 5 && s.guard === 8, 'new guard stacks with remaining guard') }
{
  const s = state([makeEnemy(foe('magic-piercer', { pierceGuard: true }))])
  const prep = applyPreparation(s, attack({ kind: 'guard', base: 0, magicShield: 1 }), 1)
  const strike = enemyTurn(s, () => 0, 'second')[0]
  assert(prep.magicShieldGain === 1 && strike.magicShieldBroken && strike.dealt === 0 && s.playerMagicShield === 0, 'player magic shield blocks one guard-piercing enemy attack')
}
{
  const s = state([makeEnemy(foe('stored-resolve', { hp: 100 }))])
  s.guard = 20
  const r = applyIntent(s, attack({ guardAttackMultiplier: .75 }), 1, 0)
  assert(r.hits[0].dmg === 25 && s.guard === 20, 'stored resolve adds current guard damage without consuming guard')
}
{
  const s = state([makeEnemy(foe('fresh-guard-bash', { hp: 100 }))])
  const intent = attack({ kind: 'guard', base: 0, guard: 12, guardAttackMultiplier: 1 })
  const prep = applyPreparation(s, intent, 1)
  const r = applyIntent(s, intent, 1, 0)
  assert(prep.guardGain === 12 && s.guard === 12 && r.hits[0].dmg === 12, 'shield bash attacks from guard after the guard action')
}
{
  const s = state([makeEnemy(foe('overheal', { hp: 100 }))])
  s.playerMax = 100
  s.playerHp = 95
  const r = applyIntent(s, attack({ kind: 'heal', base: 0, heal: 10, overhealDamageMultiplier: 1 }), 1, 0)
  assert(s.playerHp === 100 && r.convertedDamage === 5 && r.hits[0].dmg === 5, 'healing resolves first and only the amount beyond max HP attacks')
}
{
  const modifier = REWARD_WORDS.find((word) => word.id === 'deulsseogimyeo')!
  const tables = makeEarlyTables({ subj: [EARLY_WORDS.subj[0]], adv: [modifier], verb: [EARLY_WORDS.verb.find((word) => word.kind === 'guard')!] })
  const intent = compile({ subj: tables.words.subj[0], adv: modifier, verb: tables.words.verb[0] }, tables, startingPlayer().stats)
  const s = state([makeEnemy(foe('modifier-guard-engine', { hp: 100 }))])
  applyPreparation(s, intent, intent.multiplier)
  const r = applyIntent(s, intent, intent.multiplier, 0)
  assert(intent.kind === 'guard' && s.guard > 0 && intent.guardRank === 3 && r.hits.length === 0, 'modifier cleanly raises guard by three ranks without adding a verb conversion')
}
{
  const s = state([makeEnemy(foe('lifesteal', { hp: 100 }))])
  s.playerMax = 100
  s.playerHp = 50
  const r = applyIntent(s, attack({ lifeStealRate: .5 }), 1, 0)
  assert(s.playerHp === 55 && r.lifeStolen === 5, 'lifesteal heals from actual HP damage dealt')
}
{
  const s = state([makeEnemy(foe('guard-cap'))])
  s.guard = 13
  const r = applyPreparation(s, attack({ guard: 10 }), 1)
  assert(playerGuardLimit(s.playerMax) === 15 && r.guardAttempted === 10 && r.guardGain === 2 && s.guard === 15, 'player guard is capped at half max hp and reports the applied gain')
  assert(playerGuardLimit(31) === 15, 'an odd max hp guard limit rounds down without exceeding half max hp')
}
{
  const s = state([makeEnemy(foe('guard-cap-stat'))])
  s.playerGuardStat = 3
  s.guard = 13
  const r = applyPreparation(s, attack({ guard: 10 }), 1)
  assert(stateGuardLimit(s) === 21 && playerGuardLimit(s.playerMax, 3) === 21 && r.guardGain === 8 && s.guard === 21, 'guard limit rises by two per guard stat point')
}
{
  const s = state([makeEnemy(foe('guard-bash-overflow', { hp: 100 }))])
  s.guard = 13
  const intent = attack({ kind: 'guard', base: 0, guard: 10, guardAttackMultiplier: 1 })
  const prep = applyPreparation(s, intent, 1)
  const r = applyIntent(s, intent, 1, 0)
  assert(prep.guardGain === 2 && s.guard === 15 && r.hits[0].dmg === 23 && (s.guardOverflow ?? 0) === 0, 'shield bash uses the guard total before the limit clamp, then the overflow is spent')
  const next = applyIntent(s, attack({ base: 0, guardAttackMultiplier: 1 }), 1, 0)
  assert(next.hits[0].dmg === 15, 'guard overflow does not carry into a later sentence')
}
{
  const s = state()
  applyPreparation(s, attack({ attackRank: 5, guardRank: 1 }), 1)
  assert(s.playerAttackRank === 3 && s.playerGuardRank === 1, 'player stat ranks cap at +3')
  assert(rankedStat(10, s.playerAttackRank ?? 0) === 17.5 && rankedStat(10, s.playerGuardRank ?? 0) === 12.5, 'ranked stats use the shared 25-percent stage curve')
}
{
  const s = state([makeEnemy(foe('forecast-pierce', { pierceGuard: true }))])
  s.guard = 20
  const preview = enemyAttackForecast(s, s.enemies[0])
  assert(preview.piercedGuard && preview.dealt.join(',') === '4,6' && preview.hpAfter.join(',') === '24,26', 'enemy forecast exposes guard piercing instead of subtracting stored guard')
  s.playerMagicShield = 1
  const shielded = enemyAttackForecast(s, s.enemies[0])
  assert(shielded.magicShieldBlocked && shielded.dealt.join(',') === '0,0' && shielded.hpAfter.join(',') === '30,30', 'enemy forecast applies magic shield before guard piercing')
}
{
  // 상한에 막혀 비축분이 0이어도 그 턴을 방어에 썼으므로 반격은 걸려 있어야 한다.
  const s = state([makeEnemy(foe('guard-cap-counter'))])
  s.guard = playerGuardLimit(s.playerMax)
  const r = applyPreparation(s, attack({ kind: 'guard', base: 0, guard: 10, counter: true }), 1)
  assert(r.guardGain === 0 && r.counter && r.counterFull && s.counter && s.counterFull, 'guard sentence still arms full counter at the guard cap')
}
{ const card: Word = { id: 'counter', text: '', slot: 'adv', tags: [], emotion: 'sorrow', effects: { counter: true }, note: '' }; reinforceWord(card); assert(card.effects?.counter, 'counter remains a fixed rule after reinforce') }
{ const card: Word = { id: 'cast', text: '', slot: 'adv', tags: [], emotion: 'anger', effects: { castCount: 2, castScale: .65 }, note: '' }; reinforceWord(card); assert(card.effects?.castScale === .7, 'repeat-cast reinforce') }
{ const card: Word = { id: 'scaled', text: '', slot: 'verb', tags: [], emotion: 'anger', stat: 'atk', statMult: 1, kind: 'attack', note: '' }; reinforceWord(card); assert(card.statMult === 1.15, 'stat-scaled verb reinforce') }
{
  // 도박 주어는 실패 배율(배율 풀)을 올리지 않고, 기대 배율이 일반 주어(+0.15)만큼 오르도록 고점을 올린다.
  for (const p of [.3, .44, .5, .55, .6, .75]) {
    const card: Word = { id: 'gamble', text: '', slot: 'subj', tags: [], emotion: 'joy', bonus: 0, variance: { p, hi: 2, lo: 1 }, note: '' }
    reinforceWord(card)
    const evGain = p * (card.variance!.hi - 2)
    assert(card.bonus === 0 && card.variance!.lo === 1, `gamble reinforce keeps the miss side at ×1 (p=${p})`)
    assert(Math.abs(evGain - .15) <= .03, `gamble reinforce raises expected multiplier like a flat subject (p=${p}, +${evGain.toFixed(3)})`)
  }
  // 키워드만 가진 수식어는 규칙은 그대로 두고 강화마다 배율 +0.10이 한 줄로 붙는다.
  const pierce: Word = { id: 'pierce', text: '', slot: 'adv', tags: [], emotion: 'anger', effects: { pierceGuard: true }, note: '' }
  assert(reinforceGrows(pierce), 'keyword-only adverb grows on reinforce')
  reinforceWord(pierce); reinforceWord(pierce)
  assert(pierce.bonus === .2 && pierce.effects?.pierceGuard && wordValueLines(pierce).some((line) => line.text.includes('1.20')), 'keyword-only adverb gains +0.10 multiplier per reinforce and shows it')
  const pierceSentence = compile({ subj: { id: 's', text: '', slot: 'subj', tags: [], emotion: 'joy', note: '' }, adv: pierce, verb: { id: 'v', text: '', slot: 'verb', tags: [], emotion: 'sorrow', stat: 'atk', statMult: 1, kind: 'attack', note: '' } }, { ...makeEarlyTables(), combos: [] }, startingPlayer().stats)
  assert(Math.abs(pierceSentence.multiplier - 1.2) < 1e-9, `reinforced keyword adverb multiplier reaches the sentence (${pierceSentence.multiplier})`)
  assert(reinforceGrows({ id: 'crit', text: '', slot: 'adv', tags: [], emotion: 'joy', crit: .3, note: '' }), 'crit adverb still grows on reinforce')
}
{ const s = state([makeEnemy(foe('delay', { hp: 20 }))]); applyIntent(s, attack({ timing: 'delayed', hitCount: 2, pierceGuard: true, emotions: ['anger'] }), 1, 0); const r = applyPendingAttack(s)!; assert(r.hits.length === 2 && s.enemies[0].hp === 0, 'delayed plan') }
{
  const boss = makeEnemy(foe('layered-stop', { boss: true, hp: 20 }), 1, 1, 3)
  const s = state([boss])
  const r = applyIntent(s, attack({ base: 39 }), 1, 0)
  assert(boss.maxHp === 60 && boss.hp === 40 && !boss.dead && r.hits[0].dmg === 20 && r.hits[0].barsBroken === 1, 'ordinary boss burst stops at the current health bar')
  assert(r.hits[0].barOverflow === 19 && !r.hits[0].barOverflowPassed, 'stopped boss overflow remains available for the hp-bar impact effect')
}
{
  const boss = makeEnemy(foe('layered-pass', { boss: true, hp: 20 }), 1, 1, 3)
  const s = state([boss])
  const r = applyIntent(s, attack({ base: 40 }), 1, 0)
  assert(boss.hp === 20 && !boss.dead && r.hits[0].dmg === 40 && r.hits[0].barsBroken === 2, 'a two-bar boss hit earns multi-bar penetration')
  assert(r.hits[0].barOverflow === 20 && r.hits[0].barOverflowPassed, 'penetrating boss overflow is exposed to the hp-bar effect')
}
{ const boss = makeEnemy(foe('phased', { boss: true, hp: 30, atk: 10 }), 1, 1, 3); const s = state([boss]); let r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'boss starts with attack1 and base damage'); boss.hp = 60; boss.nextAttackTurn = 1; r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 2 && r.dealt === 13, 'boss uses attack2 and x1.25 damage at two-thirds hp'); boss.hp = 30; boss.nextAttackTurn = 1; r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 3 && r.dealt === 15, 'boss uses attack3 and x1.5 damage at one-third hp') }
{
  const normal = makeEnemy(foe('normal-pressure', { atk: 10 }))
  const boss = makeEnemy(foe('boss-pressure', { boss: true, atk: 10 }))
  assert(bossTurnPressureMultiplier(normal, 30) === 1, 'long-fight pressure never applies outside boss stages')
  assert(bossTurnPressureMultiplier(boss, 6) === 1 && bossTurnPressureMultiplier(boss, 7) === 1.05, 'boss pressure starts after six grace turns')
  const s = state([boss])
  s.turn = 7
  const strike = enemyTurn(s, () => 0, 'second')[0]
  assert(strike.dealt === 11, 'boss attack damage rises with the current battle turn')
}
{
  const webBoss = makeEnemy(foe('web-pressure', {
    boss: true,
    atk: 100,
    attackPattern: [{ name: '거미줄 조이기', bonusAtk: 0, pierceGuard: true }],
    webPattern: { sealPerTurn: 1, maxSealedCards: 3 },
  }))
  const s = state([webBoss])
  s.turn = 10
  const strike = enemyTurn(s, () => 0, 'second')[0]
  assert(strike.dealt === 7, 'long-fight pressure raises the elder spider damage limit instead of being swallowed by it')
}
// 사마귀는 평타를 한두 번 쓴 뒤, 공격을 겸한 예고와 강타를 잇는다. 자세만 잡고 턴을
// 버리는 칸이 다시 생기지 않도록 모든 칸의 실제 피해와 예고→강타 순서를 함께 지킨다.
assert(ENEMIES.mantis.attackPattern?.map((step) => step.animationStage).join(',') === '1,2,3', 'mantis cycles one or two plain attacks, an attacking telegraph, then the heavy strike')
{
  const pattern = ENEMIES.mantis.attackPattern ?? []
  pattern.forEach((step, i) => {
    if (!step.shatterGuard) return
    const previous = pattern[(i - 1 + pattern.length) % pattern.length]
    assert((previous.damageScale ?? 1) > 0 && !!previous.telegraphText, 'mantis attacks while telegraphing before every guard-shattering strike')
  })
  assert(pattern.every((step) => (step.damageScale ?? 1) > 0), 'every mantis turn advances at least one damaging action')
}
{
  const modifiers = [...EARLY_WORDS.adv, ...REWARD_WORDS.filter((word) => word.slot === 'adv')]
  const orphaned = modifiers.filter((word) => comboLeads(word, makeEarlyTables().combos).length === 0)
  assert(orphaned.length === 0, `every standard modifier leads to a combo (${orphaned.map((word) => word.text).join(', ')})`)
}
assert([1, 2, 3, 4, 5, 6].map((turn) => spiderSealSlotForTurn(['subj', 'adv', 'verb'], turn)).join(',') === 'subj,adv,verb,subj,adv,verb', 'spider web seal rotates evenly across subject, modifier, and verb slots')
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, animationStage: 1, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, animationStage: 2, damageScale: .5, telegraphText: '준비' }, { name: '큰낫 내려베기', bonusAtk: 0, animationStage: 3, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 2.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-pattern', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .9, 0, 0]; const rng = () => rolls.shift() ?? 0; let r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 7 && r.animationStage === 1 && r.text.includes('평타') && mantis.attackPatternIndex === 1, 'mantis normal attack uses attack1 and can advance after one hit'); mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 4 && r.animationStage === 2 && r.telegraphText === '준비', 'mantis telegraph attacks while holding its distinct preparation stage'); mantis.hp = 20; mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 8 && r.animationStage === 3 && r.lifeStolen === 4 && mantis.hp === 24 && !r.groggyEntered, 'mantis strong attack uses attack3; failed defense takes 1.2x damage and lifesteal without groggy'); assert(mantis.nextAttackTurn === 3, 'failed defense leaves the attack schedule untouched'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'failed defense does not grant a vulnerability window') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, damageScale: 0, telegraphText: '준비' }]; const mantis = makeEnemy(foe('mantis-repeat', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .1, 0]; const rng = () => rolls.shift() ?? 0; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 0 && mantis.attackStepRepeated, 'mantis can randomly schedule a second normal attack'); mantis.nextAttackTurn = 1; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 1 && !mantis.attackStepRepeated, 'mantis normal attack repeats at most once before telegraphing') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-shatter', { atk: 7, attackPattern: pattern })); const s = state([mantis]); s.guard = 30; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardShattered && r.absorbed === 30 && r.dealt === 0 && r.lifeStolen === 0 && r.groggyEntered && s.guard === 0, 'successful defense erases guard, prevents 1.2x overflow and lifesteal, and opens groggy'); assert(mantis.nextAttackTurn === 5 && r.text.includes('다음 공격 한 턴 스킵'), 'groggy pushes the scheduled attack a full cycle and says so'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'successful defense grants the groggy damage window'); s.turn = 3; assert(enemyTurn(s, () => 0, 'second').length === 0, 'the groggy mantis skips the attack it was due to make') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-first-groggy', { atk: 7, initiative: 'first', attackPattern: pattern })); const s = state([mantis]); s.guard = 11; const r = enemyTurn(s, () => 0, 'first')[0]; assert(r.guardRequired === 11 && r.groggyEntered && mantis.groggyUntilTurn === 1, 'visible guard requirement opens first-phase groggy only when fully met'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'first-phase groggy boosts the immediate main action'); assert(mantis.nextAttackTurn === 5, 'first-phase groggy also skips one scheduled attack'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'first-phase groggy does not grant a second boosted turn'); s.turn = 3; assert(enemyTurn(s, () => 0, 'second').length === 0, 'the first-phase groggy mantis also skips the attack it was due to make') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-short-guard', { atk: 7, attackPattern: pattern })); mantis.hp = 20; const s = state([mantis]); s.guard = 5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardRequired === 11 && !r.guardShattered && r.absorbed === 5 && r.dealt === 3 && r.lifeStolen === 2 && !r.groggyEntered, 'insufficient guard absorbs normally but does not open groggy') }
{ const regular = makeEnemy(foe('unphased', { hp: 30, atk: 10 })); regular.hp = 1; const r = enemyTurn(state([regular]), () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'regular enemy damage does not scale with low hp') }
{ const queen = makeEnemy(foe('queen-summon', { atk: 10, summonPattern: { name: '일벌', sprite: 'enemy_worker_bee', perTurn: 1, max: 4, maxPerSide: 2, attackBonusPerUnit: .5, releaseAt: 4 } })); const s = state([queen]); summonAtTurnStart(s); summonAtTurnStart(s); assert(queen.summonsLeft === 1 && queen.summonsRight === 0, 'queen summons only once at the same turn start'); s.turn = 2; summonAtTurnStart(s); s.turn = 3; summonAtTurnStart(s); s.turn = 4; summonAtTurnStart(s); assert(queen.summonsLeft === 2 && queen.summonsRight === 2, 'queen alternates summons up to two workers per side'); queen.nextAttackTurn = 1; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 12 && r.summonsReleased === 4 && summonCount(queen) === 0, 'four workers add only two damage then all leave on swarm charge') }
{
  for (const [damage, targets, pierce] of [[29, 2, false], [30, 1, true], [40, 2, false], [60, 'all', false]] as const) {
    const queen = makeEnemy(QUEEN_ESCORTED)
    const battle = state([queen])
    summonAtTurnStart(battle)
    queen.summonHpRight[queen.summonHpRight.length - 1] = 9
    const hpBefore = queen.summonHpRight.join(',')
    const predicted = predictSummonDefeats(queen, damage, targets, pierce)
    assert(queen.summonHpRight.join(',') === hpBefore, 'escort prediction must not mutate battle state')
    const actual = applyIntent(battle, attack({ base: damage, targetCount: targets, pierceGuard: pierce }), 1, 0)
    assert(predicted === actual.summonsDispersed, `escort prediction matches actual defeats: ${damage}/${targets}/${pierce}`)
  }
}
{ const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 3, 'a 30-damage single-target attack defeats one full-health worker'); r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonsDispersed === 2 && summonCount(queen) === 1, 'a two-target attack carries its damage through two reachable workers'); r = applyIntent(s, attack({ base: 30, targetCount: 'all', aoe: 'all' }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 0, 'an all-target attack can reach the final worker') }
{
  const queen = makeEnemy(QUEEN_ESCORTED)
  const s = state([queen]); summonAtTurnStart(s)
  const focused = applyIntent(s, attack({ base: 30, emotions: ['anger'] }), 1, 0)
  assert(focused.summonsDispersed === 1 && focused.summonFocusedBacklash && focused.summonBacklashDamage === 6, 'anger single-target worker defeat doubles queen backlash')
  const wide = applyIntent(s, attack({ base: 60, targetCount: 2, emotions: ['anger'] }), 1, 0)
  assert(wide.summonsDispersed === 2 && !wide.summonFocusedBacklash && wide.summonBacklashDamage === 6, 'wide anger attack keeps normal backlash while progressing faster toward groggy')
  assert(QUEEN_ESCORT_IMMUNITY_LABEL === '호위 중: 본체 무적' && ENEMIES.queenBee.note.includes(QUEEN_ESCORT_IMMUNITY_LABEL), 'queen escort immunity uses the required visible copy')
}
{ const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s); const r = applyIntent(s, attack({ base: 17 }), 1, 0); assert(r.summonDamage === 17 && r.summonsDispersed === 0 && queen.summonHpRight[queen.summonHpRight.length - 1] === 13 && summonCount(queen) === 4, 'partial damage remains on the front worker and keeps its health bar visible') }
{
  const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s)
  const r = applyIntent(s, attack({ base: 11, pierceGuard: true }), 1, 0)
  assert(r.summonDamage === 22 && r.summonsDispersed === 0 && queen.summonHpLeft.join(',') === '30,19' && queen.summonHpRight.join(',') === '30,19', 'partial piercing damage reaches two different workers')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s)
  queen.summonHpRight[1] = 5
  const r = applyIntent(s, attack({ base: 20, targetCount: 2 }), 1, 0)
  assert(r.summonsDispersed === 1 && queen.summonHpRight.join(',') === '30' && queen.summonHpLeft.join(',') === '30,16', 'wide damage moves to a distinct worker after a partial-health kill and applies falloff')
}
{ const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1; const hp = queen.hp; const r = applyIntent(s, attack({ base: 120, targetCount: 1, pierceGuard: true }), 1, 0); assert(r.summonsDispersed === 2 && r.summonDamage === 60 && r.summonBacklashDamage === 6 && r.hits.length === 1 && r.hits[0].summonShieldBlocked && queen.hp === hp - 6 && !r.summonGroggyTriggered && queen.summonsDefeated === 2, 'single-target pierce reaches exactly two workers and the surviving escort blocks its remaining damage'); assert(queen.nextAttackTurn === 1 && queen.groggyUntilTurn === 0 && queen.summonRespawnTurn === 1, 'a partial piercing clear does not open queen recovery') }
{ const t = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'queenBee'); assert(t.words.verb.some((word) => word.id === 'queenBeeTactic' && word.targetCount === 2), 'queen encounter lends a two-target tactic') }
// ── 보스 전용 공략 단어 세 장 ──
// 전용이라는 말은 두 가지를 뜻한다. 그 보스에서만 손에 들어오고, 어떤 보상으로도
// 덱에 남지 않는다. 값은 전부 조건부라 "언제 쓰는가"를 읽어야 커진다.
{
  const tactics = ['mantisTactic', 'queenBeeTactic', 'elderSpiderTactic']
  for (const [enemyId, id] of [['mantis', 'mantisTactic'], ['queenBee', 'queenBeeTactic'], ['elderSpider', 'elderSpiderTactic']] as const) {
    const t = tablesForEncounter(makeEarlyTables(EARLY_WORDS), enemyId)
    const lent = t.words.verb.filter((word) => tactics.includes(word.id))
    assert(lent.length === 1 && lent[0].id === id, `${enemyId} lends exactly its own tactic word`)
  }
  const plain = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'roach')
  assert(!plain.words.verb.some((word) => tactics.includes(word.id)), 'ordinary encounters lend nothing')
  assert(!ALL_REWARD_WORDS.some((word) => tactics.includes(word.id)), 'boss tactic words never enter the reward pool')
}
{
  const tables = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'queenBee')
  const tactic = tables.words.verb.find((word) => word.id === 'queenBeeTactic')!
  assert(tactic.statMult === 1.5 && tactic.targetCount === 2 && !tactic.effects, 'queen tactic is a plain strong two-target attack')
}
{
  const tables = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'mantis')
  const tactic = tables.words.verb.find((word) => word.id === 'mantisTactic')!
  assert(tactic.kind === 'guard' && tactic.stat === 'guard' && tactic.statMult === 4 && tactic.inkCost === 3, 'mantis tactic leaves room for a starting modifier')
  const intent = compile({ subj: tables.words.subj[0], adv: tables.words.adv[0], verb: tactic }, tables, { atk: 1, guard: 3, heal: 1, luck: 0 })
  assert(intent.guard === 12 && intent.base === 0, 'mantis tactic builds guard instead of dealing unexplained conditional damage')
}
{
  const tables = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'elderSpider')
  const tactic = tables.words.verb.find((word) => word.id === 'elderSpiderTactic')!
  assert(!tactic.effects?.hitCount && tactic.statMult === 1.5 && tactic.tags.includes('adapt'), 'spider tactic uses a strong single hit and always counts as the current weakness')
}
{ const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(!r.summonGroggyTriggered && queen.summonsDefeated === 2, 'queen worker defeats accumulate between sentences'); s.turn = 2; summonAtTurnStart(s); queen.nextAttackTurn = 2; r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonGroggyTriggered && queen.summonsDefeated === 0 && queen.nextAttackTurn === 3 && queen.summonRespawnTurn === 4, 'the fourth cumulative worker opens a recovery turn before the next wave') }
{ const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s); applyIntent(s, attack({ base: 999, targetCount: 'all' }), 1, 0); assert(summonCount(queen) === 0, 'an area sentence clears the whole escort'); for (let turn = 2; turn <= 6; turn++) { s.turn = turn; summonAtTurnStart(s) } assert(summonCount(queen) === 0 && queen.summonWaves === 1, 'queen workers do not respawn after the first wave is cleared') }
{
  const queen = makeEnemy(QUEEN_ESCORTED)
  const s = state([queen]); summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'queen opens with a complete four-worker wave')
  const hp = queen.hp
  let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0)
  assert(r.summonsDispersed === 1 && r.summonBacklashDamage === 3 && queen.hp === hp - 3, 'each defeated worker deals direct backlash through body immunity')
  assert(r.hits.length === 0 && summonCount(queen) === 3, 'damage spent on a worker is not duplicated onto the immune queen body')
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 3, 'a partially defeated worker wave does not refill')
  r = applyIntent(s, attack({ base: 60, targetCount: 1, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 2 && summonCount(queen) === 1 && r.hits.length === 0 && queen.hp === hp - 9, 'pierce carries through reachable workers but does not duplicate spent damage onto the body')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED)
  const s = state([queen]); summonAtTurnStart(s)
  for (let defeated = 1; defeated <= 4; defeated++) {
    const r = applyIntent(s, attack({ base: 30 }), 1, 0)
    assert(r.summonsDispersed === 1 && summonCount(queen) === 4 - defeated, `worker ${defeated}/4 falls without changing the rest of the wave`)
    assert(r.summonGroggyTriggered === (defeated === 4), 'queen enters groggy only when the original four-worker wave is completely defeated')
    if (defeated < 4) {
      s.turn++
      summonAtTurnStart(s)
      assert(summonCount(queen) === 4 - defeated, 'queen never refills a partially defeated worker wave')
    }
  }
  s.turn++
  summonAtTurnStart(s)
  assert(summonCount(queen) === 0 && enemyTurn(s, () => 0, 'second').length === 0, 'queen spends exactly one full turn recovering after all four workers fall')
  s.turn++
  summonAtTurnStart(s)
  assert(summonCount(queen) === 0, 'queen recovers but never resummons workers after the first wave falls')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED, 1, 1, 3)
  const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1
  const hp = queen.hp
  const r = applyIntent(s, attack({ base: 150, targetCount: 2, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 4 && r.summonBacklashDamage === 35 && r.summonGroggyTriggered, 'two-target pierce clears the complete worker wave and opens groggy')
  assert(r.summonDamage === 120 && r.hits[0].dmg === 23 && queen.hp === hp - 58, 'worker backlash and the x2.5 groggy strike together break the current body bar')
  assert(queen.nextAttackTurn === 2 && queen.groggyUntilTurn === 2, 'worker-wave groggy skips the imminent queen attack for one turn')
  s.turn = 2; summonAtTurnStart(s)
  assert(applyIntent(structuredClone(s), attack({ base: 10 }), 1, 0).hits[0].dmg === 25, 'the queen recovery turn really takes the advertised x2.5 damage')
  assert(summonCount(queen) === 0 && enemyTurn(s, () => 0, 'second').length === 0, 'queen spends the whole next turn recovering without summoning or attacking')
  s.turn = 3; summonAtTurnStart(s)
  assert(summonCount(queen) === 0, 'queen does not summon a fresh wave after recovery')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); s.guard = 99
  summonAtTurnStart(s); queen.nextAttackTurn = 1
  const r = enemyTurn(s, () => 0, 'second')[0]
  assert(r.piercedGuard && r.absorbed === 0 && s.guard === 99, 'queen attack pierces player guard while a worker escort survives')
}
// 10층에 도착한 플레이어의 실제 최대 체력(시작 20 + 아홉 층의 아이템 보상)을 기준으로 잰다.
// 픽스처 기본값 30은 1층 언저리 수치라 중간 보스의 한 방 판정 기준이 되지 못한다.
{ const stage = stageFor(10); const queen = makeEnemy(QUEEN_ESCORTED, stage.atkMult, stage.hpMult, stage.bossHealthBars); const s = state([queen]); s.playerHp = s.playerMax = 52; summonAtTurnStart(s); const r = enemyTurn(s, () => .999, 'second')[0]; assert(r.dealt < s.playerMax * .3 && queen.nextAttackTurn === 2, 'day-10 queen trades the old three-turn spike for a disclosed low-power action every turn') }
{
  // 11/20 피드백: 여왕벌은 혼자 싸우다가 마지막 페이지에 들어선 다음 턴에 일벌 넷을 한 번만 부른다.
  const stage = stageFor(10)
  const queen = makeEnemy(ENEMIES.queenBee, stage.atkMult, stage.hpMult, stage.bossHealthBars)
  const s = state([queen])
  assert(queen.healthBars >= 2, 'day-10 queen has at least two health pages')
  summonAtTurnStart(s)
  assert(summonCount(queen) === 0 && queen.summonWaves === 0, 'queen starts the fight without workers')
  const hp = queen.hp
  const r = applyIntent(s, attack({ base: queen.hpPerBar + 5, targetCount: 1, pierceGuard: true }), 1, 0)
  assert(queen.hp < hp && !r.hits.some((hit) => hit.summonShieldBlocked), 'early-page damage reaches the queen body directly')
  applyIntent(s, attack({ base: 9999, targetCount: 1, pierceGuard: true }), 1, 0)
  assert(queen.hp === queen.hpPerBar, 'a hit cannot skip past the last page before the workers arrive')
  {
    const probe = structuredClone(s)
    applyIntent(probe, attack({ base: 9999, targetCount: 1, pierceGuard: true }), 1, 0)
    assert(!probe.enemies[0].dead && probe.enemies[0].hp === 1, 'more damage on the last page keeps the queen alive until the workers are called')
  }
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 4 && queen.summonWaves === 1, 'entering the last page summons four workers at the next turn start')
  applyIntent(s, attack({ base: 35, targetCount: 'all', aoe: 'all' }), 1, 0)
  for (let turn = 3; turn <= 8; turn++) { s.turn = turn; summonAtTurnStart(s) }
  assert(summonCount(queen) === 0 && queen.summonWaves === 1 && !queen.dead, 'last-page workers come only once')
}
assert(ENEMIES.queenBee.every === 1 && ENEMIES.elderSpider.every === 1, 'queen bee and elder spider always have a direct action available each turn outside explicit groggy skips')
// 모여든 호위가 한꺼번에 덤비면 방패 위로 넘어온다 — 방어로 버티는 길을 막아
// "모이기 전에 넓게 흩어 놓는다"만 답으로 남긴다.
{
  const queen = makeEnemy(foe('queen-swarm', { atk: 10, summonPattern: { name: '일벌', sprite: 'enemy_worker_bee', perTurn: 2, max: 4, maxPerSide: 2, attackBonusPerUnit: 1.5, releaseAt: 4 } }))
  const s = state([queen]); s.guard = 30
  summonAtTurnStart(s); s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'two-per-turn summons fill the escort ring in two turns')
  queen.nextAttackTurn = 1
  const r = enemyTurn(s, () => 0, 'second')[0]
  assert(r.summonsReleased === 4 && r.piercedGuard && r.dealt === 16 && r.absorbed === 0 && s.guard === 30, 'swarm charge pierces player guard instead of being absorbed')
  queen.nextAttackTurn = 1
  const plain = enemyTurn(s, () => 0, 'second')[0]
  assert(!plain.piercedGuard && plain.dealt === 0 && plain.absorbed === 10, 'a queen strike without a full escort ring is still blockable')
}
// 장로거미는 거미줄 공격만 방패를 넘어 오고, 다음 앞다리 공격은 방어로 막힌다.
{
  const stage = stageFor(15)
  // 본편 첫 장로거미는 밸런스 배율상 상한보다 약하므로, 상한 자체를 검증할 때는
  // 충분히 큰 원시 공격력을 주어 반드시 제한선에 닿게 한다.
  const spider = makeEnemy({ ...ENEMIES.elderSpider, atk: 200 }, stage.atkMult, stage.hpMult, stage.bossHealthBars)
  const s = state([spider]); s.playerHp = s.playerMax = 100; s.guard = 10000
  const r = enemyTurn(s, () => .999, 'first')[0]
  assert(r.piercedGuard && r.absorbed === 0 && s.guard === 10000, 'spider web goes over the shield instead of consuming it')
  assert(r.dealt === 20 && s.playerHp === 80, 'a single spider strike is capped at a fifth of max hp')
  s.turn = spider.nextAttackTurn
  const plain = enemyTurn(s, () => .999, 'second')[0]
  assert(!plain.piercedGuard && plain.dealt === 0 && plain.absorbed > 20 && s.guard < 10000, 'spider foreleg sweep is blockable and consumes guard normally')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 5)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  assert(spider.parts.length === 5 && spider.healthBars === 5 && activeEnemyPart(spider)?.def.id === 'leg-joy', 'spider starts with four sequential legs and one body')
  let web = spiderWebAtTurnStart(s)!
  assert(web.tension === 1 && spiderWebAtTurnStart(s) === null, 'spider web advances once per turn')
  let r = applyIntent(s, attack({ base: 50, emotions: ['joy'] }), 1, 0)
  assert(r.hits[0].weak && r.hits[0].dmg === spider.hpPerBar && r.hits[0].barsBroken === 1, 'active spider leg weakness grants x2 and drops one leg without displaying damage beyond the part hp')
  assert(r.hits[0].webBurst && r.hits[0].tensionReduced === 1 && spiderWebTension(spider) === 0, 'dropping one spider health bar blows away every web layer')
  assert(activeEnemyPart(spider)?.def.id === 'leg-anger', 'next leg reveals a different weakness after the current leg drops')
  r = applyIntent(s, attack({ base: 10, emotions: ['joy'] }), 1, 0)
  assert(!r.hits[0].weak && r.hits[0].dmg === 10, 'old spider weakness no longer applies to the next leg')
  // 약점을 빗나간 문장은 아무리 세도 지금 다리에서 멈춘다. 강한 문장 하나가
  // 다리 둘을 한꺼번에 끊으면 남은 약점이 드러날 순서를 잃는다.
  r = applyIntent(s, attack({ base: 900, emotions: ['joy'] }), 1, 0)
  assert(!r.hits[0].weak && r.hits[0].dmg === spider.hpPerBar - 10 && r.hits[0].barsBroken === 1 && activeEnemyPart(spider)?.def.id === 'leg-sorrow', 'a missed weakness displays only the remaining current-leg hp and stops before the next leg')
  assert(spider.parts[2].hp === spider.parts[2].maxHp, 'the leg behind the current one keeps full health when the weakness was missed')
  s.turn = 2
  web = spiderWebAtTurnStart(s)!
  s.turn = 3
  web = spiderWebAtTurnStart(s)!
  assert(web.tension === 2 && spiderWebTension(spider) === 2, 'unchecked card seals accumulate between turns')
  s.turn = 4
  web = spiderWebAtTurnStart(s)!
  assert(web.tension === 3, 'spider web seals stop at the configured three-card maximum')
  s.turn = 5
  web = spiderWebAtTurnStart(s)!
  assert(web.tension === 3, 'spider web pressure does not grow past the card-seal maximum')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 5)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  let r = applyIntent(s, attack({ base: 900, emotions: ['joy'] }), 1, 0)
  assert(r.hits[0].weak && r.hits[0].dmg === spider.hpPerBar && r.hits[0].barsBroken === 1 && activeEnemyPart(spider)?.def.id === 'leg-anger', 'weakness alone displays one applied leg and stops after it')
  r = applyIntent(s, attack({ base: 900, emotions: ['anger'], combos: ['완벽한 맥락'] }), 1, 0)
  assert(r.hits[0].weak && r.hits[0].dmg === spider.hpPerBar * 4 && r.hits[0].barsBroken === 4 && spider.dead, 'weakness plus a named combo displays and applies all four penetrated parts')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 5)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  let transfer = applyOverkillTransfer(s, 0, spider.maxHp * 2, { emotions: ['anger'], comboMatched: true })
  assert(transfer.dealt === spider.hpPerBar && !transfer.killed && activeEnemyPart(spider)?.def.id === 'leg-anger', 'overkill transfer without the active weakness stops at the current spider part')
  transfer = applyOverkillTransfer(s, 0, spider.maxHp * 2, { emotions: ['anger'], comboMatched: true })
  assert(transfer.killed && spider.dead, 'overkill transfer crosses remaining spider parts only with the active weakness and a named combo')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 99)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  const weaknesses = ['joy', 'anger', 'sorrow', 'pleasure'] as const
  assert(spider.healthBars === 5 && spider.maxHp === spider.hpPerBar * 5, 'spider parts fix total health to five bars')
  // 다리 하나를 겨우 넘기는 위력. 막당 체력을 다시 잡아도 검사가 따라오도록 계산해 둔다.
  const breakOneLeg = Math.ceil((spider.hpPerBar + 1) / PART_WEAKNESS_MULT)
  for (const weakness of weaknesses) {
    assert(activeEnemyPart(spider)?.def.weakness?.value === weakness, `spider reveals ${weakness} weakness in sequence`)
    const r = applyIntent(s, attack({ base: breakOneLeg, emotions: [weakness] }), 1, 0)
    assert(r.hits[0].weak && r.hits[0].barsBroken === 1, `spider ${weakness} leg takes weakness damage and breaks`)
  }
  assert(activeEnemyPart(spider)?.def.id === 'body' && !activeEnemyPart(spider)?.def.weakness, 'spider body is the fifth and weakness-free health bar')
  const bodyHit = applyIntent(s, attack({ base: 1, emotions: ['pleasure'] }), 1, 0)
  assert(!bodyHit.hits[0].weak && bodyHit.hits[0].dmg === 1, 'spider body receives no weakness multiplier')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 5)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  spiderWebAtTurnStart(s)
  s.turn = 2
  spiderWebAtTurnStart(s)
  s.turn = 3
  spiderWebAtTurnStart(s)
  const r = applyIntent(s, attack({ base: 1, emotions: ['anger', 'anger'] }), 1, 0)
  assert(r.hits[0].barsBroken === 0 && !r.hits[0].weak, 'emotion burst test does not accidentally break or match the active leg')
  assert(!r.hits[0].webBurst && r.hits[0].tensionReduced === 0, 'emotion resonance alone does not clear card seals')
  assert(spiderWebTension(spider) === 3, 'only a matching weakness or a broken leg releases spider seals')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 5)
  const s = state([spider])
  spiderWebAtTurnStart(s)
  s.turn = 2
  spiderWebAtTurnStart(s)
  const hpBefore = spider.hp
  let r = applyIntent(s, attack({ kind: 'guard', base: 0, guard: 8, emotions: ['joy'] }), 1, 0)
  assert(r.hits.length === 0 && r.supportWebCut?.tensionReduced === 1 && spiderWebTension(spider) === 1, 'matching-weakness guard releases one spider card seal without dealing damage')
  r = applyIntent(s, attack({ kind: 'heal', base: 0, heal: 6, emotions: ['joy'] }), 1, 0)
  assert(r.hits.length === 0 && r.supportWebCut?.tensionReduced === 1 && spiderWebTension(spider) === 0, 'matching-weakness heal releases one spider card seal without dealing damage')
  assert(spider.hp === hpBefore && activeEnemyPart(spider)?.def.id === 'leg-joy', 'support weakness cuts neither damage nor break the active spider leg')
}

const regularEnemyIds = ['termite', 'moth', 'flea', 'roach', 'pillbug', 'mosquito']
assert(Object.keys(ENEMIES).filter((id) => !ENEMIES[id].boss).join(',') === regularEnemyIds.join(','), 'six-enemy regular roster')
assert(regularEnemyIds.every((id) => ENEMIES[id].every === 1), 'every regular enemy attacks once per turn')
{
  const first = makeEnemy(ENEMIES.termite)
  const arriving = makeEnemy(ENEMIES.moth)
  const s = state([first, arriving])
  first.dead = true
  s.turn = 4
  engageFront(s)
  assert(arriving.engaged && arriving.nextAttackTurn === 5, 'an arriving regular enemy waits through its arrival turn')
  assert(enemyTurn(s, () => 0, 'second').length === 0, 'an arriving regular enemy does not attack immediately')
  s.turn = 5
  assert(enemyTurn(s, () => 0, 'second').length === 1, 'an arrived regular enemy starts attacking on the next turn')
}
assert(ENEMIES.termite.initiative === 'second' && !ENEMIES.termite.guard && !ENEMIES.termite.magicShield && !ENEMIES.termite.pierceGuard, 'termite has no ability')
assert(ENEMIES.moth.initiative === 'second' && !ENEMIES.moth.guard && !ENEMIES.moth.magicShield && !ENEMIES.moth.pierceGuard, 'moth has no ability')
assert(ENEMIES.flea.initiative === 'first', 'flea strikes first')
assert((ENEMIES.roach.guard ?? 0) > 0, 'roach starts with guard')
assert((ENEMIES.pillbug.magicShield ?? 0) > 0, 'pillbug starts with magic shield')
assert(tacticalGuideForEnemy('termite', undefined, { floor: 1, endlessCycle: 0 })?.title === '공격으로 체력 깎기', 'first floor teaches attack damage instead of shield bash')
assert(tacticalGuideForEnemy('moth', undefined, { floor: 1, endlessCycle: 0 })?.title === '공격으로 체력 깎기', 'every first-floor enemy shows the attack damage tip')
assert(tacticalGuideForEnemy('termite', undefined, { floor: 1, endlessCycle: 1 }) === undefined, 'termite has no ability, so no shield-bash tip is attached to it')
assert(tacticalGuideForEnemy('roach', undefined, { floor: 1, endlessCycle: 1 })?.title === '관통 수식어', 'endless floor one keeps the normal enemy tactic')
assert(ENEMIES.mosquito.pierceGuard, 'mosquito pierces player guard')
const stagedRegularEnemies = new Set<string>()
for (let day = 1; day <= 8; day++) {
  const stage = stageFor(day)
  assert(stage.encounter.every((id) => !!ENEMIES[id]), `day ${day} only uses registered enemies`)
  if (!stage.isBoss) stage.encounter.forEach((id) => stagedRegularEnemies.add(id))
}
assert(regularEnemyIds.every((id) => stagedRegularEnemies.has(id)), 'all six regular enemies appear by day 8')
assert([1, 5, 10].every((floor) => eliteRarityForEncounter(floor, 0, 0) === null), 'first story cycle keeps floors one to ten and bosses non-elite')
assert([11, 12, 13, 14].every((floor) => eliteRarityForEncounter(floor, 0, 0) === 'rare'), 'first story cycle introduces only rare elites on floors eleven to fourteen')
assert(enemyRarityWeightsForDay(16).common > enemyRarityWeightsForDay(16).rare && enemyRarityWeightsForDay(16).epic === 0, 'early endless remains mostly common with a small rare share')
assert(enemyRarityWeightsForDay(60).epic > enemyRarityWeightsForDay(60).rare, 'mid endless gradually shifts its center from rare to epic')
assert(enemyRarityWeightsForDay(105).legendary >= 0.6 && enemyRarityWeightsForDay(105).legendary > enemyRarityWeightsForDay(105).epic, 'floor 105 curve makes legendary the majority rarity')
assert(enemyRarityWeightsForDay(104).legendary < enemyRarityWeightsForDay(105).legendary, 'legendary share rises continuously into the floor 105 threshold')
{
  let legendary = 0
  let total = 0
  for (let day = 106; day <= 119; day++) {
    const stage = stageFor(day)
    stage.encounter.forEach((_, index) => {
      if (eliteRarityForEncounter(stage.floor, stage.endlessCycle, index, stage.encounter.length) === 'legendary') legendary++
      total++
    })
  }
  assert(legendary / total > 0.5, 'regular encounters after floor 105 are actually majority legendary, not only weighted that way on paper')
}
assert(bossEliteRarityForDay('mantis', 5) === null && bossEliteRarityForDay('mantis', 20) === 'rare', 'story boss stays base while the first repeated mantis can become rare')
for (const bossId of ['mantis', 'queenBee', 'elderSpider']) {
  const order = [20, 35, 50, 65, 80, 95, 110].map((day) => {
    const rarity = bossEliteRarityForDay(bossId, day)
    return rarity === null ? 0 : rarity === 'rare' ? 1 : rarity === 'epic' ? 2 : 3
  })
  assert(order.every((value, index) => index === 0 || value >= order[index - 1]), `${bossId} elite boss rarity never falls on later cycles`)
  assert(order[order.length - 1] === 3, `${bossId} is legendary after floor 105`)
}
{
  const warded = enemyDefForEncounter('pillbug', 11, 0, 0)
  const leeching = enemyDefForEncounter('mosquito', 12, 0, 0)
  const raging = enemyDefForEncounter('termite', 13, 0, 0)
  assert(warded.elite?.trait === 'warded' && (warded.magicShield ?? 0) === 2, 'rare warded elite adds one magic-shield layer')
  assert(leeching.elite?.trait === 'leeching' && (leeching.attackPattern?.[0].lifeStealRate ?? 0) > 0, 'rare leeching elite gains a disclosed lifesteal action')
  assert(raging.elite?.trait === 'raging' && raging.attackPattern?.length === 2 && (raging.attackPattern[1].damageScale ?? 0) > 1, 'rare raging elite alternates probe and heavy charge')
}
assert(floorInCycle(15) === 15 && floorInCycle(16) === 1 && endlessCycleFor(16) === 1, 'endless cycle boundary')
assert(stageFor(20).encounter.join(',') === 'mantis', 'endless floor 5 repeats first boss')
assert(stageFor(25).encounter.join(',') === 'queenBee', 'endless floor 10 repeats second boss')
assert(stageFor(30).encounter.join(',') === 'elderSpider', 'endless floor 15 repeats final boss')
assert(stageFor(5).bossHealthBars === 2 && stageFor(10).bossHealthBars === 3 && stageFor(15).bossHealthBars === 5, 'story bosses use two, three, and five health bars')
assert(stageFor(20).bossHealthBars === 2 && stageFor(25).bossHealthBars === 3 && stageFor(30).bossHealthBars === 5, 'endless bosses preserve their health bar counts')
{
  const storyBoss = makeEnemy(ENEMIES.mantis, 1, stageFor(5).hpMult, stageFor(5).bossHealthBars)
  const endlessBoss = makeEnemy(ENEMIES.mantis, 1, stageFor(20).hpMult, stageFor(20).bossHealthBars)
  assert(storyBoss.healthBars === endlessBoss.healthBars && endlessBoss.hpPerBar > storyBoss.hpPerBar, 'endless scales boss hp per bar instead of adding bars')
}
assert(stageFor(16).encounter.join(',') === stageFor(1).encounter.join(','), 'endless roster repeats every fifteen floors')
assert(stageFor(16).hpMult > stageFor(1).hpMult && stageFor(16).atkMult > stageFor(1).atkMult, 'endless repeat keeps scaling')

{
  const player = startingPlayer()
  assert(player.deck.subj.length === 4 && player.deck.adv.length === 3 && player.deck.verb.length === 4, 'starting deck uses 4-3-4 cards')
  // 11/20: 시작 주어는 감정마다 한 장씩 둔다.
  assert(new Set(player.deck.subj.map((word) => word.emotion)).size === 4, 'starting subjects cover all four emotions')
  assert(DECK_LIMITS.subj === 6 && DECK_LIMITS.adv === 6 && DECK_LIMITS.verb === 8, 'deck limits use 6-6-8 cards')
  const first = genRewards(player, 5, 1, 'subject')
  const second = genRewards(player, 5, 1, 'item')
  const third = genRewards(player, 5, 1, 'verb')
  assert(first.length === 3 && first.every((option) => option.kind === 'word') && first.some((option) => option.word?.slot === 'subj') && first.some((option) => option.word?.slot === 'adv'), 'first reward mixes subjects and modifiers')
  assert(second.length === 3 && second.every((option) => option.kind === 'item'), 'second reward offers three items')
  assert(third.length === 3 && third.every((option) => option.word?.slot === 'verb'), 'third reward offers three verbs')
  assert(
    new Set(third.map((option) => option.word?.kind)).size === 3,
    'a regular verb reward exposes attack, guard, and heal as three visible build directions',
  )
  assert(
    genRewards(player, 5, 10, 'subject', () => 0, REWARD_PRICE.common)
      .some((option) => rewardPrice(option) <= REWARD_PRICE.common),
    'a reward offer keeps at least one choice within the current Inspiration budget',
  )
  const budgetVerb = genRewards(player, 5, 6, 'verb', () => 0.5, REWARD_PRICE.common)
  assert(
    budgetVerb.some((option) => rewardPrice(option) <= REWARD_PRICE.common)
      && new Set(budgetVerb.map((option) => option.word?.kind)).size === 3,
    'the affordable verb replacement preserves attack, guard, and heal diversity',
  )
  for (const day of [5, 10, 15]) {
    for (const phase of ['subject', 'verb', 'item'] as const) {
      const offers = genRewards(player, 5, day, phase, () => 0.5, 0)
      assert(offers.length === 3 && offers.every((option) => rewardPrice(option) === 0), `boss ${day} ${phase} remains a three-way choice without Inspiration`)
      if (phase !== 'item') assert(offers.some((option) => option.rarity === bossRewardRarity(day)), `boss ${day} ${phase} retains its guaranteed skill rarity`)
      if (day === 10 && phase === 'item') assert(offers.some((option) => option.rarity === 'legendary'), 'floor ten legendary item is selectable without Inspiration')
    }
  }
  assert(genRewards(player, 5, 6, 'verb', () => 0.5, 0).every((option) => rewardPrice(option) > 0), 'regular stages do not gain a boss discount')
  assert(REWARD_PRICE.common < REWARD_PRICE.rare && REWARD_PRICE.rare < REWARD_PRICE.epic && REWARD_PRICE.epic < REWARD_PRICE.legendary, 'reward inspiration prices rise with rarity')
  assert([0, 1, 2, 8].map(rewardRefreshCost).join(',') === '1,2,3,9', 'consecutive reward refreshes remain an uncapped escalating Inspiration sink')
  const seededA = genRewards(player, 5, 6, 'subject', rewardOfferRng(1234, 'subject', 0)).map((option) => option.word?.id ?? option.item?.id)
  const seededB = genRewards(player, 5, 6, 'subject', rewardOfferRng(1234, 'subject', 0)).map((option) => option.word?.id ?? option.item?.id)
  const refreshed = genRewards(player, 5, 6, 'subject', rewardOfferRng(1234, 'subject', 1)).map((option) => option.word?.id ?? option.item?.id)
  assert(seededA.join(',') === seededB.join(','), 'saved reward seed restores the same offer')
  assert(seededA.join(',') !== refreshed.join(','), 'paid refresh changes the reward offer')
  const rarityCurve = [1, 4, 5, 9, 10, 15].map((day) => rewardRarityWeights(5, day))
  assert(rarityCurve[0].common > rarityCurve[0].rare && rarityCurve[1].common > rarityCurve[1].rare, 'floors one to four remain normal-dominant')
  assert(rarityCurve[2].rare > rarityCurve[2].common && rarityCurve[3].rare > rarityCurve[3].epic, 'floors five to nine remain rare-dominant')
  assert(rarityCurve[4].epic > rarityCurve[4].rare && rarityCurve[5].epic > rarityCurve[5].legendary, 'floors ten to fifteen remain epic-dominant')
  assert(rarityCurve[3].epic > rarityCurve[2].epic && rarityCurve[5].legendary > rarityCurve[4].legendary, 'the next rarity rises within the rare and epic bands')
  assert(rarityCurve[1].rare > rarityCurve[0].rare, 'rare chance rises through floors one to four')
  assert(rarityCurve[0].epic === 0 && rarityCurve[0].legendary === 0, 'floor one stays free of epic and legendary rewards')
  assert(rewardRarityWeights(5, 1, 20).epic === 0 && rewardRarityWeights(5, 1, 20).legendary === 0, 'high luck does not open floor-one locks')
  assert(rewardRarityWeights(5, 8, 8).epic > rewardRarityWeights(5, 8, 0).epic && rewardRarityWeights(5, 8, 8).legendary > rewardRarityWeights(5, 8, 0).legendary, 'luck raises epic and legendary reward weights')
  {
    const gain = (a: number, b: number) => rewardRarityWeights(5, 8, b).legendary - rewardRarityWeights(5, 8, a).legendary
    assert(gain(20, 24) > 0 && gain(20, 24) < gain(0, 4), 'luck keeps helping without a cap but each point is worth less')
  }
  assert(rarityCurve[1].epic > 0 && rarityCurve[1].legendary > 0 && rarityCurve[2].legendary > 0, 'relaxed locks let epic and legendary appear before their home bands')
  for (const [day, rarity] of [[5, 'epic'], [10, 'legendary'], [15, 'legendary']] as const) {
    assert(bossRewardRarity(day) === rarity, `boss floor ${day} uses its milestone rarity`)
    for (const phase of ['subject', 'verb'] as const) {
      const reward = genRewards(player, 5, day, phase)
      assert(reward.some((option) => option.kind === 'word' && option.rarity === rarity), `boss floor ${day} ${phase} reward includes a ${rarity} skill`)
    }
  }
  for (const day of [1, 2, 16, 17]) {
    for (const phase of ['subject', 'item', 'verb'] as const) {
      assert(!genRewards(player, 10, day, phase).some((option) => option.rarity === 'legendary'), `early floor ${floorInCycle(day)} blocks legendary ${phase} rewards`)
    }
  }
  for (const day of [3, 4, 5, 9, 10, 11, 12, 13, 14, 25, 26, 27, 28, 29]) {
    const tacticalIds = new Set(tacticalCardIdsForRewardDay(day))
    const reward = genRewards(player, 5, day, 'subject')
    assert(reward.some((option) => option.word && tacticalIds.has(option.word.id)), `boss-eve day ${day} offers a matching tactical modifier`)
  }
  assert(genRewards(player, 5, 10, 'item').some((option) => option.kind === 'item' && option.rarity === 'legendary'), 'floor ten guarantees a legendary item each cycle')
  assert(genRewards(player, 5, 25, 'item').some((option) => option.kind === 'item' && option.rarity === 'legendary'), 'endless floor ten repeats the legendary item guarantee')
  assert(genRewards(player, 5, 15, 'verb').some((option) => option.kind === 'word' && option.rarity === 'legendary'), 'floor fifteen guarantees a legendary skill each cycle')
  assert(genRewards(player, 5, 30, 'verb').some((option) => option.kind === 'word' && option.rarity === 'legendary'), 'endless floor fifteen repeats the legendary skill guarantee')
  assert(rewardGradeForDay(5, 15) > rewardGradeForDay(5, 1) && rewardGradeForDay(5, 16) === rewardGradeForDay(5, 1), 'reward grade rises through fifteen floors and resets next cycle')

  for (let i = 0; i < 4; i++) registerWord(player, { id: `limit-${i}`, text: `limit-${i}`, slot: 'subj', tags: [], emotion: 'joy', note: '' })
  const incoming: Word = { id: 'limit-new', text: 'limit-new', slot: 'subj', tags: [], emotion: 'joy', note: '' }
  const full = registerWord(player, incoming)
  assert(full.kind === 'needs-discard' && full.candidates.map((card) => card.id).join(',') === player.deck.subj.map((card) => card.id).join(','), 'full grammar deck exposes every owned card')
  if (full.kind === 'needs-discard') registerWord(player, incoming, full.candidates[full.candidates.length - 1].id)
  assert(player.deck.subj.length === 6 && player.deck.subj[player.deck.subj.length - 1]?.id === incoming.id, 'discarding an old card keeps the grammar deck at its cap')
}

const word = (id: string, emotion: Word['emotion']): Word => ({ id, text: id, slot: id === 'v' ? 'verb' : id, tags: [], emotion, note: '', kind: id === 'v' ? 'attack' : undefined, power: id === 'v' ? 10 : undefined })
const result = compile({ subj: word('subj', 'joy'), adv: word('adv', 'joy'), verb: word('v', 'joy') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [] })
assert(result.emotionResonance === 1.3, 'emotion resonance')
const stackedResonanceResult = compile(
  {
    subj: word('subj', 'joy'),
    subj2: word('subj2', 'joy'),
    adv: word('adv', 'joy'),
    verb: word('v', 'joy'),
    verb2: { ...word('v', 'joy'), id: 'v2', slot: 'verb2' },
  },
  {
    template: {
      slots: [
        { key: 'subj', label: '', role: 'subject' },
        { key: 'subj2', label: '', role: 'subject' },
        { key: 'adv', label: '', role: 'modifier' },
        { key: 'verb', label: '', role: 'verb' },
        { key: 'verb2', label: '', role: 'verb' },
      ],
    },
    words: {},
    combos: [],
    conflicts: [],
  },
)
assert(stackedResonanceResult.emotionResonance === 1.6, 'emotion resonance keeps stacking past three cards')
assert(stackedResonanceResult.breakdown.mults.some((part) => part.source === 'emotion' && part.value === 1.6 && part.hint === '같은 감정 5장'), 'stacked emotion resonance stays visible in the tally')
const neutralResult = compile({ subj: word('subj', 'neutral'), adv: word('adv', 'neutral'), verb: word('v', 'neutral') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [] })
assert(neutralResult.emotionResonance === 1, 'neutral cards do not resonate')
const legacyWord = { ...word('legacy', 'neutral'), emotion: undefined } as unknown as Word
assert(!wordValueLines(legacyWord).some((line) => line.cls.startsWith('emotion')), 'card values keep emotion in the icon badge')
const lifestealWord = SPECIAL_REWARD_WORDS.find((entry) => entry.id === 'stainedTomorrow')!
assert(wordValueLines(lifestealWord).some((line) => line.text.includes('흡혈')), 'compact card values keep the lifesteal keyword')
assert(!wordValueLines(lifestealWord, undefined, false).some((line) => line.text.includes('흡혈')), 'detail values leave lifesteal to the keyword explanation instead of repeating it')
assert(compile({ subj: legacyWord }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }] }, words: {}, combos: [], conflicts: [] }).emotionResonance === 1, 'legacy emotion does not resonate')
assert(EARLY_WORDS.subj.every((subject) => subject.emotion !== 'neutral'), 'starting subjects carry emotions')

const resonanceCards = [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...SPECIAL_REWARD_WORDS]
// 카드 수는 등급 정원(CARD_POOL_RARITY_QUOTA)이 정본이다. 11/20 고등급 카드 추가로 칸마다
// 감정 수가 한 장씩 어긋날 수 있어, 정확히 같은 수 대신 차이 1 이하를 지킨다(check-tables와 같은 기준).
const quotaTotal = (slot: keyof typeof CARD_POOL_RARITY_QUOTA): number => Object.values(CARD_POOL_RARITY_QUOTA[slot]).reduce((a, b) => a + b, 0)
assert(resonanceCards.length === quotaTotal('subj') + quotaTotal('adv') + quotaTotal('verb'), `resonance card total (${resonanceCards.length})`)
for (const slot of ['subj', 'adv', 'verb'] as const) {
  const slotCards = resonanceCards.filter((card) => card.slot === slot)
  assert(slotCards.length === quotaTotal(slot), `${slot} card total (${slotCards.length})`)
  const counts = (['joy', 'anger', 'sorrow', 'pleasure'] as const).map((emotion) => slotCards.filter((card) => card.emotion === emotion).length)
  assert(Math.max(...counts) - Math.min(...counts) <= 1, `${slot} emotion balance (${counts.join('/')})`)
  assert(slotCards.every((card) => card.emotion !== 'neutral'), `${slot} has no forced neutral card`)
}

for (const kind of ['attack', 'guard', 'heal'] as const) {
  const counts = new Map(['joy', 'anger', 'sorrow', 'pleasure'].map((emotion) => [emotion, 0]))
  for (const word of [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...SPECIAL_REWARD_WORDS]) {
    if (word.kind === kind && word.emotion !== 'neutral') counts.set(word.emotion, (counts.get(word.emotion) ?? 0) + 1)
  }
  const values = [...counts.values()]
  assert(Math.max(...values) - Math.min(...values) <= 1, `${kind} emotion balance`)
}

// 보스의 화면 문장은 별도 수치를 만들지 않고 현재 전투 상태를 그대로 설명한다.
{
  const mantis = makeEnemy(ENEMIES.mantis, 1, 1, 2)
  const s = state([mantis])
  mantis.attackPatternIndex = 1
  let sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tokens.some((token) => token.text.includes('치켜든다')) && sentence.meta.some((line) => line.startsWith('예상 피해 ')), 'mantis preparation sentence announces its attack and the following slam')
  mantis.attackPatternIndex = 2
  sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tone === 'danger' && sentence.meta.some((line) => line.startsWith('필요 방어 ')), 'mantis heavy sentence exposes the exact guard answer')
  mantis.groggyUntilTurn = s.turn
  mantis.groggyDamageMult = 2.5
  sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tokens.some((token) => token.text === '휘청거린다'), 'mantis counter rewrites the promised attack into a stagger sentence')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED, 1, 1, 3)
  const s = state([queen])
  summonAtTurnStart(s)
  let sentence = enemySentenceFor(s, queen)!
  assert(sentence.context?.tokens.some((token) => token.text.includes('일벌 넷')) && sentence.context.meta.includes('본체 무적'), 'queen escort count changes the sentence subject and exposes immunity')
  queen.summonsLeft = 0
  queen.summonsRight = 0
  queen.summonHpLeft = []
  queen.summonHpRight = []
  queen.summonRespawnTurn = s.turn + 2
  queen.groggyUntilTurn = s.turn
  queen.groggyDamageMult = 2.5
  sentence = enemySentenceFor(s, queen)!
  assert(sentence.tokens.some((token) => token.text === '숨을 고른다') && sentence.meta.includes('다음 행동 스킵'), 'queen escort clear rewrites the attack into a recovery sentence')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 50, 1, 5)
  const s = state([spider]); s.playerMax = 100
  const sentence = enemySentenceFor(s, spider, { eventText: '「힘껏」 카드를 실로 묶었다.' })!
  assert(sentence.manuscript?.length === 5 && sentence.manuscript[0].active && sentence.manuscript[0].emotion === 'joy', 'spider manuscript mirrors the active sequential weakness')
  assert(sentence.manuscript?.slice(0, 4).map((clause) => clause.text).join(' / ') === '기쁨을 묶고 / 분노를 얽고 / 슬픔을 지우고 / 즐거움을 삼키고', 'spider manuscript attaches Korean object particles exactly once')
  assert(sentence.eventText?.includes('힘껏') && sentence.meta.includes('방어 관통'), 'spider stolen word is written beside the current piercing intent')
  assert(enemyDamageRange(s, spider)[1] === 20, 'spider sentence damage preview reads the same one-fifth hp cap as combat')
  spider.attackPatternIndex = 1
  const blockable = enemySentenceFor(s, spider)!
  assert(!blockable.meta.includes('방어 관통') && blockable.tokens.some((token) => token.text === '앞다리 휘두르기'), 'spider sentence exposes the alternating blockable attack')
}
console.log('combat effects: ok')

// 11/20 피드백 회귀 — 다중 대상 연타·호위 0마리 여왕벌·같은 카드 두 칸의 잉크.
{
  const s = state([makeEnemy(foe('front', { hp: 100 })), makeEnemy(foe('second', { hp: 100 })), makeEnemy(foe('third', { hp: 100 }))])
  const hits = previewIntentHits(s, attack({ targetCount: 2, castCount: 2, castScale: .67 }), 1, 0)
  assert(hits.length === 4 && hits.join(',') === '6,4,6,4', `a repeated two-target verb hits both targets on every cast (got ${hits.join(',')})`)
  const all = previewIntentHits(s, attack({ targetCount: 'all', aoe: 'all', castCount: 2, castScale: .67 }), 1, 0)
  assert(all.length === 6, 'a repeated all-target verb hits every enemy on every cast')
}
{
  const queen = makeEnemy(QUEEN_ESCORTED); const s = state([queen]); summonAtTurnStart(s)
  const wipe = applyIntent(s, attack({ base: 40, targetCount: 'all', aoe: 'all' }), 1, 0)
  assert(wipe.summonGroggyTriggered && summonCount(queen) === 0, 'an all-target sentence clears the worker wave')
  s.turn = 2
  const hp = queen.hp
  const hit = applyIntent(s, attack({ base: 20 }), 1, 0)
  assert(hit.hits.length === 1 && queen.hp < hp, 'a queen without escorts takes the sentence damage on her body')
}
{
  const zero = { ...EARLY_WORDS.subj[0], id: 'zero-subject', inkCost: 0 }
  const { selectionInkCost } = await import('@core/ink')
  assert(selectionInkCost({ subj: zero, subj2: zero }) === 0, 'choosing the same zero-ink card in both subject slots costs exactly its printed ink')
}

// 공격 속성 — 가장 많이 쓴 감정, 동률이면 잉크 비용 합(영향)이 큰 감정이 약점 판정에 쓰인다.
{
  const { sentenceAttackEmotion } = await import('@core/compiler')
  const w = (id: string, slot: Word['slot'], emotion: Word['emotion'], inkCost: number): Word => ({ ...EARLY_WORDS.verb[0], id, slot, emotion, inkCost })
  const order = ['subj', 'adv', 'verb']
  assert(sentenceAttackEmotion({ subj: w('a', 'subj', 'joy', 0), adv: w('b', 'adv', 'joy', 1), verb: w('c', 'verb', 'anger', 4) }, order) === 'joy', 'the most used emotion is the attack attribute')
  assert(sentenceAttackEmotion({ subj: w('a', 'subj', 'joy', 0), adv: w('b', 'adv', 'sorrow', 2), verb: w('c', 'verb', 'neutral', 2) }, order) === 'sorrow', 'a tie goes to the emotion with more influence (ink)')
  assert(sentenceAttackEmotion({ subj: w('a', 'subj', 'neutral', 0), verb: w('c', 'verb', 'neutral', 2) }, order) === null, 'a sentence without emotion cards is neutral')
  const s = state([makeEnemy(foe('weak-joy', { weakEmotion: 'joy', hp: 100 }))])
  const minority = previewIntentHits(s, attack({ base: 20, emotions: ['joy', 'anger', 'anger'], attackEmotion: 'anger' }), 1, 0)
  const majority = previewIntentHits(s, attack({ base: 20, emotions: ['joy', 'joy', 'anger'], attackEmotion: 'joy' }), 1, 0)
  assert(minority[0] === 20 && majority[0] === 25, 'only the attack attribute triggers weakness')
}
