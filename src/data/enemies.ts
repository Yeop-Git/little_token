/**
 * 적 — 그림일기를 좀먹는 벌레들(의인화 벌레 소녀). 전투라기보다 "정해진 턴 안에
 * 처리해야 하는 디펜스 대상". every(공격 주기)를 다르게 둬 서로 다른 대응을 요구한다.
 * sprite 필드는 assets/index.ts의 SPRITES 키를 참조한다.
 */

import type { EnemyDef } from '@core/types'

export const ENEMIES: Record<string, EnemyDef> = {
  armoredRoach: {
    id: 'armoredRoach', name: '갑각 바퀴', hp: 12, atk: 6, every: 2, initiative: 'second',
    sprite: 'enemy_roach', guard: 7, weakEmotion: 'anger',
    note: '단단한 껍질이 먼저 피해를 받아 낸다. 분노에 약하다.',
  },
  shieldMoth: {
    id: 'shieldMoth', name: '유리날개 좀나방', hp: 8, atk: 5, every: 2, initiative: 'first',
    sprite: 'enemy_moth', magicShield: 1, weakEmotion: 'sorrow',
    note: '매직실드가 한 타격을 막는다. 슬픔에 약하다.',
  },
  moth: {
    id: 'moth',
    name: '좀나방',
    hp: 6,
    atk: 4,
    every: 2,
    initiative: 'first',
    sprite: 'enemy_moth',
    note: '책장을 갉아 문다 — 서둘러야 한다',
  },
  roach: {
    id: 'roach',
    name: '바퀴벌레',
    hp: 10,
    atk: 6,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_roach',
    note: '껍질이 단단해 오래 버틴다',
  },
}

// 화면 데모 조우: 3마리 무리(범위 단어의 필요성을 보여준다).
export const DEMO_ENCOUNTER = ['moth', 'roach', 'moth']
