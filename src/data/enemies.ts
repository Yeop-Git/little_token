/**
 * 적 — 그림일기를 좀먹는 벌레들. 전투라기보다 "정해진 턴 안에 처리해야 하는
 * 디펜스 대상". 각 적이 서로 다른 대응을 요구하도록 every(공격 주기)를 다르게 둔다.
 */

import type { EnemyDef } from '@core/types'

export const ENEMIES: Record<string, EnemyDef> = {
  worm: {
    id: 'worm',
    name: '좀벌레',
    hp: 24,
    atk: 7,
    every: 2,
    sprite: 'worm',
    note: '느리지만 꾸준히 종이를 갉는다',
  },
  moth: {
    id: 'moth',
    name: '종이나방',
    hp: 16,
    atk: 10,
    every: 1,
    sprite: 'moth',
    note: '매 턴 파닥이며 문다 — 서둘러야 한다',
  },
  silverfish: {
    id: 'silverfish',
    name: '좀나방',
    hp: 34,
    atk: 12,
    every: 3,
    sprite: 'silverfish',
    note: '단단하지만 공격은 드물다',
  },
}

// 화면 데모용 조우: 3마리 무리(범위 단어의 필요성을 보여준다).
export const DEMO_ENCOUNTER = ['worm', 'moth', 'silverfish']
