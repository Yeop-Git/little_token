/**
 * 필드 — 오늘의 날짜/날씨/제목. 그림일기 머리글이자 전투 버프/디버프.
 * 전투가 끝나면 일기 한 장이 넘어가며 필드가 바뀐다(theme 전환 포함).
 */

import type { FieldDef } from '@core/types'

export const FIELDS: FieldDef[] = [
  {
    id: 'f_sunny',
    date: '6월 3일 화요일',
    title: '맑은 날의 소동',
    weather: 'sunny',
    theme: 'day',
    desc: '<b>맑음</b> — 볕이 좋아 마음이 든든하다. 시작이 산뜻하다.',
    playerAtkMult: 1.0,
  },
  {
    id: 'f_rain',
    date: '6월 7일 토요일',
    title: '비 오는 오후',
    weather: 'rain',
    theme: 'day',
    desc: '<b>비</b> — 종이가 눅눅하다. <b>물</b>·<b>범위</b> 단어가 잘 퍼진다(전체 피해 +2).',
    playerAtkMult: 1.0,
  },
  {
    id: 'f_night',
    date: '6월 12일 목요일',
    title: '잠 못 드는 밤',
    weather: 'night',
    theme: 'night',
    desc: '<b>밤</b> — 벌레가 대담해진다. 적 공격 +20%. 하지만 촛불 아래 <b>불꽃</b>이 더 밝다.',
    enemyAtkMult: 1.2,
  },
]

export const FIELD_BY_ID = (id: string): FieldDef => FIELDS.find((f) => f.id === id) ?? FIELDS[0]
