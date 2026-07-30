import type { Word } from '@core/types'

/**
 * 승리 보상에서만 나오는 전투 규칙 카드. 수치보다 행동 규칙을 바꾸므로 기존
 * 문장 예산표와 분리했고, 각 카드의 결과는 note와 wordValueLines에 그대로 적힌다.
 *
 * art는 동사 번호 3009~3020을 아래 배열 순서대로 쓴다(3001~3006 초기 · 3007~3008 보상).
 */
export const SPECIAL_REWARD_WORDS: Word[] = [
  { id: 'focusStrike', text: '집중해서 찍었다', slot: 'verb', tags: ['focus', 'atk'], emotion: 'anger', stat: 'atk', statMult: 1.5, kind: 'attack', targetCount: 1, art: '3009', rarity: 'rare', note: '공격 ×1.5 · 1명', lore: '한 줄에만 진하게 눌러 쓴다.' },
  { id: 'pierceStrike', text: '파고들었다', slot: 'verb', tags: ['pierce', 'atk'], emotion: 'sorrow', stat: 'atk', statMult: 1.5, kind: 'attack', targetCount: 1, effects: { pierceGuard: true }, art: '3010', rarity: 'rare', note: '공격 ×1.5 · 1명 · 관통', lore: '빈틈을 보면 연필심이 먼저 들어간다.' },
  { id: 'spreadTwo', text: '퍼뜨렸다', slot: 'verb', tags: ['wide', 'joy'], emotion: 'joy', stat: 'atk', statMult: 0.9, kind: 'attack', targetCount: 2, art: '3011', rarity: 'rare', note: '공격 ×0.9 · 2명(100%·70%)', lore: '웃음이 옆 칸까지 번진다.' },
  { id: 'splitTwo', text: '갈라냈다', slot: 'verb', tags: ['wide', 'pierce'], emotion: 'pleasure', stat: 'atk', statMult: 0.75, kind: 'attack', targetCount: 2, effects: { pierceGuard: true }, art: '3012', rarity: 'rare', note: '공격 ×0.75 · 2명(100%·70%) · 관통', lore: '종이 틈을 따라 두 줄로 갈라진다.' },
  { id: 'scatterThree', text: '흩뿌렸다', slot: 'verb', tags: ['wide', 'joy'], emotion: 'joy', stat: 'atk', statMult: 0.9, kind: 'attack', targetCount: 3, art: '3013', rarity: 'epic', note: '공격 ×0.9 · 3명(100%·70%·50%)', lore: '반짝이는 낙서가 세 칸을 덮는다.' },
  { id: 'pourThree', text: '쏟아냈다', slot: 'verb', tags: ['wide', 'tear'], emotion: 'sorrow', stat: 'atk', statMult: 0.9, kind: 'attack', targetCount: 3, art: '3014', rarity: 'epic', note: '공격 ×0.9 · 3명(100%·70%·50%)', lore: '참았던 잉크가 한꺼번에 쏟아진다.' },
  { id: 'doubleTap', text: '두드렸다', slot: 'verb', tags: ['hit', 'atk'], emotion: 'anger', stat: 'atk', statMult: 0.5, kind: 'attack', targetCount: 1, effects: { hitCount: 2 }, art: '3015', rarity: 'common', note: '공격 ×0.5 · 2연타', lore: '똑, 똑. 실드가 먼저 금이 간다.' },
  { id: 'flurry', text: '난타했다', slot: 'verb', tags: ['hit', 'mad'], emotion: 'pleasure', stat: 'atk', statMult: 0.5, kind: 'attack', targetCount: 1, effects: { hitCount: 3 }, art: '3016', rarity: 'rare', note: '공격 ×0.5 · 3연타', lore: '신나는 낙서가 멈추지 않는다.' },
  { id: 'counterOne', text: '되돌려주었다', slot: 'verb', tags: ['counter', 'mend'], emotion: 'joy', stat: 'guard', statMult: 1, kind: 'guard', effects: { counterMultiplier: 1.5 }, art: '3017', rarity: 'rare', note: '방어 ×1 · 카운터 ×1.50', lore: '받은 만큼 반짝여 돌려준다.' },
  { id: 'counterTwo', text: '버텨냈다', slot: 'verb', tags: ['counter', 'hold'], emotion: 'pleasure', stat: 'guard', statMult: 1.5, kind: 'guard', effects: { counterMultiplier: 1.5 }, art: '3018', rarity: 'epic', note: '방어 ×1.5 · 카운터 ×1.50', lore: '종이가 구겨져도 되받는 마음은 남는다.' },
  { id: 'tearMend', text: '울음을 삼켰다', slot: 'verb', tags: ['mend'], emotion: 'sorrow', stat: 'heal', statMult: 1.5, kind: 'heal', art: '3019', rarity: 'rare', note: '회복 ×1.5', lore: '젖은 종이를 꼭 눌러 펴고 다시 쓴다.' },
  { id: 'riseAgain', text: '이를 악물고 일어섰다', slot: 'verb', tags: ['mend'], emotion: 'anger', stat: 'heal', statMult: 1.5, kind: 'heal', art: '3020', rarity: 'rare', note: '회복 ×1.5', lore: '화난 마음도 다음 줄을 쓸 힘이 된다.' },
  { id: 'magicVeil', text: '빛의 막을 둘렀다', slot: 'verb', tags: ['guard', 'light'], emotion: 'sorrow', stat: 'guard', statMult: 0.5, kind: 'guard', effects: { magicShield: 1 }, art: '3018', rarity: 'epic', note: '방어 ×0.5 · 매직실드 1겹', lore: '한 줄을 통째로 감싸는 빛은 어떤 틈도 내주지 않는다.' },
  { id: 'storedResolve', text: '막아서 밀어냈다', slot: 'verb', tags: ['guard', 'atk'], emotion: 'anger', stat: 'guard', statMult: 0.5, kind: 'guard', targetCount: 2, effects: { guardAttackMultiplier: 0.6 }, art: '3009', rarity: 'rare', note: '방어 ×0.5 · 2명(100%·70%) · 방어도 60% 피해', lore: '막아 낸 문장을 방패째 앞으로 밀어 벌레를 물리친다.' },
  { id: 'overflowingHeart', text: '넘친 마음을 건넸다', slot: 'verb', tags: ['mend', 'joy'], emotion: 'joy', stat: 'heal', statMult: 1.25, kind: 'heal', effects: { overhealDamageMultiplier: 1 }, art: '3019', rarity: 'rare', note: '회복 ×1.25 · 초과 회복량 100% 피해', lore: '내게 다 담지 못한 온기가 벌레를 밀어낸다.' },
  { id: 'drinkInk', text: '흘린 잉크를 되마셨다', slot: 'verb', tags: ['atk', 'mend'], emotion: 'pleasure', stat: 'atk', statMult: 1, kind: 'attack', effects: { lifeStealRate: 0.5 }, art: '3010', rarity: 'rare', note: '공격 ×1 · 흡혈 50%', lore: '빼앗긴 이야기를 한 방울도 남기지 않고 되찾는다.' },
  { id: 'stainedTomorrow', text: '내일의 줄을 물들였다', slot: 'verb', tags: ['poison', 'sorrow'], emotion: 'sorrow', stat: 'atk', statMult: 1.5, kind: 'attack', timing: 'delayed', art: '3014', rarity: 'rare', note: '공격 ×1.5 · 다음 턴 발동', lore: '지금 번진 얼룩은 다음 줄에서야 아프게 드러난다.' },
  { id: 'savedBreath', text: '다음 숨을 모아두었다', slot: 'verb', tags: ['hold', 'calm'], emotion: 'anger', stat: 'guard', statMult: 0.5, kind: 'guard', effects: { carryInk: 2 }, art: '3017', rarity: 'common', note: '방어 ×0.5 · 다음 문장 잉크 +2', lore: '이번 줄을 짧게 맺고 다음 줄에 힘을 남긴다.' },
  { id: 'dampenMomentum', text: '기세를 눌러 적었다', slot: 'verb', tags: ['debuff', 'hold'], emotion: 'joy', stat: 'atk', statMult: 0.5, kind: 'attack', effects: { enemyAttackRank: -1 }, art: '3012', rarity: 'rare', note: '공격 ×0.5 · 적 공격 1랭크↓', lore: '거칠어진 이야기를 손바닥으로 눌러 적의 공격 태세를 꺾는다.' },
  { id: 'readAhead', text: '앞줄을 미리 읽었다', slot: 'verb', tags: ['focus', 'calm'], emotion: 'pleasure', stat: 'guard', statMult: 0.75, kind: 'guard', effects: { bonusDraws: 1 }, art: '3011', rarity: 'common', note: '방어 ×0.75 · 다시 뽑기 +1회', lore: '다음에 올 단어를 알아보자 덱에서 한 장 더 꺼낼 여유가 생겼다.' },
]
