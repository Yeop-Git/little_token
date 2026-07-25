/**
 * 적 — 그림일기를 좀먹는 벌레들(의인화 벌레 소녀). 전투라기보다 "정해진 턴 안에
 * 처리해야 하는 디펜스 대상". every(공격 주기)를 다르게 둬 서로 다른 대응을 요구한다.
 * sprite 필드는 assets/index.ts의 SPRITES 키를 참조한다.
 */

import type { EnemyDef } from '@core/types'

export const QUEEN_ESCORT_IMMUNITY_LABEL = '호위 중 : 본체 무적'

export const ENEMIES: Record<string, EnemyDef> = {
  inkDevourer: {
    id: 'inkDevourer', name: '먹물 왕바퀴', boss: true,
    hp: 26, atk: 7, every: 2, initiative: 'first',
    sprite: 'enemy_roach', guard: 8, magicShield: 1, weakEmotion: 'pleasure',
    note: '페이지를 통째로 갉아먹는 우두머리. 일반 방어와 매직실드를 모두 두르고 즐거움에 약하다.',
  },
  mantis: {
    id: 'mantis', name: '사마귀', boss: true,
    // 평타 1~2회 → 준비 → 내려베기가 한 사이클(최대 4턴)이다. 사이클을 두 바퀴
    // 이상 보여 주지 못하면 예고와 그로기가 한 번씩만 스치고 전투가 끝난다.
    hp: 88, atk: 7, every: 1, initiative: 'first',
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
    note: '평타를 무작위로 1~2회 사용한 뒤 한 턴 동안 큰낫을 들어 강공격을 예고한다. 표시된 필요 방어를 채우면 방어를 전부 소모하는 대신 체력 피해 없이 사마귀가 그로기된다. 부족한 방어는 피해를 흡수한 만큼만 소모되며, 남은 피해의 절반을 사마귀가 흡혈한다.',
  },
  queenBee: {
    id: 'queenBee', name: '여왕벌', boss: true,
    hp: 68, atk: 7, every: 3, initiative: 'second',
    sprite: 'boss_queen_bee', weakEmotion: 'anger',
    summonPattern: {
      name: '일벌',
      sprite: 'enemy_worker_bee',
      // 10층 덱의 평범한 문장은 한두 마리를 순서대로 정리하고, 덱 상한(약 160)은
      // 네 마리 총 120 체력을 한 번에 관통할 수 있는 기준이다.
      hp: 30,
      // 전투 시작과 호위 전멸 다음 턴에만 네 마리를 한꺼번에 세운다. 중간 보충을
      // 막아 매 웨이브가 "네 마리를 모두 퇴치하면 그로기"라는 완결된 목표가 된다.
      perTurn: 4,
      max: 4,
      maxPerSide: 2,
      refillOnlyWhenEmpty: true,
      pierceWhileEscorted: true,
      backlashMaxHpRatePerUnit: 0.015,
      focusedBacklash: { emotion: 'anger', multiplier: 2 },
      groggyEvery: 4,
      groggyDamageMult: 1.5,
    },
    note: `전투 시작에 체력 30인 일벌 네 마리를 호위로 세운다. ${QUEEN_ESCORT_IMMUNITY_LABEL}. 한 마리라도 남아 있으면 여왕벌의 공격도 방어를 관통한다. 범위·관통 공격은 여러 일벌을 빠르게 퇴치해 그로기를 노리고, 분노 단일 비관통 공격은 한 마리씩 노리는 대신 퇴치 반동 피해를 2배로 준다. 일반 퇴치 반동은 일벌 한 마리마다 여왕벌 최대 체력의 1.5%다. 네 마리를 모두 퇴치하면 여왕벌이 그 턴 받는 피해 ×1.5 그로기에 빠지고 예정 공격이 한 턴 밀린다. 그로기가 끝난 다음 턴에는 새 일벌 네 마리를 소환해 같은 주기를 반복한다.`,
  },
  elderSpider: {
    id: 'elderSpider', name: '장로거미', boss: true,
    // 다리 하나가 곧 체력 한 막이다. 막당 체력이 낮으면 문장 하나가 다리 둘을
    // 한꺼번에 끊어 기쁨·분노·슬픔·즐거움 약점이 드러나기도 전에 사라진다.
    //
    // 거미줄은 방패 위를 타고 넘어 몸을 감는다(pierceGuard). 방어로 버티는 길을
    // 막아야 "지금 드러난 약점을 읽어 다리를 끊는다"가 유일한 활로가 된다.
    // 대신 한 방은 최대 체력의 1/5로 묶여 있어 즉사가 아니라 조여드는 압박이다.
    hp: 58, atk: 12, every: 2, initiative: 'first',
    sprite: 'boss_elder_spider', guard: 12, magicShield: 1, pierceGuard: true,
    parts: [
      { id: 'leg-joy', name: '첫째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'joy', label: '기쁨' } },
      { id: 'leg-anger', name: '둘째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'anger', label: '분노' } },
      { id: 'leg-sorrow', name: '셋째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'sorrow', label: '슬픔' } },
      { id: 'leg-pleasure', name: '넷째 다리', kind: 'leg', weakness: { kind: 'emotion', value: 'pleasure', label: '즐거움' } },
      { id: 'body', name: '본체', kind: 'body' },
    ],
    webPattern: { sealPerTurn: 1, maxSealedCards: 3 },
    note: '네 다리는 기쁨·분노·슬픔·즐거움 약점을 차례로 드러내며, 마지막 본체에는 약점이 없다. 거미줄은 방어막을 넘어 몸에 직접 감기므로 막아서 버틸 수 없고, 대신 한 번의 피해가 최대 체력의 1/5을 넘지 않는다. 매 문장마다 무작위 카드 하나를 거미줄로 봉인하며 봉인은 최대 3장까지 누적된다. 현재 다리의 약점 공격은 피해 ×1.5와 함께 봉인 하나를 풀지만 기본적으로 현재 다리에서 멈춘다. 현재 약점을 맞힌 관용구 문장만 남은 피해로 뒤의 다리와 본체까지 관통한다. 공격이 아니어도 현재 약점 속성을 담은 방어·회복 문장은 봉인 하나를 푼다. 약점을 빗나간 공격은 아무리 세도 지금 다리에서 멈춘다. 다리가 떨어지면 모든 카드의 거미줄이 즉시 사라진다.',
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
