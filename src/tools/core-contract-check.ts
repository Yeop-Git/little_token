import assert from 'node:assert/strict'
import { RUN_SAVE_SCHEMA_VERSION, gainInspiration, newRun, spendInspiration } from '@core/run'
import { deserializeRun, serializeRun } from '@core/save'
import { inkOverdraw, selectionInkCost, SENTENCE_INK, wordInkCost } from '@core/ink'
import { EARLY_WORDS } from '@data/earlyWords'
import { applyInkOverdraw, type BattleState } from '@/sim/reference'

const original = newRun()
original.day = 7
original.combat = { hp: 31, guard: 9 }
original.reward = {
  day: 7,
  grade: 2,
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

const starterSentence = {
  subj: EARLY_WORDS.subj[0],
  adv: EARLY_WORDS.adv[0],
  verb: EARLY_WORDS.verb[0],
}
assert(selectionInkCost(starterSentence) <= SENTENCE_INK, 'a starter sentence must fit in ten ink')
assert(wordInkCost({ ...EARLY_WORDS.subj[0], rarity: 'legendary' }) > wordInkCost(EARLY_WORDS.subj[0]), 'higher rarity must cost more ink')
assert(wordInkCost({ ...EARLY_WORDS.subj[0], bonus: 1 }) > wordInkCost(EARLY_WORDS.subj[0]), 'stronger rules must cost more within the same rarity')
assert.equal(inkOverdraw(10), 0, 'spending exactly ten ink must be safe')
assert.equal(inkOverdraw(11), 1, 'the first ink above ten must cost one health')
assert.equal(inkOverdraw(13), 3, 'ink overdraw must equal health damage')
const inkState = { playerHp: 9, playerMax: 9, guard: 4, counterMultiplier: 0, turn: 1, enemies: [], pending: null } satisfies BattleState
assert.equal(applyInkOverdraw(inkState, 13), 3, 'overdraw must report its exact damage')
assert.equal(inkState.playerHp, 6, 'overdraw must spend health')
assert.equal(inkState.guard, 4, 'overdraw must bypass guard')

const legacy = structuredClone(original) as unknown as Record<string, unknown>
delete legacy.schemaVersion
delete legacy.combat
delete legacy.record
delete legacy.endless
delete legacy.endingSeen
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
assert.equal(migrated.reward?.picks.length, 0, 'legacy pending reward must gain pick history')
assert.equal(migrated.reward?.refreshes.subject, 0, 'legacy pending reward must gain refresh history')
assert.equal(typeof migrated.reward?.seed, 'number', 'legacy pending reward must gain a stable offer seed')
assert.equal(migrated.inspiration, 0, 'legacy save must start with an empty inspiration wallet')
assert.equal(migrated.player.deck.subj[0].text, '나는', 'stale card definition must migrate to current data')
assert.equal(migrated.player.items.some((item) => item.id === 'removed-by-update'), false, 'unknown item must be removed')
assert.equal(migrated.player.stats.atk, original.player.stats.atk, 'removed item stats must be subtracted')

assert.equal(deserializeRun('{broken json'), null, 'malformed JSON must be rejected')
assert.equal(deserializeRun(JSON.stringify({ day: 1 })), null, 'invalid save shape must be rejected')

console.log('핵심 계약 통과 — 저장 왕복 · 구버전 마이그레이션 · 손상 저장 거부 · 삭제 콘텐츠 복구')
