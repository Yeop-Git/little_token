import { MODELS, SPRITES } from '@/assets'

export interface CharacterAnimationDef {
  idle: string
  attack: string
  heal?: string
  shield?: string
  victory1?: string
  victory2?: string
  defeat?: string
  /** 원본 클립 길이와 무관하게 화면 연출에 맞출 단발 동작별 재생 시간. */
  durationsMs?: Partial<Record<'attack' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat', number>>
  /** 원본 동작을 보존하면서 조절할 클립별 재생 배속. */
  playbackRates?: Partial<Record<'attack' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat', number>>
  /** idle 끝 자세를 첫 자세로 점진 보간할 루프 연결 구간. */
  idleLoopBlendMs?: number
  /** 승리 동작 중 스테이지 전환 전에 보여 줄 하이라이트 길이. */
  victoryHighlightMs?: number
}

export interface CharacterVisualDef {
  id: 'player' | 'termite' | 'moth' | 'flea' | 'roach' | 'pillbug' | 'mosquito' | 'saltSkater' | 'queenBee' | 'elderSpider'
  name: string
  model3d: string | null
  animations: CharacterAnimationDef | null
  /** 모델의 기본 정면을 전장 카메라 쪽으로 맞추는 Y축 회전값(radian). */
  modelYaw?: number
  /** 자동으로 맞춘 지면에서 모델을 추가로 들어 올릴 월드 좌표값. */
  modelGroundOffset?: number
  portrait2d: string
  title: string
  description: string
  companion?: {
    name: string
    model3d: string
    idleAnimation: string
    modelYaw?: number
  }
}

// 전장의 3D 모델과 상세 화면의 2D 스프라이트를 한 곳에서 1:1로 연결한다.
// 모델 에셋이 준비되기 전에는 model3d를 null로 두고 portrait2d를 전장에도 쓴다.
// 모든 적은 완전 측면(-90°)에서 화면 쪽으로 60° 돌아간 같은 방향을 공유한다.
const ENEMY_MODEL_YAW = -Math.PI / 6
const ENEMY_IDLE_LOOP_BLEND_MS = 500

export const CHARACTER_VISUALS: Record<CharacterVisualDef['id'], CharacterVisualDef> = {
  player: {
    id: 'player',
    name: '프롬',
    model3d: MODELS.player,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      heal: 'Armature|heal|BaseLayer',
      // 새 GLB의 실제 클립명이 sheld로 저장되어 있어 의미상의 shield와 명시적으로 연결한다.
      shield: 'Armature|sheld|BaseLayer',
      victory1: 'Armature|victory1|BaseLayer',
      victory2: 'Armature|victory2|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: {
        attack: 440,
        heal: 900,
        shield: 1100,
        defeat: 1500,
      },
      playbackRates: { victory1: 1.25, victory2: 1.25 },
      victoryHighlightMs: 2000,
    },
    // 화면 정면에서 90° 돌아 오른쪽의 적을 완전히 바라보는 측면 자세.
    modelYaw: Math.PI / 2,
    modelGroundOffset: -0.34,
    companion: {
      name: '토큰',
      model3d: MODELS.token,
      idleAnimation: 'Armature|fly|BaseLayer',
    },
    portrait2d: SPRITES.player_001,
    title: '이야기를 지키는 소년',
    description: '비에 젖은 일기장을 품고, 올바른 문장으로 이야기를 지켜낸다.',
  },
  termite: {
    id: 'termite',
    name: '흰개미',
    model3d: MODELS.enemy_termite,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_moth,
    title: '종이 속의 하얀 이빨',
    description: '투명한 날개를 접고 낡은 문장의 섬유부터 차근차근 갉아 먹는다.',
  },
  moth: {
    id: 'moth',
    name: '좀나방',
    model3d: MODELS.enemy_moth,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      // 긴 원본 클립을 기존 타격·사망 연출 타이밍에 맞추되 포즈 전환은
      // 공용 모델 렌더러의 크로스페이드로 부드럽게 연결한다.
      durationsMs: {
        attack: 440,
        defeat: 560,
      },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    // 플레이어와 서로 다른 모델 셸 높이를 보정해 실제 발끝을 같은 전장선에 둔다.
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_moth,
    title: '책장을 갉는 날개',
    description: '가벼운 날갯짓으로 문장의 가장자리부터 빠르게 먹어 치운다.',
  },
  flea: {
    id: 'flea',
    name: '벼룩',
    model3d: MODELS.enemy_flea,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_roach,
    title: '먼저 튀어 오르는 점',
    description: '문장이 다 써지기 전 지면을 박차고 먼저 달려든다.',
  },
  roach: {
    id: 'roach',
    name: '바퀴벌레',
    model3d: MODELS.enemy_roach,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: {
        attack: 440,
        defeat: 560,
      },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_roach,
    title: '문장 사이의 단단한 얼룩',
    description: '두꺼운 껍질로 버티며 일기장 깊숙한 곳까지 파고든다.',
  },
  pillbug: {
    id: 'pillbug',
    name: '콩벌레',
    model3d: MODELS.enemy_pillbug,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_roach,
    title: '한 번을 지워 내는 등껍질',
    description: '몸을 말아 첫 타격을 통째로 흘려보낸다.',
  },
  mosquito: {
    id: 'mosquito',
    name: '모기',
    model3d: null,
    animations: null,
    portrait2d: SPRITES.enemy_moth,
    title: '방어막 틈을 찌르는 침',
    description: '긴 침을 밀어 넣어 방어막 뒤의 체력을 바로 갉아 낸다.',
  },
  saltSkater: {
    id: 'saltSkater',
    name: '소금쟁이',
    model3d: null,
    animations: null,
    portrait2d: SPRITES.boss_salt_skater,
    title: '먹물 웅덩이를 가르는 왕관',
    description: '검은 물 위를 글씨처럼 스쳐 지나가며, 소금빛 종이 왕관으로 문장을 긁어낸다.',
  },
  queenBee: {
    id: 'queenBee',
    name: '여왕벌',
    model3d: null,
    animations: null,
    portrait2d: SPRITES.boss_queen_bee,
    title: '찢어진 종이의 벌집 여왕',
    description: '달콤한 잉크와 밀랍으로 빈 칸을 벌집처럼 막아 버린다.',
  },
  elderSpider: {
    id: 'elderSpider',
    name: '장로거미',
    model3d: null,
    animations: null,
    portrait2d: SPRITES.boss_elder_spider,
    title: '결말을 꿰매는 오래된 편집자',
    description: '낡은 일기장과 거미줄로 이야기를 억지로 다른 결말에 묶어 둔다.',
  },
}
