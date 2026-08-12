import type { Word } from '@core/types'

/**
 * 일반 보상 동사.
 *
 * 동사는 `행동 종류(kind) · 같은 행동 스탯(stat) · 계수(statMult)`를 뼈대로 삼고,
 * 흡혈·방패치기·생명력 폭발처럼
 * 행동 결과를 다른 행동으로 잇는 부가 동작을 가진다.
 * 관통은 비율 전환이 없는 문장 전체 전략이므로 수식어가 맡는다.
 */
export const SPECIAL_REWARD_WORDS: Word[] = [
  { id: 'focusStrike', text: '찍었다', slot: 'verb', tags: ['focus', 'atk'], emotion: 'anger', stat: 'atk', statMult: 3, kind: 'attack', inkCost: 6, art: '3009', rarity: 'legendary', note: '공격 ×3', lore: '온 힘과 잉크를 한 점에 찍어 누르는 분노의 결정타다.' },
  { id: 'pierceStrike', text: '파고들었다', slot: 'verb', tags: ['pierce', 'atk'], emotion: 'sorrow', stat: 'atk', statMult: 1.5, kind: 'attack', inkCost: 3, targetCount: 1, art: '3010', rarity: 'rare', note: '공격 ×1.5', lore: '빈틈에 깊은 한 획을 남긴다.' },
  { id: 'spreadTwo', text: '퍼뜨렸다', slot: 'verb', tags: ['wide', 'joy'], emotion: 'joy', stat: 'atk', statMult: 1, kind: 'attack', inkCost: 3, targetCount: 2, art: '3011', rarity: 'common', note: '공격 ×1 · 대상 2명', lore: '한 번의 타격을 앞의 두 벌레에게 퍼뜨린다.' },
  { id: 'splitTwo', text: '갈라냈다', slot: 'verb', tags: ['wide', 'pierce'], emotion: 'pleasure', stat: 'atk', statMult: 1, kind: 'attack', inkCost: 3, targetCount: 2, art: '3012', rarity: 'common', note: '공격 ×1 · 대상 2명', lore: '한 획을 두 갈래로 갈라 앞줄에 남긴다.' },
  { id: 'scatterThree', text: '흩뿌렸다', slot: 'verb', tags: ['wide', 'joy'], emotion: 'joy', stat: 'atk', statMult: 1.15, kind: 'attack', inkCost: 5, targetCount: 3, art: '3013', rarity: 'epic', note: '공격 ×1.15 · 대상 3명', lore: '타격을 페이지 앞줄 세 칸에 흩뿌린다.' },
  { id: 'pourThree', text: '쏟아냈다', slot: 'verb', tags: ['wide', 'tear'], emotion: 'sorrow', stat: 'heal', statMult: 2, kind: 'heal', inkCost: 5, effects: { overhealDamageMultiplier: 1 }, art: '3014', rarity: 'epic', note: '회복 ×2 · 생명력 폭발 100%', lore: '참았던 눈물을 쏟아 상처를 씻고 넘친 마음은 적에게 터뜨린다.' },
  { id: 'doubleTap', text: '두드렸다', slot: 'verb', tags: ['hit', 'mend'], emotion: 'anger', stat: 'heal', statMult: 1.5, kind: 'heal', inkCost: 4, effects: { overhealDamageMultiplier: .5 }, art: '3015', rarity: 'rare', note: '회복 ×1.5 · 생명력 폭발 50%', lore: '멈추려는 심장을 두드리고, 넘친 박동은 적에게 되돌려준다.' },
  { id: 'flurry', text: '휘갈겼다', slot: 'verb', tags: ['hit', 'mad'], emotion: 'pleasure', stat: 'atk', statMult: 1.5, kind: 'attack', inkCost: 4, effects: { lifeStealRate: .25 }, art: '3016', rarity: 'rare', note: '공격 ×1.5 · 흡혈 25%', lore: '거침없는 한 획으로 체력을 조금 되찾는다.' },
  { id: 'counterOne', text: '되돌려주었다', slot: 'verb', tags: ['counter', 'mend'], emotion: 'joy', stat: 'guard', statMult: 2, kind: 'guard', inkCost: 5, effects: { guardAttackMultiplier: 1 }, art: '3017', rarity: 'epic', note: '방어 ×2 · 방패치기 100%', lore: '쌓은 실드의 힘을 피해로 되돌려준다.' },
  { id: 'counterTwo', text: '버텨냈다', slot: 'verb', tags: ['counter', 'hold'], emotion: 'pleasure', stat: 'guard', statMult: 2, kind: 'guard', inkCost: 6, effects: { guardAttackMultiplier: 1.5 }, art: '3018', rarity: 'legendary', note: '방어 ×2 · 방패치기 150%', lore: '굳게 버틴 실드의 힘을 크게 되돌린다.' },
  { id: 'tearMend', text: '울음을 꿰맸다', slot: 'verb', tags: ['mend'], emotion: 'sorrow', stat: 'heal', statMult: 1, kind: 'heal', inkCost: 2, art: '3019', rarity: 'common', note: '회복 ×1', lore: '흐트러진 마음을 꿰매 다시 숨을 고른다.' },
  { id: 'riseAgain', text: '일어섰다', slot: 'verb', tags: ['mend'], emotion: 'anger', stat: 'heal', statMult: 1, kind: 'heal', inkCost: 2, art: '3020', rarity: 'common', note: '회복 ×1', lore: '다시 일어설 만큼 숨을 되찾는다.' },
  { id: 'magicVeil', text: '막을 둘렀다', slot: 'verb', tags: ['guard', 'light'], emotion: 'sorrow', stat: 'guard', statMult: 2, kind: 'guard', inkCost: 5, effects: { guardAttackMultiplier: 1 }, art: '3018', rarity: 'epic', note: '방어 ×2 · 방패치기 100%', lore: '빛나는 막을 단단히 두르고 그 힘으로 적을 밀어낸다.' },
  { id: 'storedResolve', text: '밀어냈다', slot: 'verb', tags: ['guard', 'atk'], emotion: 'anger', stat: 'guard', statMult: 1.5, kind: 'guard', inkCost: 4, effects: { guardAttackMultiplier: 1 }, art: '3030', rarity: 'rare', note: '방어 ×1.5 · 방패치기 100%', lore: '쌓인 실드의 힘만큼 적을 밀어낸다.' },
  { id: 'overflowingHeart', text: '마음을 건넸다', slot: 'verb', tags: ['mend', 'joy'], emotion: 'joy', stat: 'heal', statMult: 1.5, kind: 'heal', inkCost: 5, effects: { overhealDamageMultiplier: 1.5 }, art: '3024', rarity: 'legendary', note: '회복 ×1.5 · 생명력 폭발 150%', lore: '다 담지 못한 회복을 더 큰 피해로 바꾸어 적에게까지 건넨다.' },
  { id: 'drinkInk', text: '잉크를 되마셨다', slot: 'verb', tags: ['mend', 'play'], emotion: 'pleasure', stat: 'heal', statMult: 2, kind: 'heal', inkCost: 5, effects: { overhealDamageMultiplier: 1 }, art: '3029', rarity: 'epic', note: '회복 ×2 · 생명력 폭발 100%', lore: '잉크를 되마셔 가득 찬 생명력까지 신나는 반격으로 바꾼다.' },
  { id: 'stainedTomorrow', text: '물들였다', slot: 'verb', tags: ['poison', 'sorrow'], emotion: 'sorrow', stat: 'atk', statMult: 2, kind: 'attack', inkCost: 5, effects: { lifeStealRate: .5 }, art: '3026', rarity: 'epic', note: '공격 ×2 · 흡혈 50%', lore: '내일의 줄까지 물들인 짙은 획에서 체력을 되찾는다.' },
  { id: 'savedBreath', text: '숨을 모았다', slot: 'verb', tags: ['hold', 'calm'], emotion: 'anger', stat: 'guard', statMult: 1.5, kind: 'guard', inkCost: 4, effects: { guardAttackMultiplier: .5 }, art: '3025', rarity: 'rare', note: '방어 ×1.5 · 방패치기 50%', lore: '모은 방어의 절반을 밀어내는 힘으로 쓴다.' },
  { id: 'dampenMomentum', text: '적었다', slot: 'verb', tags: ['debuff', 'hold'], emotion: 'joy', stat: 'heal', statMult: 1.5, kind: 'heal', inkCost: 3, art: '3027', rarity: 'rare', note: '회복 ×1.5', lore: '흐트러진 마음을 일기에 적어 차분히 추슬렀다.' },
  { id: 'readAhead', text: '읽었다', slot: 'verb', tags: ['focus', 'calm'], emotion: 'pleasure', stat: 'guard', statMult: 1, kind: 'guard', inkCost: 2, art: '3028', rarity: 'common', note: '방어 ×1', lore: '앞줄을 읽고 한발 먼저 버틸 자리를 잡는다.' },
]
