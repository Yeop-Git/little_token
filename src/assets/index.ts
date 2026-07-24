/**
 * 에셋 매니페스트 — Vite가 import를 최종 URL(해시 포함)로 바꿔 준다.
 * 스프라이트/배경/폰트는 전부 여기서 한 번만 참조하고, 코드에서는 키로 쓴다.
 */

import bg001 from './backgrounds/bg_001.png'
import titleBg from './backgrounds/tt_001.png'
import titleLogo from './backgrounds/tt_002.png'
import player001 from './sprites/player_001.png'
import enemyMoth from './sprites/enemy_moth.png'
import enemyRoach from './sprites/enemy_roach.png'
import griunFont from './fonts/Griun_PolFairness-Rg.woff2'

// 배경 키 → URL
export const BACKGROUNDS: Record<string, string> = {
  bg001,
}

// 타이틀 화면 — 배경 일러스트 + 발광 로고
export const TITLE = {
  bg: titleBg,
  logo: titleLogo,
}

// 스프라이트 키 → URL (엔티티 데이터의 sprite 필드가 이 키를 참조)
export const SPRITES: Record<string, string> = {
  player_001: player001,
  enemy_moth: enemyMoth,
  enemy_roach: enemyRoach,
}

export const FONT_URL = griunFont
