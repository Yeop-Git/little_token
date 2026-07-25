/**
 * 에셋 매니페스트 — Vite가 import를 최종 URL(해시 포함)로 바꿔 준다.
 * 스프라이트/배경/폰트는 전부 여기서 한 번만 참조하고, 코드에서는 키로 쓴다.
 */

import bg001 from './backgrounds/bg_001.webp'
import backgroundDark from './backgrounds/backgroundDark.webp'
import titleBg from './backgrounds/tt_001.webp'
import titleLogo from './backgrounds/tt_002.webp'
import player001 from './sprites/player_001.webp'
import playerModel from './models/player.glb?url'
import token001 from './sprites/token/token_001.webp'
import token002 from './sprites/token/token_002.webp'
import token003 from './sprites/token/token_003.webp'
import enemyMoth from './sprites/enemy_moth.webp'
import enemyRoach from './sprites/enemy_roach.webp'
import skill1001 from './sprites/skills/skill_1001.webp'
import skill1002 from './sprites/skills/skill_1002.webp'
import skill1003 from './sprites/skills/skill_1003.webp'
import skill1004 from './sprites/skills/skill_1004.webp'
import skill1005 from './sprites/skills/skill_1005.webp'
import skill1006 from './sprites/skills/skill_1006.webp'
import skill1007 from './sprites/skills/skill_1007.webp'
import skill1008 from './sprites/skills/skill_1008.webp'
import skill2001 from './sprites/skills/skill_2001.webp'
import skill2002 from './sprites/skills/skill_2002.webp'
import skill2003 from './sprites/skills/skill_2003.webp'
import skill2004 from './sprites/skills/skill_2004.webp'
import skill2005 from './sprites/skills/skill_2005.webp'
import skill2006 from './sprites/skills/skill_2006.webp'
import skill3001 from './sprites/skills/skill_3001.webp'
import skill3002 from './sprites/skills/skill_3002.webp'
import skill3003 from './sprites/skills/skill_3003.webp'
import skill3007 from './sprites/skills/skill_3007.webp'
import skill7001 from './sprites/skills/skill_7001.webp'
import skill7002 from './sprites/skills/skill_7002.webp'
import skill7003 from './sprites/skills/skill_7003.webp'
import itemSnack from './sprites/items/item_001.webp'
import itemChime from './sprites/items/item_002.webp'
import itemMirror from './sprites/items/item_003.webp'
import itemShoe from './sprites/items/item_004.webp'
import itemApple from './sprites/items/item_005.webp'
import itemCarrot from './sprites/items/item_006.webp'
import itemMatch from './sprites/items/item_007.webp'
import itemCloak from './sprites/items/item_008.webp'
import itemBbq from './sprites/items/item_009.webp'
import itemPino from './sprites/items/item_010.webp'
import itemBeanstalk from './sprites/items/item_011.webp'
import griunFont from './fonts/Griun_PolFairness-Rg.woff2'
import paperMapParade from './audio/paper-map-parade.mp3'
import sentenceComplete from './audio/sentence-complete.mp3'
import paperAttack from './audio/paper-attack.mp3'
import paper from './audio/paper.mp3'
import cardHover from './audio/cardhover.mp3'
import pencil from './audio/pencil.mp3'
import button from './audio/button.mp3'

// 배경 키 → URL
export const BACKGROUNDS: Record<string, string> = {
  bg001,
  battleDark: backgroundDark,
}

// 타이틀 화면 — 배경 일러스트 + 발광 로고
export const TITLE = {
  bg: titleBg,
  logo: titleLogo,
}

// 토큰(안내역) 표정 일러스트 — 오프닝 다이얼로그 초상
export const TOKEN_FACES = {
  neutral: token001,
  smile: token002,
  sad: token003,
}

// 스프라이트 키 → URL (엔티티 데이터의 sprite 필드가 이 키를 참조)
export const SPRITES: Record<string, string> = {
  player_001: player001,
  enemy_moth: enemyMoth,
  enemy_roach: enemyRoach,
}

// 전장용 GLB. 상세 카드에는 계속 대응되는 SPRITES 초상을 사용한다.
export const MODELS: Record<string, string> = {
  player: playerModel,
}

// 맥락카드 일러스트 — Word.art가 이 키를 참조한다.
// 1xxx 주어 · 2xxx 수식 · 3xxx 동사 · 7xxx 문장부호. 번호는 CSV 등장 순서를 따른다.
export const SKILL_ART: Record<string, string> = {
  '1001': skill1001,
  '1002': skill1002,
  '1003': skill1003,
  '1004': skill1004,
  '1005': skill1005,
  '1006': skill1006,
  '1007': skill1007,
  '1008': skill1008,
  '2001': skill2001,
  '2002': skill2002,
  '2003': skill2003,
  '2004': skill2004,
  '2005': skill2005,
  '2006': skill2006,
  '3001': skill3001,
  '3002': skill3002,
  '3003': skill3003,
  '3007': skill3007,
  // 문장부호(올림프의 당근) — 7001 느낌표 · 7002 온점 · 7003 물음표
  '7001': skill7001,
  '7002': skill7002,
  '7003': skill7003,
}

/**
 * 아이템 일러스트 — ItemDef.art가 이 키를 참조한다.
 * 여기 없는 키는 Icons.itemArt의 SVG 폴백으로 떨어진다(노멀 아이템 2종).
 */
export const ITEM_ART: Record<string, string> = {
  snack: itemSnack, // 맛동사
  chime: itemChime, // 누댕의 메아리
  mirror: itemMirror, // 미녀의 거울
  shoe: itemShoe, // 백설공주의 구두
  apple: itemApple, // 신데렐라의 황금사과
  carrot: itemCarrot, // 올림프의 당근
  match: itemMatch, // 빨간망토의 성냥
  cloak: itemCloak, // 성냥팔이 소녀의 망토
  bbq: itemBbq, // 아기돼지 바베큐
  pino: itemPino, // 피노키오의 미아핑
  beanstalk: itemBeanstalk, // 잭과 숙주나물
}

export const FONT_URL = griunFont

export const AUDIO = {
  bgm: paperMapParade,
  sentenceComplete,
  paperAttack,
  paper,
  cardHover,
  pencil,
  button,
}
