import { compile } from '@core/compiler'
import { reinforceWord } from '@core/run'
import type { EnemyDef, Intent, Word } from '@core/types'
import { wordValueLines } from '@core/wordText'
import { EARLY_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import { SPECIAL_REWARD_WORDS } from '@data/specialWords'
import { endlessCycleFor, floorInCycle, stageFor } from '@data/stages'
import { applyIntent, applyPendingAttack, applyPreparation, enemyTurn, makeEnemy, type BattleState } from '../sim/reference'

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }
const foe = (id: string, extra: Partial<EnemyDef> = {}): EnemyDef => ({ id, name: id, hp: 30, atk: 4, every: 2, initiative: 'second', sprite: 'enemy_moth', note: '', ...extra })
const state = (enemies = [makeEnemy(foe('a'))]): BattleState => {
  if (enemies[0]) enemies[0].engaged = true
  return { playerHp: 30, playerMax: 30, guard: 0, counterMultiplier: 0, turn: 1, enemies, pending: null }
}
const attack = (extra: Partial<Intent> = {}): Intent => ({ sentence: 'check', targetMode: 'enemy', aoe: 'single', targetCount: 1, kind: 'attack', preempt: false, base: 10, multiplier: 1, variance: null, timing: 'immediate', guard: 0, heal: 0, recoil: 0, evade: 0, pierceGuard: false, hitCount: 1, counterMultiplier: 0, emotions: [], emotionResonance: 1, tags: [], combos: [], coherence: 1, penalties: [], critP: 0, failP: 0, statKey: null, growHp: 0, doubtCount: 0, breakdown: { flats: [], mults: [] }, ...extra });

{ const s = state([makeEnemy(foe('shield', { magicShield: 1, hp: 20 }))]); const r = applyIntent(s, attack({ hitCount: 2 }), 1, 0); assert(r.hits[0].magicShieldBroken && r.hits[1].dmg === 10 && s.enemies[0].hp === 10, 'magic shield and multihit') }
{ const s = state([makeEnemy(foe('guard', { guard: 8, hp: 20 }))]); const r = applyIntent(s, attack({ pierceGuard: true }), 1, 0); assert(r.hits[0].dmg === 10 && s.enemies[0].guard === 8, 'pierce guard') }
{ const s = state([makeEnemy(foe('a')), makeEnemy(foe('b')), makeEnemy(foe('c'))]); const r = applyIntent(s, attack({ targetCount: 3 }), 1, 0); assert(r.hits.map((h) => h.dmg).join(',') === '10,7,5', 'three targets') }
{ const s = state([makeEnemy(foe('weak', { weakEmotion: 'joy', hp: 20 }))]); const r = applyIntent(s, attack({ emotions: ['joy'] }), 1, 0); assert(r.hits[0].dmg === 13, 'weak emotion') }
{ const s = state([makeEnemy(foe('counter'))]); s.guard = 4; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.counterHit?.dmg === 6, 'counter') }
{ const s = state([makeEnemy(foe('mosquito', { pierceGuard: true }))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.piercedGuard && r.dealt === 4 && r.absorbed === 0 && s.guard === 7 && !r.counterHit, 'enemy pierces player guard') }
{ const s = state([makeEnemy(foe('guard-remains'))]); s.guard = 7; s.counterMultiplier = 1.5; const r = enemyTurn(s, () => 0, 'second')[0]; assert(r.dealt === 0 && r.absorbed === 4 && s.guard === 3 && s.counterMultiplier === 1.5, 'guard remains after absorbing a smaller hit'); applyPreparation(s, attack(), 1); assert(s.guard === 3 && s.counterMultiplier === 1.5, 'non-guard preparation preserves remaining guard') }
{ const card: Word = { id: 'counter', text: '', slot: 'verb', tags: [], emotion: 'sorrow', kind: 'guard', effects: { counterMultiplier: 1.5 }, note: '' }; reinforceWord(card); assert(card.effects?.counterMultiplier === 1.75, 'counter reinforce') }
{ const s = state([makeEnemy(foe('delay', { hp: 20 }))]); applyIntent(s, attack({ timing: 'delayed', hitCount: 2, pierceGuard: true, emotions: ['anger'] }), 1, 0); const r = applyPendingAttack(s)!; assert(r.hits.length === 2 && s.enemies[0].hp === 0, 'delayed plan') }

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
assert(stageFor(20).encounter.join(',') === 'saltSkater', 'endless floor 5 repeats first boss')
assert(stageFor(25).encounter.join(',') === 'queenBee', 'endless floor 10 repeats second boss')
assert(stageFor(30).encounter.join(',') === 'elderSpider', 'endless floor 15 repeats final boss')
assert(stageFor(16).encounter.join(',') === stageFor(1).encounter.join(','), 'endless roster repeats every fifteen floors')
assert(stageFor(16).hpMult > stageFor(1).hpMult && stageFor(16).atkMult > stageFor(1).atkMult, 'endless repeat keeps scaling')

const word = (id: string, emotion: Word['emotion']): Word => ({ id, text: id, slot: id === 'v' ? 'verb' : id, tags: [], emotion, note: '', kind: id === 'v' ? 'attack' : undefined, power: id === 'v' ? 10 : undefined })
const result = compile({ subj: word('subj', 'joy'), adv: word('adv', 'joy'), verb: word('v', 'joy') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [], multCap: 9 })
assert(result.emotionResonance === 1.3, 'emotion resonance')
const neutralResult = compile({ subj: word('subj', 'neutral'), adv: word('adv', 'neutral'), verb: word('v', 'neutral') }, { template: { slots: [{ key: 'subj', label: '', role: 'subject' }, { key: 'adv', label: '', role: 'modifier' }, { key: 'verb', label: '', role: 'verb' }] }, words: {}, combos: [], conflicts: [], multCap: 9 })
assert(neutralResult.emotionResonance === 1, 'neutral cards do not resonate')
const legacyWord = { ...word('legacy', 'neutral'), emotion: undefined } as unknown as Word
assert(wordValueLines(legacyWord)[0].text.includes('무감정'), 'legacy save emotion fallback')
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
