import { compile } from '@core/compiler'
import { DECK_LIMITS, registerWord, reinforceWord, startingPlayer, type RunState } from '@core/run'
import { defaultPlayer } from '@core/player'
import { migrateCombatBalance } from '@core/save'
import type { EnemyDef, Intent, Word } from '@core/types'
import { wordValueLines } from '@core/wordText'
import { EARLY_WORDS, REWARD_WORDS, makeEarlyTables, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
import { endlessCycleFor, floorInCycle, stageFor } from '@data/stages'
import { genRewards, rewardGradeForDay } from '@data/rewards'
import { tacticalCardIdsForRewardDay } from '@data/tacticalCards'
import {
  activeEnemyPart,
  applyIntent,
  applyPendingAttack,
  applyPreparation,
  enemyTurn,
  makeEnemy,
  spiderWebAtTurnStart,
  spiderSealSlotForTurn,
  spiderWebTension,
  summonAtTurnStart,
  summonCount,
  type BattleState,
} from '../sim/reference'

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const foe = (id: string, extra: Partial<EnemyDef> = {}): EnemyDef => ({ id, name: id, hp: 30, atk: 4, every: 2, initiative: 'second', sprite: 'enemy_moth', note: '', ...extra })
const state = (enemies = [makeEnemy(foe('a'))]): BattleState => {
  if (enemies[0]) enemies[0].engaged = true
  return { playerHp: 30, playerMax: 30, guard: 0, counterMultiplier: 0, turn: 1, enemies, pending: null }
}
const attack = (extra: Partial<Intent> = {}): Intent => ({ sentence: 'check', targetMode: 'enemy', aoe: 'single', targetCount: 1, kind: 'attack', preempt: false, base: 10, multiplier: 1, variance: null, timing: 'immediate', guard: 0, heal: 0, recoil: 0, evade: 0, pierceGuard: false, hitCount: 1, counterMultiplier: 0, emotions: [], emotionResonance: 1, tags: [], combos: [], coherence: 1, penalties: [], critP: 0, failP: 0, statKey: null, growHp: 0, doubtCount: 0, breakdown: { flats: [], mults: [] }, ...extra });

{ const player = startingPlayer(); assert(player.stats.hp === 52 && player.stats.guard === 3, 'new run starts at hp 52 and guard 3') }
{ const player = defaultPlayer(); assert(player.stats.hp === 52 && player.stats.guard === 3, 'battle fallback starts at hp 52 and guard 3') }
{
  const legacy = { player: { ...startingPlayer(), stats: { hp: 20, atk: 5, guard: 5, heal: 5, luck: 3 } }, day: 4, endless: false, endingSeen: false } as Omit<RunState, 'balanceVersion'>
  assert(migrateCombatBalance(legacy as RunState) && legacy.player.stats.hp === 52 && legacy.player.stats.guard === 3, 'legacy base stats migrate once')
  assert(!migrateCombatBalance(legacy as RunState) && legacy.player.stats.hp === 52 && legacy.player.stats.guard === 3, 'combat balance migration is idempotent')
}
{
  const legacy = { player: { ...startingPlayer(), stats: { hp: 68, atk: 5, guard: 9, heal: 5, luck: 3 } }, day: 9, balanceVersion: 0, endless: false, endingSeen: false, reward: null }
  migrateCombatBalance(legacy)
  assert(legacy.player.stats.hp === 100 && legacy.player.stats.guard === 7, 'legacy growth survives combat balance migration')
}
{
  const stage = stageFor(5)
  const baseHit = Math.round(ENEMIES.mantis.atk * stage.atkMult)
  assert(startingPlayer().stats.hp > baseHit * 4, 'base hp survives four day-5 mantis baseline strikes')
}

{ const s = state([makeEnemy(foe('shield', { magicShield: 2, hp: 20 }))]); const r = applyIntent(s, attack({ hitCount: 3 }), 1, 0); assert(r.hits[0].magicShieldBroken && r.hits[0].magicShieldRemaining === 1 && r.hits[1].magicShieldRemaining === 0 && r.hits[2].dmg === 10 && s.enemies[0].hp === 10, 'layered magic shield and multihit') }
{ const s = state([makeEnemy(foe('guard', { guard: 8, hp: 20 }))]); const r = applyIntent(s, attack({ pierceGuard: true }), 1, 0); assert(r.hits[0].dmg === 10 && s.enemies[0].guard === 8, 'pierce guard') }
{ const s = state([makeEnemy(foe('a')), makeEnemy(foe('b')), makeEnemy(foe('c'))]); const r = applyIntent(s, attack({ targetCount: 3 }), 1, 0); assert(r.hits.map((h) => h.dmg).join(',') === '10,7,5', 'three targets') }
{ const s = state([makeEnemy(foe('weak', { weakEmotion: 'joy', hp: 20 }))]); const r = applyIntent(s, attack({ emotions: ['joy'] }), 1, 0); assert(r.hits[0].dmg === 13, 'weak emotion') }
{ const s = state([makeEnemy(foe('counter'))]); s.guard = 4; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.counterHit?.dmg === 6, 'counter') }
{ const s = state([makeEnemy(foe('mosquito', { pierceGuard: true }))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.piercedGuard && r.dealt === 4 && r.absorbed === 0 && s.guard === 7 && !r.counterHit, 'enemy pierces player guard') }
{ const s = state([makeEnemy(foe('guard-remains'))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.absorbed === 4 && s.guard === 3 && s.counterMultiplier === 1.5, 'guard remains after absorbing a smaller hit'); applyPreparation(s, attack(), 1); assert(s.guard === 3 && s.counterMultiplier === 1.5, 'non-guard preparation preserves remaining guard') }
{ const s = state([makeEnemy(foe('guard-stacks'))]); s.guard = 3; const r = applyPreparation(s, attack({ guard: 5 }), 1); assert(r.guardGain === 5 && s.guard === 8, 'new guard stacks with remaining guard') }
{ const card: Word = { id: 'counter', text: '', slot: 'verb', tags: [], emotion: 'sorrow', kind: 'guard', effects: { counterMultiplier: 1.5 }, note: '' }; reinforceWord(card); assert(card.effects?.counterMultiplier === 1.75, 'counter reinforce') }
{ const s = state([makeEnemy(foe('delay', { hp: 20 }))]); applyIntent(s, attack({ timing: 'delayed', hitCount: 2, pierceGuard: true, emotions: ['anger'] }), 1, 0); const r = applyPendingAttack(s)!; assert(r.hits.length === 2 && s.enemies[0].hp === 0, 'delayed plan') }
{ const boss = makeEnemy(foe('layered', { boss: true, hp: 20 }), 1, 1, 3); const s = state([boss]); const r = applyIntent(s, attack({ base: 45 }), 1, 0); assert(boss.maxHp === 60 && boss.hp === 15 && !boss.dead && r.hits[0].barsBroken === 2, 'boss damage crosses multiple health bars without a per-hit cap') }
{ const boss = makeEnemy(foe('phased', { boss: true, hp: 30, atk: 10 }), 1, 1, 3); const s = state([boss]); let r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'boss starts with attack1 and base damage'); boss.hp = 60; boss.nextAttackTurn = 1; r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 2 && r.dealt === 13, 'boss uses attack2 and x1.25 damage at two-thirds hp'); boss.hp = 30; boss.nextAttackTurn = 1; r = enemyTurn(s, () => 0, 'second')[0]; assert(r.attackStage === 3 && r.dealt === 15, 'boss uses attack3 and x1.5 damage at one-third hp') }
assert(ENEMIES.mantis.attackPattern?.map((step) => step.animationStage).join(',') === '1,2,3', 'mantis data maps normal, telegraph, and strong patterns to attack1, attack2, and attack3')
assert([1, 2, 3, 4, 5, 6].map((turn) => spiderSealSlotForTurn(['subj', 'adv', 'verb'], turn)).join(',') === 'subj,adv,verb,subj,adv,verb', 'spider web seal rotates evenly across subject, modifier, and verb slots')
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, animationStage: 1, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, animationStage: 2, damageScale: 0, telegraphText: '준비' }, { name: '큰낫 내려베기', bonusAtk: 0, animationStage: 3, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-pattern', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .9, 0, 0]; const rng = () => rolls.shift() ?? 0; let r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 7 && r.animationStage === 1 && r.text.includes('평타') && mantis.attackPatternIndex === 1, 'mantis normal attack uses attack1 and can advance after one hit'); mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 0 && r.animationStage === 2 && r.telegraphText === '준비', 'mantis telegraph uses attack2 without damage'); mantis.hp = 20; mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 8 && r.animationStage === 3 && r.lifeStolen === 4 && mantis.hp === 24 && !r.groggyEntered, 'mantis strong attack uses attack3; failed defense takes 1.2x damage and lifesteal without groggy'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'failed defense does not grant a vulnerability window') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, damageScale: 0, telegraphText: '준비' }]; const mantis = makeEnemy(foe('mantis-repeat', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .1, 0]; const rng = () => rolls.shift() ?? 0; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 0 && mantis.attackStepRepeated, 'mantis can randomly schedule a second normal attack'); mantis.nextAttackTurn = 1; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 1 && !mantis.attackStepRepeated, 'mantis normal attack repeats at most once before telegraphing') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-shatter', { atk: 7, attackPattern: pattern })); const s = state([mantis]); s.guard = 30; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardShattered && r.absorbed === 30 && r.dealt === 0 && r.lifeStolen === 0 && r.groggyEntered && s.guard === 0, 'successful defense erases guard, prevents 1.2x overflow and lifesteal, and opens groggy'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'successful defense grants the groggy damage window') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-first-groggy', { atk: 7, initiative: 'first', attackPattern: pattern })); const s = state([mantis]); s.guard = 11; const r = enemyTurn(s, () => 0, 'first')[0]; assert(r.guardRequired === 11 && r.groggyEntered && mantis.groggyUntilTurn === 1, 'visible guard requirement opens first-phase groggy only when fully met'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'first-phase groggy boosts the immediate main action'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'first-phase groggy does not grant a second boosted turn') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-short-guard', { atk: 7, attackPattern: pattern })); mantis.hp = 20; const s = state([mantis]); s.guard = 5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardRequired === 11 && !r.guardShattered && r.absorbed === 5 && r.dealt === 3 && r.lifeStolen === 2 && !r.groggyEntered, 'insufficient guard absorbs normally but does not open groggy') }
{ const regular = makeEnemy(foe('unphased', { hp: 30, atk: 10 })); regular.hp = 1; const r = enemyTurn(state([regular]), () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'regular enemy damage does not scale with low hp') }
{ const queen = makeEnemy(foe('queen-summon', { atk: 10, summonPattern: { name: '일벌', sprite: 'enemy_worker_bee', perTurn: 1, max: 4, maxPerSide: 2, attackBonusPerUnit: .5, releaseAt: 4 } })); const s = state([queen]); summonAtTurnStart(s); summonAtTurnStart(s); assert(queen.summonsLeft === 1 && queen.summonsRight === 0, 'queen summons only once at the same turn start'); s.turn = 2; summonAtTurnStart(s); s.turn = 3; summonAtTurnStart(s); s.turn = 4; summonAtTurnStart(s); assert(queen.summonsLeft === 2 && queen.summonsRight === 2, 'queen alternates summons up to two workers per side'); queen.nextAttackTurn = 1; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 12 && r.summonsReleased === 4 && summonCount(queen) === 0, 'four workers add only two damage then all leave on swarm charge') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 3, 'a 30-damage single-target attack defeats one full-health worker'); r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonsDispersed === 2 && summonCount(queen) === 1, 'a two-target attack carries its damage through two reachable workers'); r = applyIntent(s, attack({ base: 30, targetCount: 'all', aoe: 'all' }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 0, 'an all-target attack can reach the final worker') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1; const hp = queen.hp; const r = applyIntent(s, attack({ base: 120, targetCount: 1, pierceGuard: true }), 1, 0); assert(r.summonsDispersed === 4 && r.summonDamage === 120 && r.summonBacklashDamage === 4 && r.hits[0].dmg === 180 && queen.hp === hp - 184 && r.summonGroggyTriggered && queen.summonsDefeated === 0, 'a 120-damage piercing high roll defeats all four workers and reaches the groggy body'); assert(queen.nextAttackTurn === 2 && queen.groggyUntilTurn === 1 && queen.groggyDamageMult === 1.5, 'four workers skip the imminent attack and amplify the current sentence') }
{ const t = tablesForEncounter(makeEarlyTables(EARLY_WORDS), 'queenBee'); assert(t.words.verb.some((word) => word.id === 'queenBeeTactic' && word.targetCount === 2), 'queen encounter lends a two-target tactic even when the deck has no range answer') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); summonAtTurnStart(s); let r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(!r.summonGroggyTriggered && queen.summonsDefeated === 2, 'queen worker defeats accumulate between sentences'); s.turn = 2; summonAtTurnStart(s); queen.nextAttackTurn = 2; r = applyIntent(s, attack({ base: 60, targetCount: 2 }), 1, 0); assert(r.summonGroggyTriggered && queen.summonsDefeated === 0 && queen.nextAttackTurn === 3, 'the fourth cumulative worker triggers groggy and skips the due attack') }
{
  const queen = makeEnemy(ENEMIES.queenBee)
  const s = state([queen]); summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'queen opens with a complete four-worker wave')
  const hp = queen.hp
  let r = applyIntent(s, attack({ base: 30, targetCount: 1 }), 1, 0)
  assert(r.summonsDispersed === 1 && r.summonBacklashDamage === 1 && queen.hp === hp - 1, 'each defeated worker deals direct backlash through body immunity')
  assert(r.hits[0].summonShieldBlocked && r.hits[0].dmg === 0 && summonCount(queen) === 3, 'queen body remains immune while any worker survives')
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 3, 'a partially defeated worker wave does not refill')
  r = applyIntent(s, attack({ base: 60, targetCount: 1, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 2 && summonCount(queen) === 1 && r.hits[0].summonShieldBlocked, 'pierce carries overflow beyond the normal target limit but cannot reach the body while one survives')
}
{
  const queen = makeEnemy(ENEMIES.queenBee, 1, 1, 3)
  const s = state([queen]); summonAtTurnStart(s); queen.nextAttackTurn = 1
  const hp = queen.hp
  const r = applyIntent(s, attack({ base: 120, targetCount: 2, pierceGuard: true }), 1, 0)
  assert(r.summonsDispersed === 4 && r.summonBacklashDamage === 12 && r.summonGroggyTriggered, 'two-target pierce clears the complete worker wave and opens groggy')
  assert(r.hits[0].dmg === 180 && queen.hp === hp - 192, 'the wave-clearing sentence reaches the body with groggy damage after direct worker backlash')
  assert(queen.nextAttackTurn === 2 && queen.groggyUntilTurn === 1, 'worker-wave groggy skips the imminent queen attack for one turn')
  s.turn = 2; summonAtTurnStart(s)
  assert(summonCount(queen) === 4, 'queen summons a fresh four-worker wave after groggy recovery')
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
  const spider = makeEnemy(ENEMIES.elderSpider, stage.atkMult, stage.hpMult, stage.bossHealthBars)
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
  assert(r.hits[0].weak && r.hits[0].dmg === 75 && r.hits[0].barsBroken === 1, 'active spider leg weakness grants x1.5 and drops one leg')
  assert(r.hits[0].webBurst && r.hits[0].tensionReduced === 1 && spiderWebTension(spider) === 0, 'dropping one spider health bar blows away every web layer')
  assert(activeEnemyPart(spider)?.def.id === 'leg-anger', 'next leg reveals a different weakness after the current leg drops')
  r = applyIntent(s, attack({ base: 10, emotions: ['joy'] }), 1, 0)
  assert(!r.hits[0].weak && r.hits[0].dmg === 10, 'old spider weakness no longer applies to the next leg')
  // 약점을 빗나간 문장은 아무리 세도 지금 다리에서 멈춘다. 강한 문장 하나가
  // 다리 둘을 한꺼번에 끊으면 남은 약점이 드러날 순서를 잃는다.
  r = applyIntent(s, attack({ base: 900, emotions: ['joy'] }), 1, 0)
  assert(!r.hits[0].weak && r.hits[0].barsBroken === 1 && activeEnemyPart(spider)?.def.id === 'leg-sorrow', 'a missed weakness stops at the current leg instead of tearing through the next one')
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
  assert(r.hits[0].weak && r.hits[0].barsBroken === 1 && activeEnemyPart(spider)?.def.id === 'leg-anger', 'weakness alone stops after the current spider leg')
  r = applyIntent(s, attack({ base: 900, emotions: ['anger'], combos: ['완벽한 맥락'] }), 1, 0)
  assert(r.hits[0].weak && r.hits[0].barsBroken === 4 && spider.dead, 'weakness plus a named combo earns multi-part penetration')
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
  assert(first.length === 3 && first.some((option) => option.word?.slot === 'subj') && first.some((option) => option.word?.slot === 'adv'), 'first reward offers three subject/modifier cards with both slots represented')
  assert(second.length === 3 && second.every((option) => option.kind === 'item'), 'second reward offers three items')
  assert(third.length === 3 && third.every((option) => option.word?.slot === 'verb'), 'third reward offers three verbs')
  for (const day of [4, 9, 14]) {
    const tacticalIds = new Set(tacticalCardIdsForRewardDay(day))
    const reward = genRewards(player, 5, day, 'verb')
    assert(reward.some((option) => option.word && tacticalIds.has(option.word.id)), `boss-eve day ${day} offers a matching tactical verb`)
  }
  assert(genRewards(player, 5, 10, 'item').some((option) => option.rarity === 'legendary'), 'floor ten guarantees a legendary item each cycle')
  assert(genRewards(player, 5, 25, 'item').some((option) => option.rarity === 'legendary'), 'endless floor ten repeats the legendary item guarantee')
  assert(rewardGradeForDay(5, 15) > rewardGradeForDay(5, 1) && rewardGradeForDay(5, 16) === rewardGradeForDay(5, 1), 'reward grade rises through fifteen floors and resets next cycle')

  for (let i = 0; i < 4; i++) registerWord(player, { id: `limit-${i}`, text: `limit-${i}`, slot: 'subj', tags: [], emotion: 'joy', note: '' })
  const incoming: Word = { id: 'limit-new', text: 'limit-new', slot: 'subj', tags: [], emotion: 'joy', note: '' }
  const full = registerWord(player, incoming)
  assert(full.kind === 'needs-discard' && full.candidates.map((card) => card.id).join(',') === player.deck.subj.map((card) => card.id).join(','), 'full grammar deck exposes every owned card')
  if (full.kind === 'needs-discard') registerWord(player, incoming, full.candidates[full.candidates.length - 1].id)
  assert(player.deck.subj.length === 6 && player.deck.subj[player.deck.subj.length - 1]?.id === incoming.id, 'discarding an old card keeps the grammar deck at its cap')
}

const word = (id: string, emotion: Word['emotion']): Word => ({ id, text: id, slot: id === 'v' ? 'verb' : id, tags: [], emotion, note: '', kind: id === 'v' ? 'attack' : undefined, power: id === 'v' ? 10 : undefined })
const result = compile({ subj: word('subj', 'joy'), adv: word('adv', 'joy'), verb: word('v', 'joy') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [], multCap: 9 })
assert(result.emotionResonance === 1.3, 'emotion resonance')
const neutralResult = compile({ subj: word('subj', 'neutral'), adv: word('adv', 'neutral'), verb: word('v', 'neutral') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [], multCap: 9 })
assert(neutralResult.emotionResonance === 1, 'neutral cards do not resonate')
const legacyWord = { ...word('legacy', 'neutral'), emotion: undefined } as unknown as Word
assert(!wordValueLines(legacyWord).some((line) => line.cls.startsWith('emotion')), 'card values keep emotion in the icon badge')
assert(compile({ subj: legacyWord }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }] }, words: {}, combos: [], conflicts: [], multCap: 9 }).emotionResonance === 1, 'legacy emotion does not resonate')
assert(EARLY_WORDS.subj.every((subject) => subject.emotion !== 'neutral'), 'starting subjects carry emotions')

const resonanceCards = [...Object.values(EARLY_WORDS).flat(), ...REWARD_WORDS, ...SPECIAL_REWARD_WORDS]
assert(resonanceCards.length === 60, `resonance card total (${resonanceCards.length})`)
for (const slot of ['subj', 'adv', 'verb']) {
  const slotCards = resonanceCards.filter((card) => card.slot === slot)
  assert(slotCards.length === 20, `${slot} card total (${slotCards.length})`)
  for (const emotion of ['joy', 'anger', 'sorrow', 'pleasure'] as const) {
    const count = slotCards.filter((card) => card.emotion === emotion).length
    assert(count === 5, `${slot} ${emotion} balance (${count})`)
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
console.log('combat effects: ok')
