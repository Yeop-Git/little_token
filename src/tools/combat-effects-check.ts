import { comboLeads, compile, withOverdrawEffects } from '@core/compiler'
import { bossTurnPressureMultiplier } from '@core/combatRules'
import { DECK_LIMITS, applyItemReward, emptyRunRecord, newRun, registerWord, reinforceWord, startingPlayer, type RunState } from '@core/run'
import { ECHO_REPEAT_SCALE, LUCK_CLOAK_RATE, TWIN_VERB_SCALE } from '@core/passives'
import { defaultPlayer } from '@core/player'
import { migrateCombatBalance } from '@core/save'
import type { EnemyDef, Intent, Word } from '@core/types'
import { wordValueLines } from '@core/wordText'
import { EARLY_WORDS, REWARD_WORDS, makeEarlyTables, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES, QUEEN_ESCORT_IMMUNITY_LABEL, bossEliteRarityForDay, eliteRarityForEncounter, enemyDefForEncounter, enemyRarityWeightsForDay } from '@data/enemies'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
import { endlessCycleFor, floorInCycle, stageFor } from '@data/stages'
import { bossRewardRarity, genRewards, REWARD_PRICE, rewardGradeForDay, rewardOfferRng, rewardPrice, rewardRarityWeights } from '@data/rewards'
import { ALL_ITEMS, EXCLAIM_RARITY_BONUS, EXCLAIM_SLOTS, ITEM_BLESS_POOL, itemStatBudget, rollExclaimMultipliers } from '@data/items'
import { tacticalCardIdsForRewardDay } from '@data/tacticalCards'
import {
  activeEnemyPart,
  applyIntent,
  applyOverkillTransfer,
  applyPendingAttack,
  applyPreparation,
  enemyAttackForecast,
  enemyTurn,
  makeEnemy,
  playerGuardLimit,
  spiderWebAtTurnStart,
  spiderSealSlotForTurn,
  spiderWebTension,
  summonAtTurnStart,
  summonCount,
  type BattleState,
} from '../sim/reference'
import { enemyDamageRange, enemySentenceFor } from '../sim/enemySentences'

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const foe = (id: string, extra: Partial<EnemyDef> = {}): EnemyDef => ({ id, name: id, hp: 30, atk: 4, every: 2, initiative: 'second', sprite: 'enemy_moth', note: '', weakEmotion: null, ...extra })
const state = (enemies = [makeEnemy(foe('a'))]): BattleState => {
  if (enemies[0]) enemies[0].engaged = true
  return { playerHp: 30, playerMax: 30, guard: 0, counterMultiplier: 0, turn: 1, enemies, pending: null }
}
const attack = (extra: Partial<Intent> = {}): Intent => ({ sentence: 'check', targetMode: 'enemy', aoe: 'single', targetCount: 1, kind: 'attack', preempt: false, base: 10, multiplier: 1, variance: null, timing: 'immediate', guard: 0, heal: 0, recoil: 0, evade: 0, pierceGuard: false, hitCount: 1, castCount: 1, castScale: 1, overdrawHitCount: 0, counterMultiplier: 0, magicShield: 0, guardAttackMultiplier: 0, overhealDamageMultiplier: 0, lifeStealRate: 0, enemyAttackDown: 0, drawCards: 0, emotions: [], emotionResonance: 1, tags: [], combos: [], coherence: 1, penalties: [], critP: 0, failP: 0, statKey: null, growHp: 0, doubtCount: 0, breakdown: { flats: [], mults: [] }, ...extra } as Intent);

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
  assert(ECHO_REPEAT_SCALE === 0.5 && TWIN_VERB_SCALE === 0.5 && LUCK_CLOAK_RATE === 0.35, 'rule-item numeric contracts stay at echo 50%, twin verb 50%, and luck 35%')
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
  applyItemReward(player, item)
  applyItemReward(player, item)
  assert(player.items.filter((owned) => owned.id === item.id).length === 1 && player.stats.atk === 5.5, 'item acquisition boundary rejects duplicate stats and entries')
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
}

{ const s = state([makeEnemy(foe('shield', { magicShield: 2, hp: 20 }))]); const r = applyIntent(s, attack({ hitCount: 3 }), 1, 0); assert(r.hits[0].magicShieldBroken && r.hits[0].magicShieldRemaining === 1 && r.hits[1].magicShieldRemaining === 0 && r.hits[2].dmg === 10 && s.enemies[0].hp === 10, 'layered magic shield and multihit') }
{ const s = state([makeEnemy(foe('scaled-multihit', { hp: 20 }))]); const r = applyIntent(s, attack({ castCount: 2, castScale: .65 }), 1, 0); assert(r.hits.map((hit) => hit.dmg).join(',') === '7,7' && s.enemies[0].hp === 6, 'scaled verb cast repeats without doubling total power') }
{ const s = state([makeEnemy(foe('scaled-guard'))]); const r = applyPreparation(s, attack({ base: 0, kind: 'guard', guard: 10, castCount: 2, castScale: .65 }), 1); assert(r.guardGain === 13, 'scaled verb cast repeats guard at the same disclosed total power') }
{ const s = state([makeEnemy(foe('scaled-heal'))]); s.playerHp = 10; const r = applyIntent(s, attack({ base: 0, kind: 'heal', heal: 10, castCount: 2, castScale: .65 }), 1, 0); assert(r.heal === 13 && s.playerHp === 23, 'scaled verb cast repeats healing at the same disclosed total power') }
{ const s = state([makeEnemy(foe('overdraw-fury', { hp: 30 }))]); const intent = withOverdrawEffects(attack({ overdrawHitCount: 1 }), 1); const r = applyIntent(s, intent, 1, 0); assert(r.hits.length === 2 && s.enemies[0].hp === 10, 'Ink overdraw unlocks the disclosed extra attack hit') }
{ const intent = withOverdrawEffects(attack({ overdrawHitCount: 1 }), 0); assert(intent.hitCount === 1, 'overdraw attack reward stays dormant without health payment') }
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
  assert(r.overflow === 15, 'multihit keeps the killing blow excess and every unused hit')
  const transfer = applyOverkillTransfer(s, 1, r.overflow)
  assert(transfer.dealt === 15 && rear.hp === 5, 'unused multihits join the kill chain')
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
{
  const shielded = makeEnemy(foe('overkill-shielded', { guard: 99, magicShield: 3, hp: 15 }))
  const s = state([shielded])
  const r = applyOverkillTransfer(s, 0, 20)
  assert(r.dealt === 15 && r.killed && r.overflow === 5, 'overkill transfer deals directly to hp and keeps flowing')
  assert(shielded.guard === 99 && shielded.magicShield === 3, 'overkill transfer ignores and does not consume guard or magic shield')
}
{ const s = state([makeEnemy(foe('a')), makeEnemy(foe('b')), makeEnemy(foe('c'))]); const r = applyIntent(s, attack({ targetCount: 3 }), 1, 0); assert(r.hits.map((h) => h.dmg).join(',') === '10,7,5', 'three targets') }
{ const s = state([makeEnemy(foe('weak', { weakEmotion: 'joy', hp: 20 }))]); const r = applyIntent(s, attack({ emotions: ['joy'] }), 1, 0); assert(r.hits[0].dmg === 13, 'weak emotion') }
{ const s = state([makeEnemy(foe('counter'))]); s.guard = 4; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.counterHit?.dmg === 6, 'counter') }
{ const s = state([makeEnemy(foe('mosquito', { pierceGuard: true }))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.piercedGuard && r.dealt === 4 && r.absorbed === 0 && s.guard === 7 && !r.counterHit, 'enemy pierces player guard') }
{ const s = state([makeEnemy(foe('guard-remains'))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.absorbed === 4 && s.guard === 3 && s.counterMultiplier === 1.5, 'guard remains after absorbing a smaller hit'); applyPreparation(s, attack(), 1); assert(s.guard === 3 && s.counterMultiplier === 1.5, 'non-guard preparation preserves remaining guard') }
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
  const s = state([makeEnemy(foe('overheal', { hp: 100 }))])
  s.playerMax = 100
  s.playerHp = 95
  const r = applyIntent(s, attack({ kind: 'heal', base: 0, heal: 10, overhealDamageMultiplier: 1 }), 1, 0)
  assert(s.playerHp === 100 && r.convertedDamage === 5 && r.hits[0].dmg === 5, 'only healing beyond max HP converts to damage')
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
  s.guard = 28
  const r = applyPreparation(s, attack({ guard: 10 }), 1)
  assert(playerGuardLimit(s.playerMax) === 30 && r.guardAttempted === 10 && r.guardGain === 2 && s.guard === 30, 'player guard is capped at max hp and reports the applied gain')
}
{
  const s = state([makeEnemy(foe('weakened'))])
  applyPreparation(s, attack({ enemyAttackDown: 3 }), 1)
  s.guard = 2
  const preview = enemyAttackForecast(s, s.enemies[0])
  assert(preview.raw.join(',') === '1,3' && preview.dealt.join(',') === '0,1' && preview.hpAfter.join(',') === '29,30', 'enemy forecast includes attack reduction, guard, and post-hit hp')
  const strikes = enemyTurn(s, () => 0, 'second')
  assert(strikes[0]?.dealt === 0 && strikes[0]?.absorbed === 1 && s.enemyAttackReduction === 0, 'enemy attack reduction applies once and is consumed')
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
  const r = applyPreparation(s, attack({ guard: 10, counterMultiplier: 1.5 }), 1)
  assert(r.guardGain === 0 && r.counterMultiplier === 1.5 && s.counterMultiplier === 1.5, 'guard sentence still arms the counter at the guard cap')
}
{ const card: Word = { id: 'counter', text: '', slot: 'verb', tags: [], emotion: 'sorrow', kind: 'guard', effects: { counterMultiplier: 1.5 }, note: '' }; reinforceWord(card); assert(card.effects?.counterMultiplier === 1.75, 'counter reinforce') }
{ const card: Word = { id: 'cast', text: '', slot: 'adv', tags: [], emotion: 'anger', effects: { castCount: 2, castScale: .65 }, note: '' }; reinforceWord(card); assert(card.effects?.castScale === .7, 'repeat-cast reinforce') }
{ const card: Word = { id: 'scaled', text: '', slot: 'verb', tags: [], emotion: 'anger', stat: 'atk', statMult: 1, kind: 'attack', note: '' }; reinforceWord(card); assert(card.statMult === 1.15, 'stat-scaled verb reinforce') }
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
    pierceGuard: true,
    webPattern: { sealPerTurn: 1, maxSealedCards: 3 },
  }))
  const s = state([webBoss])
  s.turn = 10
  const strike = enemyTurn(s, () => 0, 'second')[0]
  assert(strike.dealt === 7, 'long-fight pressure raises the elder spider damage limit instead of being swallowed by it')
}
assert(ENEMIES.mantis.attackPattern?.map((step) => step.animationStage).join(',') === '2,3', 'mantis data repeats a distinct telegraph then strong attack cycle')
assert(ENEMIES.mantis.attackPattern?.[0].damageScale === 0 && ENEMIES.mantis.attackPattern[1].shatterGuard, 'mantis data telegraphs before every guard-shattering strike')
{
  const modifiers = [...EARLY_WORDS.adv, ...REWARD_WORDS.filter((word) => word.slot === 'adv')]
  const orphaned = modifiers.filter((word) => comboLeads(word, makeEarlyTables().combos).length === 0)
  assert(orphaned.length === 0, `every standard modifier leads to a combo (${orphaned.map((word) => word.text).join(', ')})`)
}
assert([1, 2, 3, 4, 5, 6].map((turn) => spiderSealSlotForTurn(['subj', 'adv', 'verb'], turn)).join(',') === 'subj,adv,verb,subj,adv,verb', 'spider web seal rotates evenly across subject, modifier, and verb slots')
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, animationStage: 1, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, animationStage: 2, damageScale: 0, telegraphText: '준비' }, { name: '큰낫 내려베기', bonusAtk: 0, animationStage: 3, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-pattern', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .9, 0, 0]; const rng = () => rolls.shift() ?? 0; let r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 7 && r.animationStage === 1 && r.text.includes('평타') && mantis.attackPatternIndex === 1, 'mantis normal attack uses attack1 and can advance after one hit'); mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 0 && r.animationStage === 2 && r.telegraphText === '준비', 'mantis telegraph keeps its distinct non-damaging pattern stage'); mantis.hp = 20; mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 8 && r.animationStage === 3 && r.lifeStolen === 4 && mantis.hp === 24 && !r.groggyEntered, 'mantis strong attack uses attack3; failed defense takes 1.2x damage and lifesteal without groggy'); assert(mantis.nextAttackTurn === 3, 'failed defense leaves the attack schedule untouched'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'failed defense does not grant a vulnerability window') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, damageScale: 0, telegraphText: '준비' }]; const mantis = makeEnemy(foe('mantis-repeat', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .1, 0]; const rng = () => rolls.shift() ?? 0; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 0 && mantis.attackStepRepeated, 'mantis can randomly schedule a second normal attack'); mantis.nextAttackTurn = 1; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 1 && !mantis.attackStepRepeated, 'mantis normal attack repeats at most once before telegraphing') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-shatter', { atk: 7, attackPattern: pattern })); const s = state([mantis]); s.guard = 30; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardShattered && r.absorbed === 30 && r.dealt === 0 && r.lifeStolen === 0 && r.groggyEntered && s.guard === 0, 'successful defense erases guard, prevents 1.2x overflow and lifesteal, and opens groggy'); assert(mantis.nextAttackTurn === 5 && r.text.includes('다음 공격 한 턴 스킵'), 'groggy pushes the scheduled attack a full cycle and says so'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'successful defense grants the groggy damage window'); s.turn = 3; assert(enemyTurn(s, () => 0, 'second').length === 0, 'the groggy mantis skips the attack it was due to make') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-first-groggy', { atk: 7, initiative: 'first', attackPattern: pattern })); const s = state([mantis]); s.guard = 11; const r = enemyTurn(s, () => 0, 'first')[0]; assert(r.guardRequired === 11 && r.groggyEntered && mantis.groggyUntilTurn === 1, 'visible guard requirement opens first-phase groggy only when fully met'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'first-phase groggy boosts the immediate main action'); assert(mantis.nextAttackTurn === 5, 'first-phase groggy also skips one scheduled attack'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'first-phase groggy does not grant a second boosted turn'); s.turn = 3; assert(enemyTurn(s, () => 0, 'second').length === 0, 'the first-phase groggy mantis also skips the attack it was due to make') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-short-guard', { atk: 7, attackPattern: pattern })); mantis.hp = 20; const s = state([mantis]); s.guard = 5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardRequired === 11 && !r.guardShattered && r.absorbed === 5 && r.dealt === 3 && r.lifeStolen === 2 && !r.groggyEntered, 'insufficient guard absorbs normally but does not open groggy') }
{ const regular = makeEnemy(foe('unphased', { hp: 30, atk: 10 })); regular.hp = 1; const r = enemyTurn(state([regular]), () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'regular enemy damage does not scale with low hp') }
{ const queen = makeEnemy(foe('queen-summon', { atk: 10, summonPattern: { name: '일벌', sprite: 'enemy_worker_bee', perTurn: 1, max: 4, maxPerSide: 2, attackBonusPerUnit: .5, releaseAt: 4 } })); const s = state([queen]); summonAtTurnStart(s); summonAtTurnStart(s); assert(queen.summonsLeft === 1 && queen.summonsRight === 0, 'queen summons only once at the same turn start'); s.turn = 2; summonAtTurnStart(s); s.turn = 3; summonAtTurnStart(s); s.turn = 4; summonAtTurnStart(s); assert(queen.summonsLeft === 2 && queen.summonsRight === 2, 'queen alternates summons up to two workers per side'); queen.nextAttackTurn = 1; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 12 && r.summonsReleased === 4 && summonCount(queen) === 0, 'four workers add only two damage then all leave on swarm charge') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 3, 'a 30-damage single-target attack defeats one full-health worker'); r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonsDispersed === 2 && summonCount(queen) === 1, 'a two-target attack carries its damage through two reachable workers'); r = applyIntent(s, attack({ base: 30, targetCount: 'all', aoe: 'all' }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 0, 'an all-target attack can reach the final worker') }
{
  const queen = makeEnemy(ENEMIES.queenBee)
  const s = state([queen]); summonAtTurnStart(s)
  const focused = applyIntent(s, attack({ base: 30, emotions: ['anger'] }), 1, 0)
  assert(focused.summonsDispersed === 1 && focused.summonFocusedBacklash && focused.summonBacklashDamage === 4, 'anger single-target worker defeat doubles queen backlash')
  const wide = applyIntent(s, attack({ base: 60, targetCount: 2, emotions: ['anger'] }), 1, 0)
  assert(wide.summonsDispersed === 2 && !wide.summonFocusedBacklash && wide.summonBacklashDamage === 4, 'wide anger attack keeps normal backlash while progressing faster toward groggy')
  assert(QUEEN_ESCORT_IMMUNITY_LABEL === '호위 중 : 본체 무적' && ENEMIES.queenBee.note.includes(QUEEN_ESCORT_IMMUNITY_LABEL), 'queen escort immunity uses the required visible copy')
}
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); const r = applyIntent(s, attack({ base: 17 }), 1, 0); assert(r.summonDamage === 17 && r.summonsDispersed === 0 && queen.summonHpRight[queen.summonHpRight.length - 1] === 13 && summonCount(queen) === 4, 'partial damage remains on the front worker and keeps its health bar visible') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1; const hp = queen.hp; const r = applyIntent(s, attack({ base: 120, targetCount: 1, pierceGuard: true }), 1, 0); assert(r.summonsDispersed === 2 && r.summonDamage === 60 && r.summonBacklashDamage === 4 && r.hits.length === 1 && r.hits[0].summonShieldBlocked && queen.hp === hp - 4 && !r.summonGroggyTriggered && queen.summonsDefeated === 2, 'single-target pierce reaches exactly two workers and the surviving escort blocks its remaining damage'); assert(queen.nextAttackTurn === 1 && queen.groggyUntilTurn === 0 && queen.summonRespawnTurn === 1, 'a partial piercing clear does not open queen recovery') }
{ const t = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'queenBee'); assert(t.words.verb.some((word) => word.id === 'queenBeeTactic' && word.targetCount === 2), 'queen encounter lends a two-target tactic even when the deck has no range answer') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); const tables = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'queenBee'); const tactic = tables.words.verb.find((word) => word.id === 'queenBeeTactic')!; const subject = tables.words.subj[0]; const modifier = tables.words.adv[0]; const intent = compile({ subj: subject, adv: modifier, verb: tactic }, tables, { atk: 1, guard: 1, heal: 1, luck: 0 }); const r = applyIntent(s, intent, 1, 0); assert(r.summonsDispersed === 2, 'queen encounter tactic defeats two workers even for a low-attack build') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(!r.summonGroggyTriggered && queen.summonsDefeated === 2, 'queen worker defeats accumulate between sentences'); s.turn = 2; summonAtTurnStart(s); queen.nextAttackTurn = 2; r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonGroggyTriggered && queen.summonsDefeated === 0 && queen.nextAttackTurn === 3 && queen.summonRespawnTurn === 4, 'the fourth cumulative worker opens a recovery turn before the next wave') }
{
  const queen = makeEnemy(ENEMIES.queenBee)
  const s = state([queen]); summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'queen opens with a complete four-worker wave')
  const hp = queen.hp
  let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0)
  assert(r.summonsDispersed === 1 && r.summonBacklashDamage === 2 && queen.hp === hp - 2, 'each defeated worker deals direct backlash through body immunity')
  assert(r.hits.length === 0 && summonCount(queen) === 3, 'damage spent on a worker is not duplicated onto the immune queen body')
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 3, 'a partially defeated worker wave does not refill')
  r = applyIntent(s, attack({ base: 60, targetCount: 1, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 2 && summonCount(queen) === 1 && r.hits.length === 0 && queen.hp === hp - 6, 'pierce carries through reachable workers but does not duplicate spent damage onto the body')
}
{
  const queen = makeEnemy(ENEMIES.queenBee)
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
  assert(summonCount(queen) === 4, 'queen recovers and summons one complete four-worker wave at the start of the following turn')
}
{
  const queen = makeEnemy(ENEMIES.queenBee, 1, 1, 3)
  const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1
  const hp = queen.hp
  const r = applyIntent(s, attack({ base: 150, targetCount: 2, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 4 && r.summonBacklashDamage === 24 && r.summonGroggyTriggered, 'two-target pierce clears the complete worker wave and opens groggy')
  assert(r.summonDamage === 120 && r.hits[0].dmg === 44 && queen.hp === hp - 68, 'worker chain spends 120 damage, then carries the remaining strike into the groggy body up to its current bar boundary')
  assert(queen.nextAttackTurn === 2 && queen.groggyUntilTurn === 1, 'worker-wave groggy skips the imminent queen attack for one turn')
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 0 && enemyTurn(s, () => 0, 'second').length === 0, 'queen spends the whole next turn recovering without summoning or attacking')
  s.turn = 3; summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'queen summons a fresh four-worker wave at the start of the turn after recovery')
}
{
  const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); s.guard = 99
  summonAtTurnStart(s); queen.nextAttackTurn = 1
  const r = enemyTurn(s, () => 0, 'second')[0]
  assert(r.piercedGuard && r.absorbed === 0 && s.guard === 99, 'queen attack pierces player guard while a worker escort survives')
}
// 10층에 도착한 플레이어의 실제 최대 체력(시작 20 + 아홉 층의 아이템 보상)을 기준으로 잰다.
// 픽스처 기본값 30은 1층 언저리 수치라 중간 보스의 한 방 판정 기준이 되지 못한다.
{ const stage = stageFor(10); const queen = makeEnemy(ENEMIES.queenBee, stage.atkMult, stage.hpMult, stage.bossHealthBars); const s = state([queen]); s.playerHp = s.playerMax = 52; summonAtTurnStart(s); const r = enemyTurn(s, () => .999, 'second')[0]; assert(r.dealt < s.playerMax * .7 && queen.nextAttackTurn === 4, 'day-10 queen cannot take more than two thirds of a day-10 player on her worst opening roll and gives three turns before attacking again') }
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
// 장로거미는 방패를 넘어 오지만 한 방이 최대 체력의 1/5을 넘지 않는다.
{
  const stage = stageFor(15)
  // 본편 첫 장로거미는 밸런스 배율상 상한보다 약하므로, 상한 자체를 검증할 때는
  // 충분히 큰 원시 공격력을 주어 반드시 제한선에 닿게 한다.
  const spider = makeEnemy({ ...ENEMIES.elderSpider, atk: 200 }, stage.atkMult, stage.hpMult, stage.bossHealthBars)
  const s = state([spider]); s.playerHp = s.playerMax = 100; s.guard = 400
  const r = enemyTurn(s, () => .999, 'first')[0]
  assert(r.piercedGuard && r.absorbed === 0 && s.guard === 400, 'spider web goes over the shield instead of consuming it')
  assert(r.dealt === 20 && s.playerHp === 80, 'a single spider strike is capped at a fifth of max hp')
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
  assert(r.hits[0].weak && r.hits[0].dmg === spider.hpPerBar && r.hits[0].barsBroken === 1, 'active spider leg weakness grants x1.5 and drops one leg without displaying damage beyond the part hp')
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
  const breakOneLeg = Math.ceil((spider.hpPerBar + 1) / 1.5)
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
assert(ENEMIES.termite.initiative === 'second' && !ENEMIES.termite.guard && !ENEMIES.termite.magicShield && !ENEMIES.termite.pierceGuard, 'termite has no ability')
assert(ENEMIES.moth.initiative === 'second' && !ENEMIES.moth.guard && !ENEMIES.moth.magicShield && !ENEMIES.moth.pierceGuard, 'moth has no ability')
assert(ENEMIES.flea.initiative === 'first', 'flea strikes first')
assert((ENEMIES.roach.guard ?? 0) > 0, 'roach starts with guard')
assert((ENEMIES.pillbug.magicShield ?? 0) > 0, 'pillbug starts with magic shield')
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
  assert(player.deck.subj.length === 2 && player.deck.adv.length === 3 && player.deck.verb.length === 4, 'starting deck uses 2-3-4 cards')
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
  assert(REWARD_PRICE.common < REWARD_PRICE.rare && REWARD_PRICE.rare < REWARD_PRICE.epic && REWARD_PRICE.epic < REWARD_PRICE.legendary, 'reward inspiration prices rise with rarity')
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
  for (const [day, rarity] of [[5, 'rare'], [10, 'epic'], [15, 'legendary']] as const) {
    assert(bossRewardRarity(day) === rarity, `boss floor ${day} uses its milestone rarity`)
    for (const phase of ['subject', 'verb'] as const) {
      const reward = genRewards(player, 5, day, phase)
      assert(reward.some((option) => option.kind === 'word' && option.rarity === rarity), `boss floor ${day} ${phase} reward includes a ${rarity} skill`)
    }
  }
  for (const day of [1, 2, 3, 4, 16, 17, 18, 19]) {
    for (const phase of ['subject', 'item', 'verb'] as const) {
      assert(!genRewards(player, 10, day, phase).some((option) => option.rarity === 'legendary'), `early floor ${floorInCycle(day)} blocks legendary ${phase} rewards`)
    }
  }
  for (const day of [3, 4, 5, 9, 10, 11, 12, 13, 14, 25, 26, 27, 28, 29]) {
    const tacticalIds = new Set(tacticalCardIdsForRewardDay(day))
    const reward = genRewards(player, 5, day, 'verb')
    assert(reward.some((option) => option.word && tacticalIds.has(option.word.id)), `boss-eve day ${day} offers a matching tactical verb`)
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
assert(compile({ subj: legacyWord }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }] }, words: {}, combos: [], conflicts: [] }).emotionResonance === 1, 'legacy emotion does not resonate')
assert(EARLY_WORDS.subj.every((subject) => subject.emotion !== 'neutral'), 'starting subjects carry emotions')

const resonanceCards = [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...SPECIAL_REWARD_WORDS]
assert(resonanceCards.length === 68, `resonance card total (${resonanceCards.length})`)
for (const slot of ['subj', 'adv', 'verb']) {
  const slotCards = resonanceCards.filter((card) => card.slot === slot)
  const expectedSlotCards = slot === 'verb' ? 28 : 20
  const expectedEmotionCards = slot === 'verb' ? 7 : 5
  assert(slotCards.length === expectedSlotCards, `${slot} card total (${slotCards.length})`)
  for (const emotion of ['joy', 'anger', 'sorrow', 'pleasure'] as const) {
    const count = slotCards.filter((card) => card.emotion === emotion).length
    assert(count === expectedEmotionCards, `${slot} ${emotion} balance (${count})`)
  }
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
  mantis.attackPatternIndex = 0
  let sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tokens.some((token) => token.text.includes('치켜든다')) && sentence.meta.includes('이번 행동 피해 없음'), 'mantis preparation sentence announces the harmless wind-up')
  mantis.attackPatternIndex = 1
  sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tone === 'danger' && sentence.meta.some((line) => line.startsWith('필요 방어 ')), 'mantis heavy sentence exposes the exact guard answer')
  mantis.groggyUntilTurn = s.turn
  mantis.groggyDamageMult = 1.5
  sentence = enemySentenceFor(s, mantis)!
  assert(sentence.tokens.some((token) => token.text === '휘청거린다'), 'mantis counter rewrites the promised attack into a stagger sentence')
}
{
  const queen = makeEnemy(ENEMIES.queenBee, 1, 1, 3)
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
  queen.groggyDamageMult = 1.5
  sentence = enemySentenceFor(s, queen)!
  assert(sentence.tokens.some((token) => token.text === '숨을 고른다') && sentence.meta.includes('다음 행동 스킵'), 'queen escort clear rewrites the attack into a recovery sentence')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 50, 1, 5)
  const s = state([spider]); s.playerMax = 100
  const sentence = enemySentenceFor(s, spider, { eventText: '「힘껏」 카드를 실로 묶었다.' })!
  assert(sentence.manuscript?.length === 5 && sentence.manuscript[0].active && sentence.manuscript[0].emotion === 'joy', 'spider manuscript mirrors the active sequential weakness')
  assert(sentence.eventText?.includes('힘껏') && sentence.meta.includes('방어 관통'), 'spider stolen word is written beside the persistent piercing intent')
  assert(enemyDamageRange(s, spider)[1] === 20, 'spider sentence damage preview reads the same one-fifth hp cap as combat')
}
console.log('combat effects: ok')
