import assert from 'node:assert/strict'
import {
  RUN_SAVE_SCHEMA_VERSION,
  checkpointStoryEnding,
  completeStoryEnding,
  gainInspiration,
  newRun,
  preparePendingReward,
  spendInspiration,
} from '@core/run'
import { deserializeRun, serializeRun } from '@core/save'
import { inkExceedsLimit, inkOverdraw, selectionInkCost, SENTENCE_BASE_INK, wordInkCost } from '@core/ink'
import { EARLY_COMBOS, EARLY_WORDS, SPECIAL_REWARD_WORDS } from '@data/earlyWords'
import { applyInkOverdraw, type BattleState } from '@/sim/reference'
import { availableCombos } from '@core/deckInsights'
import { floorsForEdition, isEditionFinalFloor, strictResourceError } from '@/config/edition'
import { clearRewardValue, gradeFloor, gradeForElapsedTurns, startGrade } from '@core/grade'
import { EARLY_BUILD_CARD_IDS, EARLY_BUILD_REWARD_DAY, genRewards } from '@data/rewards'

const speedGrades = Array.from({ length: 7 }, (_, elapsed) => gradeForElapsedTurns(3, elapsed))
assert.deepEqual(speedGrades, [5, 5, 5, 4, 4, 4, 3], 'reward grade falls once per three completed sentences until the luck floor')
assert.equal(gradeForElapsedTurns(3, 0), startGrade(3), 'a first-turn clear keeps the full starting grade')
assert.equal(speedGrades[speedGrades.length - 1], gradeFloor(3), 'a long battle stops at the luck floor')
assert.equal(clearRewardValue(4, 2), 6, 'unused free draws add to earned inspiration without changing speed grade')

const original = newRun()
original.day = 7
original.combat = { hp: 31, guard: 9 }
original.reward = {
  day: 7,
  grade: 2,
  earned: 4,
  phase: 'item',
  picks: [{ kind: 'word', id: 'na' }],
  seed: 17,
  refreshes: { subject: 0, item: 1, verb: 0 },
}

const roundTrip = deserializeRun(serializeRun(original))
assert(roundTrip, 'current save must deserialize')
assert.equal(roundTrip.schemaVersion, RUN_SAVE_SCHEMA_VERSION, 'save schema version must be current')
assert.equal(roundTrip.day, 7, 'day must survive a round trip')
assert.deepEqual(roundTrip.combat, original.combat, 'persistent hp and guard must survive a round trip')
assert.deepEqual(roundTrip.reward, original.reward, 'pending reward must survive a round trip')
assert.equal(roundTrip.inspiration, original.inspiration, 'inspiration wallet must survive a round trip')

assert.equal(gainInspiration(original, 4), 4, 'reward value must convert to inspiration')
assert.equal(original.inspiration, 4, 'inspiration must accumulate across clears')
assert.equal(spendInspiration(original, 3), true, 'affordable reward must spend inspiration')
assert.equal(original.inspiration, 1, 'purchase must deduct its exact inspiration cost')
assert.equal(spendInspiration(original, 2), false, 'unaffordable reward must be rejected')
assert.equal(original.inspiration, 1, 'rejected purchase must preserve the wallet')

const endingRun = newRun()
endingRun.day = 15
checkpointStoryEnding(endingRun, 3, 5)
const endingCheckpoint = deserializeRun(serializeRun(endingRun))
assert(endingCheckpoint, 'ending checkpoint must survive a save round trip')
assert.equal(endingCheckpoint.pendingEndingGrade, 3, 'ending checkpoint must preserve the earned reward grade')
assert.equal(endingCheckpoint.pendingEndingEarned, 5, 'ending checkpoint must preserve draw-bonus inspiration separately')
completeStoryEnding(endingCheckpoint)
assert.equal(endingCheckpoint.pendingEndingGrade, null, 'completed ending must clear its resume checkpoint')
assert.equal(endingCheckpoint.pendingEndingEarned, null, 'completed ending must clear its pending inspiration value')
assert.equal(endingCheckpoint.endingSeen, true, 'completed ending must be recorded')
assert.equal(endingCheckpoint.endless, true, 'completed ending must unlock endless mode')
const pendingAfterEnding = preparePendingReward(endingCheckpoint, 3, 1234, 5)
assert.equal(endingCheckpoint.inspiration, 5, 'ending reward must credit speed grade plus unused-draw inspiration')
assert.equal(pendingAfterEnding.grade, 3, 'reward rarity must keep using speed grade only')
assert.equal(pendingAfterEnding.earned, 5, 'reward screen must preserve the actual inspiration credited')
assert.equal(pendingAfterEnding.seed, 1234, 'ending reward must preserve its offer seed')
assert.equal(preparePendingReward(endingCheckpoint, 9, 9999), pendingAfterEnding, 'same-day reward preparation must be idempotent')
assert.equal(endingCheckpoint.inspiration, 5, 'resuming an existing reward must not duplicate inspiration')

const starterSentence = {
  subj: EARLY_WORDS.subj[0],
  adv: EARLY_WORDS.adv[0],
  verb: EARLY_WORDS.verb[0],
}
assert(selectionInkCost(starterSentence) <= SENTENCE_BASE_INK, 'a starter sentence must fit in base ink')
assert.equal(wordInkCost({ ...EARLY_WORDS.subj[0], bonus: 1 }), wordInkCost(EARLY_WORDS.subj[0]), 'explicit card cost must not rise after reinforcement')
const implicitSubject = { ...EARLY_WORDS.subj[0], inkCost: undefined }
assert(wordInkCost({ ...implicitSubject, bonus: 1 }) > wordInkCost(implicitSubject), 'implicit fallback cost follows expected strength')
assert.equal(inkOverdraw(6, 6), 0, 'base six ink must be safe')
assert.equal(inkOverdraw(7, 6), 1, 'the first ink above the available pool costs one health')
assert.equal(inkOverdraw(9, 6), 3, 'overdraw reports exact health damage even beyond the selectable limit')
assert.equal(inkExceedsLimit(9, 6), true, 'more than two overdraw is not selectable')
assert(SPECIAL_REWARD_WORDS.every((word) => word.inkCost == null), 'special reward verbs must use the shared value-based Ink formula')
const specialCost = (id: string) => wordInkCost(SPECIAL_REWARD_WORDS.find((word) => word.id === id)!)
assert.equal(specialCost('magicVeil'), 5, 'one-hit magic shield is valued as a maximum-cost epic verb')
assert.equal(specialCost('storedResolve'), 5, 'two-target current-guard damage is a maximum-cost rare build engine')
assert.equal(specialCost('overflowingHeart'), 4, 'overheal conversion is priced for healing and damage flexibility')
assert.equal(specialCost('drinkInk'), 3, 'lifesteal pays one Ink above the rare tier base')
const earlyBuildOffers = genRewards(original.player, 5, EARLY_BUILD_REWARD_DAY, 'verb', () => 0.5)
assert.deepEqual(
  new Set(earlyBuildOffers.map((option) => option.word?.id)),
  new Set(EARLY_BUILD_CARD_IDS),
  'the second-floor verb reward must offer all three early build engines',
)
const inkState = { playerHp: 9, playerMax: 9, guard: 4, counterMultiplier: 0, turn: 1, enemies: [], pending: null } satisfies BattleState
assert.equal(applyInkOverdraw(inkState, 9, 6), 3, 'overdraw must report its exact damage')
assert.equal(inkState.playerHp, 6, 'overdraw must spend health')
assert.equal(inkState.guard, 4, 'overdraw must bypass guard')

const starterCombos = availableCombos(EARLY_WORDS, EARLY_COMBOS)
assert(starterCombos.length > 0, 'starter deck must expose at least one completable idiom')
assert.equal(new Set(starterCombos.map((combo) => combo.name)).size, starterCombos.length, 'available idioms must be unique')
assert.deepEqual(availableCombos({}, EARLY_COMBOS), [], 'an empty deck cannot complete an idiom')
assert.equal(floorsForEdition('demo'), 5, 'demo must advertise five stages')
assert.equal(floorsForEdition('full'), 15, 'full edition must advertise fifteen stages')
assert.equal(isEditionFinalFloor(5, 'demo'), true, 'demo must end after the floor-five boss')
assert.equal(isEditionFinalFloor(5, 'full'), false, 'full edition must continue after floor five')
assert.equal(isEditionFinalFloor(15, 'full'), true, 'full edition must end its story at floor fifteen')

const legacy = structuredClone(original) as unknown as Record<string, unknown>
delete legacy.schemaVersion
delete legacy.combat
delete legacy.record
delete legacy.endless
delete legacy.endingSeen
delete legacy.pendingEndingGrade
delete legacy.pendingEndingEarned
delete legacy.inspiration
legacy.reward = { day: 7, grade: 2, phase: 'subject' }
const legacyPlayer = legacy.player as typeof original.player
legacyPlayer.deck.subj[0] = { ...legacyPlayer.deck.subj[0], text: '오래된 카드명', emotion: undefined } as unknown as typeof legacyPlayer.deck.subj[number]
legacyPlayer.items.push({
  id: 'removed-by-update',
  name: '사라진 아이템',
  art: 'missing',
  line: '',
  stats: { atk: 2 },
})
legacyPlayer.stats.atk += 2

const migrated = deserializeRun(JSON.stringify(legacy))
assert(migrated, 'legacy save must migrate')
assert.equal(migrated.schemaVersion, RUN_SAVE_SCHEMA_VERSION, 'legacy save must gain a schema version')
assert.deepEqual(migrated.combat, { hp: migrated.player.stats.hp, guard: 0 }, 'legacy combat resources must be restored safely')
assert.deepEqual(migrated.record.kills, {}, 'legacy save must gain an empty run record')
assert.equal(migrated.endless, false, 'story run must not migrate into endless mode')
assert.equal(migrated.pendingEndingGrade, null, 'legacy save must start without a pending ending')
assert.equal(migrated.pendingEndingEarned, null, 'legacy save must start without pending ending inspiration')
assert.equal(migrated.reward?.picks.length, 0, 'legacy pending reward must gain pick history')
assert.equal(migrated.reward?.earned, 2, 'legacy pending reward must use its grade as the credited amount')
assert.equal(migrated.reward?.refreshes.subject, 0, 'legacy pending reward must gain refresh history')
assert.equal(typeof migrated.reward?.seed, 'number', 'legacy pending reward must gain a stable offer seed')
assert.equal(migrated.inspiration, 0, 'legacy save must start with an empty inspiration wallet')
assert.equal(migrated.player.deck.subj[0].text, '나는', 'stale card definition must migrate to current data')
assert.equal(migrated.player.items.some((item) => item.id === 'removed-by-update'), false, 'unknown item must be removed')
assert.equal(migrated.player.stats.atk, original.player.stats.atk, 'removed item stats must be subtracted')

const damaged = structuredClone(original) as unknown as Record<string, unknown>
damaged.schemaVersion = RUN_SAVE_SCHEMA_VERSION - 1
damaged.reward = 'broken reward state'
damaged.record = {
  kills: { termite: 4, broken: 'many' },
  bestHit: { dmg: 'huge', sentence: 7 },
  bestMult: Number.NaN,
  bestCombo: 3.8,
  sentences: -2,
  daysCleared: 2,
}
const damagedPlayer = damaged.player as unknown as Record<string, unknown>
damagedPlayer.deck = {
  subj: [{ id: 'deleted-subject', level: 9 }],
  adv: 'broken-slot',
  verb: [
    { id: 'baksal', level: 2 },
    { id: 'focusStrike', level: 3 },
    { id: 'deleted-verb', level: 20 },
  ],
}
damagedPlayer.items = [
  {
    id: 'echoChime',
    name: 'stale item name',
    rarity: 'common',
    art: 'missing',
    line: 'saved exclamation',
    stats: { luck: 2 },
    passive: 'deleted-passive',
  },
  {
    id: 'removed-by-update',
    name: 'deleted item',
    art: 'missing',
    line: '',
    stats: { atk: 2 },
  },
]
const damagedStats = damagedPlayer.stats as typeof original.player.stats
damagedStats.atk += 2

const recovered = deserializeRun(JSON.stringify(damaged))
assert(recovered, 'partially damaged save must recover')
assert.deepEqual(
  recovered.player.deck.subj.map((word) => word.id),
  EARLY_WORDS.subj.map((word) => word.id),
  'a slot containing only deleted cards must regain its starter cards',
)
assert.deepEqual(
  recovered.player.deck.adv.map((word) => word.id),
  EARLY_WORDS.adv.map((word) => word.id),
  'a malformed slot must regain its starter cards',
)
assert.equal(recovered.player.deck.verb.length, 1, 'deleted cards must not remain in a recovered slot')
assert.equal(recovered.player.deck.verb[0].id, 'focusStrike', 'renamed cards must use the current ID')
assert.equal(recovered.player.deck.verb[0].level, 5, 'renamed and current duplicate card levels must merge')
assert.equal(recovered.player.items.length, 1, 'deleted items must be removed from a damaged save')
assert.equal(recovered.player.items[0].name, '누댕의 메아리', 'known item display data must use the current definition')
assert.equal(recovered.player.items[0].passive, 'echo', 'stale passive IDs must use the current item definition')
assert.equal(recovered.player.items[0].line, 'saved exclamation', 'the player-authored exclamation must survive item migration')
assert.equal(recovered.player.stats.atk, original.player.stats.atk, 'deleted item stats must be withdrawn during recovery')
assert.equal(recovered.reward, null, 'a malformed pending reward must be cleared without discarding the run')
assert.deepEqual(recovered.record.kills, { termite: 4 }, 'valid kill history must survive partial record damage')
assert.equal(recovered.record.bestHit, null, 'a malformed best hit must be discarded')
assert.equal(recovered.record.bestCombo, 3, 'fractional counters must normalize to whole counts')
assert.equal(recovered.record.sentences, 0, 'negative counters must clamp to zero')

const future = structuredClone(original)
future.schemaVersion = RUN_SAVE_SCHEMA_VERSION + 1
assert.equal(deserializeRun(JSON.stringify(future)), null, 'a newer save schema must not be silently downgraded')

assert.equal(deserializeRun('{broken json'), null, 'malformed JSON must be rejected')
assert.equal(deserializeRun(JSON.stringify({ day: 1 })), null, 'invalid save shape must be rejected')

assert.match(
  strictResourceError('image load', '/missing.webp').message,
  /^\[resource:strict\] image load failed: \/missing\.webp$/,
  'strict resource failures must identify the resource kind and URL',
)

console.log('핵심 계약 통과 — 저장 왕복 · 구버전 마이그레이션 · 부분 손상 복구 · 완전 손상/미래 버전 거부 · 엔딩/보상 재개 · 단어장 관용구 분석')
