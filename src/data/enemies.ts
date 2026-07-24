/**
 * 적 — 그림일기를 좀먹는 벌레들(의인화 벌레 소녀). 전투라기보다 "정해진 턴 안에
 * 처리해야 하는 디펜스 대상". every(공격 주기)를 다르게 둬 서로 다른 대응을 요구한다.
 * sprite 필드는 assets/index.ts의 SPRITES 키를 참조한다.
 */

import type { EnemyDef } from '@core/types'

export const ENEMIES: Record<string, EnemyDef> = {
  moth: {
    id: 'moth',
    name: '좀나방',
    hp: 18,
    atk: 8,
    every: 1,
    sprite: 'enemy_moth',
    note: '매 턴 책장을 갉아 문다 — 서둘러야 한다',
  },
  roach: {
    id: 'roach',
    name: '바퀴벌레',
    hp: 32,
    atk: 12,
    every: 2,
    sprite: 'enemy_roach',
    note: '껍질이 단단해 오래 버틴다',
  },
}

// 화면 데모 조우: 3마리 무리(범위 단어의 필요성을 보여준다).
export const DEMO_ENCOUNTER = ['moth', 'roach', 'moth']
