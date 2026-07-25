/**
 * 에셋 매니페스트 — Vite가 import를 최종 URL(해시 포함)로 바꿔 준다.
 * 스프라이트/배경/폰트는 전부 여기서 한 번만 참조하고, 코드에서는 키로 쓴다.
 */

import bg001 from './backgrounds/bg_001.webp'
import backgroundDark from './backgrounds/backgroundDark.webp'
import combatGuide from './backgrounds/combat_guide.webp'
import titleBg from './backgrounds/tt_001.webp'
import titleLogo from './backgrounds/tt_002.webp'
import player001 from './sprites/player_001.webp'
import playerModel from './models/player.glb?url'
import enemyMothModel from './models/enemy_moth.glb?url'
import enemyRoachModel from './models/enemy_roach.glb?url'
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
import skill2007 from './sprites/skills/skill_2007.webp'
import skill2008 from './sprites/skills/skill_2008.webp'
import skill2009 from './sprites/skills/skill_2009.webp'
import skill2010 from './sprites/skills/skill_2010.webp'
import skill3001 from './sprites/skills/skill_3001.webp'
import skill3002 from './sprites/skills/skill_3002.webp'
import skill3003 from './sprites/skills/skill_3003.webp'
import skill3005 from './sprites/skills/skill_3005.webp'
import skill3008 from './sprites/skills/skill_3008.webp'
import skill7001 from './sprites/skills/skill_7001.webp'
import skill7002 from './sprites/skills/skill_7002.webp'
import skill7003 from './sprites/skills/skill_7003.webp'
import skill9001 from './sprites/skills/skill_9001.webp'
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
import cinematic from './video/cinematic.webm'
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

export const GUIDE_ART = { combat: combatGuide }

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
  enemy_moth: enemyMothModel,
  enemy_roach: enemyRoachModel,
}

// 맥락카드 일러스트 — Word.art가 이 키를 참조한다.
// 1xxx 주어 · 2xxx 수식 · 3xxx 동사 · 7xxx 문장부호 · 9xxx 성장. 번호는 CSV 등장 순서를 따른다.
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
  '2007': skill2007,
  '2008': skill2008,
  '2009': skill2009,
  '2010': skill2010,
  '3001': skill3001,
  '3002': skill3002,
  '3003': skill3003,
  '3005': skill3005,
  // 3008은 '웅크렸다'용으로 그린 그림 — 카드 리뉴얼로 그 단어가 pumeot으로 옮겨가
  // 번호는 그대로 두고 옮겨 붙였다.
  '3008': skill3008,
  // 문장부호(올림프의 당근) — 7001 느낌표 · 7002 온점 · 7003 물음표
  '7001': skill7001,
  '7002': skill7002,
  '7003': skill7003,
  // 무럭무럭 — 네 슬롯이 같은 카드라 일러스트도 한 장을 공유한다.
  '9001': skill9001,
}

/**
 * 임시폐기 일러스트 — 감정 카드 리뉴얼로 대상 단어가 사라져 갈 곳을 잃은 그림들.
 * 파일은 `sprites/skills/n00X.webp`로 남겨 두고 여기 등록하지 않는다(빌드에서 빠진다).
 * 나중에 뜻이 맞는 카드가 생기면 번호를 새로 받아 되살리면 된다.
 *
 *   n001 ← 3004  후려쳤다 — 크게 휘두르는 공격
 *   n002 ← 3006  품었다   — 가슴에 안는 회복
 *   n003 ← 3007  내던졌다 — 돌을 던져 벽을 부수는 공격
 *   n004 ← 3009  박살냈다 — 산산조각 내는 공격
 *   n005 ← 3010  휩쓸어버렸다 — 페이지 끝에서 끝까지 쓰는 전체 공격
 */

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

// 영상 — 오프닝 시네마틱. 어택 컷은 전투 연출에 붙일 때 함께 등록한다.
export const VIDEO = {
  cinematic,
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
