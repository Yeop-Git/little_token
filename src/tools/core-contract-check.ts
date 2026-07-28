import assert from 'node:assert/strict'
import { RUN_SAVE_SCHEMA_VERSION, newRun } from '@core/run'
import { deserializeRun, serializeRun } from '@core/save'

const original = newRun()
original.day = 7
original.combat = { hp: 31, guard: 9 }
original.reward = { day: 7, grade: 2, phase: 'item', picks: [{ kind: 'word', id: 'na' }] }

const roundTrip = deserializeRun(serializeRun(original))
assert(roundTrip, 'current save must deserialize')
assert.equal(roundTrip.schemaVersion, RUN_SAVE_SCHEMA_VERSION, 'save schema version must be current')
assert.equal(roundTrip.day, 7, 'day must survive a round trip')
assert.deepEqual(roundTrip.combat, original.combat, 'persistent hp and guard must survive a round trip')
assert.deepEqual(roundTrip.reward, original.reward, 'pending reward must survive a round trip')

const legacy = structuredClone(original) as unknown as Record<string, unknown>
delete legacy.schemaVersion
delete legacy.combat
delete legacy.record
delete legacy.endless
delete legacy.endingSeen
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
assert.equal(migrated.player.deck.subj[0].text, '나는', 'stale card definition must migrate to current data')
assert.equal(migrated.player.items.some((item) => item.id === 'removed-by-update'), false, 'unknown item must be removed')
assert.equal(migrated.player.stats.atk, original.player.stats.atk, 'removed item stats must be subtracted')

assert.equal(deserializeRun('{broken json'), null, 'malformed JSON must be rejected')
assert.equal(deserializeRun(JSON.stringify({ day: 1 })), null, 'invalid save shape must be rejected')

console.log('핵심 계약 통과 — 저장 왕복 · 구버전 마이그레이션 · 손상 저장 거부 · 삭제 콘텐츠 복구')
