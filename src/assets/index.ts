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
import tokenModel from './models/token.glb?url'
import enemyMothModel from './models/enemy_moth.glb?url'
import enemyRoachModel from './models/enemy_roach.glb?url'
import enemyTermiteModel from './models/enemy_termite.glb?url'
import enemyFleaModel from './models/enemy_flea.glb?url'
import enemyPillbugModel from './models/enemy_pillbug.glb?url'
import enemyMosquitoModel from './models/enemy_mosquito.glb?url'
import bossQueenBeeModel from './models/boss_queen_bee.glb?url'
import token001 from './sprites/token/token_001.webp'
import token002 from './sprites/token/token_002.webp'
import token003 from './sprites/token/token_003.webp'
import enemyMoth from './sprites/enemy_moth.webp'
import enemyFlea from './sprites/enemy_flea.webp'
import enemyTermite from './sprites/enemy_termite.webp'
import enemyRoach from './sprites/enemy_roach.webp'
import enemyPillbug from './sprites/enemy_pillbug.webp'
import enemyMosquito from './sprites/enemy_mosquito.webp'
import bossSaltSkater from './sprites/boss_salt_skater.webp'
import bossQueenBee from './sprites/boss_queen_bee.webp'
import bossElderSpider from './sprites/boss_elder_spider.webp'
import emotionJoy from './sprites/emotions/emotion_joy.webp'
import emotionAnger from './sprites/emotions/emotion_anger.webp'
import emotionSorrow from './sprites/emotions/emotion_sorrow.webp'
import emotionPleasure from './sprites/emotions/emotion_pleasure.webp'
import skill1001 from './sprites/skills/skill_1001.webp'
import skill1002 from './sprites/skills/skill_1002.webp'
import skill1003 from './sprites/skills/skill_1003.webp'
import skill1004 from './sprites/skills/skill_1004.webp'
import skill1005 from './sprites/skills/skill_1005.webp'
import skill1006 from './sprites/skills/skill_1006.webp'
import skill1007 from './sprites/skills/skill_1007.webp'
import skill1008 from './sprites/skills/skill_1008.webp'
import skill1009 from './sprites/skills/skill_1009.webp'
import skill1010 from './sprites/skills/skill_1010.webp'
import skill1011 from './sprites/skills/skill_1011.webp'
import skill1012 from './sprites/skills/skill_1012.webp'
import skill1013 from './sprites/skills/skill_1013.webp'
import skill1014 from './sprites/skills/skill_1014.webp'
import skill1015 from './sprites/skills/skill_1015.webp'
import skill1016 from './sprites/skills/skill_1016.webp'
import skill1017 from './sprites/skills/skill_1017.webp'
import skill1018 from './sprites/skills/skill_1018.webp'
import skill1019 from './sprites/skills/skill_1019.webp'
import skill1020 from './sprites/skills/skill_1020.webp'
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
import skill2011 from './sprites/skills/skill_2011.webp'
import skill2012 from './sprites/skills/skill_2012.webp'
import skill2013 from './sprites/skills/skill_2013.webp'
import skill2014 from './sprites/skills/skill_2014.webp'
import skill2015 from './sprites/skills/skill_2015.webp'
import skill2016 from './sprites/skills/skill_2016.webp'
import skill2017 from './sprites/skills/skill_2017.webp'
import skill2018 from './sprites/skills/skill_2018.webp'
import skill2019 from './sprites/skills/skill_2019.webp'
import skill2020 from './sprites/skills/skill_2020.webp'
import skill3001 from './sprites/skills/skill_3001.webp'
import skill3002 from './sprites/skills/skill_3002.webp'
import skill3003 from './sprites/skills/skill_3003.webp'
import skill3004 from './sprites/skills/skill_3004.webp'
import skill3005 from './sprites/skills/skill_3005.webp'
import skill3006 from './sprites/skills/skill_3006.webp'
import skill3007 from './sprites/skills/skill_3007.webp'
import skill3008 from './sprites/skills/skill_3008.webp'
import skill3009 from './sprites/skills/skill_3009.webp'
import skill3010 from './sprites/skills/skill_3010.webp'
import skill3011 from './sprites/skills/skill_3011.webp'
import skill3012 from './sprites/skills/skill_3012.webp'
import skill3013 from './sprites/skills/skill_3013.webp'
import skill3014 from './sprites/skills/skill_3014.webp'
import skill3015 from './sprites/skills/skill_3015.webp'
import skill3016 from './sprites/skills/skill_3016.webp'
import skill3017 from './sprites/skills/skill_3017.webp'
import skill3018 from './sprites/skills/skill_3018.webp'
import skill3019 from './sprites/skills/skill_3019.webp'
import skill3020 from './sprites/skills/skill_3020.webp'
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
import battleStoryEatingBugs from './audio/battle-story-eating-bugs.mp3'
import battlePaperPages from './audio/battle-paper-pages.mp3'
import battlePaperTaiko from './audio/battle-paper-taiko.mp3'
import battleHeroicMarch from './audio/battle-heroic-march.mp3'
import bossSaltSkaterBgm from './audio/boss-salt-skater.mp3'
import bossQueenBeeBgm from './audio/boss-queen-bee.mp3'
import bossElderSpiderBgm from './audio/boss-elder-spider.mp3'
import resonanceJoy from './audio/resonance-joy.mp3'
import resonanceAnger from './audio/resonance-anger.mp3'
import resonanceSorrow from './audio/resonance-sorrow.mp3'
import resonancePleasure from './audio/resonance-pleasure.mp3'
import contextBonus from './audio/context-bonus.mp3'

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

// 카드 감정 뱃지 — 사용자 제공 수채화 캐릭터를 런타임 WebP로 최적화한 아이콘.
export const EMOTION_FACES: Record<string, string> = {
  joy: emotionJoy,
  anger: emotionAnger,
  sorrow: emotionSorrow,
  pleasure: emotionPleasure,
}

// 스프라이트 키 → URL (엔티티 데이터의 sprite 필드가 이 키를 참조)
export const SPRITES: Record<string, string> = {
  player_001: player001,
  enemy_moth: enemyMoth,
  enemy_flea: enemyFlea,
  enemy_termite: enemyTermite,
  enemy_roach: enemyRoach,
  enemy_pillbug: enemyPillbug,
  enemy_mosquito: enemyMosquito,
  boss_salt_skater: bossSaltSkater,
  boss_queen_bee: bossQueenBee,
  boss_elder_spider: bossElderSpider,
}

// 전장용 GLB. 상세 카드에는 계속 대응되는 SPRITES 초상을 사용한다.
export const MODELS: Record<string, string> = {
  player: playerModel,
  token: tokenModel,
  enemy_moth: enemyMothModel,
  enemy_roach: enemyRoachModel,
  enemy_termite: enemyTermiteModel,
  enemy_flea: enemyFleaModel,
  enemy_pillbug: enemyPillbugModel,
  enemy_mosquito: enemyMosquitoModel,
  boss_queen_bee: bossQueenBeeModel,
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
  // 감정 주어 리뉴얼분 — 1009~1020이 CSV 순서 그대로 붙는다.
  '1009': skill1009,
  '1010': skill1010,
  '1011': skill1011,
  '1012': skill1012,
  '1013': skill1013,
  '1014': skill1014,
  '1015': skill1015,
  '1016': skill1016,
  '1017': skill1017,
  '1018': skill1018,
  '1019': skill1019,
  '1020': skill1020,
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
  // 감정 수식 리뉴얼분 — 열 장이 CSV 순서대로 그대로 붙는다.
  '2011': skill2011,
  '2012': skill2012,
  '2013': skill2013,
  '2014': skill2014,
  '2015': skill2015,
  '2016': skill2016,
  '2017': skill2017,
  '2018': skill2018,
  '2019': skill2019,
  '2020': skill2020,
  '3001': skill3001,
  '3002': skill3002,
  '3003': skill3003,
  '3004': skill3004,
  '3005': skill3005,
  // 3006('품었다'용 그림)이 웅크렸다로 왔다 — id가 pumeot이고 태그도 warm이라
  // "작아진 마음을 품고"라는 문구와 같은 그림이다. 원래 쓰던 3008은 새로 그려져
  // 고쳐냈다로 넘어갔다.
  '3006': skill3006,
  '3007': skill3007,
  '3008': skill3008,
  // 3009~3020은 전투 규칙 카드(SPECIAL_REWARD_WORDS) 열두 장이 순서대로 쓴다.
  '3009': skill3009,
  '3010': skill3010,
  '3011': skill3011,
  '3012': skill3012,
  '3013': skill3013,
  '3014': skill3014,
  '3015': skill3015,
  '3016': skill3016,
  '3017': skill3017,
  '3018': skill3018,
  '3019': skill3019,
  '3020': skill3020,
  // 문장부호(올림프의 당근) — 7001 느낌표 · 7002 온점 · 7003 물음표
  '7001': skill7001,
  '7002': skill7002,
  '7003': skill7003,
  // 무럭무럭 — 네 슬롯이 같은 카드라 일러스트도 한 장을 공유한다.
  '9001': skill9001,
}

/**
 * 대기 중인 일러스트 — 파일은 있는데 아직 붙을 단어가 없는 그림들.
 * 여기 등록하지 않으면 빌드에서 빠지므로 두어도 용량에 영향이 없다.
 * 뜻이 맞는 카드가 생기면 그때 번호를 그대로 등록하면 된다.
 *
 *   1021 · 1022   주어 — 요정에게 손 뻗기 / 멀리 가리키기
 *
 * 반대로 그림이 없어 비어 있는 단어(art 미지정)는 `npm run check`가 매번 알려준다.
 * 동사 번호는 3001~3006 초기 · 3007~3008 보상 · 3009~3020 전투 규칙 카드로 꽉 차 있다.
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
  battleStoryEatingBugs,
  battlePaperPages,
  battlePaperTaiko,
  battleHeroicMarch,
  bossSaltSkaterBgm,
  bossQueenBeeBgm,
  bossElderSpiderBgm,
  resonanceJoy,
  resonanceAnger,
  resonanceSorrow,
  resonancePleasure,
  contextBonus,
}
