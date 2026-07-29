import { MODELS, SPRITES, TOKEN_FACES } from '@/assets'

export interface CharacterAnimationDef {
  idle: string
  /** 소환되어 전장에 나타나는 단발 동작. */
  appear?: string
  /** attack2의 준비 자세를 이어 받아 강공격 전까지 유지하는 대기 루프. */
  idle2?: string
  attack: string
  /**
   * 걸어오는 동작. 전장에 등장할 때만 쓰고, 도착하면 idle로 돌아온다.
   * GLB에는 진작 들어 있었는데 여기 연결이 없어서 안 쓰이고 있었다.
   */
  walk?: string
  /** 보스의 2/3 이하 체력 구간에서 사용하는 더 강한 공격 클립. */
  attack2?: string
  /** 보스의 1/3 이하 체력 구간에서 사용하는 가장 강한 공격 클립. */
  attack3?: string
  heal?: string
  shield?: string
  victory1?: string
  victory2?: string
  defeat?: string
  /**
   * 강타 연출이 attack 클립을 쪼개 쓰는 마디 — 원본 클립 길이 대비 비율이다.
   *   raise   손이 가장 높이 올라간 정점. 여기서 클립을 멈춰 세운다
   *   impact  가장 빠르게 내려꽂는 순간. 히트스탑을 넣을 프레임
   * 눈대중이 아니라 `npm run clip:beats`로 손 본의 월드 궤적을 실측해 뽑는다.
   */
  attackBeats?: { raise: number; impact: number }
  /** 원본 클립 길이와 무관하게 화면 연출에 맞출 단발 동작별 재생 시간. */
  durationsMs?: Partial<Record<'appear' | 'attack' | 'attack2' | 'attack3' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat', number>>
  /** 원본 동작을 보존하면서 조절할 클립별 재생 배속. */
  playbackRates?: Partial<Record<'appear' | 'attack' | 'attack2' | 'attack3' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat', number>>
  /** 클립별로 실제 움직임 뒤에 남은 정지 꼬리를 잘라낼 길이. */
  endTrimsMs?: Partial<Record<'appear' | 'attack' | 'attack2' | 'attack3' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat', number>>
  /** idle 끝 자세를 첫 자세로 점진 보간할 루프 연결 구간. */
  idleLoopBlendMs?: number
  /** 원본 idle 앞에서 잘라낼 불필요한 머리 구간. */
  idleStartTrimMs?: number
  /** 원본 idle 끝에서 잘라낼 불필요한 꼬리 구간. */
  idleEndTrimMs?: number
  /** 승리 동작 중 스테이지 전환 전에 보여 줄 하이라이트 길이. */
  victoryHighlightMs?: number
}

export interface CharacterVisualDef {
  id: 'player' | 'token' | 'termite' | 'moth' | 'flea' | 'roach' | 'pillbug' | 'mosquito' | 'workerBee' | 'mantis' | 'queenBee' | 'elderSpider'
  name: string
  model3d: string | null
  animations: CharacterAnimationDef | null
  /** 모델의 기본 정면을 전장 카메라 쪽으로 맞추는 Y축 회전값(radian). */
  modelYaw?: number
  /** 자동으로 맞춘 지면에서 모델을 추가로 들어 올릴 월드 좌표값. */
  modelGroundOffset?: number
  /** 깊이가 긴 모델의 투영 왜곡을 줄이는 캐릭터별 정사영 카메라 높이. */
  cameraPositionY?: number
  cameraTargetY?: number
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
// 보스전은 주인공의 1인칭 시점으로 맞선다. 추후 GLB가 들어오면 보스만
// 공용 적의 사선 방향 대신 카메라를 정면으로 바라보게 한다.
const BOSS_MODEL_YAW = 0
const ENEMY_IDLE_LOOP_BLEND_MS = 500

export const CHARACTER_VISUALS: Record<CharacterVisualDef['id'], CharacterVisualDef> = {
  player: {
    id: 'player',
    name: '프롬',
    model3d: MODELS.player,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      heal: 'Armature|heal|BaseLayer',
      // 새 GLB의 실제 클립명이 sheld로 저장되어 있어 의미상의 shield와 명시적으로 연결한다.
      shield: 'Armature|sheld|BaseLayer',
      victory1: 'Armature|victory1|BaseLayer',
      victory2: 'Armature|victory2|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      // 원본 attack 2417ms 중 손이 가장 높은 순간 667ms, 가장 빠르게 내려꽂는 순간 850ms.
      attackBeats: { raise: 0.28, impact: 0.35 },
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
  token: {
    id: 'token',
    name: '토큰',
    model3d: MODELS.token,
    animations: {
      idle: 'Armature|fly|BaseLayer',
      attack: 'Armature|fly|BaseLayer',
      idleLoopBlendMs: 350,
    },
    portrait2d: TOKEN_FACES.neutral,
    title: '불안한 이야기 길잡이',
    description: '프롬의 곁을 맴돌며 위험한 낙서 앞에서 부산하게 신호를 보낸다.',
  },
  termite: {
    id: 'termite',
    name: '흰개미',
    model3d: MODELS.enemy_termite,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_termite,
    title: '종이 속의 하얀 이빨',
    description: '투명한 날개를 접고 낡은 문장의 섬유부터 차근차근 갉아 먹는다.',
  },
  moth: {
    id: 'moth',
    name: '먼지벌레',
    model3d: MODELS.enemy_moth,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
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
    title: '책장 사이의 먼지 청소부',
    description: '먼지 묻은 솔로 문장 가장자리를 털어 내듯 조각조각 지워 버린다.',
  },
  flea: {
    id: 'flea',
    name: '좀나방',
    model3d: MODELS.enemy_flea,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_flea,
    title: '먼저 날아드는 종이 포식자',
    description: '문장이 다 써지기 전 날아들어 종잇조각부터 먼저 물어뜯는다.',
  },
  roach: {
    id: 'roach',
    name: '바퀴',
    model3d: MODELS.enemy_roach,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: {
        attack: 440,
        defeat: 560,
      },
      idleStartTrimMs: 300,
      idleEndTrimMs: 250,
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
    name: '공벌레',
    model3d: MODELS.enemy_pillbug,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleStartTrimMs: 4700,
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_pillbug,
    title: '한 번을 지워 내는 등껍질',
    description: '몸을 말아 첫 타격을 통째로 흘려보낸다.',
  },
  mosquito: {
    id: 'mosquito',
    name: '모기',
    model3d: MODELS.enemy_mosquito,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    modelGroundOffset: -0.18,
    portrait2d: SPRITES.enemy_mosquito,
    title: '방어막 틈을 찌르는 침',
    description: '긴 침을 밀어 넣어 방어막 뒤의 체력을 바로 갉아 낸다.',
  },
  workerBee: {
    id: 'workerBee',
    name: '일벌',
    model3d: MODELS.enemy_worker_bee,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      appear: 'Armature|appear|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { appear: 340, attack: 390, defeat: 280 },
      // appear는 실제 등장 동작 뒤 약 2.4초 동안 거의 같은 자세가 이어진다.
      // 마지막 2.2초를 덜어 내고 남은 동작만 소환 팝 타이밍에 맞춰 재생한다.
      endTrimsMs: { appear: 2200 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: ENEMY_MODEL_YAW,
    portrait2d: SPRITES.enemy_worker_bee,
    title: '여왕의 문장을 지키는 호위',
    description: '여왕벌의 양옆을 지켜 본체를 무적으로 만든다. 모두 쓰러뜨리면 여왕이 빈틈을 보인다.',
  },
  mantis: {
    id: 'mantis',
    name: '사마귀',
    model3d: MODELS.boss_mantis,
    animations: {
      idle: 'Armature|idle1|BaseLayer',
      // 예고 대기 자세는 원본 GLB의 `hold`다. `idle2`는 몸을 낮추고 큰낫을 옆으로
      // 뉘인 다른 대기라, 예고 한 턴 동안 사마귀가 갑자기 작아진 것처럼 보였다.
      // `hold`만 idle1과 같은 키·정면 실루엣으로 큰낫을 머리 위에 세워 둔다.
      idle2: 'Armature|hold|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack1|BaseLayer',
      // 강공격 예고는 준비 동작을 재생하지 않고 `hold`(idle2)로 바로 전환한다.
      attack3: 'Armature|attack3|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, attack3: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: BOSS_MODEL_YAW,
    cameraPositionY: 1.45,
    cameraTargetY: 1.45,
    portrait2d: SPRITES.boss_mantis,
    title: '문장을 재단하는 큰낫',
    description: '평범한 낫질 뒤 큰낫을 높이 들어 강공격을 예고한다. 막아 내면 크게 휘청여 빈틈을 보이고 다음 공격을 한 턴 거른다.',
  },
  queenBee: {
    id: 'queenBee',
    name: '여왕벌',
    model3d: MODELS.boss_queen_bee,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      walk: 'Armature|walk|BaseLayer',
      attack: 'Armature|attack1|BaseLayer',
      attack2: 'Armature|attack2|BaseLayer',
      attack3: 'Armature|attack3|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, attack2: 440, attack3: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: BOSS_MODEL_YAW,
    // 앞뒤 깊이가 키보다 큰 모델이라 공용 하향 시점을 쓰면 팔다리가
    // 세로로 늘어나 보인다. 보스를 정면에서 마주 보는 직교 시점으로 맞춘다.
    cameraPositionY: 1.45,
    cameraTargetY: 1.45,
    portrait2d: SPRITES.boss_queen_bee,
    title: '찢어진 종이의 벌집 여왕',
    description: '달콤한 잉크와 밀랍으로 빈 칸을 벌집처럼 막아 버린다.',
  },
  elderSpider: {
    id: 'elderSpider',
    name: '장로거미',
    model3d: MODELS.boss_elder_spider,
    animations: {
      idle: 'Armature|idle|BaseLayer',
      attack: 'Armature|attack1|BaseLayer',
      attack2: 'Armature|attack2|BaseLayer',
      attack3: 'Armature|attack3|BaseLayer',
      defeat: 'Armature|defeat|BaseLayer',
      durationsMs: { attack: 440, attack2: 440, attack3: 440, defeat: 560 },
      idleLoopBlendMs: ENEMY_IDLE_LOOP_BLEND_MS,
    },
    modelYaw: BOSS_MODEL_YAW,
    cameraPositionY: 1.45,
    cameraTargetY: 1.45,
    portrait2d: SPRITES.boss_elder_spider,
    title: '결말을 꿰매는 오래된 편집자',
    description: '낡은 일기장과 거미줄로 이야기를 억지로 다른 결말에 묶어 둔다.',
  },
}
