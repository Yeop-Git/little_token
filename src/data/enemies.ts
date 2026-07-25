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
  mantis: {
    id: 'mantis', name: '사마귀', boss: true,
    hp: 38, atk: 7, every: 1, initiative: 'first',
    sprite: 'boss_mantis', guard: 8, weakEmotion: 'sorrow',
    attackPattern: [
      { name: '평범한 낫 베기', bonusAtk: 0, animationStage: 1, repeatOnceChance: 0.5 },
      { name: '강공격 자세 잡기', bonusAtk: 0, animationStage: 2, damageScale: 0, telegraphText: '큰낫을 높이 들고 다음 공격을 준비한다!' },
      {
        name: '큰낫 내려베기',
        bonusAtk: 0,
        animationStage: 3,
        damageScale: 1.2,
        shatterGuard: true,
        lifeStealRate: 0.5,
        groggyDamageMult: 1.5,
        groggyRequiresGuardShatter: true,
      },
    ],
    note: '평타를 무작위로 1~2회 사용한 뒤 한 턴 동안 큰낫을 들어 강공격을 예고한다. 내려베기를 방어하면 방어를 전부 소모하는 대신 체력 피해 없이 사마귀가 그로기된다. 방어하지 못하면 일반 위력의 1.2배 피해를 받고 사마귀가 절반을 흡혈한다.',
  },
  queenBee: {
    id: 'queenBee', name: '여왕벌', boss: true,
    hp: 52, atk: 4, every: 3, initiative: 'second',
    sprite: 'boss_queen_bee', magicShield: 2, weakEmotion: 'anger',
    summonPattern: {
      name: '일벌',
      sprite: 'enemy_worker_bee',
      perTurn: 1,
      max: 4,
      maxPerSide: 2,
      attackBonusPerUnit: 0.5,
      releaseAt: 4,
    },
    note: '3턴마다 공격하며, 매 턴 시작에는 양옆으로 일벌을 한 마리씩 불러 최대 4마리의 호위를 만든다. 일벌마다 공격이 +0.5 되고, 넷이 모이면 다음 공격에 모두 돌격한 뒤 호위가 비워진다. 2·3명 공격은 각각 일벌 1·2마리를, 전체 공격은 전부 흩어 낸다.',
  },
  elderSpider: {
    id: 'elderSpider', name: '장로거미', boss: true,
    hp: 42, atk: 12, every: 2, initiative: 'first',
    sprite: 'boss_elder_spider', guard: 12, magicShield: 1,
    parts: [
      { id: 'leg-joy', name: '첫째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'joy', label: '기쁨' } },
      { id: 'leg-anger', name: '둘째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'anger', label: '분노' } },
      { id: 'leg-sorrow', name: '셋째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'sorrow', label: '슬픔' } },
      { id: 'leg-pleasure', name: '넷째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'pleasure', label: '즐거움' } },
      { id: 'body', name: '본체', kind: 'body' },
    ],
    webPattern: { sealPerTurn: 1, maxSealedCards: 3 },
    note: '네 다리는 기쁨·분노·슬픔·즐거움 약점을 차례로 드러내며, 마지막 본체에는 약점이 없다. 매 문장마다 무작위 카드 하나를 거미줄로 봉인하며 봉인은 최대 3장까지 누적된다. 현재 다리의 약점을 맞히면 피해 ×1.5와 함께 봉인 하나를 풀고, 다리가 떨어지면 모든 카드의 거미줄이 즉시 사라진다.',
  },
  termite: {
    id: 'termite', name: '흰개미', hp: 6, atk: 4, every: 2, initiative: 'second',
    sprite: 'enemy_termite',
    note: '특별한 능력 없이 종이 섬유를 차근차근 갉아 먹는다.',
  },
  moth: {
    id: 'moth',
    name: '먼지벌레',
    hp: 6,
    atk: 4,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_moth',
    note: '특별한 능력 없이 먼지 묻은 솔로 문장 가장자리를 털어 지운다.',
  },
  flea: {
    id: 'flea', name: '좀나방', hp: 7, atk: 5, every: 2, initiative: 'first',
    sprite: 'enemy_flea',
    note: '빠른 날갯짓으로 문장이 시작되기 전 먼저 날아든다.',
  },
  roach: {
    id: 'roach',
    name: '바퀴',
    hp: 10,
    atk: 6,
    every: 2,
    initiative: 'second',
    sprite: 'enemy_roach',
    guard: 7,
    note: '단단한 껍질의 방어 7이 피해를 먼저 받아 낸다.',
  },
  pillbug: {
    id: 'pillbug', name: '공벌레', hp: 12, atk: 5, every: 2, initiative: 'second',
    sprite: 'enemy_pillbug', magicShield: 1,
    note: '매직실드 1겹이 첫 타격을 완전히 막고 사라진다.',
  },
  mosquito: {
    id: 'mosquito', name: '모기', hp: 8, atk: 6, every: 2, initiative: 'second',
    sprite: 'enemy_mosquito', pierceGuard: true,
    note: '긴 침으로 방어막을 소모시키지 않고 체력에 직접 피해를 준다.',
  },
}

// 화면 데모 조우: 서로 다른 능력을 바로 비교한다.
export const DEMO_ENCOUNTER = ['flea', 'roach', 'pillbug', 'mosquito']
