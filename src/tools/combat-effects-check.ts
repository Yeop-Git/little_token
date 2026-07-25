import { compile } from '@core/compiler'
import { reinforceWord } from '@core/run'
import type { EnemyDef, Intent, Word } from '@core/types'
import { wordValueLines } from '@core/wordText'
import { EARLY_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
import { endlessCycleFor, floorInCycle, stageFor } from '@data/stages'
import {
  activeEnemyPart,
  applyIntent,
  applyPendingAttack,
  applyPreparation,
  enemyTurn,
  makeEnemy,
  spiderWebAtTurnStart,
  spiderWebAttackBonus,
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
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, damageScale: 0, telegraphText: '준비' }, { name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-pattern', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .9, 0, 0]; const rng = () => rolls.shift() ?? 0; let r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 7 && r.text.includes('평타') && mantis.attackPatternIndex === 1, 'mantis can advance after one normal attack'); mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 0 && r.telegraphText === '준비', 'mantis telegraphs the strong attack without damage'); mantis.hp = 20; mantis.nextAttackTurn = 1; r = enemyTurn(s, rng, 'second')[0]; assert(r.dealt === 8 && r.lifeStolen === 4 && mantis.hp === 24 && !r.groggyEntered, 'failed defense takes 1.2x damage and lifesteal without groggy'); assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 10, 'failed defense does not grant a vulnerability window') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '평타', bonusAtk: 0, repeatOnceChance: .5 }, { name: '강공격 자세', bonusAtk: 0, damageScale: 0, telegraphText: '준비' }]; const mantis = makeEnemy(foe('mantis-repeat', { atk: 7, attackPattern: pattern })); const s = state([mantis]); const rolls = [0, .1, 0]; const rng = () => rolls.shift() ?? 0; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 0 && mantis.attackStepRepeated, 'mantis can randomly schedule a second normal attack'); mantis.nextAttackTurn = 1; enemyTurn(s, rng, 'second'); assert(mantis.attackPatternIndex === 1 && !mantis.attackStepRepeated, 'mantis normal attack repeats at most once before telegraphing') }
{ const pattern: NonNullable<EnemyDef['attackPattern']> = [{ name: '큰낫 내려베기', bonusAtk: 0, damageScale: 1.2, shatterGuard: true, lifeStealRate: .5, groggyDamageMult: 1.5, groggyRequiresGuardShatter: true }]; const mantis = makeEnemy(foe('mantis-shatter', { atk: 7, attackPattern: pattern })); const s = state([mantis]); s.guard = 30; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.guardShattered && r.absorbed === 30 && r.dealt === 0 && r.lifeStolen === 0 && r.groggyEntered && s.guard === 0, 'successful defense erases guard, prevents 1.2x overflow and lifesteal, and opens groggy'); s.turn = 2; assert(applyIntent(s, attack({ base: 10 }), 1, 0).hits[0].dmg === 15, 'successful defense grants the groggy damage window') }
{ const regular = makeEnemy(foe('unphased', { hp: 30, atk: 10 })); regular.hp = 1; const r = enemyTurn(state([regular]), () => 0, 'second')[0]; assert(r.attackStage === 1 && r.dealt === 10, 'regular enemy damage does not scale with low hp') }
{ const queen = makeEnemy(foe('queen-summon', { atk: 10, summonPattern: { name: '일벌', sprite: 'enemy_worker_bee', perTurn: 1, max: 4, maxPerSide: 2, attackBonusPerUnit: .5, releaseAt: 4 } })); const s = state([queen]); summonAtTurnStart(s); summonAtTurnStart(s); assert(queen.summonsLeft === 1 && queen.summonsRight === 0, 'queen summons only once at the same turn start'); s.turn = 2; summonAtTurnStart(s); s.turn = 3; summonAtTurnStart(s); s.turn = 4; summonAtTurnStart(s); assert(queen.summonsLeft === 2 && queen.summonsRight === 2, 'queen alternates summons up to two workers per side'); queen.nextAttackTurn = 1; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 12 && r.summonsReleased === 4 && summonCount(queen) === 0, 'four workers add only two damage then all leave on swarm charge') }
{ const queen = makeEnemy(ENEMIES.queenBee); const s = state([queen]); for (let turn = 1; turn <= 4; turn++) { s.turn = turn; summonAtTurnStart(s) } let r = applyIntent(s, attack({ targetCount: 2 }), 1, 0); assert(r.summonsDispersed === 1 && summonCount(queen) === 3, 'two-target attack disperses one worker without reducing boss damage'); r = applyIntent(s, attack({ targetCount: 'all', aoe: 'all' }), 1, 0); assert(r.summonsDispersed === 3 && summonCount(queen) === 0, 'all-target attack disperses every remaining worker') }
{ const stage = stageFor(10); const queen = makeEnemy(ENEMIES.queenBee, stage.atkMult, stage.hpMult, stage.bossHealthBars); const s = state([queen]); summonAtTurnStart(s); const r = enemyTurn(s, () => .999, 'second')[0]; assert(r.dealt < s.playerMax && queen.nextAttackTurn === 4, 'day-10 queen cannot one-shot base hp on her worst opening roll and gives three turns before attacking again') }
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 9)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  assert(spider.parts.length === 9 && activeEnemyPart(spider)?.def.id === 'leg-force', 'spider starts with eight sequential legs and one body')
  let web = spiderWebAtTurnStart(s)!
  assert(web.tension === 1 && spiderWebAtTurnStart(s) === null, 'spider web advances once per turn')
  let r = applyIntent(s, attack({ base: 28, tags: ['force'] }), 1, 0)
  assert(r.hits[0].weak && r.hits[0].dmg === 42 && r.hits[0].barsBroken === 1, 'active spider leg weakness grants x1.5 and drops one leg')
  assert(r.hits[0].webBurst && r.hits[0].webBurstReason === 'part' && r.hits[0].tensionReduced === 1 && spiderWebTension(spider) === 0, 'dropping one spider health bar blows away every web layer')
  assert(activeEnemyPart(spider)?.def.id === 'leg-joy', 'next leg reveals a different weakness after the current leg drops')
  r = applyIntent(s, attack({ base: 10, tags: ['force'] }), 1, 0)
  assert(!r.hits[0].weak && r.hits[0].dmg === 10, 'old spider weakness no longer applies to the next leg')
  s.turn = 2
  web = spiderWebAtTurnStart(s)!
  s.turn = 3
  web = spiderWebAtTurnStart(s)!
  assert(web.tension === 2 && spiderWebTension(spider) === 2 && spiderWebAttackBonus(spider) === 1, 'unchecked web tension gradually adds attack')
  s.turn = 4
  spiderWebAtTurnStart(s)
  s.turn = 5
  spiderWebAtTurnStart(s)
  spider.nextAttackTurn = 1
  spider.initiativePhase = 'first'
  const finisher = enemyTurn(s, () => .999, 'first')[0]
  assert(finisher.webFinisher && finisher.webReleased && finisher.dealt <= Math.round(s.playerMax * .55) && s.playerHp >= 1, 'web finisher is spectacular but explicitly nonlethal')
  assert(spiderWebTension(spider) === 0, 'web finisher releases the arena tension after it lands')
}
{
  const spider = makeEnemy(ENEMIES.elderSpider, 1, 1, 9)
  spider.guard = 0
  spider.magicShield = 0
  const s = state([spider])
  spiderWebAtTurnStart(s)
  s.turn = 2
  spiderWebAtTurnStart(s)
  s.turn = 3
  spiderWebAtTurnStart(s)
  const r = applyIntent(s, attack({ base: 1, emotions: ['joy', 'joy'] }), 1, 0)
  assert(r.hits[0].barsBroken === 0 && !r.hits[0].weak, 'emotion burst test does not accidentally break or match the active leg')
  assert(r.hits[0].webBurst && r.hits[0].webBurstReason === 'emotion' && r.hits[0].tensionReduced === 3, 'two-card emotion resonance blows away every web layer')
  assert(spiderWebTension(spider) === 0, 'emotion resonance leaves spider web tension at zero')
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
assert(stageFor(5).bossHealthBars === 3 && stageFor(10).bossHealthBars === 4 && stageFor(15).bossHealthBars === 9, 'boss health bars grow by stage')
assert(stageFor(16).encounter.join(',') === stageFor(1).encounter.join(','), 'endless roster repeats every fifteen floors')
assert(stageFor(16).hpMult > stageFor(1).hpMult && stageFor(16).atkMult > stageFor(1).atkMult, 'endless repeat keeps scaling')

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
