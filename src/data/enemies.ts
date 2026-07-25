/**
 * 적 — 그림일기를 좀먹는 벌레들(의인화 벌레 소녀). 전투라기보다 "정해진 턴 안에
 * 처리해야 하는 디펜스 대상". every(공격 주기)를 다르게 둬 서로 다른 대응을 요구한다.
 * sprite 필드는 assets/index.ts의 SPRITES 키를 참조한다.
 */

import type { EnemyDef } from '@core/types'

export const ENEMIES: Record<string, EnemyDef> = {
  inkDevourer: {
    id: 'inkDevourer', name: '먹물 왕바퀴', boss: true,
    hp: 26, atk: 7, every: 2, initiative: 'first',
    sprite: 'enemy_roach', guard: 8, magicShield: 1, weakEmotion: 'pleasure',
    note: '페이지를 통째로 갉아먹는 우두머리. 일반 방어와 매직실드를 모두 두르고 즐거움에 약하다.',
  },
  saltSkater: {
    id: 'saltSkater', name: '소금쟁이', boss: true,
    hp: 38, atk: 8, every: 2, initiative: 'first',
    sprite: 'boss_salt_skater', guard: 8, weakEmotion: 'sorrow',
    note: '먹물 웅덩이 위를 미끄러지며 일기의 줄을 지운다. 단단한 종이 왕관은 슬픈 문장에 젖는다.',
  },
  queenBee: {
    id: 'queenBee', name: '여왕벌', boss: true,
    hp: 52, atk: 10, every: 2, initiative: 'second',
    sprite: 'boss_queen_bee', magicShield: 2, weakEmotion: 'anger',
    note: '찢어진 페이지로 벌집 왕관을 짓고 달콤한 잉크를 모은다. 분노가 밀랍 보호막을 부순다.',
  },
  elderSpider: {
    id: 'elderSpider', name: '장로거미', boss: true,
    hp: 70, atk: 12, every: 2, initiative: 'first',
    sprite: 'boss_elder_spider', guard: 12, magicShield: 1, weakEmotion: 'pleasure',
    note: '낡은 일기장을 거미줄로 꿰매며 이야기를 다른 결말로 고친다. 즐거운 한 줄이 거미줄을 흔든다.',
  },
  armoredRoach: {
    id: 'armoredRoach', name: '갑각 바퀴', hp: 12, atk: 6, every: 2, initiative: 'first',
    sprite: 'enemy_roach', guard: 7, weakEmotion: 'anger',
    note: '먼저 달려들며 단단한 껍질이 피해를 받아 낸다. 분노에 약하다.',
  },
  shieldMoth: {
    id: 'shieldMoth', name: '유리날개 좀나방', hp: 8, atk: 5, every: 2, initiative: 'second',
    sprite: 'enemy_moth', magicShield: 1, weakEmotion: 'sorrow',
    note: '매직실드가 한 타격을 막는다. 슬픔에 약하다.',
  },
  moth: {
    id: 'moth',
    name: '좀나방',
    hp: 6,
    atk: 4,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_moth',
    note: '책장을 갉아 문다 — 서둘러야 한다',
  },
  roach: {
    id: 'roach',
    name: '바퀴벌레',
    hp: 10,
    atk: 6,
    every: 2,
    initiative: 'first',
    sprite: 'enemy_roach',
    note: '재빠르게 먼저 달려들고, 단단한 껍질로 오래 버틴다',
  },
}

// 화면 데모 조우: 3마리 무리(범위 단어의 필요성을 보여준다).
export const DEMO_ENCOUNTER = ['moth', 'roach', 'moth']
