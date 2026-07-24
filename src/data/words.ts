/**
 * 단어 풀. 슬롯당 3~5개. 각 단어에 등급(rarity)과 줄거리(lore)를 달아
 * 우측 상세 패널에서 덱빌딩 감을 준다. 수치는 여기서만 관리.
 */

import type { Word } from '@core/types'

export const WORDS: Record<string, Word[]> = {
  subj: [
    { id: 'na', text: '나는', slot: 'subj', tags: ['self'], bonus: 0, targetMode: 'enemy', rarity: 'common', note: '균형', lore: '일기의 화자. 언제나 여기서 시작한다.' },
    { id: 'neo', text: '너는', slot: 'subj', tags: ['enemy'], bonus: 0.25, targetMode: 'enemy', rarity: 'rare', note: '공격 특화 · 방어 무효', lore: '손끝을 겨눈다. 방어를 잊을 만큼.' },
    { id: 'uri', text: '우리는', slot: 'subj', tags: ['both'], bonus: 0.5, targetMode: 'both', rarity: 'epic', note: '피해 40% 되돌아옴', lore: '함께 타오르면, 함께 그을린다.' },
  ],
  adv: [
    { id: 'holo', text: '홀로', slot: 'adv', tags: ['solo'], bonus: 0.3, effects: { guard: -2 }, rarity: 'rare', note: '방어 −2', lore: '혼자 선 자의 각오. 등이 시리다.' },
    { id: 'joy', text: '조용히', slot: 'adv', tags: ['quiet'], bonus: -0.1, effects: { evade: 3 }, rarity: 'common', note: '회피 +3', lore: '숨을 죽이면 벌레도 방심한다.' },
    { id: 'mad', text: '미친듯이', slot: 'adv', tags: ['mad'], bonus: 0.7, effects: { recoil: 3 }, rarity: 'epic', note: '자해 3', lore: '종이가 타는 냄새. 멈출 수 없다.' },
    { id: 'slow', text: '천천히', slot: 'adv', tags: ['slow'], bonus: 0.1, effects: { guard: 2 }, rarity: 'common', note: '방어 +2', lore: '느린 붓질에도 단단함이 깃든다.' },
    { id: 'neolli', text: '널리', slot: 'adv', tags: ['wide'], bonus: -0.15, aoe: 'all', rarity: 'rare', note: '전체 적중 · 위력 −', lore: '한 방울이 온 페이지로 번진다.' },
  ],
  obj: [
    { id: 'war', text: '전투', slot: 'obj', tags: ['war'], power: 6, rarity: 'common', note: '위력 6', lore: '연필심이 부러지도록.' },
    { id: 'fir', text: '불꽃', slot: 'obj', tags: ['fire'], power: 8, rarity: 'rare', note: '위력 8', lore: '촛농 아래 잠든 작은 태양.' },
    { id: 'sil', text: '침묵', slot: 'obj', tags: ['quiet'], power: 3, effects: { guard: 4 }, rarity: 'common', note: '위력 3 · 방어 +4', lore: '아무 말도 적지 않은 칸의 힘.' },
    { id: 'mem', text: '기억', slot: 'obj', tags: ['mind'], power: 4, effects: { heal: 3 }, rarity: 'rare', note: '위력 4 · 회복 3', lore: '지난 장을 넘기면 상처가 아문다.' },
    { id: 'bit', text: '빗물', slot: 'obj', tags: ['water', 'wide'], power: 5, aoe: 'all', rarity: 'rare', note: '위력 5 · 전체', lore: '번지는 잉크, 젖는 날개들.' },
  ],
  verb: [
    { id: 'jin', text: '진행', slot: 'verb', tags: ['atk'], power: 4, kind: 'attack', rarity: 'common', note: '공격', lore: '그냥, 앞으로.' },
    { id: 'hoi', text: '회피', slot: 'verb', tags: ['grd'], power: 1, kind: 'guard', effects: { guard: 5 }, rarity: 'common', note: '방어 +5', lore: '한 발 물러서는 것도 문장이다.' },
    { id: 'jum', text: '점화', slot: 'verb', tags: ['fire'], power: 6, kind: 'attack', rarity: 'rare', note: '공격', lore: '심지에 불을 붙이는 한 획.' },
    { id: 'mang', text: '망각', slot: 'verb', tags: ['mind'], power: 2, kind: 'heal', effects: { heal: 4 }, rarity: 'common', note: '회복 +4', lore: '잊는 편이 나을 때가 있다.' },
    { id: 'hui', text: '휩쓸어', slot: 'verb', tags: ['atk', 'wide'], power: 3, kind: 'attack', aoe: 'all', rarity: 'rare', note: '공격 · 전체', lore: '빗자루처럼, 페이지 끝에서 끝까지.' },
  ],
  end: [
    { id: 'e1', text: '했다', slot: 'end', tags: [], bonus: 0, timing: 'immediate', rarity: 'common', note: '즉발', lore: '담담한 마침표.' },
    { id: 'e2', text: '하려고 했다', slot: 'end', tags: [], bonus: 0.9, timing: 'delayed', rarity: 'rare', note: '다음 턴 발동', lore: '다짐은 다음 장에서 터진다.' },
    { id: 'e3', text: '했었나?', slot: 'end', tags: [], bonus: 0, timing: 'immediate', variance: { p: 0.5, hi: 2.5, lo: 0.3 }, rarity: 'epic', note: '50%: ×2.5 / ×0.3', lore: '기억이 흐릿하다… 운에 맡긴다.' },
    { id: 'e4', text: '하고 말았다!', slot: 'end', tags: [], bonus: 0.4, timing: 'immediate', effects: { recoil: 4 }, rarity: 'epic', note: '자해 4', lore: '저지르고야 말았다. 손이 떨린다.' },
  ],
}
