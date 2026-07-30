/**
 * 전투 뷰 v4 — 배경 일러스트 위 쉐이더틱 UI.
 *  · 상단: 완성 중인 문장(체인) 그림자 강조
 *  · 중앙 하단: 단어를 가로 배치하고 클릭으로 발동. 전부 채우면 자동 완성(반짝 후 발동)
 *  · 되돌리기: 하단 중앙 회색 연한 글자, 한 단계씩 되돌림
 *  · 좌측: 스탯표 · 행동 순서 · 보유 아이템 아이콘
 *  · 우측: 정보 패널 — "해당 단어"만의 효과/수치(누적 아님)
 *  · 우상단: 설정 · 도감 · 홈
 */

import {
  compile,
  effectiveBase,
  isDamageIntent,
  matchCombos,
  resolveMultiplier,
  sentenceTokens,
  statBiasOf,
  withOverdrawEffects,
  type ResolvedMult,
} from '@core/compiler'
import { wordNoteText, wordValueLines } from '@core/wordText'
import {
  carryInkAfterSpend,
  inkExceedsLimit,
  inkOverdraw,
  selectionInkCost,
  selectionCarryInk,
  SENTENCE_OVERDRAW_LIMIT,
  sentenceInkAvailable,
  wordInkCost,
} from '@core/ink'
import { eul } from '@core/josa'
import { conflictReason, pruneConflicts } from '@core/validator'
import { comboHintHtml } from '@/ui/ComboHint'
import { emotionBadgeContent, emotionIconBadge, emotionIconContent } from '@/ui/EmotionBadge'
import { emotionOrNeutral, EMOTION_LABEL, RARITY_LABEL, type Combo, type CompileMods, type Emotion, type Intent, type Selection, type Tables, type Word, type FieldDef } from '@core/types'
import { TABLES } from '@data/tables'
import { ALL_REWARD_WORDS, ANY_SLOT, EARLY_WORDS, growCardFor, PUNCT_WORDS, tablesForEncounter } from '@data/earlyWords'
import { ENEMIES, QUEEN_ESCORT_IMMUNITY_LABEL, enemyDefForEncounter } from '@data/enemies'
import { tacticalGuideForEnemy } from '@data/tacticalCards'
import {
  activeEnemyPart,
  allDead,
  aliveIdx,
  applyIntent,
  applyInkOverdraw,
  applyOverkillTransfer,
  applyPendingAttack,
  applyPreparation,
  BOSS_ATTACK_MULTIPLIER,
  bossAttackStage,
  enemyAttackForecast,
  enemyGuardBreakRequirement,
  enemyTurn,
  engageFront,
  engageInitialFront,
  frontIdx,
  makeEnemy,
  nextEnemyAttackStep,
  playerGuardLimit,
  spiderWebAtTurnStart,
  spiderSealSlotForTurn,
  spiderWebTension,
  summonAtTurnStart,
  summonCount,
  type ApplyResult,
  type TurnSummon,
  type BattleState,
  type EnemyInst,
} from '@/sim/reference'
import { enemySentenceFor, type EnemySentenceToken, type EnemySentenceView } from '@/sim/enemySentences'
import { INK_UI, REWARD_ART, SKILL_ART, SPRITES, TOKEN_FACES } from '@/assets'
import { icon, itemArt } from '@/ui/Icons'
import { SquareBurst } from '@/ui/SquareBurst'
import { TooltipLayer } from '@/ui/TooltipLayer'
import { clearRewardValue, gradeForElapsedTurns, gradeTier, startGrade } from '@core/grade'
import { defaultPlayer, itemTooltipText, ITEM_STAT_ORDER, ownedItemRarity, STAT_META, type PlayerState } from '@core/player'
import { emptyRunRecord, type DefeatCause, type RunRecord } from '@core/run'
import { hasSeenCombatCoach, markCombatCoachSeen, type CombatCoachHint } from '@core/save'
import { discoverCombos, discoveredComboIds } from '@core/comboDiscovery'
import { beanstalkGrowthFor, DOUBT_RANGE, DOUBT_SUFFIX, ECHO_REPEAT_SCALE, hasPassive, modsFor, PASSIVES } from '@core/passives'
import { ALL_ITEMS, STAT_LABEL } from '@data/items'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'
import { BOSS_BY_FLOOR, stageFor, type Stage } from '@data/stages'
import { DISPLAY_FLOORS } from '@/config/edition'
import { CARD_HAND_CONFIG, CardHand, type DebugCardSpawnResult } from '@/ui/CardHand'
import { wordCardFrontHtml, wordMood } from '@/ui/WordCardFace'
import { GameAudio } from '@/audio/GameAudio'
import { inkMeterHtml, updateInkMeter } from '@/ui/InkMeter'
import { IntroDialogue } from '@views/IntroDialogue'
import { AttackCinematic, attackCutFor, PUMP_MULT, PUMP_RATIO, type AttackCut } from '@/ui/AttackCinematic'
import {
  currentFieldLight,
  currentFieldStage,
  pickFieldBackground,
  type FieldBackground,
} from '@data/backgrounds'
import { openSettingsModal } from '@/ui/SettingsModal'
import { currentLocale, t } from '@/localization'
import { growthText } from '@/localization/growth'

const BUILD_EFFECT_TEXT = {
  ko: { magic: '매직실드', magicTip: '다음 적 공격을 관통 여부와 무관하게 막음', magicReady: '매직실드 1겹 준비', magicBlocked: '매직실드가 적의 공격을 통째로 막고 사라졌다.', blocked: '매직실드 방어!', healed: '흡혈로 체력 {value} 회복', overflow: '넘친 회복이 피해 {value}(으)로 바뀌었다.', healPop: '회복+{value}' },
  en: { magic: 'Magic Shield', magicTip: 'Blocks the next enemy attack even if it pierces Guard', magicReady: 'Magic Shield: 1 layer ready', magicBlocked: 'The Magic Shield erased the enemy attack and vanished.', blocked: 'Magic Shield!', healed: 'Lifesteal restored {value} HP', overflow: 'Overhealing became {value} damage.', healPop: 'Heal +{value}' },
  ja: { magic: 'マジックシールド', magicTip: '防御貫通を含む次の敵攻撃を防ぐ', magicReady: 'マジックシールド1層を準備', magicBlocked: 'マジックシールドが敵の攻撃を防いで消えた。', blocked: 'マジックシールド！', healed: '吸収で体力を{value}回復', overflow: '超過回復が{value}ダメージに変わった。', healPop: '回復+{value}' },
  ru: { magic: 'Магический щит', magicTip: 'Блокирует следующую атаку врага, даже пробивающую защиту', magicReady: 'Готов 1 слой магического щита', magicBlocked: 'Магический щит полностью поглотил атаку и исчез.', blocked: 'Магический щит!', healed: 'Вампиризм восстановил {value} здоровья', overflow: 'Избыток лечения превратился в {value} урона.', healPop: 'Лечение +{value}' },
  'zh-Hans': { magic: '魔法盾', magicTip: '无视是否贯穿防御，抵挡下一次敌方攻击', magicReady: '已准备1层魔法盾', magicBlocked: '魔法盾完全挡住敌方攻击后消失了。', blocked: '魔法盾防御！', healed: '吸血恢复了{value}点生命', overflow: '过量治疗转化为{value}点伤害。', healPop: '恢复+{value}' },
  'zh-Hant': { magic: '魔法盾', magicTip: '無視是否貫穿防禦，抵擋下一次敵方攻擊', magicReady: '已準備1層魔法盾', magicBlocked: '魔法盾完全擋住敵方攻擊後消失了。', blocked: '魔法盾防禦！', healed: '吸血恢復了{value}點生命', overflow: '過量治療轉化為{value}點傷害。', healPop: '恢復+{value}' },
}[currentLocale]

const buildEffectText = (key: keyof typeof BUILD_EFFECT_TEXT, value?: number): string =>
  BUILD_EFFECT_TEXT[key].replace('{value}', String(value ?? ''))
import { bossTokenLine, type TokenLine } from '@/localization/bossToken'
import { enemySentenceText as bossText } from '@/localization/enemySentences'
import { comboCodexText } from '@/localization/comboCodex'
import {
  characterAnimationOf,
  destroyCharacterModels,
  dissolveCharacterParts,
  freezeCharacterAnimation,
  isCharacterModelReady,
  mountCharacterModel,
  playCharacterAnimation,
  suspendCharacterModel,
  type BattleAnimation,
} from '@views/BattleCharacterModel'
import { TokenActor } from '@views/TokenActor'
import { sharedTokenPlaystyle } from '@core/tokenPlaystyle'
import { sharedTokenMind } from '@core/tokenMind'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const hudTip = (key: string, korean: string, values: Record<string, string | number> = {}): string => {
  let text = t(key, korean)
  for (const [name, value] of Object.entries(values)) text = text.split(`{${name}}`).join(String(value))
  return text
}

interface Opts {
  field: FieldDef
  encounter: string[]
  /** 런 전체에서 보유 중인 영감. 전투 HUD에서는 이번 전투 획득 예정치와 분리해 보여 준다. */
  inspiration?: number
  /** 전투가 끝난 시점의 영감 획득량을 들고 나간다 — 런 재화와 보상 희귀도 확률에 함께 쓰인다. */
  onWin: (grade: number, resources: { hp: number; guard: number }, rewardValue: number) => void
  onLose: (cause: DefeatCause | null) => void
  /** 런 내내 누적되는 기록. 결과 화면의 찢어진 종이가 이걸 읽는다. */
  record?: RunRecord
  onHome?: () => void
  onResetAll?: () => void
  player?: PlayerState
  /** 직전 스테이지에서 남긴 체력과 방어막. */
  resources?: { hp: number; guard: number }
  tables?: Tables
  hpMult?: number
  atkMult?: number
  isBoss?: boolean
  /** 현재 층. 배경 고르기에 쓴다 — 1스테이지는 늘 첫 배경으로 고정한다. */
  day?: number
  /** 진입 전에 이미지 디코딩까지 마친 이번 전투 배경. */
  background?: FieldBackground
  /** 현재 보스의 체력 막 수. 일반 전투에는 전달하지 않는다. */
  bossHealthBars?: number
  /** 오프닝 다이얼로그(토큰 컷신)를 이 전투 위에서 먼저 재생한다. */
  intro?: boolean
  /** 오프닝을 끝까지 보거나 SKIP으로 정상 종료한 뒤 호출한다. */
  onIntroComplete?: () => void
  /** 저장하지 않는 개발용 전투 보정. */
  debugCombat?: {
    invincible: boolean
    attackMultiplier: number
  }
}

type Mood = 'attack' | 'guard' | 'heal' | 'gamble' | 'sacrifice' | 'buff'
/** 한 공격 안에서 여러 적이 맞을 때 음계처럼 들리게 하는 타격 간격. */
const SWORD_HIT_GAP_MS = 85
// 적 레일 — 전장에는 앞의 세 마리만 세우고, 나머지는 대기 수로 요약한다.
// 전투 상태의 전체 적 배열은 유지하므로 관통·광역 피해 규칙에는 영향을 주지 않는다.
// 레일의 가로 자리와 간격은 배경마다 다르되, 일반 전투 배우는 모두 같은
// 바닥선·크기로 세운다(data/backgrounds.ts의 FieldStage).
const MAX_VISIBLE_ENEMIES = 3
/** 배경이 갈리는 판 — 와이프(1.7초 + 0.15 지연)가 지나간 뒤 적이 들어온다. */
const ENEMY_ENTER_AFTER_SWAP_MS = 1500
/** 첫 판처럼 갈릴 배경이 없으면 한 박자만 두고 바로 들어온다. */
const ENEMY_ENTER_DELAY_MS = 260
/**
 * 프롬·적이 걷는 시간. 이동 자체는 style.css가 맡는다(프롬 1초 / 적 2.1초).
 * 여기에 딱 맞추지 않고 한 뼘씩 넘겨 둔다 — 도착하는 프레임에 동작이 끊기면
 * 발이 땅에 닿는 순간 자세가 튀어서, 마지막 걸음이 잦아들며 idle로 넘어가게 한다.
 */
const PLAYER_ENTER_MS = 1120
const FOE_WALK_MS = 2260
/**
 * 뒷줄이 한 칸 당겨올 때 걷는 시간. style.css의 .actor 이동 트랜지션(0.42s)과
 * 같아야 한다 — 더 길면 도착한 자리에서 제자리걸음을 하고, 더 짧으면 걷다 말고 미끄러진다.
 */
const RAIL_ADVANCE_WALK_MS = 420
const MAX_ACTION_ORDER_ENEMIES = 3

// ── 강타 한 방의 마디 ──
// 평소 attack은 440ms로 눌러 쓰지만(원본 2417ms) 강타에서만 늘려서 예비 동작을 보여 준다.
// 늘린 길이 안에서 정점과 타격 프레임은 매니페스트의 attackBeats 비율로 잡는다.
/** 강타에서 attack 클립을 늘려 쓸 길이. 정점까지 약 390ms, 정점에서 타격까지 약 100ms. */
const HEAVY_SWING_MS = 1400
/** 칼을 들어올린 채 멈춰 있는 시간. 이 위로 액션 컷이 밀려 들어온다. */
const HEAVY_HOLD_MS = 460
/**
 * 컷이 물러난 뒤 한 박자 — 패널의 나가는 곡선이 뒤로 몰려 있어(cubic-bezier(0.7,0,0.84,0))
 * 트랜지션이 끝나고도 화면 끝을 스치며 나간다. 실측으로 260ms 뒤에도 10%밖에 안 빠졌다.
 */
const HEAVY_PANEL_CLEAR_MS = 200
/** 돌진을 타격보다 이만큼 먼저 출발시킨다 — 0.44초 돌진의 42%(185ms)가 타격에 겹치게. */
const HEAVY_LUNGE_LEAD_MS = 80
/**
 * 섬광이 다 피어날 시간. 정지 화면에 붙들 그림이 없으면 정지가 공백으로 읽힌다.
 * 48ms로 잡았을 때는 겉겹(링·프리즘·베인 사선)이 아직 10~20%밖에 안 자라서
 * 정지 프레임에 흰 점 하나만 남았다(실측). 겹들이 절정에 닿는 지점까지 기다린다.
 */
const HEAVY_FLASH_BLOOM_MS = 120
/** 강타의 정지는 평소보다 이만큼 더 길게 — 다만 120ms를 넘기면 멈춘 게 아니라 버벅인 것으로 읽힌다. */
const HEAVY_HIT_STOP_BONUS_MS = 26
/**
 * 검기가 적 하나를 지나쳐 다음 적에게 닿기까지. 짧아야 한다 —
 * 260ms로 잡았을 때는 관통마다 화면이 기다리는 것처럼 읽혔다. 검기는 훑고 지나가는
 * 것이고, 쓰러지는 건 그 뒤에서 알아서 일어나야 한다.
 */
const SLASH_BEAM_MS = 120
/**
 * 이 배율이면 연출이 최대로 화려해진다. 문턱은 PUMP_MULT(×2) —
 * 그 사이를 0~1로 펴서 겹·크기·정지 길이·흔들림에 전부 태운다.
 * 초반 덱으로도 ×5는 나오고 ×8은 잘 쌓은 후반 문장이라 여기를 천장으로 잡았다.
 */
const HEAVY_MULT_CEILING = 8
const TOKEN_BOSS_LINES = [
  bossTokenLine('idleConcern'),
  bossTokenLine('idleHuge'),
  bossTokenLine('idleStand'),
  bossTokenLine('idleIncoming'),
] as const
const TOKEN_COACH_LINES: Record<CombatCoachHint, TokenLine> = {
  subject: bossTokenLine('coachSubject'),
  modifier: bossTokenLine('coachModifier'),
  verb: bossTokenLine('coachVerb'),
  resonance: bossTokenLine('coachResonance', 'relief'),
  context: bossTokenLine('coachContext', 'relief'),
  'ink-low': bossTokenLine('coachInkLow'),
  'ink-overdraw': bossTokenLine('coachInkOverdraw', 'warn'),
  'enemy-first': bossTokenLine('coachEnemyFirst', 'warn'),
  overflow: bossTokenLine('coachOverflow', 'relief'),
}
/**
 * 토큰의 말투 세기. 보스 패턴 경고와 파훼 방법은 전부 토큰의 말풍선으로 나가고,
 * 지금 놓치면 아픈 것만 `warn`으로 올려 빨간 색연필 쪽지가 된다.
 *
 * `warn`은 스스로 사라지지 않는다. 큰낫이 올라간 걸 알려 놓고 카드를 고르는 사이에
 * 말풍선이 꺼지면 경고를 본 의미가 없다.
 */
/**
 * 아이콘 호버 쪽지 한 장 — 첫 줄은 "무엇인지", 둘째 줄은 "그래서 어떻게 되는지".
 * 처음 하는 사람이 규칙 용어를 몰라도 둘째 줄만 읽고 행동을 정할 수 있어야 한다.
 * 개행은 CSS(white-space: pre-line)가 살린다.
 */
const tip = (title: string, detail: string): string => `${title}\n${detail}`

const TOKEN_BOSS_HINTS = {
  mantisStart: bossTokenLine('mantisStart'),
  mantisTelegraph: bossTokenLine('mantisTelegraph', 'warn'),
  mantisGroggy: bossTokenLine('mantisGroggy', 'relief'),
  mantisPunished: bossTokenLine('mantisPunished', 'warn'),
  queenBeeStart: bossTokenLine('queenBeeStart'),
  queenBeeDispersed: bossTokenLine('queenBeeDispersed', 'relief'),
  elderSpiderMiss: bossTokenLine('elderSpiderMiss', 'warn'),
  elderSpiderWebReady: bossTokenLine('elderSpiderWebReady', 'warn'),
  elderSpiderWebCut: bossTokenLine('elderSpiderWebCut', 'relief'),
} as const

/** 다리가 떨어질 때마다 다음 약점을 이름으로 알려 준다 — 이 보스의 유일한 공략이다. */
const spiderNextWeaknessLine = (weakness: string | null): TokenLine =>
  weakness
    ? bossTokenLine('spiderNextWeakness', 'relief', { weakness })
    : bossTokenLine('spiderBody', 'relief')
const TRANSIENT_ACTOR_CLASSES = [
  'front',
  'target',
  'back',
  'strikes-first',
  'hit',
  'lunge',
  'dying',
  'fast',
  'dead',
] as const
const BUG_COUNT_ICON = `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="24" cy="26" rx="10" ry="14" fill="currentColor" fill-opacity=".16"/><path d="M19 14c0-5 10-5 10 0M14 21 8 17M34 21l6-4M14 29l-7 2M34 29l7 2M17 37l-5 5M31 37l5 5M24 16v24"/>
</svg>`

/** 발라트로식 점수 분해 — 더해지는 "깡 점수"와 곱해지는 "배율"을 출처별로 쪼갠 것. */
interface TallyPart {
  label: string
  value: number
  cls: string
}
interface Tally {
  flats: TallyPart[]
  mults: TallyPart[]
  base: number
  mult: number
  total: number
  kind: 'dmg' | 'guard' | 'heal'
}

export class BattleView {
  private t: Tables = TABLES
  private field: FieldDef
  private onWin: (grade: number, resources: { hp: number; guard: number }, rewardValue: number) => void
  private onLose: (cause: DefeatCause | null) => void
  /** 런 기록 — 전달되지 않으면(스샷·검수 진입) 빈 기록에 적고 버린다. */
  private record: RunRecord
  /** 마지막으로 나를 다치게 한 것. 쓰러지는 순간 이 값이 곧 사인이 된다. */
  private lastHurtBy: DefeatCause | null = null
  /** 방금 꽂은 문장 — 자해로 쓰러졌을 때 사인으로 적는다. */
  private lastSentence = ''
  private onHome?: () => void
  private onResetAll?: () => void
  private onIntroComplete?: () => void
  private isBoss = false
  private playerVisual: CharacterVisualDef
  private stageInfo: Stage
  // 희귀도용 속도 등급. 실제 영감 획득량에는 쓰지 않은 무료 드로우가 별도로 더해진다.
  private grade = 0
  private inspiration = 0
  private player: PlayerState
  private state: BattleState
  /**
   * 이 판의 크기 — 전투 시작 시 적 전체의 최대 체력 합.
   * 집계판이 달아오르는 문턱도, 액션 컷이 터지는 문턱도 전부 이 값의 비율이다.
   * 깡수치로 잡으면 초반엔 영영 안 터지고 후반엔 매 턴 터진다.
   */
  private encounterHp = 0
  private attackCine: AttackCinematic | null = null
  private tooltips: TooltipLayer | null = null
  private swordHitCount = 0
  /** 이번 판 배경과 직전 배경 — 직전 것이 있으면 그 위로 새 그림이 밀려 들어온다. */
  private bg: FieldBackground = { next: '', prev: null }
  private sel: Selection = {}
  private slotIndex = 0
  private carriedInk = 0
  private inkPreviewSpent: number | null = null
  private autoCompleteTimer = 0
  private target = 0
  private busy = false
  private over = false
  private timers: number[] = []
  private cardHand!: CardHand
  private introDialogue: IntroDialogue | null = null
  /** 적이 등장 연출을 마치고 실제 전장에 선 뒤에야 거미줄이 날아간다. */
  private spiderCastReady = false
  // 정보창 유지용 — 클릭 중 호버가 잠깐 풀려도 패널이 꺼지지 않게 붙잡는다.
  // 배율 릴 세대 — 새 선택이 들어오면 이전 릴은 조용히 물러난다.
  private multReelToken = 0
  private parkedTally: HTMLElement | null = null
  /** 정산이 끝난 문장의 실제 값. 다음 문장에서 첫 단어를 고를 때까지 손패 위에 남긴다. */
  private lastResolvedTally: Tally | null = null
  private dockRestore: (() => void) | null = null
  private dockTimer = 0
  private pointerDown = false
  private phaseLabel = '주어 선택'
  private playerPreempting = false
  /** 강타의 정점에서 칼을 붙들고 있는 상태 — 메아리는 이 예비 동작을 다시 밟지 않는다. */
  private heavyHeld = false
  /** 이번 강타에 실린 배율 — 이펙트의 화려함이 여기서 나온다. */
  private heavyMult = 0
  /**
   * 이번 문장에서 프레임 정지를 이미 썼는가. 정지는 **처음 검을 휘두르는 한 번**에만
   * 붙는다 — 관통이나 메아리에서 또 멈추면 검기가 지나가는 흐름이 토막토막 끊긴다.
   */
  private heavyStopUsed = false
  private actionOrderSignature = ''
  private debugAttackMultiplier = 1
  private readonly enemyPool = new Map<string, HTMLElement[]>()
  private actorsInitialized = false
  private readonly enemyPrewarmQueue: EnemyInst[] = []
  private readonly prewarmingEnemyKeys = new Set<string>()
  private enemyPrewarmActive = false
  /** 보스전의 큰 GLB 복제·첫 GPU 업로드가 한 프레임에 몰리지 않게 직렬 준비한다. */
  private readonly deferredModelQueue: Array<{ actor: HTMLElement; visual: CharacterVisualDef; priority: number }> = []
  private readonly deferredModelActors = new WeakSet<HTMLElement>()
  private deferredModelActive = false
  private destroyed = false
  private helpOpen = false
  private readonly onHelpOutside = (event: PointerEvent) => {
    if (!this.helpOpen || (event.target as Element | null)?.closest('.battle-help')) return
    this.setHelpOpen(false)
  }
  private readonly onHelpKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.helpOpen) this.setHelpOpen(false, true)
  }
  /** 손패에만 생성한 미보유 카드를 일반 테이블을 바꾸지 않고 선택하기 위한 임시 조회표. */
  private readonly debugSpawnedWords = new Map<string, Word>()
  private readonly discoveredCombos = discoveredComboIds()
  /** 아기돼지 바베큐 — 이번 전투에서 지금까지 잡은 적 수(배율에 들어간다). */
  private killsThisBattle = 0
  /** 잭의 하늘나물은 각 전투의 첫 문장에만 한 번 자란다. */
  private beanstalkGrownThisBattle = false
  private tokenSpeechIndex = 0
  private tokenSpeechTimer = 0
  private bossPatternSolved = false
  private bossPatternHint: TokenLine | null = null
  /** 보스 문장은 전투 상태에서 다시 만들고, 방금 일어난 사건 한 줄만 짧게 덧쓴다. */
  private bossSentenceEvent: string | null = null
  private bossSentenceEventTimer = 0
  private bossSentenceSignature = ''
  /** 프롬 곁을 자유롭게 나는 토큰. 일반전·보스전이 같은 한 몸을 쓴다. */
  private token: TokenActor | null = null
  /** 현재 층. 토큰이 런의 끝을 기억할 때 "몇 층까지 갔는지"로 남긴다. */
  private readonly day: number
  /** 런 오프닝 한마디는 한 번만. 적이 다시 도착해도 되풀이하지 않는다. */
  private tokenOpeningSaid = false
  /** 장로거미는 턴마다 슬롯을 순환 지정하고, 그 슬롯이 열릴 때 카드 한 장을 봉인한다. */
  private pendingSpiderSeal: { enemyIdx: number; maxSealed: number; slotKey: string } | null = null

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    this.onLose = opts.onLose
    this.record = opts.record ?? emptyRunRecord()
    this.onHome = opts.onHome
    this.onResetAll = opts.onResetAll
    this.onIntroComplete = opts.onIntroComplete
    this.isBoss = !!opts.isBoss
    // 보스전은 카드 뒤에서 보스를 올려다보는 3인칭 구도다. 공용 플레이어
    // 매니페스트의 일반 전투 측면 방향은 유지하고, 이 뷰에서만 등을 돌린다.
    this.playerVisual = this.isBoss
      ? { ...CHARACTER_VISUALS.player, modelYaw: Math.PI }
      : CHARACTER_VISUALS.player
    this.stageInfo = stageFor(opts.day ?? 1)
    this.inspiration = Math.max(0, Math.floor(opts.inspiration ?? 0))
    this.t = tablesForEncounter(opts.tables ?? TABLES, opts.encounter[0])
    this.player = opts.player ?? defaultPlayer()
    const atkMult = opts.atkMult ?? this.field.enemyAtkMult ?? 1
    const enemies = opts.encounter.map((id, index) =>
      makeEnemy(
        enemyDefForEncounter(id, this.stageInfo.floor, this.stageInfo.endlessCycle, index, opts.encounter.length),
        atkMult,
        opts.hpMult ?? 1,
        this.isBoss ? opts.bossHealthBars ?? 3 : 1,
      ),
    )
    // 최대 체력은 스탯에서, 현재 체력과 방어막은 런의 직전 스테이지에서 이어받는다.
    const maxHp = this.player.stats.hp
    const savedHp = opts.resources?.hp ?? maxHp
    const savedGuard = opts.resources?.guard ?? 0
    this.state = {
      playerHp: Math.max(0, Math.min(maxHp, savedHp)),
      playerMax: maxHp,
      guard: Math.max(0, Math.min(playerGuardLimit(maxHp), savedGuard)),
      counterMultiplier: 0,
      playerMagicShield: 0,
      turn: 1,
      enemies,
      pending: null,
    }
    this.debugSetCombatModes(opts.debugCombat)
    // 이 판의 크기 — 적 전체의 최대 체력 합. 연출 문턱을 깡수치가 아니라 이 값의 비율로
    // 잡으면 층이 올라 적이 단단해질수록 문턱도 저절로 따라 올라간다.
    this.encounterHp = enemies.reduce((n, e) => n + (e.maxHp ?? e.hp), 0)
    // 배경은 판마다 갈린다(1스테이지 고정 · 보스별 지정 · 나머지는 직전 것 빼고 무작위).
    // 이 한 줄이 조명과 무대 배치까지 함께 정한다.
    this.day = opts.day ?? 1
    this.bg = opts.background ?? pickFieldBackground(this.day, this.isBoss, opts.encounter[0])
    // 여왕벌의 첫 일벌은 배경·연출 기준값을 확정한 뒤, 첫 행동 순서를 잡기 전에 소환한다.
    summonAtTurnStart(this.state)
    engageInitialFront(this.state)
    this.grade = startGrade(this.player.stats.luck)
    this.target = aliveIdx(this.state)[0] ?? 0
    this.mount()
    if (opts.intro) this.mountIntro()
    else this.enterEnemies()
  }

  /**
   * 일반 전투의 적 등장 — 오른쪽 밖에 세워 두었다가 배경이 다 갈린 뒤 걸어 들어온다.
   * 배경 와이프가 지나가기 전에 들어오면 아직 옛 전장에 적이 서 있는 꼴이 된다.
   */
  private enterEnemies() {
    const scene = this.q('.scene.battle')
    scene.classList.add('is-intro-hold')
    // 배경이 바뀌는 판에서만 와이프를 기다린다. 첫 판은 갈릴 배경이 없으니 바로 들어온다.
    const wait = this.bg.prev ? ENEMY_ENTER_AFTER_SWAP_MS : ENEMY_ENTER_DELAY_MS
    this.timers.push(window.setTimeout(() => this.releaseEnemies(scene), wait))
    this.timers.push(window.setTimeout(() => this.enterPlayer(), wait))
  }

  /**
   * 프롬은 화면 밖에서 들어오지 않는다. 런 내내 같은 아이가 계속 걸어가는 중이고,
   * 판이 바뀌는 건 그 아이가 다음 장으로 넘어간 것이지 새로 등장하는 게 아니다 —
   * 매 판 왼쪽 밖에서 다시 걸어 들어오면 스테이지마다 딴 사람이 오는 꼴이 된다.
   *
   * 그래서 자리 이동 없이 제자리에서 걷는 자세만 잠깐 보여 주고 idle로 돌아온다.
   */
  private enterPlayer() {
    const you = this.root.querySelector<HTMLElement>('.actor.you')
    if (!you) return
    playCharacterAnimation(you, 'walk')
    this.timers.push(window.setTimeout(() => playCharacterAnimation(you, 'idle'), PLAYER_ENTER_MS))
  }

  destroy() {
    this.destroyed = true
    this.timers.forEach((t) => clearTimeout(t))
    clearTimeout(this.autoCompleteTimer)
    clearTimeout(this.dockTimer)
    document.removeEventListener('pointerdown', this.onPointerDown, true)
    document.removeEventListener('pointerup', this.onPointerUp, true)
    document.removeEventListener('pointercancel', this.onPointerUp, true)
    document.removeEventListener('pointerdown', this.onHelpOutside)
    window.removeEventListener('keydown', this.onHelpKeydown)
    this.cardHand.destroy()
    this.introDialogue?.destroy()
    this.attackCine?.destroy()
    this.tooltips?.destroy()
    this.token?.destroy()
    this.token = null
    destroyCharacterModels(this.root)
    this.enemyPool.forEach((pool) => pool.forEach((actor) => destroyCharacterModels(actor)))
    this.enemyPool.clear()
  }

  /** Developer-only shortcut; avoid interrupting an already resolving battle turn. */
  debugDefeat() {
    if (this.busy || this.over) return
    this.state.playerHp = 0
    void this.lose()
  }

  /** Developer-only battle modifiers; they never change the saved player state. */
  debugSetCombatModes(modes?: { invincible: boolean; attackMultiplier: number }) {
    this.state.damageImmune = !!modes?.invincible
    this.debugAttackMultiplier = Math.max(1, Math.floor(modes?.attackMultiplier ?? 1))
  }

  /** Developer-only shortcut; the spawned card exists only in the current slot hand. */
  async debugSpawnCard(word: Word): Promise<string> {
    if (this.busy || this.over) return '지금은 카드를 생성할 수 없습니다.'
    const key = this.order()[this.slotIndex]
    const compatibleSlot = key === 'subj2' ? 'subj' : key === 'verb2' ? 'verb' : key
    const slotLabel = this.t.template.slots[this.slotIndex]?.label ?? key
    // 무럭무럭은 칸을 가리지 않는다 — 현재 칸 이름표를 달아 찍어 준다.
    if (word.slot === ANY_SLOT) word = growCardFor(key)
    else if (word.slot !== compatibleSlot) return `현재 ${slotLabel} 칸에는 ${compatibleSlot} 카드만 생성할 수 있습니다.`

    const result: DebugCardSpawnResult = await this.cardHand.debugSpawn(word)
    if (result === 'spawned') {
      this.debugSpawnedWords.set(`${key}:${word.id}`, word)
      return `${word.text} 카드를 현재 손패에 생성했습니다.`
    }
    if (result === 'already-in-hand') return `${word.text} 카드는 이미 현재 손패에 있습니다.`
    if (result === 'hand-full') return '현재 손패가 가득 찼습니다.'
    return '카드 생성 준비가 끝난 뒤 다시 시도해 주세요.'
  }

  private onPointerDown = () => {
    this.pointerDown = true
  }
  private onPointerUp = () => {
    this.pointerDown = false
    if (this.dockRestore) this.scheduleDockRestore(80)
  }

  // ── 우측 정보창 붙잡기 ──
  // 카드를 누르는 순간 눌림 효과/리렌더 때문에 커서가 잠깐 엘리먼트 밖으로 떨어진다.
  // 그때마다 패널이 꺼지면 눈이 아프니, 짧은 유예를 두고 버튼을 누르고 있는 동안에는 계속 붙잡는다.
  private keepDock() {
    clearTimeout(this.dockTimer)
    this.dockRestore = null
  }

  private fadeDock(restore: () => void) {
    this.dockRestore = restore
    this.scheduleDockRestore(180)
  }

  private scheduleDockRestore(delay: number) {
    clearTimeout(this.dockTimer)
    this.dockTimer = window.setTimeout(() => {
      const restore = this.dockRestore
      if (!restore) return
      if (this.pointerDown) return this.scheduleDockRestore(120)
      // 리렌더로 엘리먼트만 갈렸을 뿐 커서는 아직 무언가 위에 있다면 그대로 둔다.
      if (this.root.querySelector('.word-card:hover, .actor:hover')) return
      this.dockRestore = null
      restore()
    }, delay)
  }

  // 오프닝 컷신 — 적들은 홀드로 어둠 밖에 묶어 두고, 다이얼로그가 끝나면
  // 홀드를 풀어 천천히 밀려들어오게 한다. 전투 상태는 손대지 않는다.
  private mountIntro() {
    const scene = this.q('.scene.battle')
    scene.classList.add('is-tutorial-dialogue')
    scene.classList.add('is-intro-hold')
    this.introDialogue = new IntroDialogue(scene, {
      onComplete: () => {
        this.introDialogue = null
        scene.classList.remove('is-tutorial-dialogue')
        this.onIntroComplete?.()
        this.releaseEnemies(scene)
      },
    })
  }

  /**
   * 적을 오른쪽 밖에서 걸어 들어오게 한다.
   *
   * 예전엔 이 연출이 첫 튜토리얼 전투에만 붙어 있었다. 나머지 판에서는 화면이 열리는
   * 순간 적이 제자리에 그냥 나타나서, 배경이 바뀌는 연출을 붙여 놓고도 정작 적은
   * 순간이동하는 꼴이었다. 이제 모든 전투가 같은 길로 들어온다.
   *
   * 배경 와이프(1.7초)가 지나간 뒤에 들어와야 "새 전장에 적이 도착한다"는 순서로 읽힌다.
   */
  private releaseEnemies(scene: HTMLElement) {
    scene.classList.add('is-enemies-arriving')
    // 홀드를 거두기 전에 이동 트랜지션의 출발점을 커밋한다. 예전엔 이걸
    // requestAnimationFrame으로 했는데, 탭이 숨겨져 있으면 콜백이 아예 안 돌아서
    // is-intro-hold(opacity 0)가 영구히 남고 적이 끝까지 안 보였다.
    void scene.offsetWidth
    scene.classList.remove('is-intro-hold')
    this.timers.push(window.setTimeout(() => scene.classList.remove('is-enemies-arriving'), 4000))
    // 걸어서 들어온다. GLB에 walk 클립이 진작 들어 있었는데 매니페스트에 연결이 없어서
    // 여태 안 쓰이고 있었다(어택 클립으로 대신해 봤지만 440ms짜리라 앞부분만 달리고
    // 끝의 휘두르는 동작 때문에 등장하면서 공격하는 것처럼 보였다).
    // walk는 idle처럼 계속 도는 클립이라 도착할 때까지 반복되고, 다 오면 idle로 돌린다.
    this.root.querySelectorAll<HTMLElement>('.actor.foe').forEach((foe) => {
      playCharacterAnimation(foe, 'walk')
      this.timers.push(window.setTimeout(() => playCharacterAnimation(foe, 'idle'), FOE_WALK_MS))
    })
    this.timers.push(window.setTimeout(() => this.onEnemiesArrived(), FOE_WALK_MS))
  }

  /**
   * 적이 제자리에 선 순간 — 등장 동안 미뤄 둔 첫 거미줄을 여기서 쏜다.
   * 등장하는 사이에 칸이 넘어갔으면 지금 열린 칸으로 옮겨 묶는다. 이번 문장에서
   * 한 장은 반드시 봉인된다는 규칙은 등장 연출 때문에 건너뛰지 않는다.
   */
  private onEnemiesArrived() {
    if (this.spiderCastReady) return
    this.spiderCastReady = true
    this.cardHand.setInputEnabled(true)
    // 런의 첫 층에서만, 그리고 **조작권이 열린 뒤에** 한마디. 인트로 컷신 위에 띄우면
    // 아무도 못 읽고 사라진다.
    const opening = !this.isBoss && this.day === 1 && !this.tokenOpeningSaid ? this.tokenOpeningLine() : null
    if (opening) {
      this.tokenOpeningSaid = true
      this.timers.push(window.setTimeout(() => this.showTokenSpeech(opening), 480))
    }
    if (!this.isBoss) {
      // 인사가 먼저, 가르침은 그 뒤다. 같은 말풍선을 나눠 쓰므로 오프닝이 있으면
      // 그게 다 떠 있다 사라진 다음에 코치를 부른다 — 안 그러면 1회성 교육 대사가
      // 뜨자마자 덮여 영영 사라진다.
      this.timers.push(window.setTimeout(() => {
        const front = this.state.enemies[frontIdx(this.state)]
        if (!this.showCombatCoach('subject') && front?.initiativePhase === 'first') {
          this.showCombatCoach('enemy-first')
        }
      }, opening ? 4400 : 480))
    }
    const pending = this.pendingSpiderSeal
    if (!pending) return
    const current = this.order()[this.slotIndex]
    if (current) pending.slotKey = current
    this.castPendingSpiderWeb(pending.slotKey)
  }

  private mount() {
    this.root.innerHTML = `
      <div class="scene battle" data-weather="${this.field.weather}"${this.isBoss ? ' data-boss="true" data-entrance="fade"' : ''} style="background-image:url(${this.bg.prev ?? this.bg.next});--actor-bottom:${currentFieldStage().bottom}px;--player-left:${currentFieldStage().playerLeft ?? 290}px;--sun-x:${(currentFieldLight().sunX * 100).toFixed(1)}%;--sun-y:${(currentFieldLight().sunY * 100).toFixed(1)}%;--sun-color:#${currentFieldLight().keyColor.toString(16).padStart(6, '0')};--sun-strength:${currentFieldLight().sunStrength};--model-grade-hue:${currentFieldLight().gradeHue}deg">
        ${
          this.bg.prev
            ? `<div class="field-swap" aria-hidden="true" style="background-image:url(${this.bg.next})"></div>`
            : ''
        }
        ${this.isBoss ? '<div class="boss-entry-fade" aria-hidden="true"></div>' : ''}
        <div class="vignette"></div>
        <div class="weather-wash"></div>
        <div class="field-clarity" aria-hidden="true"></div>
        <div class="field-sun" aria-hidden="true"></div>
        <div class="storybook-grade" aria-hidden="true"></div>
        <div class="hud-top">
          ${this.stageProgressHtml()}
          <div class="hud-left-stack">
            <div class="hud-left-status" aria-label="전투 상태">
              <div class="inspiration-wallet glass" role="img" tabindex="0" aria-label="보유 영감 ${this.inspiration}" data-tooltip="${hudTip('hudInspirationTip', `보유 영감 ${this.inspiration}\n전투에서 모아 보상 카드를 구입하거나 보상 목록을 새로 고칠 때 사용한다.`, { value: this.inspiration })}">
                <span class="inspiration-mark" aria-hidden="true">◈</span>
                <span class="inspiration-wallet-copy"><small>보유 영감</small><b>${this.inspiration}</b></span>
              </div>
              <div class="grade-badge glass" id="grade-badge" role="img" tabindex="0">
                <span class="clear-reward-mark" aria-hidden="true">◈</span>
                <span class="clear-reward-copy"><small>클리어 보상</small><b id="grade"></b></span>
              </div>
              <div class="hud-player-stats glass" id="stats" aria-label="주인공 상태"></div>
            </div>
            <aside class="action-order" tabindex="0" aria-label="이번 문장 행동 순서" data-tooltip="${hudTip('hudActionOrderTip', '행동 순서\n누가 먼저 행동하고, 문장 뒤에 누가 행동하며, 누가 레일에서 기다리는지 보여 준다.')}">
              <div class="action-order-head"><span>이번 문장</span><b>행동 순서</b></div>
              <ol id="action-order-list"></ol>
            </aside>
            <aside class="relic-strip" id="relic-strip" aria-label="보유 아이템"></aside>
          </div>
          <div class="hud-status">
            <div class="hud-status-bar">
              <div class="hud-actions glass" aria-label="시스템 메뉴">
                <button id="settings-btn" type="button" aria-label="설정" data-tooltip="${hudTip('hudSettingsTip', '설정\n그래픽, 소리, 언어와 플레이 기록을 조정한다.')}">${icon('settings')}</button>
                <button id="bond-btn" type="button" aria-label="토큰과의 유대" data-tooltip="${hudTip('hudBondTip', '토큰과의 유대\n함께한 기록과 토큰이 너에 대해 알게 된 것을 본다.')}">${icon('bond')}</button>
                <button id="codex-btn" type="button" aria-label="그림일기 도감" data-tooltip="${hudTip('hudCodexTip', '그림일기 도감\n단어, 카드, 만난 벌레와 획득한 아이템을 살펴본다.')}">${icon('collection')}</button>
                <button id="home-btn" type="button" aria-label="홈으로" data-tooltip="${hudTip('hudHomeTip', '홈\n이번 전투를 시작 전으로 되돌리고 타이틀로 돌아간다.')}">${icon('home')}</button>
              </div>
            </div>
            <div class="effect-log" id="log"></div>
          </div>
        </div>

        <div class="stage-area" id="pbox">
          ${this.isBoss ? this.bossHudHtml() : ''}
          ${this.isBoss ? '<section class="boss-sentence-board" id="boss-sentence-board" role="status" aria-live="polite" hidden></section>' : ''}
          <div class="chain-rail" id="chain"></div>
          <div class="mult-now" id="mult-now" aria-live="polite"></div>
          <div class="combo-flash" id="combo"></div>
          <div class="resonance-flash" id="resonance" aria-live="polite"></div>
          <div class="flash" id="flash"></div>
          <div id="actors"></div>
          <div class="model-prewarm-stage" aria-hidden="true"></div>
        </div>

        <div class="slot-step" id="steps" aria-label="문장 조립 단계"></div>
        ${inkMeterHtml()}

        <div class="word-zone">
          <div class="card-table" aria-label="단어 카드 선택 영역">
            <div class="card-hand" id="card-hand" aria-label="현재 손패"></div>
            <button class="draw-deck" id="draw-deck" type="button"></button>
          </div>
        </div>

        <aside class="info-dock detail-idle" id="detail" aria-live="polite"></aside>

        <div class="battle-help">
          <aside class="battle-help-note" id="battle-help-note" role="dialog" aria-modal="false" aria-labelledby="battle-help-title" aria-hidden="true">
            <div class="battle-help-token" aria-hidden="true">
              <img class="battle-help-token-shadow" src="${TOKEN_FACES.smile}" alt="">
              <img class="battle-help-token-main" src="${TOKEN_FACES.smile}" alt="">
            </div>
            <div class="battle-help-heading">
              <span aria-hidden="true">✦</span>
              <div>
                <small>토큰의 메모</small>
                <h2 id="battle-help-title">문장 규칙 다시보기</h2>
              </div>
            </div>
            <ul>
              <li><i aria-hidden="true">맥락</i><span>문맥에 맞는 멋진 단어를 만들면 <b>보너스!</b></span></li>
              <li><i aria-hidden="true">공명</i><span>같은 감정을 모아 증폭시키면 <b>보너스!</b></span></li>
              <li><i aria-hidden="true">동사</i><span>다양한 동사로 <b>다채로운 동작</b>을!</span></li>
              <li><i aria-hidden="true">쾅!</i><span>초과 데미지는 짜릿한 <b>오버킬</b>을 선사!</span></li>
            </ul>
          </aside>
          <button class="battle-help-button" id="battle-help-button" type="button" aria-label="전투 도움말 열기" aria-controls="battle-help-note" aria-expanded="false" data-tooltip="${hudTip('hudHelpTip', '전투 도움말\n문장을 조립하는 핵심 규칙을 다시 살펴본다.')}">?</button>
        </div>

        <div id="overlay"></div>
      </div>`

    this.renderGrade()

    // 액션 컷은 화면 밖에 붙여 두고 지금부터 받아 둔다 — 터질 때 받기 시작하면
    // 가장 짜릿해야 할 순간에 검은 사각형이 먼저 뜬다.
    this.attackCine = new AttackCinematic(this.q<HTMLElement>('.scene.battle'))

    // 아이콘 쪽지는 씬 맨 위 한 겹에서만 그린다 — 아이콘의 가상 요소로 두면 전장·HUD·
    // 손패의 쌓임 맥락에 갇혀 무엇으로든 가려진다. 자리는 매 프레임 다시 잰다.
    this.tooltips = new TooltipLayer(this.q<HTMLElement>('.scene.battle'))

    this.q('#bond-btn').addEventListener('click', () => this.openBondRecord())
    this.q('#codex-btn').addEventListener('click', () => this.openCodex())
    this.q('#settings-btn').addEventListener('click', () => this.openSettings())
    this.q('#home-btn').addEventListener('click', () => this.onHome?.())
    this.q('#battle-help-button').addEventListener('click', () => this.setHelpOpen(!this.helpOpen))
    this.q('#steps').addEventListener('click', (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.step[data-i]')
      if (!button) return
      this.rewindToSlot(Number(button.dataset.i))
    })
    document.addEventListener('pointerdown', this.onHelpOutside)
    window.addEventListener('keydown', this.onHelpKeydown)

    this.cardHand = new CardHand({
      handRoot: this.q('#card-hand'),
      deckButton: this.q<HTMLButtonElement>('#draw-deck'),
      onDraw: () => this.renderGrade(),
      onConfirm: (word) => {
        if (!this.busy && !this.over) this.pick(word.id)
      },
      onHover: (word) => this.previewInkSpend(word),
      onHoverEnd: () => this.clearInkPreview(),
      onPreview: (word) => {
        this.keepDock()
        this.renderDetail(word)
      },
      onPreviewEnd: () => this.fadeDock(() => this.renderDetail(null)),
    })
    // 손패 DOM은 등장 연출 전에 먼저 만들어진다. 보이지 않는 카드를 광클해
    // 문장이 임의로 확정되지 않도록 적이 전장에 도착할 때까지 입력을 잠근다.
    this.cardHand.setInputEnabled(false)
    document.addEventListener('pointerdown', this.onPointerDown, true)
    document.addEventListener('pointerup', this.onPointerUp, true)
    document.addEventListener('pointercancel', this.onPointerUp, true)
    this.renderActors()
    this.renderActionOrder()
    this.beginSpiderTurn()
    this.renderChain()
    this.renderWords()
    this.renderStats()
    this.renderRelics()
    this.clearDetailDock()
    if (this.isBoss) {
      const initialPatternHint = this.bossOpeningHint()
      if (initialPatternHint) this.scheduleBossTokenHint(initialPatternHint, 900)
      else this.scheduleBossTokenSpeech(1800)
    }
  }

  /**
   * 런을 여는 토큰의 한마디. 지난 런의 기억이 우선이고, 없으면 이 사람의 플레이에서
   * 알게 된 것을 말한다. 둘 다 **세어 둔 사실**에서만 나오므로 없는 말을 지어내지 않는다.
   */
  private tokenOpeningLine(): TokenLine | null {
    const memory = this.token?.recall()
    if (memory) {
      if (memory.outcome === 'clear') return bossTokenLine('recallClear', 'relief', { day: String(memory.day) })
      return memory.cause
        ? bossTokenLine('recallDefeatBy', 'calm', { day: String(memory.day), cause: memory.cause })
        : bossTokenLine('recallDefeatPlain', 'calm', { day: String(memory.day) })
    }

    const style = sharedTokenPlaystyle().read()
    // 아직 몇 판 못 봤으면 사람을 규정하지 않는다. 처음이라고 말할 뿐이다.
    if (style.tentative) return style.sentences === 0 ? bossTokenLine('recallFirst', 'calm') : null
    if (style.boldness >= 0.25) return bossTokenLine('styleBold', 'calm')
    if (style.comboRate >= 0.5) return bossTokenLine('styleCombo', 'relief')
    if (style.archetype === 'striker') return bossTokenLine('styleStriker', 'calm')
    if (style.archetype === 'keeper') return bossTokenLine('styleKeeper', 'calm')
    if (style.archetype === 'mender') return bossTokenLine('styleMender', 'calm')
    if (style.favoriteEmotion && style.favoriteEmotionShare >= 0.4) {
      return bossTokenLine('styleEmotion', 'calm', { emotion: EMOTION_LABEL[style.favoriteEmotion] })
    }
    return null
  }

  private stageProgressHtml(): string {
    if (this.isBoss) return ''
    const { floor, endlessCycle } = this.stageInfo
    const bossFloors = Object.keys(BOSS_BY_FLOOR).map(Number).filter((value) => value <= DISPLAY_FLOORS).sort((a, b) => a - b)
    const nextBossFloor = bossFloors.find((bossFloor) => bossFloor >= floor) ?? DISPLAY_FLOORS
    const bossName = ENEMIES[BOSS_BY_FLOOR[nextBossFloor]]?.name ?? t('hudBoss', '보스')
    const remaining = Math.max(0, nextBossFloor - floor)
    const next = remaining === 0
      ? hudTip('hudBossNow', '{boss} 보스전', { boss: bossName })
      : hudTip('hudNextBoss', '{boss}까지 {count}스테이지', { boss: bossName, count: remaining })
    const cycle = endlessCycle > 0
      ? hudTip('hudEndlessCycle', '엔드리스 {cycle}주기', { cycle: endlessCycle })
      : t('hudStoryCycle', '첫 번째 이야기')
    const aria = hudTip('hudStageAria', '{cycle}. {floor}/{total}스테이지. {next}', {
      cycle,
      floor,
      total: DISPLAY_FLOORS,
      next,
    })
    return `
      <section class="stage-progress glass" role="img" tabindex="0" aria-label="${aria}" data-tooltip="${aria.split('. ').join('\n')}">
        <span aria-hidden="true">✦</span>
        <b>${t('hudStageLabel', '스테이지')} ${floor}<i>/${DISPLAY_FLOORS}</i></b>
      </section>`
  }

  private setHelpOpen(open: boolean, restoreFocus = false) {
    this.helpOpen = open
    const help = this.root.querySelector<HTMLElement>('.battle-help')
    const note = this.root.querySelector<HTMLElement>('#battle-help-note')
    const button = this.root.querySelector<HTMLButtonElement>('#battle-help-button')
    if (!help || !note || !button) return
    help.classList.toggle('is-open', open)
    note.setAttribute('aria-hidden', String(!open))
    button.setAttribute('aria-expanded', String(open))
    button.setAttribute('aria-label', open ? '전투 도움말 닫기' : '전투 도움말 열기')
    if (restoreFocus) button.focus()
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T
  }
  private order() {
    return this.t.template.slots.map((s) => s.key)
  }

  // 단어 효과별 무드(색) 분류.
  private moodOf(w: Word): Mood {
    if (w.variance) return 'gamble'
    if (w.kind === 'heal' || w.effects?.heal) return 'heal'
    if (w.kind === 'guard' || w.effects?.guard) return 'guard'
    if (w.kind === 'attack' || (w.power ?? 0) > 0) return 'attack'
    if (w.effects?.recoil) return 'sacrifice'
    return 'buff'
  }

  // ── 배우 — 적은 "레일 대기열": 최전방만 선명·전투 참여, 뒷줄은 흐릿·대기 ──
  // 엘리먼트를 통째로 다시 만들지 않고 자리·수치만 갱신한다. 그래야 앞 적이 쓰러졌을 때
  // 뒷줄이 실제로 "당겨져 오는" 레일 이동과 체력바 페이드가 트랜지션으로 이어진다.
  private queueDeferredCharacterModel(actor: HTMLElement, visual: CharacterVisualDef, priority: number) {
    if (!visual.model3d || this.deferredModelActors.has(actor)) return
    // 이미 첫 드로우까지 끝난 배우는 지연 큐에 태울 게 없다. 그렇다고 그냥 돌아서면
    // 풀에서 꺼내거나 잠재웠던 모델의 idle 복귀와 재활성이 통째로 빠진다 —
    // 되살아난 일벌이 쓰러진 자세로 멈춰 서던 이유다. 준비는 건너뛰되 복귀는 시킨다.
    if (isCharacterModelReady(actor, visual)) {
      mountCharacterModel(actor, visual)
      return
    }
    this.deferredModelActors.add(actor)
    this.deferredModelQueue.push({ actor, visual, priority })
    this.deferredModelQueue.sort((a, b) => a.priority - b.priority)
    this.drainDeferredCharacterModels()
  }

  private drainDeferredCharacterModels() {
    if (this.destroyed || this.deferredModelActive) return
    this.deferredModelActive = true
    const start = window.setTimeout(() => {
      const next = this.deferredModelQueue.shift()
      if (!next) {
        this.deferredModelActive = false
        return
      }
      const { actor, visual } = next
      if (!actor.isConnected || actor.hidden) {
        this.deferredModelActors.delete(actor)
        this.deferredModelActive = false
        this.drainDeferredCharacterModels()
        return
      }

      // mount 안의 GLB 복제는 동기 구간이지만 한 배우만 실행한다. 그 배우의 첫
      // 드로우가 확인된 뒤 다음 배우를 시작해 여러 복제·텍스처 업로드가 겹치지 않는다.
      mountCharacterModel(actor, visual)
      let attempts = 0
      const settle = () => {
        if (this.destroyed || !actor.isConnected || isCharacterModelReady(actor, visual) || attempts >= 90) {
          this.deferredModelActors.delete(actor)
          this.deferredModelActive = false
          this.drainDeferredCharacterModels()
          return
        }
        attempts += 1
        const retry = window.setTimeout(settle, 32)
        this.timers.push(retry)
      }
      const firstCheck = window.setTimeout(settle, 32)
      this.timers.push(firstCheck)
    }, 0)
    this.timers.push(start)
  }

  private renderActors() {
    const host = this.q('#actors')
    const s = this.state
    const alive = aliveIdx(s) // 살아있는 적 인덱스(앞→뒤)
    // 전투 대상은 항상 최전방.
    this.target = frontIdx(s)
    const visible = alive.slice(0, MAX_VISIBLE_ENEMIES)
    const hiddenWaiting = alive.length - visible.length
    const visibleSet = new Set(visible)

    let you = host.querySelector<HTMLElement>('.actor.you')
    if (!you) {
      host.insertAdjacentHTML('beforeend', this.playerHtml())
      you = host.querySelector<HTMLElement>('.actor.you')!
      this.bindActor(you)
    }
    this.updatePlayer(you)
    mountCharacterModel(you, this.playerVisual)
    // 토큰은 배우 레일에 속하지 않는다 — 한 번 띄워 두고 프롬이 다시 그려질 때마다
    // 맴돌 대상만 새 요소로 바꿔 준다.
    const stage = this.root.querySelector<HTMLElement>('.stage-area')
    if (stage && !this.token) this.token = new TokenActor(stage)
    this.token?.attachTo(you)
    this.token?.observeBattle({
      hpRatio: this.state.playerMax > 0 ? this.state.playerHp / this.state.playerMax : 1,
      enemyCount: this.state.enemies.filter((e) => e.hp > 0).length,
      // 한 전투가 대략 열 턴 안팎이라 그걸 1로 본다. 길어지면 그냥 1에서 머문다.
      turnProgress: Math.min(1, this.state.turn / 10),
    })

    host.querySelectorAll<HTMLElement>('.actor.foe').forEach((el) => {
      if (!visibleSet.has(Number(el.dataset.i))) this.releaseFoe(el)
    })
    visible.forEach((i, rank) => {
      const e = s.enemies[i]
      let el = host.querySelector<HTMLElement>(`.actor.foe[data-i="${i}"]`)
      if (!el) {
        el = this.acquireFoe(i, e)
        host.append(el)
        if (this.actorsInitialized && !this.isBoss) {
          // 대기 숫자에서 새로 드러난 적도 한 칸 뒤에 실제로 서 있던 것처럼 시작한다.
          // 출발 좌표를 먼저 확정해야 updateFoe의 right 전환과 walk 동작이 함께 보인다.
          const stage = currentFieldStage()
          el.style.left = 'auto'
          el.style.right = `${stage.railRight - MAX_VISIBLE_ENEMIES * stage.railGap}px`
          el.dataset.rank = String(MAX_VISIBLE_ENEMIES)
          void el.offsetWidth
        }
      }
      this.updateFoe(el, e, rank)
    })
    this.actorsInitialized = true
    this.queueWaitingEnemyModels(alive.slice(MAX_VISIBLE_ENEMIES))
    this.renderEnemyOverflow(host, hiddenWaiting)
    this.renderStats()
    this.renderActionOrder()
    this.syncMantisGuardCue()
    this.renderBossSentence()
  }

  private renderEnemyOverflow(host: HTMLElement, count: number) {
    let badge = host.querySelector<HTMLElement>('.enemy-overflow-count')
    if (count <= 0) {
      badge?.remove()
      return
    }
    if (!badge) {
      host.insertAdjacentHTML('beforeend', `
        <div class="enemy-overflow-count" role="status" aria-live="polite">
          ${BUG_COUNT_ICON}<b></b><span>레일 대기</span>
        </div>`)
      badge = host.querySelector<HTMLElement>('.enemy-overflow-count')!
    }
    badge.querySelector<HTMLElement>('b')!.textContent = `적 × ${count}`
    badge.setAttribute('aria-label', `대기 중인 적 ${count}마리`)
  }

  private releaseFoe(el: HTMLElement) {
    const key = el.dataset.poolKey
    el.getAnimations().forEach((animation) => animation.cancel())
    // 사망 애니메이션은 forwards라 dying/fast가 남으면 재사용한 적도 opacity 0이 된다.
    el.classList.remove(...TRANSIENT_ACTOR_CLASSES)
    // 풀에 남은 자리 번호를 지운다 — 다음에 꺼내 쓸 적이 남의 자리에서
    // 당겨온 것으로 오해해 등장하면서 걸어 버린다.
    delete el.dataset.rank
    delete el.dataset.walkUntil
    suspendCharacterModel(el)
    el.remove()
    if (!key) return
    const pool = this.enemyPool.get(key) ?? []
    pool.push(el)
    this.enemyPool.set(key, pool)
  }

  /**
   * 레일 뒤의 새 적은 등장 전에 유휴 시간에 한 번 렌더해 캔버스 생성·모델 복제·GPU 텍스처
   * 업로드를 끝낸다. 전투 규칙과 DOM 레일에는 손대지 않고, 준비가 끝난 배우만 기존 풀에 넣는다.
   */
  private queueWaitingEnemyModels(waiting: number[]) {
    if (this.destroyed || this.isBoss) return
    for (const index of waiting) {
      const enemy = this.state.enemies[index]
      if (!enemy || enemy.dead) continue
      const key = this.enemyPoolKey(enemy)
      const visual = this.visualForEnemy(enemy)
      if (!visual.model3d || this.prewarmingEnemyKeys.has(key)) continue
      const pool = this.enemyPool.get(key) ?? []
      if (pool.some((actor) => isCharacterModelReady(actor, visual))) continue
      this.prewarmingEnemyKeys.add(key)
      this.enemyPrewarmQueue.push(enemy)
    }
    this.drainEnemyPrewarmQueue()
  }

  private drainEnemyPrewarmQueue() {
    if (this.destroyed || this.enemyPrewarmActive) return
    const enemy = this.enemyPrewarmQueue.shift()
    if (!enemy) return
    this.enemyPrewarmActive = true
    const timer = window.setTimeout(() => {
      void this.prewarmEnemyModel(enemy).finally(() => {
        this.enemyPrewarmActive = false
        this.drainEnemyPrewarmQueue()
      })
    }, 80)
    this.timers.push(timer)
  }

  private prewarmEnemyModel(enemy: EnemyInst): Promise<void> {
    const key = this.enemyPoolKey(enemy)
    const visual = this.visualForEnemy(enemy)
    const host = this.root.querySelector<HTMLElement>('.model-prewarm-stage')
    if (this.destroyed || !host || !visual.model3d) {
      this.prewarmingEnemyKeys.delete(key)
      return Promise.resolve()
    }

    // 음수 인덱스는 실제 전장 레일과 절대 겹치지 않는다. 준비가 끝나면 releaseFoe가 풀로 옮긴다.
    const actor = this.acquireFoe(-1000 - this.enemyPrewarmQueue.length, enemy)
    actor.classList.add('model-prewarm')
    host.append(actor)
    return new Promise((resolve) => {
      let attempts = 0
      const settle = () => {
        if (this.destroyed || !actor.isConnected) {
          this.prewarmingEnemyKeys.delete(key)
          resolve()
          return
        }
        if (isCharacterModelReady(actor, visual)) {
          this.releaseFoe(actor)
          this.prewarmingEnemyKeys.delete(key)
          resolve()
          return
        }
        attempts++
        // 리소스는 전투 진입 전에 파싱됐으므로 보통 2~3 프레임 안에 끝난다. 느린 GPU에서도
        // 준비 캔버스는 화면 밖에서 계속 살아 있어 실제 웨이브가 이 작업을 대신하지 않는다.
        const retry = window.setTimeout(settle, attempts < 12 ? 16 : 48)
        this.timers.push(retry)
      }
      const firstCheck = window.setTimeout(settle, 32)
      this.timers.push(firstCheck)
    })
  }

  /**
   * 적 변종은 별도의 3D/상세 캐릭터 매니페스트를 강제하지 않는다. 같은 벌레
   * 스프라이트를 쓰는 변종은 원형의 검증된 2D 표현을 재사용해야 전투 HUD
   * 렌더가 중간에 멈추지 않는다.
   */
  private visualForEnemy(enemy: EnemyInst): CharacterVisualDef {
    const direct = CHARACTER_VISUALS[enemy.def.id as CharacterVisualDef['id']]
    if (direct) return direct
    const visualBySprite: Partial<Record<string, CharacterVisualDef['id']>> = {
      enemy_moth: 'moth',
      enemy_flea: 'flea',
      enemy_termite: 'termite',
      enemy_roach: 'roach',
      enemy_pillbug: 'pillbug',
      enemy_mosquito: 'mosquito',
    }
    return CHARACTER_VISUALS[visualBySprite[enemy.def.sprite] ?? 'moth']
  }

  private enemyPoolKey(enemy: EnemyInst): string {
    return `${enemy.def.id}:${enemy.def.elite?.rarity ?? 'common'}`
  }

  private acquireFoe(i: number, enemy: EnemyInst): HTMLElement {
    const key = this.enemyPoolKey(enemy)
    const visual = this.visualForEnemy(enemy)
    const pool = this.enemyPool.get(key)
    let pooled: HTMLElement | undefined
    // 준비 중인 WebGL 인스턴스를 풀에서 성급히 꺼내면 빈 캔버스나 2D 초상이
    // 한 프레임 노출된다. 첫 프레임 출력이 검증된 항목만 선택한다.
    if (pool) {
      for (let index = pool.length - 1; index >= 0; index -= 1) {
        if (!isCharacterModelReady(pool[index], visual)) continue
        pooled = pool.splice(index, 1)[0]
        break
      }
    }
    const el = pooled ?? (() => {
      const template = document.createElement('template')
      template.innerHTML = this.foeHtml(i, enemy).trim()
      const actor = template.content.firstElementChild as HTMLElement
      return actor
    })()
    // 풀에 들어오기 전 경로와 무관하게 재취득 시 한 번 더 방어적으로 초기화한다.
    el.getAnimations().forEach((animation) => animation.cancel())
    el.classList.remove(...TRANSIENT_ACTOR_CLASSES)
    el.dataset.i = String(i)
    el.dataset.character = visual.id
    el.dataset.poolKey = key
    el.dataset.enemyRarity = enemy.def.elite?.rarity ?? 'common'
    el.dataset.enemyTrait = enemy.def.elite?.trait ?? ''
    el.setAttribute('aria-label', `${enemy.def.name} 상세 보기`)
    el.querySelector<HTMLElement>('.nm')!.textContent = enemy.def.name
    const image = el.querySelector<HTMLImageElement>(':scope > .model-shell > .battle-sprite')!
    image.src = visual.portrait2d
    image.alt = enemy.def.name
    const modelShell = el.querySelector<HTMLElement>(':scope > .model-shell')!
    modelShell.dataset.enemyRarity = enemy.def.elite?.rarity ?? 'common'
    if (!visual.model3d) modelShell.dataset.modelStatus = 'fallback-2d'
    if (this.isBoss) this.queueDeferredCharacterModel(el, visual, 0)
    else mountCharacterModel(el, visual)
    return el
  }

  // 날짜 아래 행동 순서 — 레퍼런스의 세로 초상화 열을 가져오되, 실제 전투 규칙처럼
  // 최전방 적만 순서에 넣는다. 뒷줄은 행동자가 아니라 레일 대기임을 흐리게 분리한다.
  private renderActionOrder() {
    const host = this.root.querySelector<HTMLOListElement>('#action-order-list')
    if (!host) return

    type OrderEntry = {
      key: string
      name: string
      portrait: string
      side: 'player' | 'enemy'
      timing: 'first' | 'player' | 'second' | 'displaced' | 'cooldown' | 'waiting' | 'summary'
      note: string
      active: boolean
    }

    const entries: OrderEntry[] = []
    const front = frontIdx(this.state)
    const enemy = front >= 0 ? this.state.enemies[front] : null
    const enemyReady = !!enemy && this.state.turn >= enemy.nextAttackTurn
    const enemyActive = this.phaseLabel.includes('상대 행동')
    const playerActive = this.phaseLabel.includes('본인 캐릭터') || this.phaseLabel.includes('선수')
    const attackStep = enemy ? nextEnemyAttackStep(enemy) : null
    const enemyEntry = (timing: OrderEntry['timing'], note: string, active = false): OrderEntry => ({
      key: `enemy-${front}`,
      name: enemy!.def.name,
      portrait: this.visualForEnemy(enemy!).portrait2d,
      side: 'enemy',
      timing,
      note: [
        note,
        attackStep?.name,
      ].filter(Boolean).join(' · '),
      active,
    })
    const playerEntry: OrderEntry = {
      key: 'player',
      name: t('playerName', '프롬'),
      portrait: CHARACTER_VISUALS.player.portrait2d,
      side: 'player',
      timing: 'player',
      note: '문장 행동',
      active: playerActive,
    }

    if (enemy && enemyReady && enemy.initiativePhase === 'first' && this.playerPreempting) {
      playerEntry.active = true
      entries.push(playerEntry)
      entries.push(enemyEntry('displaced', '선공 빼앗김'))
    } else if (enemy && enemyReady && enemy.initiativePhase === 'first') {
      entries.push(enemyEntry('first', '선공', enemyActive))
      entries.push(playerEntry)
    } else {
      entries.push(playerEntry)
    }
    if (enemy && enemyReady && enemy.initiativePhase === 'second') {
      entries.push(enemyEntry('second', '후공', enemyActive))
    } else if (enemy && !enemyReady) {
      entries.push(enemyEntry('cooldown', `${enemy.nextAttackTurn - this.state.turn}턴 뒤`))
    }

    const waitingEnemies = aliveIdx(this.state).filter((i) => i !== front)
    waitingEnemies.slice(0, MAX_ACTION_ORDER_ENEMIES - 1).forEach((i) => {
      const waiting = this.state.enemies[i]
      entries.push({
        key: `enemy-${i}`,
        name: waiting.def.name,
        portrait: this.visualForEnemy(waiting).portrait2d,
        side: 'enemy',
        timing: 'waiting',
        note: '레일 대기',
        active: false,
      })
    })
    const hiddenWaiting = Math.max(0, waitingEnemies.length - (MAX_ACTION_ORDER_ENEMIES - 1))
    if (hiddenWaiting > 0) {
      entries.push({
        key: 'enemy-overflow',
        name: `×${hiddenWaiting}`,
        portrait: '',
        side: 'enemy',
        timing: 'summary',
        note: '추가 대기',
        active: false,
      })
    }

    if (!entries.some((entry) => entry.active)) {
      const next = entries.find((entry) => entry.timing !== 'waiting' && entry.timing !== 'cooldown')
      if (next) next.active = true
    }

    const signature = JSON.stringify(entries.map(({ key, name, timing, note, active }) => [key, name, timing, note, active]))
    if (signature === this.actionOrderSignature) return
    this.actionOrderSignature = signature

    const previous = new Map([...host.querySelectorAll<HTMLElement>('[data-order-key]')]
      .map((item) => [item.dataset.orderKey!, item.getBoundingClientRect()]))
    host.closest('.action-order')?.classList.toggle('is-preempting', this.playerPreempting)
    host.innerHTML = entries.map((entry, index) => `
      <li class="action-order-item ${entry.side} timing-${entry.timing}${entry.active ? ' is-now' : ''}${this.playerPreempting && entry.side === 'player' ? ' priority-taken' : ''}"
        data-order-key="${entry.key}" style="--order-i:${index}" tabindex="0" aria-label="${entry.name} ${entry.note}">
        <div class="action-order-portrait">${entry.timing === 'summary' ? BUG_COUNT_ICON : `<img src="${entry.portrait}" alt="">`}</div>
        <div class="action-order-copy"><b>${entry.name}</b><span>${entry.note}</span></div>
      </li>`).join('')
    host.querySelectorAll<HTMLElement>('[data-order-key]').forEach((item) => {
      const before = previous.get(item.dataset.orderKey!)
      if (!before) return
      const after = item.getBoundingClientRect()
      const dy = before.top - after.top
      if (Math.abs(dy) < 1) return
      item.animate(
        [{ translate: `0 ${dy}px` }, { translate: '0 -7px', offset: .72 }, { translate: '0 0' }],
        { duration: 520, easing: 'cubic-bezier(.2, .9, .25, 1)' },
      )
    })
    this.renderCombatForecast()
  }

  private playerHtml(): string {
    const modelStatus = this.playerVisual.model3d ? 'preparing-3d' : 'fallback-2d'
    return `
      <div class="actor you" data-character="player" role="button" tabindex="0" aria-label="${t('playerName', '프롬')}과 도우미 ${t('tokenName', '토큰')} 상세 보기">
        ${this.isBoss ? '' : `<div class="nameplate glass">
          <div class="row"><span class="nm">${t('playerName', '프롬')}</span><span class="hpn"></span></div>
          <div class="hpbar you"><div class="fill"></div><div class="shield"></div></div>
        </div>`}
        <div class="shadow"></div>
        <div class="mantis-guard-cue" hidden aria-live="polite">
          <span class="mantis-guard-shield" aria-hidden="true">◈</span>
          <span><b>방어 필수</b><em></em></span>
        </div>
        <div class="model-shell" data-model-status="${modelStatus}"><img class="battle-sprite" src="${this.playerVisual.portrait2d}" alt="${t('playerName', '프롬')}"></div>
      </div>`
  }

  /** 사마귀의 예고 다음 턴에만 프롬 옆에 작은 방어 목표를 남긴다. */
  private syncMantisGuardCue() {
    const cue = this.root.querySelector<HTMLElement>('.mantis-guard-cue')
    if (!cue) return
    const mantis = this.state.enemies.find((enemy) => !enemy.dead && enemy.def.id === 'mantis')
    const imminent = mantis && !!nextEnemyAttackStep(mantis)?.shatterGuard
    cue.hidden = !imminent
    if (!mantis || !imminent) return
    const required = enemyGuardBreakRequirement(mantis, this.state.turn)
    const current = Math.min(this.state.guard, required)
    cue.querySelector<HTMLElement>('em')!.textContent = `${current}/${required}`
    cue.classList.toggle('ready', current >= required)
    cue.setAttribute('aria-label', `강공격 취소에 필요한 방어 ${current} / ${required}`)
  }

  private async breakMantisGuardCue() {
    const cue = this.root.querySelector<HTMLElement>('.mantis-guard-cue')
    if (!cue || cue.hidden) return
    cue.classList.remove('breaking')
    void cue.offsetWidth
    cue.classList.add('breaking')
    await sleep(380)
    cue.hidden = true
    cue.classList.remove('breaking')
  }

  private bossSentenceTokenHtml(token: EnemySentenceToken): string {
    const emotion = token.emotion ? ` emotion-${token.emotion}` : ''
    return `<span class="boss-sentence-token role-${token.role}${emotion}${token.crossed ? ' is-crossed' : ''}">
      <b>${token.text}</b>
    </span>`
  }

  private bossSentenceLineHtml(view: { tokens: EnemySentenceToken[] }): string {
    return `<div class="boss-sentence-line">${view.tokens.map((token) => this.bossSentenceTokenHtml(token)).join('<i aria-hidden="true">/</i>')}</div>`
  }

  /** 현재 시뮬레이션 상태를 그대로 읽어 보스가 쓰는 다음 문장으로 투영한다. */
  private renderBossSentence() {
    if (!this.isBoss) return
    const host = this.root.querySelector<HTMLElement>('#boss-sentence-board')
    const boss = this.state.enemies.find((enemy) => enemy.def.boss && !enemy.dead)
    if (!host || !boss) {
      if (host) host.hidden = true
      return
    }
    const view = enemySentenceFor(this.state, boss, { eventText: this.bossSentenceEvent })
    if (!view) {
      host.hidden = true
      return
    }
    const signature = JSON.stringify(view)
    if (signature === this.bossSentenceSignature) return
    this.bossSentenceSignature = signature
    this.paintBossSentence(host, view)
  }

  private paintBossSentence(host: HTMLElement, view: EnemySentenceView) {
    const context = view.context
      ? `<div class="boss-sentence-context">
          <span class="boss-sentence-side-label">${view.context.label}</span>
          ${this.bossSentenceLineHtml(view.context)}
          <div class="boss-sentence-meta">${view.context.meta.map((text) => `<span>${text}</span>`).join('')}</div>
        </div>`
      : ''
    const manuscript = view.manuscript?.length
      ? `<div class="boss-manuscript" aria-label="${bossText('manuscriptAria')}">
          <span class="boss-sentence-side-label">${bossText('damagedLongSentence')}</span>
          <div class="boss-manuscript-line">${view.manuscript.map((clause) => `
            <span class="boss-manuscript-clause${clause.active ? ' is-active' : ''}${clause.crossed ? ' is-crossed' : ''}${clause.emotion ? ` emotion-${clause.emotion}` : ''}" data-clause-id="${clause.id}">
              <b>${clause.text}</b>
            </span>`).join('<i aria-hidden="true">/</i>')}</div>
        </div>`
      : ''
    host.className = `boss-sentence-board tone-${view.tone}`
    host.innerHTML = `
      <div class="boss-sentence-heading"><span>${view.label}</span><b>${bossText(view.tone === 'danger' ? 'executeSoon' : view.tone === 'relief' ? 'endingRevision' : 'enemyIntent')}</b></div>
      ${context}
      <div class="boss-sentence-main">${this.bossSentenceLineHtml(view)}</div>
      <div class="boss-sentence-meta">${view.meta.map((text) => `<span>${text}</span>`).join('')}</div>
      ${manuscript}
      ${view.eventText ? `<div class="boss-sentence-event"><b>✎</b><span>${view.eventText}</span></div>` : ''}`
    host.hidden = false
    host.classList.remove('is-writing')
    void host.offsetWidth
    host.classList.add('is-writing')
  }

  /** 봉인·파훼·실패처럼 상태 한 장으로는 사라지는 사건만 짧게 문장 여백에 남긴다. */
  private showBossSentenceEvent(text: string, duration = 1800) {
    if (!this.isBoss || this.over) return
    clearTimeout(this.bossSentenceEventTimer)
    this.bossSentenceEvent = text
    this.bossSentenceSignature = ''
    this.renderBossSentence()
    this.bossSentenceEventTimer = window.setTimeout(() => {
      if (this.destroyed) return
      this.bossSentenceEvent = null
      this.bossSentenceSignature = ''
      this.renderBossSentence()
    }, duration)
    this.timers.push(this.bossSentenceEventTimer)
  }

  private bossHudHtml(): string {
    const bossName = this.state.enemies[0]?.def.name ?? '보스'
    const { floor, endlessCycle } = this.stageInfo
    const cycle = endlessCycle > 0
      ? hudTip('hudEndlessCycle', '엔드리스 {cycle}주기', { cycle: endlessCycle })
      : t('hudStoryCycle', '첫 번째 이야기')
    return `
      <section class="boss-health-hud" id="boss-health-hud" aria-label="${bossName} 보스 체력. ${cycle}. ${floor}/${DISPLAY_FLOORS}스테이지">
        <div class="boss-health-heading">
          <span class="boss-health-kicker">
            <span class="boss-health-mark" aria-hidden="true">BOSS</span>
          </span>
          <span class="boss-health-title"><b class="nm">${bossName}</b><em class="boss-health-stage">${t('hudStageLabel', '스테이지')} ${floor}/${DISPLAY_FLOORS}</em></span>
          <span class="hpn"></span>
        </div>
        <div class="hp-row">
          <div class="hpbar foe">
            <div class="fill"></div>
            <div class="shield"></div>
            <div class="boss-hp-segments" hidden></div>
            <div class="spellshield-overlay" hidden><span>✦</span><b></b></div>
          </div>
        </div>
        <div class="boss-badge-row">
          <span class="boss-first-mark" hidden title="선공 — 내 문장 직후, 나보다 먼저 때린다">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/><path class="bang" d="M12 9v5M12 17.2v.1"/></svg><b>선공</b>
          </span>
          <div class="boss-intel enemy-intel" aria-label="${bossText('bossBattleInfo', { boss: bossName })}" hidden></div>
        </div>
      </section>`
  }

  /**
   * 전투를 여는 한마디. 보스 HUD에 상시 패턴표가 없으므로 이 첫 대사가 약점과
   * 대응법을 모두 지고 간다. 파훼에 성공할 때까지 토큰이 계속 되뇐다.
   */
  private bossOpeningHint(): TokenLine | null {
    const boss = this.state.enemies[0]
    if (!boss) return null
    if (boss.def.id === 'mantis') return TOKEN_BOSS_HINTS.mantisStart
    if (boss.def.id === 'queenBee') return TOKEN_BOSS_HINTS.queenBeeStart
    if (boss.def.id === 'elderSpider') {
      const weak = activeEnemyPart(boss)?.def.weakness?.label
      return weak
        ? bossTokenLine('spiderOpeningWeak', 'calm', { weakness: weak })
        : bossTokenLine('spiderOpeningGeneric')
    }
    return null
  }

  private scheduleBossTokenSpeech(delay: number) {
    clearTimeout(this.tokenSpeechTimer)
    this.tokenSpeechTimer = window.setTimeout(() => {
      if (this.over) return
      // 한가한 응원은 경고를 밀어내지 않는다. 큰낫이 올라간 채로 "힘내!"가 뜨면
      // 화면이 지금 무엇이 급한지 스스로 뒤집는 셈이다.
      if (this.token?.isHolding) return this.scheduleBossTokenSpeech(7600)
      this.showTokenSpeech(TOKEN_BOSS_LINES[this.tokenSpeechIndex % TOKEN_BOSS_LINES.length])
      this.tokenSpeechIndex += 1
      this.scheduleBossTokenSpeech(7600)
    }, delay)
    this.timers.push(this.tokenSpeechTimer)
  }

  private scheduleBossTokenHint(line: TokenLine, delay = 0) {
    this.bossPatternHint = line
    clearTimeout(this.tokenSpeechTimer)
    this.tokenSpeechTimer = window.setTimeout(() => {
      if (this.over) return
      const next = this.bossPatternHint ?? line
      this.showTokenSpeech(next)
      if (this.bossPatternSolved) this.scheduleBossTokenSpeech(7600)
      else this.scheduleBossTokenHint(next, 7600)
    }, delay)
    this.timers.push(this.tokenSpeechTimer)
  }

  /**
   * 한마디는 전부 토큰 자신이 낸다. 말풍선도 감정 이펙트도 그의 몸에 달려 있어서,
   * 뷰는 무엇을 말할지만 정하고 어디에 띄울지는 신경 쓰지 않는다.
   */
  private showTokenSpeech(line: TokenLine) {
    this.token?.say(line)
  }

  /** 일반전의 동반 토큰이 최초 상황에만 짧게 개입한다. 보스의 고정 경고가 우선이다. */
  private showCombatCoach(hint: CombatCoachHint): boolean {
    if (this.isBoss || this.over || this.token?.isHolding || hasSeenCombatCoach(hint)) return false
    markCombatCoachSeen(hint)
    this.showTokenSpeech(TOKEN_COACH_LINES[hint])
    return true
  }

  private clearNormalTokenWarning() {
    if (this.isBoss) return
    this.token?.clearSpeech()
  }

  private showBossTokenHint(line: TokenLine) {
    if (!this.isBoss || this.over) return
    this.bossPatternHint = line
    clearTimeout(this.tokenSpeechTimer)
    this.showTokenSpeech(line)
    if (this.bossPatternSolved) this.scheduleBossTokenSpeech(7600)
    else this.scheduleBossTokenHint(line, 7600)
  }

  private resolveBossPattern(line: TokenLine) {
    if (!this.isBoss || this.over) return
    this.bossPatternSolved = true
    this.bossPatternHint = null
    clearTimeout(this.tokenSpeechTimer)
    this.showTokenSpeech(line)
    this.scheduleBossTokenSpeech(7600)
  }

  private updatePlayer(el: HTMLElement) {
    const s = this.state
    if (this.isBoss) return
    const guardLimit = playerGuardLimit(s.playerMax)
    el.querySelector<HTMLElement>('.hpn')!.innerHTML =
      `${Math.max(0, s.playerHp)}/${s.playerMax} ${s.guard ? `<span class="shield-chip" title="방어막 한도: 최대 체력과 같음">◈${s.guard}/${guardLimit}</span>` : ''}${s.playerMagicShield ? `<span class="shield-chip magic" title="${BUILD_EFFECT_TEXT.magicTip}">✦1</span>` : ''}`
    this.paintGuardedHpBar(el.querySelector<HTMLElement>('.hpbar.you')!, s.playerHp, s.playerMax, s.guard)
  }

  /** 일반 방어는 진영과 무관하게 현재 체력 오른쪽에 이어지는 파란 추가 체력으로 그린다. */
  private paintGuardedHpBar(bar: HTMLElement, currentHp: number, maxHp: number, currentGuard: number) {
    const hp = Math.max(0, currentHp)
    const guard = Math.max(0, currentGuard)
    const total = Math.max(1, maxHp + guard)
    const hpPct = hp / total
    bar.querySelector<HTMLElement>(':scope > .fill')!.style.width = `${hpPct * 100}%`
    const shield = bar.querySelector<HTMLElement>(':scope > .shield')!
    shield.style.left = `${hpPct * 100}%`
    shield.style.width = `${(guard / total) * 100}%`
    shield.classList.toggle('on', guard > 0)
  }

  private foeHtml(i: number, e: EnemyInst): string {
    const visual = this.visualForEnemy(e)
    const modelStatus = visual.model3d ? 'preparing-3d' : 'fallback-2d'
    const summonPattern = e.def.summonPattern
    const workerVisual = CHARACTER_VISUALS.workerBee
    const summonedAllies = summonPattern
      ? `<div class="summoned-allies" aria-label="${summonPattern.name} 호위">
          ${(['left', 'right'] as const).flatMap((side) =>
            Array.from({ length: summonPattern.maxPerSide }, (_, slot) =>
              `<span class="queen-worker ${side}" data-side="${side}" data-slot="${slot + 1}" hidden>
                <span class="queen-worker-nameplate nameplate glass" aria-label="일벌 체력 ${summonPattern.hp ?? 1} / ${summonPattern.hp ?? 1}">
                  <span class="queen-worker-tag"><b>적</b><span>${summonPattern.name}</span><em>${summonPattern.hp ?? 1}/${summonPattern.hp ?? 1}</em></span>
                  <span class="queen-worker-hp hpbar foe"><i class="fill"></i></span>
                </span>
                <span class="model-shell" data-model-status="${workerVisual.model3d ? 'preparing-3d' : 'fallback-2d'}">
                  <img class="battle-sprite" src="${SPRITES[summonPattern.sprite]}" alt="${summonPattern.name}">
                </span>
              </span>`,
            ),
          ).join('')}
        </div>`
      : ''
    return `
      <div class="actor foe${e.def.boss ? ' boss' : ''}" data-i="${i}" data-character="${visual.id}">
        <div class="nameplate glass">
          <div class="row">
            <span class="nm">${e.def.name}</span>
            <span class="hpn"></span>
          </div>
          <div class="hp-row">
            <div class="hpbar foe">
              <div class="fill"></div>
              <div class="shield"></div>
              <div class="boss-hp-segments" hidden></div>
              <div class="spellshield-overlay" hidden><span>✦</span><b></b></div>
            </div>
          </div>
        </div>
        <div class="enemy-intel" aria-label="${e.def.name} 전투 정보"></div>
        <span class="first-mark" title="선공 — 내 문장 직후, 나보다 먼저 때린다">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/><path class="bang" d="M12 9v5M12 17.2v.1"/></svg><b>선공</b>
        </span>
        ${summonedAllies}
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="${modelStatus}"><img class="battle-sprite" src="${visual.portrait2d}" alt="${e.def.name}"></div>
      </div>`
  }

  private updateSummonedAllies(el: HTMLElement, enemy: EnemyInst) {
    const host = el.querySelector<HTMLElement>('.summoned-allies')
    if (!host) return
    host.querySelectorAll<HTMLElement>('.queen-worker').forEach((worker) => {
      const side = worker.dataset.side
      const slot = Number(worker.dataset.slot)
      const count = side === 'left' ? enemy.summonsLeft : enemy.summonsRight
      const visible = slot <= count
      const wasHidden = worker.hidden
      worker.hidden = !visible
      if (visible) {
        if (wasHidden) worker.getAnimations().forEach((animation) => animation.cancel())
        const hp = (side === 'left' ? enemy.summonHpLeft : enemy.summonHpRight)[slot - 1]
          ?? enemy.def.summonPattern?.hp
          ?? 1
        const maxHp = enemy.def.summonPattern?.hp ?? 1
        const nameplate = worker.querySelector<HTMLElement>('.queen-worker-nameplate')
        const hpText = worker.querySelector<HTMLElement>('.queen-worker-tag > em')
        const fill = worker.querySelector<HTMLElement>('.queen-worker-hp > .fill')
        nameplate?.setAttribute('aria-label', `일벌 체력 ${hp} / ${maxHp}`)
        if (hpText) hpText.textContent = `${hp}/${maxHp}`
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, hp / maxHp * 100))}%`
        this.queueDeferredCharacterModel(worker, CHARACTER_VISUALS.workerBee, 2)
      } else {
        suspendCharacterModel(worker)
      }
    })
    host.setAttribute('aria-label', `${enemy.def.summonPattern?.name ?? '호위'} ${summonCount(enemy)}마리`)
    host.classList.toggle('swarm-ready', summonCount(enemy) >= (enemy.def.summonPattern?.releaseAt ?? Infinity))
  }

  private updateFoe(el: HTMLElement, e: EnemyInst, rank: number) {
    const front = rank === 0
    // 일반 전투 레일은 원근 단차를 두지 않는다. 모든 적을 같은 바닥선과 크기로
    // 세우고, 배경별 차이는 가로 자리와 간격에만 남긴다.
    const st = currentFieldStage()
    if (this.isBoss && e.def.boss) {
      // 보스마다 뷰포트 폭이 달라도 배우의 발 실루엣 중심은 항상 무대 정중앙에 둔다.
      // 모델 고유의 비대칭은 CSS의 캐릭터별 오프셋으로 보정한다.
      // 개별 translate 속성은 공격·피격의 transform 애니메이션과 서로 덮어쓰지 않는다.
      el.style.right = 'auto'
      el.style.translate = 'calc(-50% + var(--boss-stage-offset-x, 0px)) 0'
      el.style.left = '50%'
    } else {
      el.style.left = 'auto'
      el.style.right = `${st.railRight - rank * st.railGap}px`
      el.style.translate = 'none'
    }
    el.style.bottom = this.isBoss && e.def.boss ? '24px' : `${st.bottom}px`
    el.style.zIndex = String(40 - rank) // 앞줄이 뒷줄을 가린다
    // 보스 외 모든 적은 프롬과 같은 시각 크기·선명도를 유지한다.
    el.style.opacity = '1'
    el.style.setProperty('--model-scale', '1')
    el.style.setProperty('--model-blur', '0px')
    // 앞줄이 쓰러져 자리가 한 칸 당겨지면 걸어서 옮긴다. 이 자리 이동은 CSS
    // 트랜지션이라, 동작을 안 바꾸면 선 자세 그대로 얼음판을 타듯 끌려온다.
    const previousRank = el.dataset.rank
    el.dataset.rank = String(rank)
    if (previousRank != null && rank < Number(previousRank)) this.walkFoeForward(el)
    el.classList.toggle('front', front)
    el.classList.toggle('target', front)
    el.classList.toggle('back', !front)
    el.classList.toggle('groggy', this.state.turn <= e.groggyUntilTurn)
    el.dataset.brokenLegs = String(e.parts.filter((part) => part.def.kind === 'leg' && part.broken).length)
    this.updateSummonedAllies(el, e)
    this.updateEnemyIntel(el, e)

    // 대기 적도 이름과 체력을 즉시 읽을 수 있도록 이름표 투명도를 낮추지 않는다.
    const plate = el.querySelector<HTMLElement>('.nameplate')!
    plate.classList.remove('faint')
    plate.classList.remove('gone')
    this.updateFoePlate(plate, e, false)
    if (e.def.boss) {
      const bossHud = this.root.querySelector<HTMLElement>('#boss-health-hud')
      if (bossHud) this.updateFoePlate(bossHud, e, true)
    }
    const strikesFirst = front && !e.dead && e.initiativePhase === 'first'
    // 일반 적은 캐릭터 옆 경고를, 보스는 상단 체력 HUD에 통합된 표식을 같은 상태값으로 갱신한다.
    el.classList.toggle('strikes-first', strikesFirst)
    if (e.def.boss) {
      const bossFirst = this.root.querySelector<HTMLElement>('#boss-health-hud .boss-first-mark')
      if (bossFirst) bossFirst.hidden = !strikesFirst
    }
  }

  /**
   * 한 칸 당겨오는 동안만 walk를 끼워 넣고 도착하면 idle로 돌린다.
   * 공격·사망 같은 동작 중이면 손대지 않는다 — 그쪽 연출이 중간에 끊긴다.
   * 관통으로 여러 칸이 연달아 당겨질 때는 마지막 걸음의 도착 시각까지 계속 걷는다.
   */
  private walkFoeForward(foe: HTMLElement) {
    const playing = characterAnimationOf(foe)
    if (playing !== 'idle' && playing !== 'walk') return
    const arriveAt = performance.now() + RAIL_ADVANCE_WALK_MS
    foe.dataset.walkUntil = String(arriveAt)
    playCharacterAnimation(foe, 'walk')
    this.timers.push(window.setTimeout(() => {
      if (Number(foe.dataset.walkUntil) !== arriveAt) return // 그 사이에 또 당겨졌다
      delete foe.dataset.walkUntil
      if (characterAnimationOf(foe) === 'walk') playCharacterAnimation(foe, 'idle')
    }, RAIL_ADVANCE_WALK_MS))
  }

  /** 적 모델을 가리지 않는 작은 상태 아이콘. 숫자와 규칙은 호버 툴팁에서만 풀어 쓴다. */
  private updateEnemyIntel(el: HTMLElement, e: EnemyInst) {
    const host = e.def.boss
      ? this.root.querySelector<HTMLElement>('#boss-health-hud .boss-intel')!
      : el.querySelector<HTMLElement>('.enemy-intel')!
    const attackStep = nextEnemyAttackStep(e)
    const summonPattern = e.def.summonPattern
    const summons = summonCount(e)
    const icons: string[] = []
    const add = (kind: string, glyph: string, tooltip: string) => {
      icons.push(`<span class="enemy-intel-icon ${kind}" role="img" tabindex="0" aria-label="${tooltip}" data-tooltip="${tooltip}" data-tip-place="above">${glyph}</span>`)
    }

    if (attackStep) {
      const detail = attackStep.damageScale === 0
        ? '이번엔 안 때리고 다음 공격을 준비한다'
        : attackStep.damageScale != null && attackStep.damageScale !== 1
          ? `평소 위력의 ${Math.round(attackStep.damageScale * 100)}%로 때린다`
          : attackStep.bonusAtk > 0
            ? `평소보다 ${attackStep.bonusAtk} 세게 때린다`
            : '평소 위력으로 때린다'
      add('attack', icon('sword'), tip(`다음 행동 · ${attackStep.name}`, detail))
    }
    if (e.def.boss) {
      const stage = bossAttackStage(e)
      add(`stage stage-${stage}`, `<b>${stage}</b>`, tip(`공격 단계 ${stage}`, `단계가 오를수록 세진다 (지금 ×${BOSS_ATTACK_MULTIPLIER[stage].toFixed(2)})`))
    }
    if (e.guard > 0) add('guard', `${icon('shield')}<b>${e.guard}</b>`, tip(`방어 ${e.guard}`, `피해를 ${e.guard}만큼 먼저 막아 낸다`))
    if (e.magicShield > 0) add('magic', `${icon('shield')}<b>${e.magicShield}</b>`, tip(`마법실드 ${e.magicShield}`, `공격 ${e.magicShield}번을 통째로 지운다 · 연타로 벗긴다`))
    if (e.def.pierceGuard) add('pierce', icon('sword'), tip('관통', '내 방어를 뚫고 체력을 바로 깎는다'))
    if (summonPattern) add(
      `summon${summons >= (summonPattern.releaseAt ?? Infinity) ? ' ready' : ''}`,
      icon('jar'),
      tip(`${summonPattern.name} ${summons}/${summonPattern.max}`, `부하가 늘수록 세진다 (지금 공격 +${summons * (summonPattern.attackBonusPerUnit ?? 0)})`),
    )
    if (e.def.webPattern) add(
      `web${spiderWebTension(e) >= e.def.webPattern.maxSealedCards ? ' ready' : ''}`,
      '<b>✣</b>',
      tip(`거미줄 ${spiderWebTension(e)}/${e.def.webPattern.maxSealedCards}`, '드러난 다리를 때리거나 약점 감정으로 막고 회복하면 풀린다'),
    )
    if (this.state.turn <= e.groggyUntilTurn) add('groggy', '<b>✦</b>', tip('그로기', `지금 주는 피해가 ${e.groggyDamageMult.toFixed(1)}배가 되고 예정된 공격을 한 턴 거른다`))
    if (e.def.elite) {
      add(`elite elite-${e.def.elite.rarity}`, '<b>◆</b>', tip(`${e.def.name} · ${e.def.elite.label}`, e.def.note))
    }
    const tacticalGuide = tacticalGuideForEnemy(e.def.id, e.def.tacticalGuideId)
    if (tacticalGuide) add('tactic', '<b>✦</b>', tip(tacticalGuide.title, tacticalGuide.tooltip))

    host.hidden = icons.length === 0
    host.innerHTML = icons.join('')
  }

  private updateFoePlate(plate: HTMLElement, e: EnemyInst, bossHud: boolean) {
    const remainingBars = Math.ceil(Math.max(0, e.hp) / e.hpPerBar)
    const activePart = activeEnemyPart(e)
    const activeWeakness = activePart ? activePart.def.weakness ?? null : null
    const affinity = activePart
      ? activeWeakness?.kind === 'emotion' ? activeWeakness.value as Emotion : 'neutral'
      : e.def.weakEmotion ?? 'neutral'
    const affinityLabel = affinity === 'neutral' ? '무속성' : `${EMOTION_LABEL[affinity]} 약점`
    const affinityTooltip = affinity === 'neutral'
      ? tip('무속성', '감정 약점이 없어 추가 피해를 받지 않는다')
      : tip(affinityLabel, `${EMOTION_LABEL[affinity]} 카드로 때리면 피해 1.5배`)
    ;(['joy', 'anger', 'sorrow', 'pleasure', 'neutral'] as const).forEach((emotion) => {
      plate.classList.toggle(`emotion-${emotion}`, emotion === affinity)
    })
    plate.dataset.tooltip = affinityTooltip
    plate.dataset.tipPlace = 'above'
    plate.tabIndex = 0
    plate.querySelector<HTMLElement>('.hpn')!.textContent = e.healthBars > 1
      ? (bossHud ? `${Math.max(0, e.hp)} / ${e.maxHp}` : `${Math.max(0, e.hp)}/${e.maxHp} · ${remainingBars}막`)
      : `${Math.max(0, e.hp)}/${e.maxHp}`
    const hpbar = plate.querySelector<HTMLElement>('.hpbar.foe')!
    hpbar.hidden = false
    this.paintGuardedHpBar(hpbar, e.hp, e.maxHp, e.guard)
    hpbar.setAttribute('aria-label', bossHud
      ? `보스 체력 ${Math.max(0, e.hp)} / ${e.maxHp}`
      : e.healthBars > 1
        ? `보스 체력 ${remainingBars}막 남음, 전체 ${e.healthBars}막`
        : `체력 ${Math.max(0, e.hp)} / ${e.maxHp}`)
    const segments = hpbar.querySelector<HTMLElement>('.boss-hp-segments')!
    segments.hidden = e.healthBars <= 1
    if (!segments.hidden) {
      segments.style.gridTemplateColumns = `repeat(${e.healthBars}, 1fr)`
      segments.innerHTML = Array.from({ length: e.healthBars }, (_, i) =>
        `<i${i === e.healthBars - 1 ? ' class="last"' : ''}></i>`,
      ).join('')
    }
    const spellshield = hpbar.querySelector<HTMLElement>('.spellshield-overlay')!
    spellshield.hidden = e.magicShield <= 0
    spellshield.querySelector<HTMLElement>('b')!.textContent = e.magicShield > 1 ? `×${e.magicShield}` : ''
    // 보스 상단 HUD의 체력과 호위 규칙을 갱신한다. 세부 전투 정보는 바로 아래의
    // 공용 아이콘 배지가 맡아 긴 텍스트가 체력바 폭을 밀어내지 않게 한다.
    if (bossHud) {
      const mark = plate.querySelector<HTMLElement>('.boss-health-mark')
      const escortedQueen = e.def.id === 'queenBee' && summonCount(e) > 0
      if (mark) {
        mark.textContent = escortedQueen ? QUEEN_ESCORT_IMMUNITY_LABEL : 'BOSS'
        mark.toggleAttribute('aria-hidden', !escortedQueen)
        mark.classList.toggle('escort-rule', escortedQueen)
      }
      return
    }
    const partHost = plate.querySelector<HTMLElement>('.spider-parts')
    if (partHost) {
      partHost.hidden = !e.parts.length
      if (!partHost.hidden) {
        partHost.style.gridTemplateColumns = `repeat(${e.parts.length}, minmax(0, 1fr))`
        partHost.innerHTML = e.parts.map((part) => {
          const weak = part.def.weakness
          const active = part === activePart
          // 약점은 카드에 찍힌 것과 같은 감정 뱃지·같은 색으로 세운다. 이름표만
          // 적어 두면 「슬픔」이 손패의 어느 색인지 플레이어가 매번 번역해야 한다.
          const weakness = weak?.kind === 'emotion'
            ? `<em class="emotion-${weak.value}">${emotionBadgeContent(weak.value as Emotion)}</em>`
            : `<em>${weak?.label ?? '약점 없음'}</em>`
          return `<span class="spider-part${part.broken ? ' broken' : ''}${active ? ' active' : ''}" data-part-id="${part.def.id}">
            <span class="spider-part-head"><b>${part.def.name}</b>${weakness}</span>
            <span class="spider-part-bar"><i style="width:${Math.max(0, part.hp) / part.maxHp * 100}%"></i></span>
          </span>`
        }).join('')
      }
    }
  }

  private bindActor(actor: HTMLElement) {
    const show = () => {
      this.keepDock()
      const id = actor.dataset.character as CharacterVisualDef['id']
      this.renderCharacterDetail(id, actor.dataset.i == null ? null : Number(actor.dataset.i))
    }
    const leave = () => this.fadeDock(() => this.clearDetailDock())
    // 체력바뿐 아니라 캐릭터 본체도 각각 명시적인 상세보기 호버 영역으로 사용한다.
    // 포인터 히트박스는 실제 캐릭터가 그려지는 모델 셸로 통일한다.
    actor.querySelectorAll<HTMLElement>('.model-shell').forEach((target) => {
      target.addEventListener('mouseenter', show)
      target.addEventListener('mouseleave', leave)
    })
    actor.addEventListener('focus', show)
    actor.addEventListener('blur', leave)
    actor.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('.model-shell')) show()
    })
    actor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        show()
      }
    })
  }

  private setPhase(label: string) {
    this.phaseLabel = label
    const el = this.root.querySelector<HTMLElement>('#phase')
    if (el) {
      const short: Record<string, string> = {
        '준비 효과': '준비',
        '선수 · 먼저 움직였다': '선수',
        '선공 상대 행동': '적 선공',
        '본인 캐릭터 행동': '본행동',
        '후공 상대 행동': '적 후공',
        '단어 완성': '완성',
        '전투 승리': '승리',
      }
      el.textContent = short[label] ?? label.replace(/ 선택$/, '')
    }
    this.renderActionOrder()
  }

  // 캐릭터 호버 상세는 우측 캐스트 로그 패널 위에 그대로 겹쳐 표시한다.
  private renderCharacterDetail(id: CharacterVisualDef['id'], enemyIndex: number | null) {
    const visual = CHARACTER_VISUALS[id]
    const host = this.q('#detail')
    let stats: string
    if (id === 'player') {
      const p = this.player.stats
      stats = [
        ['체력', `${Math.max(0, this.state.playerHp)} / ${this.state.playerMax}`],
        ['공격', String(p.atk)],
        ['방어', String(p.guard)],
        ['회복', String(p.heal)],
        ['운', String(p.luck)],
      ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
    } else {
      const enemy = enemyIndex == null ? null : this.state.enemies[enemyIndex]
      const waiting = enemyIndex != null && enemyIndex !== frontIdx(this.state)
      const attackStage = enemy ? bossAttackStage(enemy) : 1
      const attackMultiplier = BOSS_ATTACK_MULTIPLIER[attackStage]
      const attackStep = enemy ? nextEnemyAttackStep(enemy) : null
      const summonPattern = enemy?.def.summonPattern
      const summons = enemy ? summonCount(enemy) : 0
      const currentPart = enemy ? activeEnemyPart(enemy) : null
      // 상세 정보도 실행부와 같은 공용 예상값을 쓴다. 공격 감소·거미줄 상한·다음
      // 공격 턴의 압박 배율을 따로 재구현하지 않는다.
      const [attackLow, attackHigh] = enemy ? enemyAttackForecast(this.state, enemy).raw : [0, 0]
      stats = enemy
        ? [
            ['체력', `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`],
            ['공격', attackLow === attackHigh ? String(attackLow) : `${attackLow}–${attackHigh}`],
            ...(attackStep ? [['다음 기술', attackStep.name]] : []),
            ...(summonPattern ? [['호위', `${summonPattern.name} ${summons}/${summonPattern.max}`]] : []),
            ...(currentPart ? [['현재 부위', `${currentPart.def.name} ${Math.max(0, currentPart.hp)}/${currentPart.maxHp}`]] : []),
            ...(currentPart?.def.weakness
              ? [['현재 약점', `${currentPart.def.weakness.label} · 공격 피해 ×1.5 · 방어·회복도 봉인 -1`]]
              : currentPart ? [['현재 속성', '무속성 · 감정 추가 피해 없음']] : []),
            ...(enemy.def.webPattern ? [['거미줄', `카드 봉인 최대 ${enemy.def.webPattern.maxSealedCards}장`]] : []),
            ...(enemy.def.boss ? [['공격 단계', `${attackStage}단계 · ×${attackMultiplier.toFixed(2)}`]] : []),
            ...(!currentPart
              ? [[enemy.def.weakEmotion ? '약점' : '속성', enemy.def.weakEmotion
                ? `<span class="enemy-weakness emotion-${enemy.def.weakEmotion}">${emotionBadgeContent(enemy.def.weakEmotion)}</span>`
                : '무속성 · 감정 추가 피해 없음']]
              : []),
            ['행동 주기', `${enemy.def.every}턴`],
            ...(waiting ? [] : [['다음 순서', enemy.initiativePhase === 'first' ? '선공' : '후공']]),
          ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('')
        : ''
    }
    host.className = 'info-dock glass character-dock'
    host.innerHTML = `
      <article aria-label="${visual.name} 상세 정보">
        <div class="character-portrait"><img src="${visual.portrait2d}" alt="${visual.name} 2D 스프라이트"></div>
        <div class="character-copy">
          <div class="character-kicker">CHARACTER DETAIL</div>
          <h2>${visual.name}</h2>
          <h3>${visual.title}</h3>
          <p>${visual.description}</p>
          <div class="character-stats">${stats}</div>
          ${id === 'player' ? '<div class="character-note">문장을 조립해 이야기를 올바른 방향으로 이끈다.</div>' : `<div class="character-note">${this.state.enemies[enemyIndex ?? 0]?.def.note ?? ''}</div>`}
        </div>
      </article>`
  }

  private clearDetailDock() {
    const host = this.q('#detail')
    host.className = 'info-dock detail-idle'
    host.innerHTML = ''
  }

  // ── 상단 발광 체인(문장) ──
  // 단어마다 그 단어가 무엇을 얼마나 주는지(깡수치/배율)를 바로 밑에 붙여 읽게 한다.
  // 맨 끝에는 완벽한 맥락(관용구)과 어긋남 배율을 따로 세워 둔다.
  private renderChain() {
    const host = this.q('#chain')
    const toks = sentenceTokens(this.sel, this.t)
    const order = this.order()
    const anyPicked = order.some((k) => this.sel[k])
    const words = order
      .map((k, i) => {
        const w = this.sel[k]
        if (!w) return ''
        const note = this.chainNote(w)
        // 문장부호는 한 글자짜리 칸이라 좁게 붙인다.
        const attach = this.t.template.slots[i]?.attach ? ' is-punct' : ''
        const emotion = emotionOrNeutral(w.emotion)
        return `<span class="chain-word emotion-${emotion}${attach}" data-i="${i}">
          <b class="cw-text">${toks[i]}</b>
          <span class="cw-cost" style="--ink-cost-badge-image:url('${INK_UI.costBadge}')" title="잉크 비용">${wordInkCost(w)}</span>
          ${note ? `<em class="cw-note ${note.cls}">${note.text}</em>` : ''}
        </span>`
      })
      .join('')
    let extra = ''
    if (anyPicked) {
      const intent = compile(this.sel, this.t, this.combatStats(), this.mods())
      for (const c of matchCombos(this.sel, this.t.combos, order)) {
        const known = this.discoveredCombos.has(c.id)
        extra += `<span class="chain-word ctx perfect"><b class="cw-text">${known ? `「${c.name}」` : '?'}</b><em class="cw-note combo">${known ? `완벽한 맥락 ×${c.mult}` : '새로운 맥락?'}</em></span>`
      }
      // 피노키오의 미아핑 — 문장을 완성하면 끝에 붙는 고정 맥락. 굴림 전에 범위를 보여준다.
      if (intent.doubtCount > 0) {
        extra += `<span class="chain-word ctx doubt"><b class="cw-text">${DOUBT_SUFFIX}</b><em class="cw-note gamble">×1.00~×${(1 + DOUBT_RANGE).toFixed(2)}</em></span>`
      }
      // 부조화(어긋난 맥락) — 위력이 깎인다는 걸 실행 전에 보여준다.
      if (intent.penalties.length) {
        extra += `<span class="chain-word ctx broken"><b class="cw-text">어긋남</b><em class="cw-note down">×${intent.coherence.toFixed(2)} · ${intent.penalties[0]}</em></span>`
      }
    }
    host.innerHTML = words + extra
    host.classList.toggle('has-sentence', anyPicked)
    host.classList.toggle('sentence-ready', this.complete())
    this.renderInk()
    this.renderMultNow(anyPicked)
  }

  private renderInk(): void {
    const meter = this.q<HTMLElement>('#ink-meter')
    const spent = selectionInkCost(this.sel)
    const available = this.currentInkAvailable()
    const over = inkOverdraw(spent, available)
    updateInkMeter(meter, { spent, max: available, overdraw: over, previewSpent: this.inkPreviewSpent })
  }

  private currentInkAvailable(): number {
    return sentenceInkAvailable(this.carriedInk)
  }

  private previewInkSpend(word: Word): void {
    if (this.busy || this.over) return
    const key = this.order()[this.slotIndex]
    if (!key) return
    this.inkPreviewSpent = selectionInkCost({ ...this.sel, [key]: word })
    this.renderInk()
  }

  private clearInkPreview(): void {
    if (this.inkPreviewSpent == null) return
    this.inkPreviewSpent = null
    this.renderInk()
  }

  // 체인 아래 "지금 배율" — 카드를 고르는 즉시 숫자가 삐리릭 돌다가 팅! 하고 확정된다.
  // 발동을 기다리지 않고 이번 선택이 얼마짜리인지 바로 읽게 하는 게 목적이다.
  private renderMultNow(anyPicked: boolean) {
    const host = this.q('#mult-now')
    if (!anyPicked) {
      host.innerHTML = ''
      host.className = 'mult-now'
      this.multReelToken++
      return
    }
    const intent = compile(this.sel, this.t, this.combatStats(), this.mods())
    const mult = resolveMultiplier(intent, this.multCtx(intent), 0.5).mult
    // 정산판과 같은 출처(컴파일러가 쌓아 둔 깡수치)를 쓴다 — 방어·회복 문장도 0이 되지 않는다.
    const flat = intent.breakdown.flats.reduce((n, f) => n + f.value, 0)
    const lane = isDamageIntent(intent) ? '위력' : intent.heal > 0 ? '회복' : intent.guard > 0 ? '방어' : '위력'
    if (!host.querySelector('.mn-mult')) {
      host.innerHTML = `<span class="mn-lane"></span><span class="mn-flat"></span><span class="mn-x">×</span><span class="mn-mult"></span>`
    }
    // 감정 공명은 총배율 안에 이미 곱해져 있지만, 숫자 하나만 올리면 무엇이 배율을
    // 키웠는지 조립 중에는 읽히지 않는다. 오른쪽 배율판의 빈 왼쪽 공간에 감정색
    // 배지를 붙여, 같은 감정 카드가 들어오는 즉시 출처와 증가량을 함께 보여 준다.
    const resonanceEmotion = this.resonantEmotion(intent.emotions)
    const oldBadge = host.querySelector<HTMLElement>('.mn-emotion-badge')
    if (resonanceEmotion && intent.emotionResonance > 1) {
      const count = intent.emotions.filter((emotion) => emotion === resonanceEmotion).length
      const signature = `${resonanceEmotion}-${count}-${intent.emotionResonance}`
      const badge = oldBadge ?? document.createElement('span')
      badge.className = `mn-emotion-badge emotion-${resonanceEmotion}`
      badge.setAttribute('aria-label', `${EMOTION_LABEL[resonanceEmotion]} 공명, 같은 감정 ${count}장, 배율 ${intent.emotionResonance.toFixed(2)}`)
      badge.innerHTML = `
        <i class="mn-emotion-spark" aria-hidden="true"></i>
        <span class="mn-emotion-face">${emotionIconContent(resonanceEmotion)}</span>
        <span class="mn-emotion-copy"><small>감정 공명 · ${count}장</small><b>×${intent.emotionResonance.toFixed(2)}</b></span>`
      if (!oldBadge) host.prepend(badge)
      if (badge.dataset.signature !== signature) {
        badge.dataset.signature = signature
        badge.classList.remove('bloom')
        void badge.offsetWidth
        badge.classList.add('bloom')
      }
    } else {
      oldBadge?.remove()
    }
    // 동사를 아직 안 골라 깡수치가 없으면 배율만 보여준다("위력 0 ×1.4"는 오해를 부른다).
    host.classList.toggle('no-flat', flat <= 0)
    host.querySelector<HTMLElement>('.mn-lane')!.textContent = flat > 0 ? lane : '지금 배율'
    host.querySelector<HTMLElement>('.mn-flat')!.textContent = String(flat)
    void this.spinMult(host.querySelector<HTMLElement>('.mn-mult')!, mult, host)
  }

  // 숫자 릴 — 계단식 난수 대신 이전 값에서 목표 값까지 부드럽게 롤업한다.
  private async spinMult(el: HTMLElement, target: number, host: HTMLElement) {
    const token = ++this.multReelToken
    host.classList.add('spinning')
    host.classList.remove('landed', 'hot')
    const from = Number(el.textContent) || 1
    await this.rollMultiplierValue(el, from, target, 360, () => token === this.multReelToken)
    if (token !== this.multReelToken) return
    host.classList.remove('spinning')
    host.classList.add('landed')
    // 배율이 크게 붙었으면 더 뜨겁게 빛난다.
    host.classList.toggle('hot', target >= 2)
    this.timers.push(window.setTimeout(() => host.classList.remove('landed'), 620))
  }

  /** 배율 숫자를 프레임 단위로 이어서 올려 칩 단위의 끊김을 줄인다. */
  private rollMultiplierValue(el: HTMLElement, from: number, target: number, duration: number, isCurrent = () => true): Promise<void> {
    return new Promise((resolve) => {
      const started = performance.now()
      const frame = (now: number) => {
        if (!isCurrent()) return resolve()
        const ratio = Math.min(1, (now - started) / duration)
        const eased = 1 - Math.pow(1 - ratio, 3)
        el.textContent = (from + (target - from) * eased).toFixed(2)
        if (ratio < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  }

  // 체인에 붙는 한 줄 설명 — 카드 상세·보상과 같은 표기 규칙(wordValueLines)을 쓴다.
  private chainNote(w: Word): { text: string; cls: string } | null {
    const lines = wordValueLines(w, this.combatStats())
    if (!lines.length) return null
    // 도박 카드는 색을 보라로 고정한다(카드 무드와 같은 색).
    const cls = w.variance ? 'gamble' : lines[0].cls
    return { text: lines.map((v) => v.text).join(' · '), cls }
  }

  /**
   * 스텝 묶음 — 라벨이 같은 연속 슬롯을 한 칸으로 묶는다("동사"+"동사 2" → 3·4 동사).
   * 겹슬롯은 카드풀이 같아서 두 칸으로 늘어놓으면 새 슬롯처럼 오해된다.
   */
  private stepGroups(): { label: string; indices: number[] }[] {
    const out: { label: string; indices: number[] }[] = []
    this.t.template.slots.forEach((s, i) => {
      const label = s.label.replace(/\s*\d+$/, '') // '동사 2' → '동사'
      const last = out[out.length - 1]
      if (last && last.label === label) last.indices.push(i)
      else out.push({ label, indices: [i] })
    })
    return out
  }

  // ── 중앙 하단: 슬롯 스텝 + 가로 단어 ──
  private renderWords() {
    // 겹슬롯(주어 2·동사 2)은 같은 카드풀을 쓰므로 "3·4 동사" 한 칸으로 합쳐 보여준다.
    this.q('#steps').innerHTML = this.stepGroups()
      .map((g) => {
        const active = g.indices.includes(this.slotIndex)
        const done = g.indices.every((i) => this.sel[this.t.template.slots[i].key])
        const cls = active ? 'active' : done ? 'done' : ''
        const no = g.indices.map((i) => i + 1).join('·')
        const canRewind = done && !this.over && !this.busy
        const rewindLabel = canRewind ? `${g.label} 선택으로 되돌리기` : `${g.label} 단계`
        return `<button class="step ${cls}${canRewind ? ' rewindable' : ''}" data-i="${g.indices[0]}" aria-label="${rewindLabel}" title="${rewindLabel}" ${canRewind ? '' : 'disabled'}><b>${no}</b> ${g.label}</button>`
      })
      .join('<span class="sep">·</span>')

    const key = this.order()[this.slotIndex]
    // 테이블 목록을 먼저 본다 — 덱에 없는 문장부호·조우 전용 카드가 여기에만 있다.
    // 덱을 먼저 보면 아이템과 보스 공략이 연 임시 선택지가 사라진다.
    const slotWords = this.t.words[key] ?? this.player.deck[key] ?? []
    // 회복은 체력이 가득 차도 숨기지 않는다. 초과 회복 전환과 회복 기반 관용구는
    // 만피에서 시작하는 빌드이므로 드로우 단계가 임의로 전략을 지우면 안 된다.
    const words = slotWords
    const front = this.state.enemies[frontIdx(this.state)]
    const needsQueenAnswer = front?.def.id === 'queenBee'
      && summonCount(front) > 0
      && (key === 'verb' || key === 'verb2')
    this.cardHand.showSlot(
      key,
      words,
      this.sel[key],
      (word) => this.unavailableReason(word),
      needsQueenAnswer ? (word) => word.kind === 'attack' && (!!word.effects?.pierceGuard || word.targetCount === 'all' || (word.targetCount ?? 1) >= 2) : undefined,
    )
    this.castPendingSpiderWeb(key)
    this.renderDetail(null)
    this.renderCombatForecast()
  }

  /** 카드 위를 가리지 않고 좌상단 행동 순서의 각 초상화 호버에 실제 예상값을 붙인다. */
  private renderCombatForecast(): void {
    const selected = this.order().some((key) => !!this.sel[key])
    let sentenceValue = bossText('forecastWaiting')
    let sentenceLabel = bossText('forecastMySentence')
    let sentenceMeta = ''

    if (selected) {
      const intent = compile(this.sel, this.t, this.combatStats(), this.mods())
      const chosenCount = this.order().filter((key) => !!this.sel[key]).length
      const actionReady = effectiveBase(intent) > 0
        || intent.guard > 0
        || intent.heal > 0
        || intent.enemyAttackDown > 0
        || intent.magicShield > 0
      if (!actionReady) {
        sentenceValue = bossText('forecastProgress', { current: chosenCount, total: this.order().length })
      } else {
        const normalMult = resolveMultiplier(intent, this.multCtx(intent), .99).mult
      const healPreview = Math.round(intent.heal * normalMult * intent.castScale * intent.castCount)
      const overhealDamage = Math.round(
        Math.max(0, healPreview - Math.max(0, this.state.playerMax - this.state.playerHp))
          * intent.overhealDamageMultiplier,
      )
      const resourceDamage = Math.round(this.state.guard * intent.guardAttackMultiplier) + overhealDamage
      const damageValue = Math.round(
        (effectiveBase(intent) * normalMult * intent.castScale + resourceDamage) * intent.hitCount * intent.castCount,
      )
      const value = isDamageIntent(intent)
        ? damageValue
        : intent.guard > 0
          ? Math.round(intent.guard * normalMult * intent.castScale * intent.castCount)
          : Math.round(intent.heal * normalMult * intent.castScale * intent.castCount)
      const kindKey = intent.kind === 'attack'
        ? 'forecastAttack'
        : intent.kind === 'guard'
          ? 'forecastGuard'
          : intent.kind === 'heal'
            ? 'forecastHeal'
            : 'forecastDebuff'
      const targetCount = intent.targetCount === 'all'
        ? aliveIdx(this.state).length
        : Math.min(intent.targetCount, aliveIdx(this.state).length)
      sentenceValue = bossText('forecastContextValue', { value })
      const enemyTargets = bossText('forecastTargets', { count: Math.max(1, targetCount) })
      const targetText = intent.targetMode === 'self'
        ? bossText('forecastSelf')
        : intent.targetMode === 'both'
          ? `${enemyTargets} + ${bossText('forecastSelf')}`
          : enemyTargets
        sentenceMeta = `${bossText(kindKey)} · ${targetText}`
      }
    } else if (this.lastResolvedTally) {
      const tally = this.lastResolvedTally
      sentenceLabel = bossText('forecastLastSentence')
      sentenceValue = bossText('forecastExact', {
        base: tally.base,
        mult: tally.mult.toFixed(2),
        total: tally.total,
      })
      sentenceMeta = bossText(tally.kind === 'dmg' ? 'forecastAttack' : tally.kind === 'guard' ? 'forecastGuard' : 'forecastHeal')
    }

    const enemy = this.state.enemies[frontIdx(this.state)]
    let enemyTooltip = ''
    if (enemy) {
      const forecast = enemyAttackForecast(this.state, enemy)
      const timing = forecast.attackTurn > this.state.turn
        ? bossText('turnsLater', { count: forecast.attackTurn - this.state.turn })
        : bossText(enemy.initiativePhase === 'first' ? 'first' : 'second')
      const projected = enemySentenceFor(this.state, enemy)
      const action = projected?.tokens.map((token) => token.text).join(' ') ?? bossText('forecastAttack')
      const defense = forecast.magicShieldBlocked
        ? bossText('forecastMagicBlock')
        : forecast.guardShattered
          ? bossText('forecastGuardShatter')
          : forecast.piercedGuard
            ? bossText('forecastPierce')
            : forecast.dealt[1] === 0 && this.state.guard > 0
              ? bossText('forecastGuardBlock')
              : ''
      enemyTooltip = [
        bossText('forecastEnemy'),
        bossText('forecastEnemyAction', { name: action, timing }),
        `${bossText('forecastTargetPlayer')} · ${bossText('forecastRawDamage', { min: forecast.raw[0], max: forecast.raw[1] })}`,
        bossText('forecastHpAfter', { min: forecast.hpAfter[0], max: forecast.hpAfter[1] }),
        defense,
      ].filter(Boolean).join('\n')
    }

    const playerTooltip = [sentenceLabel, sentenceValue, sentenceMeta].filter(Boolean).join('\n')
    const playerOrder = this.root.querySelector<HTMLElement>('.action-order-item.player')
    const enemyOrder = this.root.querySelector<HTMLElement>('.action-order-item.enemy:not(.timing-waiting):not(.timing-summary)')
    if (playerOrder) playerOrder.dataset.tooltip = playerTooltip
    if (enemyOrder && enemyTooltip) enemyOrder.dataset.tooltip = enemyTooltip
  }

  /** 장로거미는 문장마다 슬롯을 순환 지정한다. 해당 슬롯이 열릴 때 카드 한 장만 묶는다. */
  private beginSpiderTurn() {
    const web = spiderWebAtTurnStart(this.state)
    if (!web) return
    const maxSealed = this.state.enemies[web.idx].def.webPattern?.maxSealedCards ?? 0
    const slotKey = spiderSealSlotForTurn(this.order(), this.state.turn)
    if (!slotKey) return
    this.pendingSpiderSeal = {
      enemyIdx: web.idx,
      maxSealed,
      slotKey,
    }
  }

  private castPendingSpiderWeb(slotKey: string) {
    const pending = this.pendingSpiderSeal
    if (!pending || pending.slotKey !== slotKey) return
    // 적이 아직 걸어 들어오는 중이면(보스는 그 앞에 암전까지 있다) 쏘지 않는다.
    // 화면에 없는 거미가 거미줄만 날리면 어디서 날아온 건지 읽을 수가 없다.
    if (!this.spiderCastReady) return
    this.pendingSpiderSeal = null
    const sealed = this.cardHand.sealRandom(pending.maxSealed)
    if (sealed) this.playSpiderWebProjectile(pending.enemyIdx, sealed.instanceId)
    this.log(
      sealed
        ? `장로거미가 ${this.t.template.slots.find((slot) => slot.key === slotKey)?.label ?? slotKey} 「${sealed.word.text}」 카드를 봉인했다. · 봉인 ${this.cardHand.sealedCount}/${pending.maxSealed}`
        : `선택지를 남기기 위해 이번 거미줄은 빗나갔다. · 봉인 ${this.cardHand.sealedCount}/${pending.maxSealed}`,
    )
    this.showBossSentenceEvent(sealed
      ? bossText('sealCard', { word: sealed.word.text })
      : bossText('webMiss'))
    if (this.cardHand.sealedCount >= pending.maxSealed) this.showBossTokenHint(TOKEN_BOSS_HINTS.elderSpiderWebReady)
    this.renderActors()
  }

  /** 장로거미에서 봉인 카드까지 실선과 거미줄 스프라이트가 함께 날아간다. */
  private playSpiderWebProjectile(enemyIdx: number, instanceId: string) {
    const scene = this.q<HTMLElement>('.scene.battle')
    const source = this.root.querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"] .model-shell`)
    const target = this.root.querySelector<HTMLElement>(`#card-hand [data-instance-id="${instanceId}"]`)
    if (!source || !target) {
      this.cardHand.playSealImpact(instanceId)
      return
    }
    const sceneRect = scene.getBoundingClientRect()
    const sourceRect = source.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const scaleX = sceneRect.width / scene.offsetWidth || 1
    const scaleY = sceneRect.height / scene.offsetHeight || 1
    const fromX = (sourceRect.left + sourceRect.width * .5 - sceneRect.left) / scaleX
    const fromY = (sourceRect.top + sourceRect.height * .42 - sceneRect.top) / scaleY
    const toX = (targetRect.left + targetRect.width * .5 - sceneRect.left) / scaleX
    const toY = (targetRect.top + targetRect.height * .46 - sceneRect.top) / scaleY
    const dx = toX - fromX
    const dy = toY - fromY
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI

    const line = document.createElement('i')
    line.className = 'spider-web-shot-line'
    line.style.left = `${fromX}px`
    line.style.top = `${fromY}px`
    line.style.width = `${distance}px`
    line.style.setProperty('--web-angle', `${angle}deg`)

    const projectile = document.createElement('img')
    projectile.className = 'spider-web-projectile'
    projectile.src = SPRITES.effect_card_web_seal
    projectile.alt = ''
    projectile.style.left = `${fromX}px`
    projectile.style.top = `${fromY}px`
    scene.append(line, projectile)
    projectile.animate([
      { opacity: .15, transform: 'translate(-50%, -50%) scale(.08) rotate(-18deg)' },
      { opacity: .9, offset: .38, transform: `translate(calc(-50% + ${dx * .46}px), calc(-50% + ${dy * .46}px)) scale(.26) rotate(8deg)` },
      { opacity: 1, transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.58) rotate(0deg)` },
    ], { duration: 520, easing: 'cubic-bezier(.2,.72,.2,1)', fill: 'forwards' })
    this.cardHand.playSealImpact(instanceId, 420)
    this.timers.push(window.setTimeout(() => {
      line.remove()
      projectile.remove()
    }, 620))
  }

  // ── 우측 정보 패널 ──
  // 이 단어의 고유 효과(작게) + 이 단어를 문장에 넣었을 때의 "최종 적용 수치"를
  // 단계별로 보여준다: 이 단어가 더하는 값(적용) + 현재 문장 총합(최종).
  private renderDetail(word: Word | null) {
    const detail = this.q('#detail')
    const key = this.order()[this.slotIndex]
    const w = word ?? this.sel[key] ?? null
    if (!w) {
      this.clearDetailDock()
      return
    }
    // 슬롯 키로 잡는다 — 겹동사(verb2)처럼 한 단어가 여러 칸에 들어갈 수 있어서
    // w.slot을 쓰면 지금 고르는 칸이 아니라 원래 칸을 가리킨다.
    const slotLabel = this.t.template.slots.find((s) => s.key === key)?.label ?? ''
    const mood = this.moodOf(w)
    const emotion = emotionOrNeutral(w.emotion)
    const values = this.wordOwnValues(w)
    const sealed = this.cardHand.isSealed(w)
    // 현재 문장에 이 단어를 끼우면 맥락이 어긋나는지 미리 경고(실행 전 학습).
    const trial: Selection = { ...this.sel, [key]: w }
    const intent = compile(trial, this.t, this.combatStats(), this.mods())
    const warn = intent.penalties.length
      ? `<div class="wd-warn">⚠ ${intent.penalties[0]} · 위력 ×${intent.coherence.toFixed(2)}</div>`
      : ''

    // 일러스트가 있으면 패널 전체에 풀로 깔고, 글은 아래쪽 스크림 위에 얹는다.
    const art = w.art ? SKILL_ART[w.art] : undefined
    detail.className = `info-dock glass word-detail mood-${mood} emotion-${emotion}${sealed ? ' sealed' : ''}`
    detail.innerHTML = `
      ${art ? `<div class="wd-art"><img src="${art}" alt="" /><span class="wd-art-tint" aria-hidden="true"></span></div>` : ''}
      <div class="wd-scrim" aria-hidden="true"></div>
      <div class="wd-body">
        <div class="wd-title-row">${emotionIconBadge(emotion, 'wd-emotion')}<div class="wd-name">${w.text}</div></div>
        <div class="wd-grade">✦ ${slotLabel} · ${RARITY_LABEL[w.rarity ?? 'common']}${(w.level ?? 1) > 1 ? ` · Lv.${w.level}` : ''}</div>
        ${this.projectionHtml(w, key)}
        <div class="wd-values"><div class="v flat">잉크 ${wordInkCost(w)}</div>${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
        ${comboHintHtml(w, { combos: this.t.combos, words: this.t.words }, intent.combos)}
        ${warn}
      </div>
      ${sealed ? `<span class="card-web-overlay" aria-hidden="true" style="--card-web-seal-image:url('${SPRITES.effect_card_web_seal}')"><i></i><b>거미줄 봉인</b><small>사용 불가</small></span>` : ''}`
  }

  private multCtx(intent: Intent) {
    const stats = this.combatStats()
    return { luck: stats.luck, statBias: statBiasOf(intent, stats) }
  }

  /** The boost changes only outgoing attack-stat cards, never saved stats or heal/guard values. */
  private combatStats() {
    if (this.debugAttackMultiplier === 1) return this.player.stats
    return { ...this.player.stats, atk: this.player.stats.atk * this.debugAttackMultiplier }
  }

  /** 보유 패시브 → 컴파일러 수정자. 바베큐는 이번 전투 처치 수를 먹는다. */
  private mods(): CompileMods {
    return modsFor(this.player, this.killsThisBattle)
  }

  /**
   * 신데렐라의 황금사과 — 대성공에 실패하면 한 번 더 굴린다.
   * 낮은 굴림일수록 대성공이므로 두 번 굴려 낮은 쪽을 쓰면 "재시도"와 같다.
   */
  private rouletteRoll(): number {
    const a = Math.random()
    if (!hasPassive(this.player, 'retry')) return a
    return Math.min(a, Math.random())
  }

  /** 피노키오의 미아핑 — 맥락 수만큼 "근데?"를 굴린다. */
  private doubtRolls(intent: Intent): number[] {
    return Array.from({ length: intent.doubtCount }, () => Math.random())
  }

  // 이 문장(현재 선택 + 이 단어)이 발동될 때의 미리보기 수치 — 운은 반영, 룰렛은 보통(normal) 가정.
  // 공/방/회 모두 하나의 배율을 공유한다(execute와 동일 규칙, 룰렛만 미확정).
  // 스탯은 이미 동사의 깡수치로 들어가 있으니 여기서 또 더하지 않는다.
  private projectFinal(sel: Selection): { dmg: number; heal: number; guard: number; self: number; multiplier: number } {
    const intent = compile(sel, this.t, this.combatStats(), this.mods())
    const m = resolveMultiplier(intent, this.multCtx(intent), 0.5).mult
    const castPower = intent.castCount * intent.castScale
    const guard = Math.round(intent.guard * m * castPower)
    const heal = Math.round(intent.heal * m * castPower)
    const missingHp = Math.max(0, this.state.playerMax - this.state.playerHp)
    const overhealDamage = Math.round(Math.max(0, heal - missingHp) * intent.overhealDamageMultiplier)
    const resourceDamage = Math.round(this.state.guard * intent.guardAttackMultiplier) + overhealDamage
    const dmg = Math.round((effectiveBase(intent) * m * intent.castScale + resourceDamage) * intent.hitCount * intent.castCount)
    if (intent.targetMode === 'both') return { dmg, heal, guard, self: intent.recoil + Math.round(dmg * 0.4), multiplier: m }
    return { dmg, heal, guard, self: intent.recoil, multiplier: m }
  }

  // "적용(이 단어가 더하는 값) · 최종(현재 문장 총합)" 프로젝션 블록.
  // slotKey는 지금 고르고 있는 칸 — 겹동사면 verb2일 수 있다.
  private projectionHtml(w: Word, slotKey: string): string {
    const base: Selection = { ...this.sel }
    delete base[slotKey]
    const now = this.projectFinal({ ...this.sel, [slotKey]: w })
    const prev = this.projectFinal(base)
    const metrics: { key: 'dmg' | 'heal' | 'guard' | 'self'; label: string }[] = [
      { key: 'dmg', label: '피해' },
      { key: 'heal', label: '회복' },
      { key: 'guard', label: '방어' },
      { key: 'self', label: '자해' },
    ]
    const rows = metrics
      .filter((m) => now[m.key] > 0 || (m.key === 'dmg' && prev.dmg > 0))
      .map((m) => {
        const delta = now[m.key] - prev[m.key]
        const sign = delta > 0 ? '+' : delta < 0 ? '' : '±'
        const dcls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
        return `<div class="pj-row ${m.key}">
          <span class="pj-l">${m.label}</span>
          <span class="pj-d ${dcls}">${sign}${delta}</span>
          <span class="pj-f">${now[m.key]}</span>
        </div>`
      })
      .join('')
    if (!rows) return '' // 순수 보정 단어(회피/지연 등)는 프로젝션 없이 고유 효과만
    const multLine = now.multiplier !== 1 ? `<span class="pj-mult">위력 ×${now.multiplier.toFixed(2)}</span>` : ''
    return `<div class="wd-proj">
      <div class="pj-head"><span>이 단어 적용</span><span>문장 최종</span>${multLine}</div>
      <div class="pj-rows">${rows}</div>
    </div>`
  }

  // 단어 하나의 고유 수치 — 누적하지 않는다. 표기 규칙은 체인·보상과 공용이다.
  private wordOwnValues(w: Word): { text: string; cls: string }[] {
    return wordValueLines(w, this.combatStats())
  }

  // ── 좌상단 아이콘 스탯 바 ──
  private renderStats() {
    this.q('#stats').innerHTML =
      `<span class="hud-player-name" aria-label="주인공 이름 ${t('playerName', '프롬')}">${t('playerName', '프롬')}</span>` +
      STAT_META.map(
        (m) => {
          const value = m.key === 'hp'
            ? `${Math.max(0, this.state.playerHp)}/${this.state.playerMax}${this.state.guard ? ` ◈${this.state.guard}` : ''}${this.state.playerMagicShield ? ' ✦1' : ''}`
            : String(this.player.stats[m.key])
          return `<div class="hud-stat" data-stat-key="${m.key}" role="img" tabindex="0" aria-label="${m.label} ${value}. ${m.desc}" data-tooltip="${tip(`${m.label} ${value}`, m.desc)}">
        <span class="si">${icon(m.icon)}</span>
        <b>${value}</b>
      </div>`
        },
      ).join('')
  }

  // ── 보유 아이템 — 가방을 열지 않고 전장 좌측에 유물 아이콘으로 상시 표시한다. ──
  private renderRelics() {
    const strip = this.q('#relic-strip')
    if (!this.player.items.length) {
      strip.hidden = true
      strip.innerHTML = ''
      return
    }
    strip.hidden = false
    // 이름 / 고유효과 / 감탄사로 얻은 스탯 — 조립은 core/player.ts가 한다.
    const tooltipFor = itemTooltipText
    strip.innerHTML = `
      <div class="relic-strip-head"><span>보유</span><b>아이템</b></div>
      <div class="relic-icons">
        ${this.player.items.map((item) => `<span class="relic-icon rarity-${ownedItemRarity(item)}" role="img" tabindex="0" aria-label="${tooltipFor(item)}" data-tooltip="${tooltipFor(item)}">${itemArt(item.art)}</span>`).join('')}
      </div>`
  }

  private openSettings() {
    openSettingsModal(this.root, { onResetAll: () => this.onResetAll?.() })
  }

  // ── 단어장(전체 덱) 오버레이 ──
  private deckPreviewHtml(w: Word): string {
    const emotion = emotionOrNeutral(w.emotion)
    const rarity = w.rarity ?? 'common'
    // 앞면은 손패와 같은 함수로 그린다 — 도감에서 본 카드가 전투에서 다르게 읽히면 안 된다.
    return `<div class="deck-hover-card mood-${wordMood(w)} emotion-${emotion} rarity-${rarity}" aria-hidden="true">${wordCardFrontHtml(w)}</div>`
  }

  // ── 도감 — 현재 단어장과 카드·적·아이템 기록을 왼쪽 인덱스로 넘겨 본다. ──
  /**
   * 유대 기록 — 토큰이 이번까지 알게 된 것을 한 장의 종이로 편다.
   *
   * 여기 뜨는 숫자는 전부 **실제로 세어 둔 것**이다. 유대는 함께한 순간의 합이고,
   * 성향은 런이 끝날 때마다 조금씩 움직인 값이며, 취향은 완성한 문장을 그대로 센 것이다.
   * 지어낸 수치를 예쁘게 보여 주지 않는다 — 그러면 이 창은 장식이 된다.
   */
  private openBondRecord() {
    const host = this.q('#overlay')
    const mind = this.token?.mindState ?? sharedTokenMind()
    const style = sharedTokenPlaystyle().read()
    const snapshot = mind.snapshot()
    const bondPercent = Math.round(mind.bond * 100)
    const TIER_TEXT: Record<string, [string, string]> = {
      new: ['막 만난 사이', '아직 서로를 알아 가는 중이다.'],
      familiar: ['익숙해진 사이', '지난 이야기를 떠올려 말하기 시작한다.'],
      close: ['가까운 사이', '곁에 더 오래 머물고, 네 쪽을 자주 돌아본다.'],
      inseparable: ['떨어질 수 없는 사이', '어디로 가든 따라온다.'],
    }
    const [tierName, tierNote] = TIER_TEXT[mind.tier]
    // 학습 결과를 그대로 편다. 배우고 있다는 말은 보여 줄 수 없으면 주장일 뿐이다.
    const READING_TEXT: Record<string, string> = {
      orbit: '곁을 지킨다', wander: '무대를 가로지른다', inspect: '무언가를 들여다본다', peer: '네 쪽을 바라본다',
    }
    const reading = this.token?.distanceReading() ?? []
    const face = mind.bond >= 0.6 ? TOKEN_FACES.crown : mind.bond >= 0.25 ? TOKEN_FACES.smile : TOKEN_FACES.neutral

    /** 0~1 값을 잉크가 스며든 눈금으로. 숫자는 곁에 그대로 적어 근거를 감추지 않는다. */
    const meter = (label: string, value: number, note: string) => `
      <div class="bond-meter">
        <div class="bond-meter-head"><b>${label}</b><span>${note}</span></div>
        <div class="bond-meter-track"><i style="width:${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%"></i></div>
      </div>`

    const traitNote = (value: number) =>
      value >= 0.62 ? '뚜렷하다' : value <= 0.38 ? '옅다' : '보통'

    const ARCHETYPE_TEXT: Record<string, [string, string]> = {
      striker: ['때리는 사람', '문장의 끝을 공격으로 맺는 쪽을 좋아한다.'],
      keeper: ['막는 사람', '맞기 전에 먼저 손을 쓴다.'],
      mender: ['돌보는 사람', '스스로를 추스르는 문장을 자주 쓴다.'],
      balanced: ['고르게 쓰는 사람', '한쪽으로 치우치지 않는다.'],
    }
    const [archetypeName, archetypeNote] = ARCHETYPE_TEXT[style.archetype]

    const actionTotal = style.actions.attack + style.actions.guard + style.actions.heal
    const actionRow = (label: string, count: number, tone: string) => `
      <div class="bond-action ${tone}">
        <b>${label}</b>
        <div class="bond-action-track"><i style="width:${actionTotal ? ((count / actionTotal) * 100).toFixed(1) : 0}%"></i></div>
        <span>${count}</span>
      </div>`

    // 함께한 기록 — 최근이 위로 온다. 아직 한 판도 안 끝냈으면 그렇게 적는다.
    const runsBody = snapshot.runs.length
      ? snapshot.runs.map((run, index) => `
          <li class="bond-run ${run.outcome}">
            <span class="bond-run-no">${String(snapshot.runsTogether - index).padStart(2, '0')}</span>
            <b>${run.day}층</b>
            <em>${run.outcome === 'clear' ? '끝까지 썼다' : run.cause ? `${run.cause}에게 멈췄다` : '멈췄다'}</em>
          </li>`).join('')
      : '<li class="bond-run empty">아직 함께 끝낸 이야기가 없다.</li>'

    // 취향은 문장을 충분히 본 다음에만 단정한다.
    const styleBody = style.sentences === 0
      ? '<p class="bond-empty">아직 지켜본 문장이 없다. 몇 줄 써 보면 토큰이 알아차린다.</p>'
      : `
        <div class="bond-verdict${style.tentative ? ' tentative' : ''}">
          <small>${style.tentative ? '아직 지켜보는 중' : '토큰이 내린 결론'}</small>
          <b>${archetypeName}</b>
          <span>${archetypeNote}</span>
        </div>
        <div class="bond-actions" aria-label="문장 갈래">
          ${actionRow('공격', style.actions.attack, 'atk')}
          ${actionRow('방어', style.actions.guard, 'def')}
          ${actionRow('회복', style.actions.heal, 'heal')}
        </div>
        <dl class="bond-facts">
          <div><dt>쓴 문장</dt><dd>${style.sentences}줄</dd></div>
          <div><dt>즐겨 쓰는 감정</dt><dd>${style.favoriteEmotion ? `${EMOTION_LABEL[style.favoriteEmotion]} · ${Math.round(style.favoriteEmotionShare * 100)}%` : '아직 없다'}</dd></div>
          <div><dt>관용구 성사</dt><dd>${Math.round(style.comboRate * 100)}%</dd></div>
          <div><dt>여백 밖 집필</dt><dd>${Math.round(style.boldness * 100)}%</dd></div>
          <div><dt>고르는 속도</dt><dd>${style.averageDecisionMs > 0 ? `${(style.averageDecisionMs / 1000).toFixed(1)}초` : '아직 모른다'}</dd></div>
          <div><dt>망설임 없이</dt><dd>${Math.round(style.decisiveness * 100)}%</dd></div>
        </dl>`

    host.innerHTML = `
      <div class="ov-backdrop"></div>
      <section class="ov-panel glass bond-panel" aria-label="토큰과의 유대">
        <div class="ov-head">
          <div class="ov-title">${icon('bond')} 토큰과의 유대 <span class="codex-current-count">함께한 이야기 ${snapshot.runsTogether}</span></div>
          <button class="ov-close" id="ov-x" type="button" aria-label="닫기">${icon('close')}</button>
        </div>
        <div class="bond-layout">
          <aside class="bond-portrait">
            <div class="bond-face"><img src="${face}" alt="토큰"></div>
            <div class="bond-gauge" role="img" aria-label="유대 ${bondPercent}%">
              <div class="bond-gauge-track"><i style="height:${bondPercent}%"></i></div>
              <b>${bondPercent}<small>%</small></b>
              <span>유대</span>
            </div>
            <div class="bond-tier"><b>${tierName}</b><span>${tierNote}</span></div>
            <p class="bond-portrait-note">조언을 끝까지 들려주거나 위기를 함께 넘길 때마다 자란다. 줄어들지는 않는다.</p>
          </aside>
          <div class="bond-sheets">
            <section class="bond-sheet">
              <h3>토큰의 성격</h3>
              <p class="bond-sheet-note">이야기가 끝날 때마다 아주 조금씩 움직인다. 무너진 런은 조심스럽게, 살아남은 런은 대담하게 만든다.</p>
              ${meter('호기심', snapshot.traits.curiosity, traitNote(snapshot.traits.curiosity))}
              ${meter('조심성', snapshot.traits.caution, traitNote(snapshot.traits.caution))}
              ${meter('장난기', snapshot.traits.playfulness, traitNote(snapshot.traits.playfulness))}
            </section>
            <section class="bond-sheet">
              <h3>너에 대해 알게 된 것</h3>
              ${styleBody}
            </section>
            <section class="bond-sheet">
              <h3>거리감</h3>
              <p class="bond-sheet-note">토큰이 지금 상황에서 어떻게 있을지 고르는 비율이다. 네가 다칠 때 곁에 있었는지, 고르는 동안 손패를 가렸는지를 보고 조금씩 옮겨 간다.</p>
              ${reading.length
                ? `<div class="bond-reading">${reading
                    .map(({ action, probability }) => `
                      <div class="bond-read">
                        <b>${READING_TEXT[action]}</b>
                        <div class="bond-read-track"><i style="width:${(probability * 100).toFixed(1)}%"></i></div>
                        <span>${Math.round(probability * 100)}%</span>
                      </div>`).join('')}</div>`
                : '<p class="bond-empty">전투 중에만 잴 수 있다.</p>'}
            </section>
            <section class="bond-sheet bond-sheet-runs">
              <h3>함께한 이야기</h3>
              <ul class="bond-runs">${runsBody}</ul>
            </section>
          </div>
        </div>
      </section>`
    host.classList.add('open')
    const close = () => this.closeOverlay()
    host.querySelector('#ov-x')!.addEventListener('click', close)
    host.querySelector('.ov-backdrop')!.addEventListener('click', close)
    GameAudio.play('paper')
  }

  private async showComboDiscovery(combos: Combo[]): Promise<void> {
    const note = document.createElement('div')
    note.className = 'combo-discovery-note'
    note.setAttribute('role', 'status')
    note.setAttribute('aria-live', 'polite')
    note.innerHTML = `
      <span>${comboCodexText('discovery')}</span>
      <b>「${combos.map((combo) => combo.name).join(' · ')}」</b>
      <small>${comboCodexText('recorded')} · ${comboCodexText('found')} ${this.t.combos.filter((combo) => this.discoveredCombos.has(combo.id)).length} / ${this.t.combos.length}</small>`
    this.root.append(note)
    GameAudio.play('paper')
    await sleep(900)
    note.classList.add('leaving')
    await sleep(220)
    note.remove()
  }

  // ── 도감 — 현재 단어장과 카드·관용구·적·아이템 기록을 왼쪽 인덱스로 넘겨 본다. ──
  private openCodex() {
    const host = this.q('#overlay')
    const slots = this.t.template.slots
    const ownedWords = Object.values(this.player.deck).flat()
    // 문장부호는 덱에 들어오지 않는다 — 칸을 여는 아이템(올림프의 당근)을 얻으면 기록된다.
    // 보상으로 얻는 무럭무럭은 실제 덱 카드이므로 다른 단어와 같은 방식으로 기록한다.
    const punctOwned = hasPassive(this.player, 'punct')
    const owned = new Set([
      ...Object.values(this.player.deck).flat().map((word) => word.id),
      ...(punctOwned ? PUNCT_WORDS.map((word) => word.id) : []),
    ])
    const catalog = [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS, ...PUNCT_WORDS]
      .filter((word, index, all) => all.findIndex((entry) => entry.id === word.id) === index)
    const found = catalog.filter((word) => owned.has(word.id)).length
    const comboCatalog = this.t.combos
    const foundCombos = comboCatalog.filter((combo) => this.discoveredCombos.has(combo.id)).length
    const slotLabel: Record<string, string> = { subj: '주어', adv: '수식', obj: '목적어', verb: '동사', end: '어미', punct: '문장부호' }
    const groups = [...new Set(catalog.map((word) => word.slot))]
    const encountered = new Set(this.state.enemies.map((enemy) => enemy.def.id))
    const enemyCatalog = Object.values(ENEMIES)
    const foundEnemies = enemyCatalog.filter((enemy) => encountered.has(enemy.id)).length
    const ownedItems = new Set(this.player.items.map((item) => item.id))
    const itemCatalog = Object.values(ALL_ITEMS)
    const foundItems = itemCatalog.filter((item) => ownedItems.has(item.id)).length

    const ownedContent = `<div class="codex-page codex-owned-page" data-codex-page="owned">
      <p class="codex-intro">이번 런에서 모은 단어다. 단어를 고르면 옆에 카드 상세가 펼쳐진다.</p>
      <div class="deck-cols">
        ${slots.map((slot, index) => `<section class="deck-col">
          <div class="deck-col-h"><b>${index + 1}</b> ${slot.label}</div>
          ${(this.player.deck[slot.key] ?? []).map((word) => `<div class="deck-word codex-selectable mood-${this.moodOf(word)}" data-detail-kind="word" data-slot="${slot.key}" data-word="${word.id}">
            <span class="dw">${word.text}</span><span class="dn">${wordNoteText(word)}</span>
          </div>`).join('')}
        </section>`).join('')}
      </div>
    </div>`

    const cardContent = `<div class="codex-groups" data-codex-page="card" hidden>
      ${groups.map((slot) => `<section class="codex-group">
        <h3>${slotLabel[slot] ?? slot}</h3>
        <div class="codex-grid">
          ${catalog.filter((word) => word.slot === slot).map((word) => {
            const discovered = owned.has(word.id)
            return `<article class="codex-entry rarity-${word.rarity ?? 'common'}${discovered ? ' discovered codex-selectable' : ' missing'}"${discovered ? ` data-detail-kind="word" data-word="${word.id}"` : ''}>
              <span class="codex-mark">${discovered ? '✦' : '?'}</span>
              <div><b>${discovered ? word.text : '미발견 카드'}</b><span>${discovered ? wordNoteText(word) : '보상에서 만나면 기록된다.'}</span></div>
            </article>`
          }).join('')}
        </div>
      </section>`).join('')}
    </div>`

    const comboContent = `<div class="codex-page codex-combo-page" data-codex-page="combo" hidden>
      <p class="codex-intro">${comboCodexText('intro')}</p>
      <div class="codex-grid codex-combo-grid">
        ${comboCatalog.map((combo) => {
          const discovered = this.discoveredCombos.has(combo.id)
          return `<article class="codex-entry combo-entry${discovered ? ' discovered' : ' missing'}">
            <span class="codex-mark">${discovered ? '✦' : '?'}</span>
            <div><b>${discovered ? `「${combo.name}」` : comboCodexText('unknown')}</b><span>${discovered ? `${currentLocale === 'ko' && combo.flavor ? combo.flavor : comboCodexText('knownHint')} · ×${combo.mult.toFixed(2)}` : comboCodexText('unknownHint')}</span></div>
          </article>`
        }).join('')}
      </div>
    </div>`

    const enemyContent = `<div class="codex-page" data-codex-page="enemy" hidden>
      <p class="codex-intro">이번 런에서 직접 마주친 벌레만 그림일기에 기록됩니다.</p>
      <div class="codex-portrait-grid">
        ${enemyCatalog.map((enemy) => {
          const discovered = encountered.has(enemy.id)
          const sprite = SPRITES[enemy.sprite]
          return `<article class="codex-portrait-entry${discovered ? ' discovered codex-selectable' : ' missing'}"${discovered ? ` data-detail-kind="enemy" data-enemy="${enemy.id}"` : ''}>
            <div class="codex-portrait-art">${discovered && sprite ? `<img src="${sprite}" alt="">` : '<span>?</span>'}</div>
            <div><b>${discovered ? enemy.name : '미발견 벌레'}</b><span>${discovered ? enemy.note : '전장에서 만나면 기록된다.'}</span></div>
            <dl><div><dt>체력</dt><dd>${discovered ? enemy.hp : '—'}</dd></div><div><dt>공격</dt><dd>${discovered ? enemy.atk : '—'}</dd></div><div><dt>행동</dt><dd>${discovered ? `${enemy.every}턴` : '—'}</dd></div></dl>
          </article>`
        }).join('')}
      </div>
    </div>`

    const itemContent = `<div class="codex-page" data-codex-page="item" hidden>
      <p class="codex-intro">획득해 감탄 문장을 붙인 소품만 온전한 모습으로 남습니다.</p>
      <div class="codex-item-grid">
        ${itemCatalog.map((item) => {
          const discovered = ownedItems.has(item.id)
          return `<article class="codex-item-entry rarity-${item.rarity}${discovered ? ' discovered codex-selectable' : ' missing'}"${discovered ? ` data-detail-kind="item" data-item="${item.id}"` : ''}>
            <div class="codex-item-art">${discovered ? itemArt(item.art) : '<span>?</span>'}</div>
            <div><b>${discovered ? item.name : '미발견 아이템'}</b><em>${discovered ? RARITY_LABEL[item.rarity] : '기록 없음'}</em><span>${discovered ? item.flavor : '보상에서 만나면 기록된다.'}</span></div>
          </article>`
        }).join('')}
      </div>
    </div>`

    host.innerHTML = `
      <div class="ov-backdrop"></div>
      <section class="ov-panel glass codex-panel" aria-label="도감">
        <div class="ov-head">
          <div class="ov-title">${icon('collection')} 그림일기 도감 <span class="codex-current-count">내 단어 ${ownedWords.length}</span></div>
          <button class="ov-close" id="ov-x" type="button" aria-label="닫기">${icon('close')}</button>
        </div>
        <div class="codex-layout">
          <nav class="codex-index" aria-label="도감 분류">
            <button type="button" class="on" data-codex-tab="owned" data-count="내 단어 ${ownedWords.length}"><span>01</span><b>현재 내 단어</b><small>${ownedWords.length}장</small></button>
            <button type="button" data-codex-tab="card" data-count="카드 ${found} / ${catalog.length}"><span>02</span><b>카드 도감</b><small>${found} / ${catalog.length}</small></button>
            <button type="button" data-codex-tab="combo" data-count="${comboCodexText('tab')} ${foundCombos} / ${comboCatalog.length}"><span>03</span><b>${comboCodexText('tab')}</b><small>${foundCombos} / ${comboCatalog.length}</small></button>
            <button type="button" data-codex-tab="enemy" data-count="적 ${foundEnemies} / ${enemyCatalog.length}"><span>04</span><b>적 도감</b><small>${foundEnemies} / ${enemyCatalog.length}</small></button>
            <button type="button" data-codex-tab="item" data-count="아이템 ${foundItems} / ${itemCatalog.length}"><span>05</span><b>아이템 도감</b><small>${foundItems} / ${itemCatalog.length}</small></button>
          </nav>
          <div class="codex-content">
            ${ownedContent}
            ${cardContent}
            ${comboContent}
            ${enemyContent}
            ${itemContent}
          </div>
          <aside class="codex-detail" id="codex-detail" aria-live="polite"></aside>
        </div>
      </section>`
    host.classList.add('open')
    const close = () => this.closeOverlay()
    host.querySelector('#ov-x')!.addEventListener('click', close)
    host.querySelector('.ov-backdrop')!.addEventListener('click', close)
    const count = host.querySelector<HTMLElement>('.codex-current-count')!
    const panel = host.querySelector<HTMLElement>('.codex-panel')!
    const detail = host.querySelector<HTMLElement>('#codex-detail')!
    let selected: HTMLElement | null = null

    // 상세를 닫으면 창을 원래 폭으로 되돌린다.
    const closeDetail = () => {
      panel.classList.remove('detail-open')
      selected?.classList.remove('selected')
      selected = null
      detail.innerHTML = ''
    }
    // 항목을 고르면 창이 좌우로 늘어나며 옆에 상세 카드가 열린다(같은 항목을 다시 누르면 닫힘).
    const openDetail = (el: HTMLElement, body: string) => {
      if (selected === el) { closeDetail(); return }
      selected?.classList.remove('selected')
      selected = el
      el.classList.add('selected')
      detail.innerHTML = `<button class="cdx-detail-close" type="button" aria-label="상세 닫기">${icon('close')}</button>${body}`
      panel.classList.add('detail-open')
      detail.querySelector('.cdx-detail-close')!.addEventListener('click', closeDetail)
      GameAudio.play('paper')
    }

    host.querySelectorAll<HTMLButtonElement>('[data-codex-tab]').forEach((button) => {
      button.addEventListener('click', () => {
        const tab = button.dataset.codexTab!
        host.querySelectorAll('[data-codex-tab]').forEach((entry) => entry.classList.toggle('on', entry === button))
        host.querySelectorAll<HTMLElement>('[data-codex-page]').forEach((page) => { page.hidden = page.dataset.codexPage !== tab })
        count.textContent = button.dataset.count ?? ''
        closeDetail() // 분류를 바꾸면 상세는 접는다.
      })
    })

    host.querySelectorAll<HTMLElement>('.codex-selectable').forEach((el) => {
      el.addEventListener('click', () => {
        const kind = el.dataset.detailKind
        if (kind === 'word') {
          const id = el.dataset.word!
          const word = (this.player.deck[el.dataset.slot ?? ''] ?? []).find((w) => w.id === id)
            ?? catalog.find((w) => w.id === id)
          if (word) openDetail(el, this.codexWordDetailHtml(word, el.dataset.slot ?? word.slot, slotLabel))
        } else if (kind === 'enemy') {
          const enemy = enemyCatalog.find((e) => e.id === el.dataset.enemy)
          if (enemy) openDetail(el, this.codexEnemyDetailHtml(enemy))
        } else if (kind === 'item') {
          const item = itemCatalog.find((i) => i.id === el.dataset.item)
          if (item) openDetail(el, this.codexItemDetailHtml(item))
        }
      })
    })
  }

  // ── 도감 상세 카드 — 전투 중 호버 상세와 같은 표기(wd-name·character-dock·id-stats)를 재활용한다. ──
  private codexWordDetailHtml(w: Word, slotKey: string, slotLabel: Record<string, string>): string {
    const values = this.wordOwnValues(w)
    const rarity = w.rarity ?? 'common'
    const level = w.level ?? 1
    const label = slotLabel[slotKey] ?? slotKey
    return `<div class="cdx-detail-card cdx-word mood-${this.moodOf(w)} rarity-${rarity}">
      <div class="cdx-detail-kicker">WORD CARD</div>
      <div class="cdx-cardstage">${this.deckPreviewHtml(w)}</div>
      <div class="cdx-detail-copy">
        <div class="wd-title-row">${emotionIconBadge(emotionOrNeutral(w.emotion), 'wd-emotion')}<div class="wd-name">${w.text}</div></div>
        <div class="wd-grade">✦ ${label} · ${RARITY_LABEL[rarity]}${level > 1 ? ` · Lv.${level}` : ''}</div>
        ${values.length ? `<div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>` : ''}
        <p class="wd-flavor">${wordNoteText(w)}</p>
      </div>
    </div>`
  }

  private codexEnemyDetailHtml(enemy: (typeof ENEMIES)[keyof typeof ENEMIES]): string {
    const sprite = SPRITES[enemy.sprite]
    return `<article class="cdx-detail-card cdx-character" aria-label="${enemy.name} 상세 정보">
      <div class="character-portrait">${sprite ? `<img src="${sprite}" alt="${enemy.name}">` : '<span>?</span>'}</div>
      <div class="character-copy">
        <div class="character-kicker">ENEMY DETAIL</div>
        <h2>${enemy.name}</h2>
        <div class="character-stats">
          <div><span>체력</span><b>${enemy.hp}</b></div>
          <div><span>공격</span><b>${enemy.atk}</b></div>
          <div><span>행동 주기</span><b>${enemy.every}턴</b></div>
        </div>
        <div class="character-note">${enemy.note}</div>
      </div>
    </article>`
  }

  private codexItemDetailHtml(item: (typeof ALL_ITEMS)[keyof typeof ALL_ITEMS]): string {
    // 보유품은 기본 스탯과 감탄 문장 보너스가 합쳐진 확정 수치를 보여 준다.
    // 도감은 보유한 아이템만 상세를 여니, 그 판에서 정말 오른 값을 그대로 적는다.
    const owned = this.player.items.find((entry) => entry.id === item.id)
    const stats = owned?.stats ?? item.base
    const rows = ITEM_STAT_ORDER.filter((k) => stats[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${stats[k]}</span></div>`)
      .join('')
    const p = item.passive ? PASSIVES[item.passive] : null
    const passive = p ? `<div class="id-passive"><b>${p.name}</b><span>${p.desc}</span></div>` : ''
    return `<div class="cdx-detail-card cdx-item${p ? ' is-passive' : ''}">
      <div class="cdx-detail-kicker">ITEM DETAIL</div>
      <div class="id-art">${itemArt(item.art)}</div>
      <div class="cdx-detail-copy">
        <div class="wd-name">${item.name}</div>
        <div class="wd-grade">✦ ${RARITY_LABEL[item.rarity]}${owned ? ` · ${owned.line}` : ''}</div>
        ${passive}
        ${rows ? `<div class="id-stats">${rows}</div>` : ''}
        <p class="wd-flavor">${item.flavor}</p>
      </div>
    </div>`
  }

  private closeOverlay() {
    const host = this.q('#overlay')
    host.classList.remove('open')
    host.innerHTML = ''
  }

  private pick(id: string) {
    // CardHand 외부의 개발 입력이나 지연된 confirm도 정산 잠금 뒤에는 선택을 바꾸지 못한다.
    if (this.busy || this.over) return
    this.inkPreviewSpent = null
    if (!this.order().some((slot) => !!this.sel[slot])) this.lastResolvedTally = null
    const key = this.order()[this.slotIndex]
    const debugKey = `${key}:${id}`
    const w = this.t.words[key].find((x) => x.id === id) ?? this.debugSpawnedWords.get(debugKey)
    if (!w) return
    if (this.unavailableReason(w)) return
    this.debugSpawnedWords.delete(debugKey)
    GameAudio.play('paper')
    // 이 한 칸을 고르는 데 얼마나 걸렸는지 — 정책은 거리감으로, 취향 기록은 성격으로 읽는다.
    const decisionMs = this.token?.noteSelectionMade() ?? 0
    if (decisionMs > 0) sharedTokenPlaystyle().noteDecision(decisionMs)
    this.sel = { ...this.sel, [key]: w }
    this.sel = pruneConflicts(this.sel, this.slotIndex, this.t)
    const order = this.order()
    let next = this.slotIndex + 1
    while (next < order.length && this.sel[order[next]]) next++
    this.slotIndex = Math.min(next, order.length - 1)
    this.setPhase(this.complete() ? '단어 완성' : `${this.t.template.slots[this.slotIndex].label} 선택`)
    this.renderChain()
    GameAudio.play('pencil')
    this.renderWords()
    this.coachAfterPick()
    // 전부 채우면 자동 완성(반짝 → 발동)
    if (this.complete()) {
      const intent = compile(this.sel, this.t, this.combatStats(), this.mods())
      GameAudio.playSentenceComplete(intent.emotions)
      // 맥락이 맞물린 문장은 토큰도 신이 난다.
      if (intent.combos.length > 0) this.token?.feel('comboFired')
      // 토큰이 이 사람의 취향을 지켜본다 — 어떤 감정을 고르고, 때리는지 막는지.
      // debuff는 아직 데이터가 없으므로 공격으로 묶는다.
      sharedTokenPlaystyle().noteSentence({
        words: this.order().flatMap((key) => {
          const word = this.sel[key]
          return word ? [{ id: word.id, emotion: word.emotion }] : []
        }),
        action: intent.kind === 'guard' ? 'guard' : intent.kind === 'heal' ? 'heal' : 'attack',
        combo: intent.combos.length > 0,
        // 잉크 여유는 이월분에 따라 문장마다 다르다 — 고정 상한이 아니라 지금 값을 쓴다.
        overdraw: inkOverdraw(selectionInkCost(this.sel), this.currentInkAvailable()) > 0,
      })
      this.scheduleAutoComplete()
    } else {
      this.token?.noteSelectionStart()
    }
  }

  private unavailableReason(word: Word): string | null {
    const reason = conflictReason(word, this.slotIndex, this.sel, this.t)
    if (reason) return reason
    const key = this.order()[this.slotIndex]
    const projected = { ...this.sel, [key]: word }
    const projectedCost = selectionInkCost(projected)
    if (inkExceedsLimit(projectedCost, this.currentInkAvailable())) return '현재 잉크 한도 초과'
    const remainingFloor = this.minimumRemainingInkCost(this.slotIndex, projected)
    return projectedCost + remainingFloor > this.currentInkAvailable() + SENTENCE_OVERDRAW_LIMIT
      ? '남은 문장을 완성할 잉크 부족'
      : null
  }

  private minimumRemainingInkCost(afterIndex: number, selection: Selection): number {
    let floor = 0
    for (let i = afterIndex + 1; i < this.order().length; i++) {
      const key = this.order()[i]
      const costs = (this.t.words[key] ?? this.player.deck[key] ?? [])
        .filter((candidate) => !conflictReason(candidate, i, selection, this.t))
        .map((candidate) => Math.max(0, wordInkCost(candidate) - (candidate.effects?.inkDiscount ?? 0)))
      if (!costs.length) return Number.POSITIVE_INFINITY
      floor += Math.min(...costs)
    }
    return floor
  }

  private scheduleAutoComplete(): void {
    window.clearTimeout(this.autoCompleteTimer)
    this.autoCompleteTimer = window.setTimeout(() => {
      this.autoCompleteTimer = 0
      void this.autoComplete()
    }, 520)
  }

  private rewindToSlot(index: number): void {
    if (this.over || this.busy || !Number.isFinite(index)) return
    this.inkPreviewSpent = null
    const order = this.order()
    if (index < 0 || index >= order.length || !this.sel[order[index]]) return
    window.clearTimeout(this.autoCompleteTimer)
    this.autoCompleteTimer = 0
    this.q('.word-zone').classList.remove('is-resolving')
    const next: Selection = {}
    for (let i = 0; i < index; i++) {
      const key = order[i]
      if (this.sel[key]) next[key] = this.sel[key]
    }
    this.sel = next
    this.slotIndex = index
    this.setPhase(`${this.t.template.slots[this.slotIndex].label} 선택`)
    this.renderChain()
    this.renderWords()
    this.renderDetail(null)
  }

  /** 한 번의 카드 선택에서는 가장 급한 상황 하나만 말한다. */
  private coachAfterPick() {
    if (this.isBoss || this.over) return
    const spent = selectionInkCost(this.sel)
    const available = this.currentInkAvailable()
    const overdraw = inkOverdraw(spent, available)
    if (overdraw > 0 && this.showCombatCoach('ink-overdraw')) return
    if (available - spent <= 3 && this.showCombatCoach('ink-low')) return

    const intent = compile(this.sel, this.t, this.combatStats(), this.mods())
    if (intent.emotionResonance > 1 && this.showCombatCoach('resonance')) return
    if (intent.combos.length > 0 && this.showCombatCoach('context')) return

    const chosen = this.order().filter((key) => !!this.sel[key]).length
    if (chosen === 1) this.showCombatCoach('modifier')
    else if (chosen === 2) this.showCombatCoach('verb')
  }

  private complete(): boolean {
    return this.order().every((k) => !!this.sel[k])
  }

  private async autoComplete() {
    // 마지막 카드 확정 직후 잠근다. 반짝임을 기다린 뒤 execute에서 잠그면 그 사이
    // 광클이 두 번째 카드 적용 연출을 시작할 수 있다.
    if (!this.complete() || this.busy || this.over) return
    this.busy = true
    this.q('.word-zone').classList.add('is-resolving')
    const rail = this.q('#chain')
    rail.classList.add('sparkle')
    await sleep(300)
    rail.classList.remove('sparkle')
    await this.execute()
  }

  // ── 점수 분해 — 깡 점수(더하기)와 배율(곱하기)을 출처별로 쪼갠다 ──
  // execute와 같은 규칙으로 계산하므로 여기 총합은 실제로 꽂히는 수치와 일치한다.
  private buildTally(intent: Intent, resolved: ResolvedMult, dealsDamage: boolean): Tally {
    // 피해·실드·회복 어느 문장이든 같은 배율 정산을 보여 준다.
    // 순수 효과형 카드도 실제 적용값과 일치하도록 아래에서 깡수치를 보충한다.
    const kind: Tally['kind'] = dealsDamage ? 'dmg' : intent.guard > 0 ? 'guard' : 'heal'
    const repeatPower = intent.castCount * intent.castScale * (dealsDamage ? intent.hitCount : 1)
    const supportBase = (kind === 'guard' ? intent.guard : kind === 'heal' ? intent.heal : 0) * repeatPower
    if (!dealsDamage && supportBase <= 0) return { flats: [], mults: [], base: 0, mult: 1, total: 0, kind }

    // 깡수치·배율의 출처는 컴파일러가 이미 순서대로 쌓아 뒀다(문장 왼쪽부터 → 관용구 → 어긋남).
    const resonanceEmotion = this.resonantEmotion(intent.emotions)
    const cls = (p: { source: string; value: number }) =>
      p.source === 'emotion' && resonanceEmotion
        ? `resonance emotion-${resonanceEmotion}`
        : p.source === 'combo' ? 'combo' : p.source === 'coherence' ? 'down' : p.source === 'stat' ? 'stat' : p.value < 1 ? 'down' : 'buff'
    // 동사가 둘이면 한 문장이 피해와 회복을 동시에 만든다 — 집계판은 자기 풀만 더한다.
    // (안 그러면 방어 깡수치가 피해 총합에 섞여 화면 숫자와 실제 피해가 어긋난다.)
    const lane = kind === 'dmg' ? 'damage' : kind
    const flats: TallyPart[] = intent.breakdown.flats
      .filter((p) => (p.lane ?? 'damage') === lane)
      .map((p) => ({
        label: p.hint ? `${p.label} (${p.hint})` : p.label,
        value: p.value * repeatPower,
        cls: kind,
      }))
    // effects.guard/effects.heal처럼 동사 깡수치가 아닌 보조 효과도 배율을 받는다.
    // 집계판의 깡수치 합이 실제 방어·회복 적용값과 항상 같도록 남은 값만 보탠다.
    if (supportBase > 0) {
      const explained = flats.reduce((sum, part) => sum + part.value, 0)
      if (supportBase > explained) {
        flats.push({
          label: kind === 'guard' ? '실드 효과' : '회복 효과',
          value: supportBase - explained,
          cls: kind,
        })
      }
    }
    const mults: TallyPart[] = intent.breakdown.mults.map((p) => ({ label: p.label, value: p.value, cls: cls(p) }))

    const p = resolved.parts
    if (p.variance !== 1) mults.push({ label: '도박', value: p.variance, cls: p.variance >= 1 ? 'buff' : 'down' })
    if (p.luck !== 1) mults.push({ label: '운', value: p.luck, cls: 'stat' })
    // 피노키오의 미아핑 — 맥락마다 따로 굴린 "근데?"를 하나씩 늘어놓는다.
    for (const d of resolved.doubtRolls) mults.push({ label: '근데?', value: d, cls: 'gamble' })
    if (resolved.outcome === 'crit') mults.push({ label: '대성공', value: p.roulette, cls: 'crit' })
    if (resolved.outcome === 'fail') mults.push({ label: '실패', value: p.roulette, cls: 'down' })

    const base = flats.reduce((n, f) => n + f.value, 0)
    const mult = mults.reduce((m, x) => m * x.value, 1)
    const repeats = dealsDamage ? intent.hitCount * intent.castCount : 1
    const total = dealsDamage && repeats > 1
      ? Math.round((base / repeats) * mult) * repeats
      : Math.round(base * mult)
    return { flats, mults, base, mult, total, kind }
  }

  // 깡 점수가 하나씩 쌓이고 → 배율이 하나씩 꽂히고 → 총합이 쾅. 발라트로식 콤보 쾌감.
  private async playTally(tally: Tally): Promise<void> {
    const el = document.createElement('div')
    el.className = `tally ${tally.kind}`
    const baseLabel = tally.kind === 'guard' ? '실드' : tally.kind === 'heal' ? '회복' : '깡 점수'
    el.innerHTML = `
      <div class="tally-slots">
        <div class="tally-cell"><div class="tally-box base"><span class="tl">${baseLabel}</span><b>0</b></div></div>
        <div class="tally-x">×</div>
        <div class="tally-cell"><div class="tally-box mult"><span class="tl">배율</span><b>1.00</b></div></div>
      </div>
      <div class="tally-feed tally-flat-feed"></div>
      <div class="tally-phase" aria-hidden="true"><i></i><span>배율 누적</span><i></i></div>
      <div class="tally-feed tally-mult-feed"></div>
      <div class="tally-total"></div>`
    this.q('#pbox').appendChild(el)
    this.fitTallyToStage(el)
    requestAnimationFrame(() => {
      this.fitTallyToStage(el)
      el.classList.add('in')
    })
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    const flatFeed = el.querySelector<HTMLElement>('.tally-flat-feed')!
    const multFeed = el.querySelector<HTMLElement>('.tally-mult-feed')!
    await sleep(120)

    let base = 0
    for (const f of tally.flats) {
      base += f.value
      baseBox.querySelector('b')!.textContent = String(base)
      this.tallyChip(flatFeed, `${f.label} +${f.value}`, f.cls)
      this.fitTallyToStage(el)
      this.bump(baseBox)
      // 깡수치만으로도 판을 뒤흔들 만큼 쌓였으면 이미 달아오르기 시작한다.
      this.setFever(el, base)
      await sleep(100)
    }
    let mult = 1
    const hasRisingMultiplier = tally.mults.some((part) => part.value > 1)
    if (hasRisingMultiplier) {
      el.classList.add('mult-rising')
      GameAudio.playMultiplierRise()
    }
    multBox.classList.add('rolling')
    for (const [i, m] of tally.mults.entries()) {
      const nextMult = mult * m.value
      this.tallyChip(multFeed, `${m.label} ×${m.value.toFixed(2)}`, m.cls)
      this.fitTallyToStage(el)
      // 배율이 겹칠수록 판이 뜨거워진다.
      el.style.setProperty('--heat', Math.min(1, (i + 1) / 4).toFixed(2))
      await this.rollMultiplierValue(multBox.querySelector('b')!, mult, nextMult, 220)
      mult = nextMult
      this.bump(multBox)
      // 배율이 한 칸 꽂힐 때마다 지금까지의 예상 총합으로 열기를 다시 잰다 —
      // 곱이 겹칠수록 판이 커지고 흔들리고 불이 붙는다.
      this.setFever(el, base * mult)
      await sleep(20)
    }
    multBox.classList.remove('rolling')
    if (hasRisingMultiplier) {
      el.classList.remove('mult-rising')
      el.classList.add('mult-settled')
      await sleep(240)
      el.classList.remove('mult-settled')
    }

    // 깡 × 배율이 다 모이면 잠깐 멈춰 읽을 시간을 준다 — 호버 중이면 더 기다리고, 클릭하면 즉시.
    await this.tallyDwell(el)

    // 총합 롤업 — 깡·배율 상자에서 불꽃이 중앙으로 날아가 꽂힐 때마다 숫자가 뽀로롱 오른다.
    await this.rollUpTotal(el, tally)

    // 여기서 지우지 않는다 — 준비 효과·선공을 지나 내 공격이 꽂힐 때까지 이 숫자가 머문다.
    el.classList.add('parked')
    this.parkedTally = el
  }

  // 집계판 체류 — 기본 0.35초. 패널에 마우스를 올려두면 놓을 때까지(최대 2초) 기다리고,
  // 아무 곳이나 클릭하면 바로 진행한다.
  private tallyDwell(el: HTMLElement): Promise<void> {
    el.classList.add('dwell')
    return new Promise((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        el.classList.remove('dwell')
        this.root.removeEventListener('pointerdown', onClick, true)
        resolve()
      }
      const onClick = () => finish()
      this.root.addEventListener('pointerdown', onClick, true)
      const started = Date.now()
      const tick = () => {
        if (done) return
        const elapsed = Date.now() - started
        const holding = el.matches(':hover') && elapsed < 2000
        if (elapsed >= 350 && !holding) return finish()
        this.timers.push(window.setTimeout(tick, 80))
      }
      tick()
    })
  }

  // 총합 문턱 — 넘을 때마다 판이 한 단계 더 화려해진다(발광·확대).
  private applyHeatTier(el: HTMLElement, v: number) {
    el.classList.toggle('hot1', v >= 50)
    el.classList.toggle('hot2', v >= 90)
    el.classList.toggle('hot3', v >= 140)
    this.fitTallyToStage(el)
  }

  /**
   * 배율 내역이 여러 줄이거나 큰 숫자가 들어와도 집계판이 전장 안전 영역을 넘지 않게 한다.
   * 레이아웃 크기는 그대로 두고 최종 표시 비율만 줄이므로, 숫자·칩이 잘리지 않는다.
   */
  private fitTallyToStage(el: HTMLElement) {
    const stage = this.q('#pbox')
    const safeWidth = Math.max(340, Math.min(680, stage.clientWidth - 420))
    const safeHeight = Math.max(250, Math.round(stage.clientHeight * 0.62))
    // 집계판의 폭은 CSS로 고정돼 있어 offsetWidth만 재면 내용이 아무리 넘쳐도 항상
    // 같은 값이 나온다. 상자와 총합은 이제 자르지 않고 내용만큼 넓어지므로, 실제로
    // 무대를 밀어내는 건 이 자식들의 폭이다 — 가장 넓은 쪽을 기준으로 줄인다.
    const width = Math.max(
      el.offsetWidth,
      ...[...el.children].map((child) => (child as HTMLElement).offsetWidth),
    )
    const height = el.offsetHeight
    if (width <= 0 || height <= 0) return
    const feverScale = [1, 1.05, 1.1, 1.16][Number(el.dataset.fever ?? 0)] ?? 1.16
    const fit = Math.min(1, safeWidth / (width * feverScale), safeHeight / (height * feverScale))
    el.style.setProperty('--tally-fit', Math.max(0.34, fit).toFixed(3))
    el.classList.toggle('compact', fit < 0.86)
  }

  // 뽀로롱 롤업 — 스텝마다 깡/배율 상자에서 불꽃이 총합으로 날아가 꽂히고 숫자가 오른다.
  private async rollUpTotal(el: HTMLElement, tally: Tally) {
    const total = el.querySelector<HTMLElement>('.tally-total')!
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    total.textContent = '0'
    const steps = Math.min(6, Math.max(4, Math.round(tally.total / 28)))
    for (let i = 1; i <= steps; i++) {
      const eased = 1 - Math.pow(1 - i / steps, 2)
      void this.flingSpark(i % 2 ? baseBox : multBox, total, el)
      await sleep(i === steps ? 100 : 55)
      total.textContent = String(Math.round(tally.total * eased))
      total.classList.remove('tick')
      void total.offsetWidth
      total.classList.add('tick')
      this.applyHeatTier(el, Math.round(tally.total * eased))
    }
    total.textContent = String(tally.total)
    this.applyHeatTier(el, tally.total)
    total.classList.remove('tick')
    total.classList.add('slam')
    await sleep(180)
  }

  // 상자 중심 → 총합 중심으로 날아가는 불꽃 하나. 무대가 scale()로 줄어 있으므로
  // 화면 좌표 차이를 무대 배율로 되돌려 적용한다.
  private flingSpark(from: HTMLElement, to: HTMLElement, host: HTMLElement): Promise<void> {
    const f = from.getBoundingClientRect()
    const t = to.getBoundingClientRect()
    const h = host.getBoundingClientRect()
    const scale = h.width / Math.max(1, host.offsetWidth)
    const s = document.createElement('span')
    s.className = 'tally-spark'
    s.style.left = `${(f.left + f.width / 2 - h.left) / scale}px`
    s.style.top = `${(f.top + f.height / 2 - h.top) / scale}px`
    host.appendChild(s)
    const dx = (t.left + t.width / 2 - (f.left + f.width / 2)) / scale
    const dy = (t.top + t.height / 2 - (f.top + f.height / 2)) / scale
    const anim = s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(0.7)', opacity: 0.9 },
        { transform: `translate(calc(-50% + ${(dx * 0.5).toFixed(0)}px), calc(-50% + ${(dy * 0.5 - 24).toFixed(0)}px) ) scale(1.25)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) scale(0.5)`, opacity: 0.85 },
      ],
      { duration: 230, easing: 'cubic-bezier(0.3,0.1,0.4,1)' },
    )
    // 배경 탭 등 애니메이션이 진행되지 않는 상황에서도 반드시 치워지도록 타이머로도 건다.
    this.timers.push(window.setTimeout(() => s.remove(), 400))
    return anim.finished.then(() => s.remove()).catch(() => s.remove())
  }

  // 머물러 있던 총합을 거둔다 — 그 수치가 그대로 적에게 들어간 직후에 부른다.
  private releaseTally() {
    const el = this.parkedTally
    if (!el) return
    this.parkedTally = null
    el.classList.remove('parked')
    el.classList.add('out')
    this.timers.push(window.setTimeout(() => el.remove(), 340))
  }

  private resonantEmotion(emotions: readonly Emotion[]): Emotion | null {
    return (['joy', 'anger', 'sorrow', 'pleasure'] as const).find(
      (emotion) => emotions.filter((entry) => entry === emotion).length >= 2,
    ) ?? null
  }

  /** 공명은 맥락 보너스와 섞지 않고, 감정색 배율을 먼저 읽히게 한다. */
  private async showEmotionResonance(intent: Intent) {
    const emotion = this.resonantEmotion(intent.emotions)
    if (!emotion) return
    const el = this.q('#resonance')
    const count = intent.emotions.filter((entry) => entry === emotion).length
    el.className = `resonance-flash emotion-${emotion}`
    el.innerHTML = `
      <div class="resonance-head">${emotionBadgeContent(emotion)}<span>공명</span></div>
      <div class="resonance-value"><small>배율</small><b>×${intent.emotionResonance.toFixed(2)}</b></div>
      <div class="resonance-note">같은 감정 ${count}장</div>`
    el.classList.remove('show')
    void el.offsetWidth
    el.classList.add('show')
    await sleep(520)
    el.classList.remove('show')
  }

  private tallyChip(feed: HTMLElement, text: string, cls: string) {
    const chip = document.createElement('span')
    chip.className = `tally-chip ${cls}`
    chip.textContent = text
    feed.appendChild(chip)
    while (feed.children.length > 6) feed.removeChild(feed.firstChild!)
  }

  private bump(el: HTMLElement) {
    el.classList.remove('bump')
    void el.offsetWidth
    el.classList.add('bump')
  }

  // 단어 하나가 문장 위로 톡 튀길 기여 수치.
  private contribOf(w: Word): { text: string; cls: string } | null {
    if (w.power) return { text: `+${w.power}`, cls: w.kind === 'heal' ? 'heal' : w.kind === 'guard' ? 'guard' : 'dmg' }
    if (w.bonus) return { text: `×${(1 + w.bonus).toFixed(1)}`, cls: 'buff' }
    if (w.effects?.guard) return { text: `방어+${w.effects.guard}`, cls: 'guard' }
    if (w.effects?.heal) return { text: `+${w.effects.heal}`, cls: 'heal' }
    return null
  }

  // ── 발동: 팅팅팅(기여 수치) → 맥락 → 총합 롤업 → 돌진·사각 블라스트로 꽂힘 ──
  private async execute() {
    // autoComplete가 마지막 선택 승인과 같은 호출 스택에서 정산 잠금을 선점한다.
    if (!this.complete() || !this.busy || this.over) return

    const order = this.order()
    // 스탯은 동사의 깡수치로 이미 들어와 있다(공격×1 · 방어×1 · 회복×1) — 여기서 또 더하지 않는다.
    let intent = compile(this.sel, this.t, this.combatStats(), this.mods())
    const inkCost = selectionInkCost(this.sel)
    const availableInk = this.currentInkAvailable()
    const overdraw = inkOverdraw(inkCost, availableInk)
    if (overdraw > 0) {
      this.lastSentence = intent.sentence
      this.lastHurtBy = { kind: 'self', sentence: intent.sentence }
      this.setPhase('잉크 초과')
      applyInkOverdraw(this.state, inkCost, availableInk)
      this.token?.feel('overdraw')
      this.popPlayer(`잉크 초과 · 체력 -${overdraw}`, 'dmg big')
      this.log(`잉크 ${inkCost}/${availableInk} · 초과한 ${overdraw}만큼 체력이 깎였다.`)
      this.renderActors()
      await sleep(420)
      this.clearNormalTokenWarning()
      if (this.state.playerHp <= 0) {
        await this.lose()
        return
      }
    }
    intent = withOverdrawEffects(intent, overdraw)
    this.carriedInk = carryInkAfterSpend(inkCost, availableInk, selectionCarryInk(this.sel))
    const dealsDamage = isDamageIntent(intent) && intent.base > 0
    // 한 문장 한 번의 굴림 — 운·룰렛·variance를 확정해 공/방/회가 같은 배율을 공유한다.
    const resolved = resolveMultiplier(
      intent,
      this.multCtx(intent),
      this.rouletteRoll(),
      intent.variance ? Math.random() : null,
      this.doubtRolls(intent),
    )
    const mult = resolved.mult
    const healPreview = Math.round(intent.heal * mult * intent.castScale * intent.castCount)
    const overhealDamage = Math.round(Math.max(0, healPreview - Math.max(0, this.state.playerMax - this.state.playerHp)) * intent.overhealDamageMultiplier)
    const resourceDamage = Math.round(this.state.guard * intent.guardAttackMultiplier) + overhealDamage
    const dmg = Math.round((effectiveBase(intent) * mult * intent.castScale + resourceDamage) * intent.hitCount * intent.castCount)

    // 문장을 읽고 맥락을 확정한 뒤 준비 효과와 본행동을 시간순으로 나눈다.
    const chainEls = Array.from(this.q('#chain').querySelectorAll<HTMLElement>('.chain-word'))
    for (let i = 0; i < order.length; i++) {
      const w = this.sel[order[i]]
      const c = w ? this.contribOf(w) : null
      const el = chainEls[i]
      if (el) el.classList.add('wave')
      if (c && el) this.popEl(el, c.text, `tick ${c.cls}`)
      await sleep(70)
    }
    this.q('#flash').classList.add('go')
    await sleep(110)

    if (intent.emotionResonance > 1) await this.showEmotionResonance(intent)

    // 맥락(관용구) 발동 배너
    if (intent.combos.length) {
      GameAudio.play('contextBonus')
      const combos = matchCombos(this.sel, this.t.combos, order)
      const newlyDiscovered = combos.filter((combo) => !this.discoveredCombos.has(combo.id))
      if (newlyDiscovered.length) {
        discoverCombos(newlyDiscovered.map((combo) => combo.id))
        newlyDiscovered.forEach((combo) => this.discoveredCombos.add(combo.id))
      }
      const comboMult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div><div class="name">${intent.combos.join(' · ')}</div><div class="mult">위력 ×${comboMult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(520)
      el.classList.remove('show')
      if (newlyDiscovered.length) await this.showComboDiscovery(newlyDiscovered)
    }

    // 4) 점수 확정 — 깡수치와 배율이 팅·팅·팅 순서대로 꽂히고, 총합은 화면에 그대로 머문다.
    //    이 숫자를 들고 준비 효과 → 선공 → 내 공격까지 이어가므로 중간에 다시 계산하지 않는다.
    this.noteSentence(intent.sentence, mult, dealsDamage ? dmg : 0)
    const tally = this.buildTally(intent, resolved, dealsDamage)
    this.lastResolvedTally = tally
    if (tally.total > 0) await this.playTally(tally)

    // 보상 카드의 성장과 하늘나물의 첫 문장 성장을 한 번에 보여 준다.
    const passiveGrowth = beanstalkGrowthFor(this.player, !this.beanstalkGrownThisBattle)
    if (passiveGrowth > 0) this.beanstalkGrownThisBattle = true
    const totalGrowth = intent.growHp + passiveGrowth
    if (totalGrowth > 0) await this.growUp(totalGrowth)

    // 5) 준비 효과 — 방어를 선공 공격보다 먼저 적용한다.
    this.setPhase('준비 효과')
    const prep = applyPreparation(this.state, intent, mult)
    if (prep.guardGain > 0) {
      GameAudio.play('shield')
      playCharacterAnimation(this.q<HTMLElement>('.actor.you'), 'shield')
      // 캐릭터의 실드 형성과 같은 프레임에 체력바도 차오르기 시작한다.
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      await this.rollTotal(prep.guardGain, 'guard')
      await this.flyToPlayer(`방어+${prep.guardGain}`, 'guard', 'guard')
      this.log(`${intent.sentence} → 방어 ${prep.guardGain} 준비`)
    }
    if (prep.guardAttempted > prep.guardGain) {
      this.popPlayer(`실드 한도 ${playerGuardLimit(this.state.playerMax)}`, 'guard')
      this.log(`방어막은 최대 체력만큼만 비축한다 — ${this.state.guard}/${playerGuardLimit(this.state.playerMax)}`)
    }
    if (prep.magicShieldGain > 0) {
      GameAudio.play('shield')
      playCharacterAnimation(this.q<HTMLElement>('.actor.you'), 'shield')
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      await this.flyToPlayer(BUILD_EFFECT_TEXT.magic, 'guard', 'guard')
      this.log(`${intent.sentence} → ${BUILD_EFFECT_TEXT.magicReady}`)
    }
    this.renderActors()

    // 6) 선공 상대 행동 — 이번 문장의 준비 효과를 받은 뒤 공격한다.
    //    문장부호 '!'가 붙었으면 이 페이즈를 건너뛴다. 선공 적은 이번 턴에 못 때리고,
    //    쿨다운도 소모하지 않으므로 다음 턴에 그대로 돌아온다(미루기지 없애기가 아니다).
    if (intent.preempt) {
      this.playerPreempting = true
      this.setPhase('선수 · 먼저 움직였다')
      this.log('느낌표 — 상대보다 먼저 움직였다.')
      await sleep(260)
    } else {
      this.setPhase('선공 상대 행동')
      await this.enemyPhase('first')
      this.clearNormalTokenWarning()
      if (this.state.playerHp <= 0) {
        await this.lose()
        return
      }
    }

    // 7) 본인 캐릭터 행동 — 아까 띄워 둔 총합이 그대로 적에게 꽂힌다.
    this.setPhase('본인 캐릭터 행동')

    // 강타 등급 — 이 판을 크게 깎아내는 일격에만 붙는다. 남은 적을 전부 쓸어버리면 2번 컷.
    // 문턱은 판 크기 비율이라(encounterHp) 층이 올라도 희소성이 그대로 유지된다.
    // pump는 정점 정지·히트스탑·타격점까지, wipe는 거기에 검기 관통까지 붙는다.
    //
    // 액션 컷을 끝까지 기다리면 배율이 큰 문장마다 전투가 멈춘 것처럼 느껴진다.
    // 그래서 컷을 타격과 **겹쳐** 재생하는데, 겹치는 자리는 검을 들어올린 채 멈춘
    // 구간이다(heavyWindup) — 컷이 도는 동안 화면은 이미 절정을 붙들고 있다.
    let heavy: AttackCut | null = null
    if (dealsDamage) {
      const alive = aliveIdx(this.state)
      const wipesAll =
        alive.length > 0 && this.predictKills(dmg, this.target, intent.aoe === 'all') >= alive.length
      heavy = attackCutFor(dmg, this.encounterHp, mult, wipesAll)
      this.heavyMult = heavy ? mult : 0
      this.heavyStopUsed = false // 이번 문장의 정지 한 번을 새로 연다
    }

    // 두 마리 이상이 쓸려나갈 일격이면 때리기 직전에 화면이 늘어졌다가, 꽂히는 순간 고속으로 풀린다.
    const sweep = dealsDamage && this.predictKills(dmg, this.target, intent.aoe === 'all') >= 2
    // 강타는 액션 컷을 칼질 안으로 끌어들인다 — 예전엔 패널이 먼저 다 지나간 다음에
    // 휘둘러서 절정이 두 번으로 갈렸다. 강타가 아니면 예전 그대로 슬로우만 건다.
    if (heavy) await this.heavyWindup(heavy)
    else if (sweep) await this.slowmoWindup()

    // 실제 본행동 발동 + 꽂힘 연출
    const hpBeforeIntent = this.state.playerHp
    const res = applyIntent(this.state, intent, mult, this.target)
    // 만피에서 회복 문장을 써도 실제로 오른 건 없다 — 그럴 땐 토큰도 기뻐하지 않는다.
    if (this.state.playerHp > hpBeforeIntent) this.token?.feel('healed')
    const missedSpiderWeakness = dealsDamage && res.hits.some((hit) =>
      !hit.weak && this.state.enemies[hit.target]?.def.id === 'elderSpider',
    )
    this.releaseTally()
    await this.strike(res, sweep, heavy)
    if ((res.lifeStolen ?? 0) > 0) {
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      await this.flyToPlayer(buildEffectText('healPop', res.lifeStolen), 'heal', 'heal')
      this.log(buildEffectText('healed', res.lifeStolen))
    }
    if ((res.convertedDamage ?? 0) > 0) {
      this.log(buildEffectText('overflow', res.convertedDamage))
    }
    if (missedSpiderWeakness) this.showBossTokenHint(TOKEN_BOSS_HINTS.elderSpiderMiss)
    if (res.summonDamage > 0) {
      this.log(`문장이 일벌에게 ${res.summonDamage} 피해${res.summonsDispersed > 0 ? ` · ${res.summonsDispersed}마리 퇴치` : ''}.`)
    }
    const rouletteNote = resolved.outcome === 'crit' ? ' · 대성공!' : resolved.outcome === 'fail' ? ' · 실패…' : ''
    this.log(
      res.text +
        (res.combos.length ? ` · ${res.combos.join(', ')}` : '') +
        rouletteNote +
        (intent.penalties.length ? ` · 어긋남 ×${intent.coherence.toFixed(2)}` : ''),
      tally.total > 0 ? tally : undefined,
    )
    // 검기가 뒷줄로 날아갈 판이면 여기서 레일을 당기지 않는다. 미리 당기면 다음 적이
    // 이미 앞자리에 와 있어서, 검기가 출발점 위로 날아가는 꼴이 된다(실측으로 그랬다).
    if (!(heavy && res.overflow > 0)) this.renderActors()

    // 초과 피해(오버플로우): 앞 적을 넘겼으면 활활 타오르다 다음 적이 당겨오면 꽂힌다.
    let kills = res.killed.length
    if (this.state.playerHp <= 0) {
      await this.lose()
      return
    }

    if (res.overflow > 0 && !allDead(this.state)) {
      this.showCombatCoach('overflow')
      kills += await this.resolveOverflow(res.overflow, sweep, heavy, intent)
    }

    // 누댕의 메아리 — 대성공한 문장은 한 번 더 발동한다. 준비 효과와 적 페이즈는
    // 다시 돌지 않는다(문장만 메아리친다). 이미 전멸했으면 울릴 곳이 없다.
    if (resolved.outcome === 'crit' && hasPassive(this.player, 'echo') && !allDead(this.state)) {
      kills += await this.echoStrike(intent, mult * ECHO_REPEAT_SCALE, sweep, heavy)
    }

    // 맞대던 적이 죽었으면 새 최전방을 여기서 맞댄다 — 행동 순서 표시도 같은 상태를 읽는다.
    if (kills > 0) engageFront(this.state)

    // 아기돼지 바베큐 — 잡은 수가 다음 문장의 배율이 된다.
    this.killsThisBattle += kills
    for (let i = 0; i < kills; i++) this.token?.feel('enemyKilled')

    if (allDead(this.state)) {
      this.log('마지막 벌레가 책장 밖으로 떨어졌다.')
      await this.finishWin(500)
      return
    }

    // 8) 후공 상대 행동 — 플레이어 본행동이 끝난 뒤 행동한다.
    this.setPhase('후공 상대 행동')
    await this.enemyPhase('second')

    if (this.state.pending) {
      const result = applyPendingAttack(this.state)
      if (result) {
        for (const hit of result.hits) {
          const el = this.q(`#actors .actor.foe[data-i="${hit.target}"]`)
          if (hit.summonShieldBlocked) this.popAt(hit.target, '일벌 호위 · 본체 무적', 'guard big')
          else if (hit.magicShieldBroken) await this.playSpellShieldImpact(hit.target, hit.magicShieldRemaining)
          else if (hit.guardAbsorbed > 0 && hit.dmg === 0) this.popAt(hit.target, `방어 ${hit.guardAbsorbed}`, 'guard')
          else if (hit.dmg > 0) {
            if (el) SquareBurst.playOn(el, 'damage', { spread: 100 })
            this.popAt(hit.target, `${hit.dmg}`, hit.weak ? 'dmg big weak' : 'dmg big')
            if ((hit.barOverflow ?? 0) > 0) this.playBossBarOverkill(hit.target, hit.barOverflow ?? 0, !!hit.barOverflowPassed)
            if ((hit.barsBroken ?? 0) > 0) this.playBossBarBreak(hit.target, hit.barsBroken ?? 1, !!hit.barOverflowPassed)
          }
        }
        if (result.summonDamage > 0) {
          await this.playSummonDispersal(result.hits[0]?.target ?? this.target, result.summonsDispersed, result.summonDamage, result.summonBacklashDamage, result.summonFocusedBacklash, result.summonGroggyTriggered)
          this.log(`예약 문장이 일벌에게 ${result.summonDamage} 피해${result.summonsDispersed > 0 ? ` · ${result.summonsDispersed}마리 퇴치` : ''}.`)
        }
        this.log(result.text)
        await sleep(300)
        for (const k of result.killed) await this.playDeath(k, 1)
        this.renderActors()
        if (result.killed.length > 0) engageFront(this.state)
      }
    }

    if (this.state.playerHp <= 0) {
      await this.lose()
      return
    } else if (allDead(this.state)) {
      await this.finishWin(300)
      return
    }

    // 턴이 넘어갈 때 연출 상태를 무조건 원위치시킨다. 확대·정지는 여러 갈래(패배·승리·
    // 메아리·보스 패턴)에서 중간에 빠져나갈 수 있어서, 한 갈래라도 놓치면 화면이 조여든
    // 채로 굳는다 — 실제로 "어두워진 화면이 안 돌아온다"는 사고가 여기서 났다.
    this.endSlowmo()
    this.sel = {}
    this.clearNormalTokenWarning()
    this.cardHand.grantNextOpeningHand(intent.drawCards)
    this.slotIndex = 0
    this.playerPreempting = false
    this.state.turn++
    this.token?.passTurn()
    // 유대 문턱을 넘었으면 그 순간에만 한마디. 넘는 순간을 놓치면 축하할 자리가 없다.
    const upgraded = this.token?.takeTierUpgrade()
    if (upgraded && upgraded !== 'new' && !this.token?.isHolding) {
      const key = upgraded === 'familiar' ? 'bondFamiliar' : upgraded === 'close' ? 'bondClose' : 'bondInseparable'
      this.timers.push(window.setTimeout(() => this.showTokenSpeech(bossTokenLine(key, 'relief')), 900))
    }
    // 새 턴의 첫 슬롯이 열렸다 — 여기서부터 사람이 얼마나 망설이는지 잰다.
    this.token?.noteSelectionStart()
    const turnSummons = summonAtTurnStart(this.state)
    this.renderActors()
    if (turnSummons.length > 0) await this.playTurnSummons(turnSummons)
    // 세 문장을 쓸 때마다 등급이 한 번 식는다. 방어·회복이 공격보다 한 문장 길다는
    // 이유만으로 매번 보상을 잃지 않되, 아주 오래 끄는 전투에는 여전히 비용이 남는다.
    const prevGrade = this.grade
    this.grade = gradeForElapsedTurns(this.player.stats.luck, Math.max(0, this.state.turn - 1))
    if (this.grade < prevGrade) this.tickGradeDown()
    this.setPhase('주어 선택')
    this.busy = false
    this.q('.word-zone').classList.remove('is-resolving')
    this.cardHand.resetTurn()
    this.beginSpiderTurn()
    this.renderChain()
    this.renderWords()
  }

  /** 패배 — 진행 중 연출을 정리하고 그림일기 결과 화면으로 넘긴다. */
  private async lose(): Promise<void> {
    if (this.over) return
    this.releaseTally()
    this.over = true
    this.setPhase('패배')
    this.token?.feel('runLost')
    // 런의 끝을 기억에 남기는 건 main의 goResult 한 곳이다 — 승패가 함께 지나는 유일한
    // 길목이라, 여기서도 적으면 패배만 두 번 세어진다.
    this.log('일기장이 너무 상했다…')
    this.renderActors()
    const defeatDuration = playCharacterAnimation(this.q<HTMLElement>('.actor.you'), 'defeat')
    await sleep(defeatDuration || 520)
    this.onLose(this.lastHurtBy)
  }

  /**
   * 무럭무럭 — 최대 체력이 영구히 자란다. 배율을 받지 않는 고정 수치다.
   * 런 전체에 남아야 하므로 플레이어 스탯(hp)까지 함께 올린다.
   */
  private async growUp(n: number): Promise<void> {
    this.player.stats.hp += n
    this.state.playerMax += n
    this.state.playerHp += n
    const text = growthText(n)
    this.popPlayer(text.pop, 'heal')
    this.log(text.log)
    this.renderStats()
    this.renderActors()
    await sleep(420)
  }

  /**
   * 메아리 재발동 — 같은 문장을 확정 배율의 50%로 한 번 더 꽂는다.
   * 배율을 다시 굴리지 않으므로 대성공 ×1.5가 두 번 그대로 들어간다.
   * 반환값은 이번 재발동으로 늘어난 처치 수(오버킬 등급에 합산).
   */
  private async echoStrike(
    intent: Intent,
    mult: number,
    sweep: boolean,
    heavy: AttackCut | null = null,
  ): Promise<number> {
    // 살아 있는 적으로 조준을 옮긴다 — 원래 대상이 이미 쓰러졌을 수 있다.
    if (this.state.enemies[this.target]?.dead) this.target = aliveIdx(this.state)[0] ?? this.target

    const banner = this.q('#combo')
    banner.innerHTML = `<div class="kicker">누댕의 메아리</div><div class="name">한 번 더</div><div class="mult">대성공</div>`
    banner.classList.remove('show')
    void banner.offsetWidth
    banner.classList.add('show')
    await sleep(420)

    const res = applyIntent(this.state, intent, mult, this.target)
    // 메아리는 예비 동작을 다시 밟지 않는다 — 칼을 두 번 들어올리면 늘어진다.
    // 타격점·정지·검기만 그대로 물려받아 같은 등급의 일격으로 읽히게 한다.
    await this.strike(res, sweep, heavy)
    if (res.summonDamage > 0) {
      this.log(`메아리가 일벌에게 ${res.summonDamage} 피해${res.summonsDispersed > 0 ? ` · ${res.summonsDispersed}마리 퇴치` : ''}.`)
    }
    this.log(`${intent.sentence} → 메아리 · ${res.text.split('→ ').pop() ?? ''}`)
    this.renderActors()

    let kills = res.killed.length
    if (res.overflow > 0 && !allDead(this.state)) kills += await this.resolveOverflow(res.overflow, sweep, heavy, intent)
    return kills
  }

  // 플레이어 공격/방어/회복 꽂힘 — 공격이면 돌진, 방어/회복/자해는 플레이어에게 날아가 꽂힘.
  private async strike(
    res: ApplyResult,
    sweep = false,
    heavy: AttackCut | null = null,
  ) {
    const you = this.q<HTMLElement>('.actor.you')
    // 여왕벌은 피해를 먼저 일벌 킬체인에 소비하므로 본체 hit가 0건일 수 있다.
    // 그 경우에도 실제 공격은 일어났다. hit만 보면 정확히 30/60/120 피해에서 프롬이
    // 가만히 선 채 일벌만 뒤늦게 사라지는 역전된 그림이 된다.
    const attacking = res.hits.length > 0 || res.summonDamage > 0
    this.swordHitCount = 0
    if (heavy && attacking && this.heavyHeld) {
      // 이미 칼을 들어올린 채 멈춰 있다. 돌진을 먼저 출발시켜 내리치는 프레임에
      // 적과 딱 붙게 만든 뒤(0.44초 중 42%가 최대) 붙들고 있던 클립을 놓는다.
      // heavy-lunge는 접점에서 한 박자 버티는 돌진이다 — 정지 프레임이 붙는 순간에
      // 프롬이 이미 물러나고 있으면 "맞부딪친 채로 멈춘" 그림이 안 된다.
      you.classList.add('lunge', 'heavy-lunge')
      await sleep(HEAVY_LUNGE_LEAD_MS)
      await sleep(this.heavyRelease(you))
    } else if (attacking) {
      GameAudio.play('paperAttack')
      playCharacterAnimation(you, 'attack')
      you.classList.add('lunge')
      await sleep(sweep ? 120 : 170)
    } else {
      await sleep(40)
    }
    // 꽂히는 순간 늘어졌던 시간이 풀리고 레일이 고속 모드로 전환된다.
    // 강타는 여기서 확대를 풀지 않는다 — 프레임 정지가 풀리는 순간에 같이 터져야
    // "팡" 하고 뒤로 물러나는 것으로 읽힌다. 여기서 풀면 정지 전에 이미 축소가 끝난다.
    if (sweep) {
      if (!heavy) {
        this.endSlowmo()
        this.shakeStage(1)
      }
      this.q('#actors').classList.add('rail-rush')
    }

    const stopMs = Math.min(112, 62 + res.killed.length * 14 + (sweep ? 20 : 0))
    let firstHitStopped = heavy ? this.heavyStopUsed : false
    const stopFirstHit = async (target: HTMLElement | null) => {
      if (firstHitStopped) return
      firstHitStopped = true
      if (heavy) {
        this.heavyStopUsed = true
        const tier = this.heavyTier()
        await sleep(HEAVY_FLASH_BLOOM_MS)
        await this.attackHitStop(you, target, stopMs + HEAVY_HIT_STOP_BONUS_MS + Math.round(tier * 34))
        this.shakeStage(1 + tier * .7)
        this.endSlowmo()
      } else {
        await this.attackHitStop(you, target, stopMs)
      }
    }

    const chainContinuesToBody = res.summonDamage > 0 && res.hits.some((hit) => hit.dmg > 0)
    if (res.summonDamage > 0) {
      // 일벌 킬체인의 첫 접촉이 이 공격의 유일한 히트스톱이다. 먼저 한 마리에
      // 충격점을 만든 뒤 멈추고, 풀린 다음 나머지 일벌과 본체까지는 절대 다시 멈추지 않는다.
      const visibleWorkers = [...this.root.querySelectorAll<HTMLElement>(
        `.actor.foe[data-i="${this.target}"] .queen-worker:not([hidden])`,
      )]
      const firstWorker = res.summonsDispersed > 0
        ? visibleWorkers[Math.max(0, visibleWorkers.length - res.summonsDispersed)]
        : visibleWorkers[visibleWorkers.length - 1]
      if (firstWorker) {
        GameAudio.playSwordHit(this.swordHitCount++)
        SquareBurst.playOn(firstWorker, 'damage', { spread: heavy ? 150 : 92 })
        this.hitOne(firstWorker)
      }
      if (firstWorker) await stopFirstHit(firstWorker)
      await this.playSummonDispersal(
        this.target,
        res.summonsDispersed,
        res.summonDamage,
        res.summonBacklashDamage,
        res.summonFocusedBacklash,
        res.summonGroggyTriggered,
        chainContinuesToBody,
        false,
      )
    }

    let remainingSwordHits = res.hits.filter((hit) =>
      hit.dmg > 0 && !hit.summonShieldBlocked && !hit.magicShieldBroken,
    ).length
    for (const h of res.hits) {
      if (h.summonShieldBlocked) {
        this.popAt(h.target, QUEEN_ESCORT_IMMUNITY_LABEL, 'guard big')
        continue
      }
      if (h.magicShieldBroken) {
        const shieldTarget = this.q<HTMLElement>(`#actors .actor.foe[data-i="${h.target}"]`)
        await this.playSpellShieldImpact(h.target, h.magicShieldRemaining)
        if (shieldTarget) await stopFirstHit(shieldTarget)
        continue
      }
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${h.target}"]`)
      if (h.dmg > 0) {
        GameAudio.playSwordHit(this.swordHitCount++)
        remainingSwordHits--
      }
      if (el) {
        // 강타는 접점의 섬광을 먼저 피운다 — 정지 프레임에 붙들 그림이 있어야 한다.
        if (heavy) this.flashImpact(el, this.encounterHp > 0 ? h.dmg / this.encounterHp : 0)
        SquareBurst.playOn(el, 'damage', { spread: heavy ? 190 : 120 })
        this.hitOne(el)
      }
      this.popAt(h.target, `${h.partName ? `${h.partName} ` : ''}${h.dmg}`, `dmg big${h.weak ? ' weak' : ''}`)
      if ((h.barOverflow ?? 0) > 0) this.playBossBarOverkill(h.target, h.barOverflow ?? 0, !!h.barOverflowPassed)
      if ((h.barsBroken ?? 0) > 0) this.playBossBarBreak(h.target, h.barsBroken ?? 1, !!h.barOverflowPassed)
      if (h.webBurst) this.playSpiderWebBurst(h.target, h.tensionReduced ?? 0)
      else if (h.webCut) this.playSpiderWebCut(h.target, h.tensionReduced ?? 0)
      if ((h.barsBroken ?? 0) > 0 && h.partId) this.playSpiderPartBreak(h.target, h.partId, h.barsBroken ?? 1)
      if (el) await stopFirstHit(el)
      if (remainingSwordHits > 0) await sleep(SWORD_HIT_GAP_MS)
    }
    if (res.supportWebCut) this.playSpiderWebCut(res.supportWebCut.target, res.supportWebCut.tensionReduced)
    // 실제로 attack 애니메이션이 닿은 첫 대상만 붙든다. 보호막·무적 때문에 대상 연출이
    // 없거나 이후 resolveOverflow로 이어지는 연쇄 타격에는 히트스톱을 만들지 않는다.
    // 강타는 정지가 풀리는 순간 곧바로 검기가 나가야 한다. 여기서부터 아래는 전부
    // 기다리지 않는다 — 돌진 마무리도, 수치가 날아가는 것도, 쓰러지는 것도 뒤에서
    // 저절로 일어난다. 정지 한 순간 말고 텀이 하나라도 더 끼면 "탕→촥"이 안 된다.
    if (attacking) {
      if (heavy) this.timers.push(window.setTimeout(() => you.classList.remove('lunge', 'heavy-lunge'), 250))
      else {
        await sleep(250)
        you.classList.remove('lunge', 'heavy-lunge')
      }
    }
    // 회복/자해 수치도 플레이어에게 각각 날아가 꽂힌다. 방어는 준비 단계에서 처리한다.
    if (res.selfDmg) {
      // 내가 쓴 문장이 나를 깎았다 — 여기서 쓰러지면 사인은 벌레가 아니라 이 문장이다.
      this.lastHurtBy = { kind: 'self', sentence: this.lastSentence }
      const fly = this.flyToPlayer(`${res.selfDmg}`, 'self', 'self')
      if (!heavy) await fly
    }
    if (res.heal) {
      GameAudio.play('heal')
      playCharacterAnimation(you, 'heal')
      const fly = this.flyToPlayer(`+${res.heal}`, 'heal', 'heal')
      if (!heavy) await fly
    }
    // 처치된 적은 레일이 당겨지기 전에 카드가 쓰러지며 회색으로 소멸.
    // 강타의 일반 적은 검기 흐름을 위해 뒤에서 쓰러져도 되지만, 보스는 체력바가
    // 0까지 내려간 뒤 사망해야 한다. 여기서 기다리지 않으면 allDead 판정이 먼저
    // finishWin을 열어 체력이 남아 보이는 채 CLEAR가 덮인다.
    if (heavy) {
      for (const k of res.killed) {
        if (this.state.enemies[k]?.def.boss) await this.playDeath(k, 1, true)
        else void this.playDeath(k, 1, true)
      }
    } else {
      for (const k of res.killed) await this.playDeath(k, 1, sweep)
    }
  }

  /** 체력 막이 깨질 때 대응하는 3D 다리 메시를 디졸브하고 아래로 떨어뜨린다. */
  private playSpiderPartBreak(enemyIdx: number, partId: string, count: number) {
    const actor = this.root.querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"]`)
    const part = this.root.querySelector<HTMLElement>(`.spider-part[data-part-id="${partId}"]`)
    if (part) {
      part.classList.add('breaking')
      for (let i = 0; i < 10; i++) {
        const fleck = document.createElement('i')
        fleck.className = 'spider-dissolve-fleck'
        fleck.style.setProperty('--x', `${(Math.random() - .5) * 90}px`)
        fleck.style.setProperty('--y', `${20 + Math.random() * 55}px`)
        fleck.style.setProperty('--delay', `${Math.random() * 180}ms`)
        part.append(fleck)
      }
    }
    actor?.classList.add('leg-dissolving')
    dissolveCharacterParts(actor ?? null, partId, count)
    actor?.dispatchEvent(new CustomEvent('enemy-part-break', {
      detail: { partId, count },
      bubbles: true,
    }))
    this.timers.push(window.setTimeout(() => actor?.classList.remove('leg-dissolving'), 820))
  }

  /** 막을 넘긴 충격을 상단 보스 체력바 안에서 직접 읽히게 한다. */
  private playBossBarOverkill(enemyIdx: number, amount: number, passed: boolean) {
    if (amount <= 0 || !this.state.enemies[enemyIdx]?.def.boss) return
    const bar = this.root.querySelector<HTMLElement>('#boss-health-hud .hpbar.foe')
    if (!bar) return
    bar.querySelector('.boss-bar-overkill')?.remove()
    const fx = document.createElement('span')
    fx.className = `boss-bar-overkill ${passed ? 'is-passed' : 'is-stopped'}`
    fx.setAttribute('aria-hidden', 'true')
    bar.append(fx)
    this.timers.push(window.setTimeout(() => fx.remove(), 700))
  }

  /** 보스 체력 막이 실제로 깨진 결과를 화면 중앙과 체력바 양쪽에서 동시에 읽힌다. */
  private playBossBarBreak(enemyIdx: number, count: number, passed: boolean) {
    if (count <= 0 || !this.state.enemies[enemyIdx]?.def.boss) return
    const hud = this.root.querySelector<HTMLElement>('#boss-health-hud')
    const pbox = this.q<HTMLElement>('#pbox')
    if (!hud) return

    hud.classList.remove('boss-bar-breaking', 'boss-bar-pierced')
    void hud.offsetWidth
    hud.classList.add(passed && count > 1 ? 'boss-bar-pierced' : 'boss-bar-breaking')

    const banner = document.createElement('div')
    banner.className = `boss-bar-break-banner${passed && count > 1 ? ' pierced' : ''}`
    banner.innerHTML = passed && count > 1
      ? `<small>한 번에 돌파</small><b>체력 막 ×${count} 관통!</b>`
      : '<small>경계 파괴</small><b>체력 막 파괴!</b>'
    pbox.append(banner)

    const bar = hud.querySelector<HTMLElement>('.hpbar.foe')
    if (bar) {
      for (let i = 0; i < Math.min(12, 5 + count * 3); i++) {
        const shard = document.createElement('i')
        shard.className = 'boss-bar-shard'
        shard.style.setProperty('--x', `${(Math.random() - .5) * (180 + count * 35)}px`)
        shard.style.setProperty('--y', `${(Math.random() - .5) * 90}px`)
        shard.style.setProperty('--r', `${(Math.random() - .5) * 150}deg`)
        shard.style.setProperty('--delay', `${Math.random() * 55}ms`)
        bar.append(shard)
        this.timers.push(window.setTimeout(() => shard.remove(), 720))
      }
    }
    this.shakeStage(passed && count > 1 ? 1.45 : .72)
    this.timers.push(window.setTimeout(() => {
      banner.remove()
      hud.classList.remove('boss-bar-breaking', 'boss-bar-pierced')
    }, 880))
  }

  private playSpiderWebCut(enemyIdx: number, _reduced: number) {
    const scene = this.q<HTMLElement>('.scene.battle')
    const released = this.cardHand.releaseSealed(1)
    scene.classList.remove('spider-web-cut')
    void scene.offsetWidth
    scene.classList.add('spider-web-cut')
    this.popAt(enemyIdx, released > 0 ? '약점 파훼! 카드 봉인 -1' : '약점 파훼!', 'buff big')
    this.log(`현재 다리의 약점을 문장에 담아 카드 봉인 ${released}개를 풀었다.`)
    this.showBossSentenceEvent(released > 0 ? bossText('weakenWeb') : bossText('shakeClause'))
    this.resolveBossPattern(TOKEN_BOSS_HINTS.elderSpiderWebCut)
    this.timers.push(window.setTimeout(() => scene.classList.remove('spider-web-cut'), 720))
  }

  private playSpiderWebBurst(enemyIdx: number, _reduced: number) {
    const scene = this.q<HTMLElement>('.scene.battle')
    const released = this.cardHand.releaseAllSealed()
    scene.classList.remove('spider-web-burst')
    void scene.offsetWidth
    scene.classList.add('spider-web-burst')
    for (let i = 0; i < 20; i++) {
      const strand = document.createElement('span')
      strand.className = 'web-burst-strand'
      strand.style.setProperty('--angle', `${i * 18 + (Math.random() - .5) * 14}deg`)
      strand.style.setProperty('--distance', `${430 + Math.random() * 480}px`)
      strand.style.setProperty('--delay', `${Math.random() * 90}ms`)
      scene.append(strand)
      this.timers.push(window.setTimeout(() => strand.remove(), 940))
    }
    this.popAt(enemyIdx, '다리 절단! 거미줄 전부 해제!', 'buff big')
    this.log(`다리가 떨어지는 충격에 카드 봉인 ${released}개가 즉시 풀렸다.`)
    // 다리가 바뀌면 노려야 할 감정도 바뀐다. 부위 목록의 작은 뱃지만으로는
    // 순서가 넘어간 순간을 놓치므로, 토큰이 다음 약점을 이름으로 불러 준다.
    const nextWeak = activeEnemyPart(this.state.enemies[enemyIdx])?.def.weakness?.label ?? null
    this.showBossSentenceEvent(nextWeak
      ? bossText('nextLegRecover', { weakness: currentLocale === 'ko' ? eul(nextWeak) : nextWeak })
      : bossText('allClausesErased'))
    this.resolveBossPattern(spiderNextWeaknessLine(nextWeak))
    this.timers.push(window.setTimeout(() => scene.classList.remove('spider-web-burst'), 880))
  }

  // 적 사망 연출 — 카드가 살짝 젖혀졌다 옆으로 쓰러지고, 회색으로 변하며 소멸.
  // combo가 높을수록 튀는 불꽃이 많아 관통 콤보의 화려함이 커진다.
  // fast면 쓸려나가는 흐름이 끊기지 않게 짧고 세게 끝낸다.
  private async playDeath(idx: number, combo = 1, fast = false): Promise<void> {
    // 모든 사망 경로(본타격·관통·예약 문장·반격)가 이 함수를 지난다 — 종류별 처치는
    // 여기 한 곳에서만 센다.
    this.noteKill(idx)
    const enemy = this.state.enemies[idx]
    // 상태의 hp/dead는 타격 계산 때 이미 확정된다. 보스 HUD는 별도 DOM이라
    // renderActors를 건너뛰는 강타에서도 직접 0을 칠하고, 폭 전환이 끝난 뒤에야
    // defeat를 시작한다: 공격 → 체력 감소 → 0 → 사망 → 클리어.
    if (enemy?.def.boss && enemy.dead) await this.drainDefeatedBossHealth(enemy)
    const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${idx}"]`)
    if (!el) return
    el.classList.remove('lunge')
    playCharacterAnimation(el, 'defeat')
    el.classList.add('dying')
    if (fast) el.classList.add('fast')
    this.spawnSparks(el, 8 + combo * 5)
    await sleep(fast ? 190 : 560)
  }

  /** 보스 사망 판정보다 먼저 상단 체력바가 실제 0에 도착하도록 동기화한다. */
  private async drainDefeatedBossHealth(enemy: EnemyInst): Promise<void> {
    const hud = this.root.querySelector<HTMLElement>('#boss-health-hud')
    if (!hud) return
    const fill = hud.querySelector<HTMLElement>('.hpbar.foe > .fill')
    const alreadyEmpty = fill?.style.width === '0%'
    this.updateFoePlate(hud, enemy, true)
    if (!fill || alreadyEmpty) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return
    }
    if (this.motionOff()) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        fill.removeEventListener('transitionend', done)
        clearTimeout(fallback)
        resolve()
      }
      const done = (event: TransitionEvent) => {
        if (event.propertyName === 'width') finish()
      }
      fill.addEventListener('transitionend', done)
      // DOM 교체·백그라운드 탭 등으로 transitionend가 빠져도 전투가 멈추지 않는다.
      const fallback = window.setTimeout(finish, 560)
    })
  }

  /** 매직실드가 공격을 삼킨 순간의 결정 균열. 마지막 겹은 체력바 밖으로 파편이 터진다. */
  private async playSpellShieldImpact(target: number, remaining: number): Promise<void> {
    const actor = this.q<HTMLElement>(`#actors .actor.foe[data-i="${target}"]`)
    const hpbar = actor?.querySelector<HTMLElement>('.hpbar.foe')
    const overlay = hpbar?.querySelector<HTMLElement>('.spellshield-overlay')
    if (!actor || !hpbar || !overlay) return

    const removed = remaining <= 0
    overlay.hidden = false
    overlay.querySelector<HTMLElement>('b')!.textContent = remaining > 1 ? `×${remaining}` : ''
    overlay.classList.remove('cracking', 'shattering')
    void overlay.offsetWidth
    overlay.classList.add(removed ? 'shattering' : 'cracking')
    this.popAt(target, removed ? '매직실드 파괴!' : `매직실드 ${remaining}겹`, 'guard')
    if (removed) this.spawnCrystalShards(hpbar)
    await sleep(removed ? 360 : 180)
    const enemy = this.state.enemies[target]
    if (removed && enemy?.def.id === 'elderSpider') {
      const weak = activeEnemyPart(enemy)?.def.weakness?.label
      if (weak) this.showBossTokenHint(bossTokenLine('spiderShieldBroken', 'relief', { weakness: weak }))
    }
  }

  private spawnCrystalShards(hpbar: HTMLElement) {
    const host = this.q('#pbox')
    const screenRect = hpbar.getBoundingClientRect()
    const rect = this.toStage(screenRect)
    for (let i = 0; i < 14; i++) {
      const shard = document.createElement('i')
      shard.className = 'spellshield-shard'
      shard.style.left = `${rect.x + Math.random() * screenRect.width}px`
      shard.style.top = `${rect.y + screenRect.height * 0.5}px`
      shard.style.setProperty('--shard-x', `${(Math.random() - 0.5) * 150}px`)
      shard.style.setProperty('--shard-y', `${-25 - Math.random() * 90}px`)
      shard.style.setProperty('--shard-r', `${(Math.random() - 0.5) * 240}deg`)
      shard.style.setProperty('--shard-delay', `${Math.random() * 70}ms`)
      host.appendChild(shard)
      this.timers.push(window.setTimeout(() => shard.remove(), 720))
    }
  }

  /**
   * 열기 단계 — 이 수치가 판 크기의 몇 할인가로 0~3을 매긴다.
   * 3은 액션 컷이 터지는 문턱과 같은 자리다. 집계판이 미쳐 날뛰다가 그대로 컷으로
   * 이어지도록 두 연출이 같은 기준을 공유한다.
   */
  private feverOf(value: number): number {
    if (this.encounterHp <= 0 || value <= 0) return 0
    const ratio = value / this.encounterHp
    if (ratio >= PUMP_RATIO) return 3
    if (ratio >= PUMP_RATIO * 0.66) return 2
    if (ratio >= PUMP_RATIO * 0.33) return 1
    return 0
  }

  /** 집계판에 지금 열기를 반영한다. 오르기만 하고 내려가지 않는다 — 달아오른 판은 안 식는다. */
  private setFever(el: HTMLElement, value: number) {
    const next = this.feverOf(value)
    if (next <= Number(el.dataset.fever ?? 0)) return
    el.dataset.fever = String(next)
    this.fitTallyToStage(el)
  }

  // 이 일격으로 몇 마리가 쓸려나가는지 미리 센다 — 오버킬 연출 트리거.
  private predictKills(dmg: number, target: number, aoe: boolean): number {
    if (dmg <= 0) return 0
    const alive = aliveIdx(this.state)
    if (aoe) return alive.filter((i) => this.state.enemies[i].hp <= dmg).length
    let left = dmg
    let kills = 0
    for (const i of alive) {
      if (i < target) continue
      const e = this.state.enemies[i]
      if (left < e.hp) break
      left -= e.hp
      kills++
    }
    return kills
  }

  // 쓸어담기 직전 — 화면이 타격점 쪽으로 빨려들며 시간이 늘어진다.
  /**
   * 강타의 예비 동작 — 달라붙기 전에 화면이 조여들고, 프롬이 칼을 들어올린 채 멈춘다.
   *
   * attack 클립은 원본 2417ms인데 평소엔 440ms(5.5배속)로 눌러 쓴다. 스물여섯 프레임에
   * 휘두르고 끝나니 예비 동작이 물리적으로 없다. 강타에서만 클립을 HEAVY_SWING_MS로
   * 늘려 정점(매니페스트 attackBeats.raise)에서 mixer를 얼린다.
   *
   * 얼어 있는 동안 액션 컷 패널을 겹쳐 튼다 — 예전엔 이 패널이 다 지나간 **다음에**
   * 휘둘러서, 가장 짜릿해야 할 두 순간이 서로 남처럼 떨어져 있었다.
   */
  private async heavyWindup(cut: AttackCut) {
    if (this.motionOff()) {
      // 연출을 끄면 확대·정지 없이 컷만 한 번 지나가고 곧바로 꽂힌다.
      await this.attackCine?.play(cut)
      return
    }
    const you = this.q<HTMLElement>('.actor.you')
    const scene = this.q('.scene.battle')
    this.focusStageOn(this.target)
    scene.classList.add('heavy-windup')
    this.q('#actors').classList.add('slowmo')

    const swing = playCharacterAnimation(you, 'attack', HEAVY_SWING_MS) || HEAVY_SWING_MS
    const beats = this.playerVisual.animations?.attackBeats
    // 실측 마디가 없는 모델은 절반쯤을 정점으로 본다 — 대개 그 근처에서 팔이 가장 높다.
    await sleep(swing * (beats?.raise ?? 0.45))
    freezeCharacterAnimation(you, true)
    you.classList.add('blade-charge')
    this.heavyHeld = true
    GameAudio.play('paperAttack')

    // 칼을 든 채 멈춘 이 정지 화면 위로 컷이 밀려 들어온다.
    //
    // 붙들고 있는 시간은 **컷이 원래 쓰던 길이**(holdMsFor)를 그대로 쓴다. 여기에
    // 짧은 상수를 넣었더니 한창일 때 멈춰서 빠지는 원본 타이밍이 통째로 잘려 나갔다 —
    // 컷은 들어오고, 한창 돌고, 그 그림을 들고 물러나는 한 덩이여야 한다.
    const opened = this.attackCine?.open(cut) ?? false
    if (opened) {
      await sleep((this.attackCine?.enterMs ?? 0) + (this.attackCine?.holdMsFor(cut) ?? HEAVY_HOLD_MS))
      // 컷이 스스로 물러나는 것과 같은 방식으로 치운다(멈춘 그림을 들고 왼쪽으로).
      await this.attackCine?.close()
      await sleep(HEAVY_PANEL_CLEAR_MS)
    } else {
      // 컷이 아직 안 데워졌으면 정점만 짧게 붙들고 곧바로 내리친다.
      await sleep(HEAVY_HOLD_MS)
    }
  }

  /**
   * 정점에서 붙들고 있던 칼을 놓는다 — 컷이 빠져나간 빈 화면에 내리친다.
   * 돌진(0.44초 중 42%가 최대)은 타격 프레임에 딱 붙도록 조금 먼저 출발시킨다.
   * @returns 타격이 꽂히기까지 남은 시간(ms)
   */
  private heavyRelease(you: HTMLElement): number {
    you.classList.remove('blade-charge')
    this.heavyHeld = false
    if (this.motionOff()) return 0
    const beats = this.playerVisual.animations?.attackBeats
    const raise = beats?.raise ?? 0.45
    const impact = beats?.impact ?? 0.55
    freezeCharacterAnimation(you, false)
    return Math.max(60, HEAVY_SWING_MS * (impact - raise))
  }

  /**
   * 칼이 몸에 닿는 지점에 터지는 섬광. 여태 타격점이라는 개념이 없어서 — 폭발은 적
   * 엘리먼트 전체에, 숫자는 발밑에 떴다 — 몇이 꽂혔는지만 읽히고 어디를 맞았는지는
   * 안 보였다. 돌진해 온 프롬과 적 실루엣이 만나는 앞면에 찍는다.
   */
  private flashImpact(foe: HTMLElement, power: number) {
    if (this.motionOff()) return
    const shell = foe.querySelector<HTMLElement>('.model-shell') ?? foe
    const rect = shell.getBoundingClientRect()
    const { x, y } = this.toStageCenter(rect)
    const tier = this.heavyTier()
    const step = this.heavyTierStep()
    const flash = document.createElement('div')
    flash.className = 'impact-flash'
    flash.dataset.tier = String(step)
    // 프롬이 오른쪽으로 파고들어 때리므로 접점은 적 실루엣의 왼쪽 앞면이다.
    flash.style.left = `${x - rect.width * 0.22}px`
    flash.style.top = `${y}px`
    // 크기는 이 판을 얼마나 깎았는지(power)와 배율 등급(tier)을 함께 태운다.
    flash.style.setProperty('--power', (0.9 + power * 0.7 + tier * 0.8).toFixed(2))
    flash.style.setProperty('--tier', tier.toFixed(2))
    // 겹: 흰 심 → 프리즘 굴절 → 충격 링 → 베인 사선. 등급이 오르면 교차 베기가 하나 더 붙는다.
    flash.innerHTML = '<i class="if-core"></i><i class="if-prism"></i><i class="if-ring"></i>'
      + '<i class="if-slash"></i>'
      + (step >= 2 ? '<i class="if-slash alt"></i>' : '')
      + (step >= 3 ? '<i class="if-ring late"></i><i class="if-shards"></i>' : '')
    this.q('#pbox').appendChild(flash)
    this.timers.push(window.setTimeout(() => flash.remove(), 900))
  }

  // ── 런 기록 ── 결과 화면의 찢어진 종이에 적힐 값들을 여기서만 손댄다.

  /** 문장 하나가 정산될 때 — 문장 수, 최고 배율, 가장 센 한 방과 그 문장. */
  private noteSentence(sentence: string, mult: number, dmg: number) {
    this.lastSentence = sentence
    this.record.sentences += 1
    if (mult > this.record.bestMult) this.record.bestMult = mult
    if (dmg > (this.record.bestHit?.dmg ?? 0)) this.record.bestHit = { dmg, sentence }
  }

  /** 벌레 한 마리가 쓰러질 때 — 이름별로 센다. 종이에 "흰개미 ×7"로 늘어놓는다. */
  private noteKill(idx: number) {
    const name = this.state.enemies[idx]?.def.name
    if (!name) return
    this.record.kills[name] = (this.record.kills[name] ?? 0) + 1
  }

  /** 관통이 이어질 때마다 — 이 런의 최고 콤보를 남긴다. */
  private noteCombo(combo: number) {
    if (combo > this.record.bestCombo) this.record.bestCombo = combo
  }

  /** 적의 타격이 실제로 체력을 깎을 때 — 쓰러지면 이 벌레가 사인이 된다. */
  private noteAttacker(idx: number) {
    const def = this.state.enemies[idx]?.def
    if (!def) return
    this.lastHurtBy = { kind: 'enemy', enemyId: def.id, name: def.name, sprite: def.sprite, note: def.note }
    // 토큰이 가장 크게 흔들리는 사건. 남은 체력이 얼마 없으면 더 크게 흔들린다.
    this.token?.feel(this.state.playerHp <= this.state.playerMax * 0.3 ? 'playerNearDeath' : 'playerHurt')
  }

  /** 슬로우·딤·확대가 한 점을 보게 초점을 맞춘다. */
  private focusStageOn(enemyIdx: number) {
    const front = this.root.querySelector<HTMLElement>(`#actors .actor.foe[data-i="${enemyIdx}"]`)
    if (!front) return
    const box = this.q('#pbox')
    const x = this.toStage(front.getBoundingClientRect()).x
    const pct = `${((x / box.offsetWidth) * 100).toFixed(1)}%`
    this.q('#actors').style.setProperty('--zoom-x', pct)
    this.q('.scene.battle').style.setProperty('--zoom-x', pct) // 씬 전체 딤도 같은 초점을 쓴다
  }

  /**
   * 배율이 곧 화려함이다 — 문턱(×2)에서 0, 압도적인 문장(×8)에서 1.
   * 잘 쌓은 문장에 더 큰 연출을 돌려주는 게 이 게임의 보상 구조다.
   */
  private heavyTier(): number {
    return Math.min(1, Math.max(0, (this.heavyMult - PUMP_MULT) / (HEAVY_MULT_CEILING - PUMP_MULT)))
  }

  /** 단계별로 갈리는 겹(프리즘 링·교차 베기·잔상 수)을 CSS에 넘길 등급. */
  private heavyTierStep(): 1 | 2 | 3 {
    const tier = this.heavyTier()
    return tier >= 0.66 ? 3 : tier >= 0.33 ? 2 : 1
  }

  /** 저사양이나 동작 최소화 설정에서는 확대·정지·흔들림을 건너뛴다. */
  private motionOff(): boolean {
    return document.documentElement.dataset.effects === 'low'
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  private async slowmoWindup() {
    this.focusStageOn(this.target)
    this.q('#actors').classList.add('slowmo')
    // 딤은 씬 전체에 건다 — 무대(.stage-area)에 걸면 하단 350px에서 잘린다.
    this.q('.scene.battle').classList.add('slowmo-veil')
    await sleep(340)
  }

  private endSlowmo() {
    this.q('#actors').classList.remove('slowmo')
    this.q('.scene.battle').classList.remove('slowmo-veil', 'heavy-windup', 'hit-stop')
  }

  // 불꽃 파편 — 지정 배우 근처에서 사방으로 튀며 사그라든다.
  private spawnSparks(el: HTMLElement, count: number) {
    const pbox = this.q('#pbox')
    const r = this.toStage(el.getBoundingClientRect())
    const cx = r.x
    const cy = r.y + 150 // 스프라이트 몸통 근처
    for (let i = 0; i < count; i++) {
      const s = document.createElement('div')
      s.className = 'spark'
      s.style.left = `${cx}px`
      s.style.top = `${cy}px`
      pbox.appendChild(s)
      const ang = Math.random() * Math.PI * 2
      const dist = 60 + Math.random() * 150
      const dx = Math.cos(ang) * dist
      const dy = Math.sin(ang) * dist - 50 // 살짝 위로 솟구쳤다 흩어짐
      const dur = 420 + Math.random() * 380
      s.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(0.15)`, opacity: 0 },
        ],
        { duration: dur, easing: 'cubic-bezier(0.2,0.7,0.3,1)' },
      )
      this.timers.push(window.setTimeout(() => s.remove(), dur + 60))
    }
  }

  // 관통 콤보 배지 — "관통 ×N". 콤보가 오를수록 크고 뜨겁게.
  private showComboBadge(combo: number) {
    if (combo < 2) return
    const b = document.createElement('div')
    b.className = 'combo-badge'
    b.style.setProperty('--cb', String(Math.min(combo, 6)))
    b.innerHTML = `<span class="cb-x">관통</span><span class="cb-n">×${combo}</span>`
    this.q('#pbox').appendChild(b)
    this.timers.push(window.setTimeout(() => b.remove(), 900))
  }

  // 화면 흔들림 — 관통이 깊을수록 강하게(0~1).
  private shakeStage(intensity: number) {
    if (intensity <= 0) return
    const px = 5 + intensity * 13
    this.q('#pbox').animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${px.toFixed(0)}px, ${(-px * 0.5).toFixed(0)}px)` },
        { transform: `translate(${(-px * 0.8).toFixed(0)}px, ${(px * 0.4).toFixed(0)}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 230, easing: 'ease-out' },
    )
  }

  // 오버플로우 — 초과 피해가 꼬챙이처럼 다음 적을 깊게 관통한다(빠바바박).
  // 한 마리씩 쓰러질수록 콤보가 오르고 불꽃·흔들림·배지가 점점 화려해진다.
  // 강타에서는 그 초과 피해가 검기가 되어 레일을 훑고 뒤로 빠져나간다.
  // 반환값: 관통으로 추가 처치한 수(전투 중 처치 누적과 패시브 계산용).
  private async resolveOverflow(
    overflow: number,
    sweep = false,
    heavy: AttackCut | null = null,
    intent?: Pick<Intent, 'emotions' | 'tags' | 'combos'>,
  ): Promise<number> {
    const actors = this.q('#actors')
    if (sweep) actors.classList.add('rail-rush')
    let combo = 1 // strike의 첫 처치가 콤보 1. 관통마다 +1.
    let killedCount = 0
    // 검기는 방금 베인 자리에서 다음 적으로 이어져야 한 줄기로 읽힌다.
    let lastHit = this.root.querySelector<HTMLElement>(`#actors .actor.foe[data-i="${this.target}"]`)
    while (overflow > 0 && !allDead(this.state)) {
      const front = frontIdx(this.state)
      if (front < 0) break
      combo++
      // 검기는 레일 **뒤로** 뻗는 한 줄기다. 그래서 당겨오기 전, 적이 아직 자기 자리에
      // 서 있는 동안 그 자리로 날아가 꽂힌다. 예전 흐름(당겨온 뒤에 꽂기)에서는 궤적이
      // 오히려 플레이어 쪽으로 되돌아와서 "뒤로 관통한다"가 거꾸로 읽혔다.
      if (!heavy) this.renderActors() // 다음 적이 최전방으로 당겨온다
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${front}"]`)
      const ember = this.showEmber(overflow, combo)
      const power = this.encounterHp > 0 ? overflow / this.encounterHp : 0
      const beamMs = heavy ? this.launchSlashBeam(lastHit, el, power) : 0
      // 콤보가 오를수록 대기가 짧아져 관통이 빨라진다(빠·바·바·박).
      // 쓸어담기 중이면 아예 고속도로 — 죽고 당겨오고가 끊김 없이 이어진다.
      // 검기가 날아가는 중이면 그게 도착하는 순간이 곧 타격 순간이다.
      const gap = sweep ? Math.max(70, 180 - combo * 30) : Math.max(200, 480 - combo * 66)
      await sleep(beamMs > 0 ? beamMs : gap)
      // 오버킬 전이는 일반 방어막과 매직실드를 소모하지 않고 체력에 직접 꽂힌다.
      // 실제 상태 변경은 코어가 맡아 부위 보스의 체력 막도 함께 동기화한다.
      const transfer = applyOverkillTransfer(this.state, front, overflow, {
        emotions: intent?.emotions,
        tags: intent?.tags,
        comboMatched: (intent?.combos.length ?? 0) > 0,
      })
      GameAudio.playSwordHit(this.swordHitCount++)
      // 깊고 화려한 관통 — 콤보에 따라 블라스트/불꽃/흔들림이 커진다.
      ember.classList.add('stab')
      this.showComboBadge(combo)
      if (el) {
        if (heavy) this.flashImpact(el, power)
        SquareBurst.playOn(el, 'damage', { spread: 120 + combo * 46 })
        this.hitOne(el)
        this.spawnSparks(el, 6 + combo * 4)
        lastHit = el
      }
      // 검기가 훑는 동안은 화면을 흔들지 않는다 — 관통마다 흔들면 지나가는 한 줄기가
      // 아니라 매번 뭔가 터지며 멈추는 것으로 읽힌다(정지는 첫 칼질 한 번뿐이다).
      if (!heavy) this.shakeStage(Math.min(1, combo / 5))
      this.popAt(front, `${overflow}`, 'dmg big')
      this.timers.push(window.setTimeout(() => ember.remove(), 220))
      // 맞은 다음에 레일이 움직인다 — 검기가 꽂힌 자리에서 쓰러지고, 그 뒤에 당겨온다.
      if (heavy) this.renderActors()
      // 또 넘겼으면 카드가 쓰러진 뒤 남은 초과 피해가 다음 적으로 연쇄된다.
      if (transfer.killed) {
        killedCount++
        this.noteCombo(combo)
        if (heavy) {
          // 쓰러지는 건 기다리지 않는다. 검기는 이미 다음 적으로 가 있고, 베인 것들은
          // 그 뒤에서 우후죽순 넘어가야 한다 — 시체마다 기다리면 줄기가 공중에 멈춘다.
          void this.playDeath(front, combo, true)
        } else {
          await this.playDeath(front, combo, sweep)
        }
        overflow = transfer.overflow
      } else {
        overflow = 0
        await sleep(sweep ? 160 : heavy ? 90 : 320)
      }
    }
    this.renderActors()
    // 다 훑은 검기는 멈추지 않고 레일 뒤 화면 밖으로 주르륵 빠져나간다.
    if (heavy) this.launchSlashBeam(lastHit, null, 0.4)
    if (sweep) this.timers.push(window.setTimeout(() => actors.classList.remove('rail-rush'), 460))
    return killedCount
  }

  /**
   * 검기 — 초과 피해가 한 줄기 궤적이 되어 레일을 훑는다. 여태 초과 피해는 숫자가
   * 360px 찔러 들어가는 그림이라, 몇이 넘쳤는지는 읽혀도 그게 뒷줄까지 뻗는 한 방이라는
   * 건 안 보였다. 받을 적이 없으면 레일 뒤 화면 밖으로 빠져나간다.
   *
   * 조준은 목표의 **지금** 위치다 — 레일이 당겨오는 중이면 도착 지점과 조금 어긋나지만,
   * 당겨오는 거리(약 245px)가 적 실루엣(280px)보다 짧아서 몸통 안에는 들어간다.
   * @returns 날아가는 데 걸리는 시간(ms). 연출이 꺼져 있으면 0.
   */
  private launchSlashBeam(from: HTMLElement | null, to: HTMLElement | null, power: number): number {
    if (this.motionOff()) return 0
    const box = this.q('#pbox')
    const stage = currentFieldStage()
    // 앞줄이 쓰러진 자리 — 그 적의 엘리먼트는 이미 풀로 돌아갔을 수 있어서 자리로 잡는다.
    // .actor는 오른쪽 기준으로 놓이므로 중심은 (무대 너비 - right - 실루엣 절반)이다.
    const frontSlot = { x: box.offsetWidth - stage.railRight - 140, y: box.offsetHeight * 0.52 }
    // 쓰러진 적은 풀로 돌아가 DOM에서 떨어진다. 떨어진 노드의 rect는 전부 0이라 그대로
    // 쓰면 검기가 화면 좌상단 구석에서 출발한다(실측으로 그랬다).
    const centerOf = (el: HTMLElement | null) => {
      if (!el?.isConnected) return null
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 ? this.toStageCenter(rect) : null
    }
    const start = centerOf(from) ?? frontSlot
    // 다음 적에게 정확히 날아간다. 이때 그 적은 아직 당겨지지 않고 자기 자리(레일 뒤)에
    // 서 있어야 한다 — 그래서 관통 전에는 레일을 다시 그리지 않는다(resolveOverflow 참고).
    // 궤적은 **올곧다**. 목표 높이로 기울이면 레일을 훑는 한 줄기가 아니라 여러 번
    // 꺾인 선으로 읽힌다 — 높이는 출발점에 고정하고 가로로만 뻗는다.
    const aim = centerOf(to)
    const end = { x: aim ? aim.x : box.offsetWidth + 360, y: start.y }
    const tier = this.heavyTier()
    const step = this.heavyTierStep()
    const beam = document.createElement('div')
    beam.className = 'slash-beam'
    beam.dataset.tier = String(step)
    beam.style.left = `${start.x}px`
    beam.style.top = `${start.y}px`
    beam.style.setProperty('--power', (0.85 + power + tier * 0.6).toFixed(2))
    beam.style.setProperty('--tier', tier.toFixed(2))
    // 잔상 겹은 등급에 따라 늘어난다 — 날 하나만 날아가면 그냥 막대로 읽힌다.
    // 잔상 → 번짐 → 구운 날 → 앞날 순으로 쌓아 뒤에서 앞으로 두꺼워진다.
    const trails = 2 + Math.round(tier * 3)
    beam.innerHTML = Array.from({ length: trails }, (_, i) =>
      `<i class="sb-trail" style="--i:${i}"></i>`).join('')
      + '<i class="sb-bloom"></i><i class="sb-blade"></i><i class="sb-edge"></i>'
      + (step >= 2 ? '<i class="sb-spiral"></i>' : '')
      + (step >= 3 ? '<i class="sb-motes"></i>' : '')
    box.appendChild(beam)

    // 배율이 높으면 조금 더 길게 뻗는다 — 궤적이 화면에 남는 시간도 등급이다.
    const travel = Math.round((to ? SLASH_BEAM_MS : SLASH_BEAM_MS * 1.7) * (1 + tier * 0.25))
    const dx = end.x - start.x
    const dy = end.y - start.y
    beam.animate(
      [
        // 첫 프레임부터 보이게 둔다 — 0에서 시작하면 발사 순간이 빈 화면으로 지나간다.
        { transform: 'translate(-50%, -50%) scaleX(0.5)', opacity: 0.75 },
        { transform: `translate(calc(-50% + ${(dx * 0.3).toFixed(0)}px), calc(-50% + ${(dy * 0.3).toFixed(0)}px)) scaleX(1.18)`, opacity: 1, offset: 0.28 },
        { transform: `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px)) scaleX(0.92)`, opacity: to ? 1 : 0 },
      ],
      { duration: travel, easing: to ? 'cubic-bezier(0.2, 0.8, 0.3, 1)' : 'cubic-bezier(0.3, 0.5, 0.7, 1)', fill: 'forwards' },
    )
    this.timers.push(window.setTimeout(() => beam.remove(), travel + 200))
    return travel
  }

  // 보상등급 배지 — 현재 등급 숫자와, 그 등급이면 노려볼 만한 희귀도의 색.
  private renderGrade() {
    const badge = this.q('#grade-badge')
    const unusedDraws = this.cardHand?.savedDraws ?? CARD_HAND_CONFIG.drawsPerStage
    const rewardValue = clearRewardValue(this.grade, unusedDraws)
    badge.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary')
    badge.classList.add(`rarity-${gradeTier(this.grade)}`)
    const tooltip = hudTip('hudClearRewardTip', `클리어 보상 +${rewardValue}\n속도 등급 ${this.grade} + 미사용 무료 드로우 ${unusedDraws}. 속도 등급은 빠르게 끝낼수록 높다.`, { value: rewardValue, speed: this.grade, draws: unusedDraws })
    badge.setAttribute('aria-label', `클리어 보상 +${rewardValue}, 속도 등급 ${this.grade}, 미사용 무료 드로우 ${unusedDraws}`)
    badge.dataset.tooltip = tooltip
    this.q('#grade').textContent = `+${rewardValue}`
  }

  /** 승리 마무리 — 현재 속도 등급을 그대로 확정하고 피날레를 돌린다. */
  private async finishWin(pause: number): Promise<void> {
    this.over = true
    this.setPhase('전투 승리')
    const victoryStartedAt = performance.now()
    const victory = Math.random() < 0.5 ? 'victory1' : 'victory2'
    playCharacterAnimation(this.q<HTMLElement>('.actor.you'), victory)
    const victoryHighlightMs = CHARACTER_VISUALS.player.animations?.victoryHighlightMs ?? 2000
    await sleep(pause)
    await this.gradeFinale()
    this.token?.feel(this.isBoss ? 'bossDown' : 'runCleared')
    if (this.isBoss) this.token?.bindCloser('bossDown')
    await this.collectClearInspiration()
    const victoryRemaining = victoryHighlightMs - (performance.now() - victoryStartedAt)
    if (victoryRemaining > 0) await sleep(victoryRemaining)
    this.onWin(this.grade, this.combatResources(), clearRewardValue(this.grade, this.cardHand.savedDraws))
  }

  private combatResources(): { hp: number; guard: number } {
    return {
      hp: Math.max(0, Math.min(this.state.playerMax, this.state.playerHp)),
      guard: Math.max(0, Math.min(playerGuardLimit(this.state.playerMax), this.state.guard)),
    }
  }

  // 승리 피날레 — CLEAR 원화와 보상등급이 함께 떠오르고 빵빠레가 울린다.
  private async gradeFinale() {
    const badge = this.q('#grade-badge')
    const scene = this.q('.scene.battle')
    const clearBanner = document.createElement('div')
    clearBanner.className = 'victory-clear-banner'
    clearBanner.innerHTML = `<img src="${REWARD_ART.clear}" alt="CLEAR! 보상" />`
    scene.appendChild(clearBanner)
    GameAudio.play('win')
    const b = badge.getBoundingClientRect()
    const s = scene.getBoundingClientRect()
    const scale = s.width / Math.max(1, scene.offsetWidth)
    const dx = (s.left + s.width / 2 - (b.left + b.width / 2)) / scale
    const dy = (s.top + s.height * 0.44 - (b.top + b.height / 2)) / scale
    badge.classList.add('finale')
    const anim = badge.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(2.5)`, offset: 0.55 },
        { transform: `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px) scale(2.25)` },
      ],
      { duration: 700, easing: 'cubic-bezier(0.2, 1.2, 0.3, 1)', fill: 'forwards' },
    )
    // 애니메이션이 끝나지 않는 환경에서도 보상 화면으로는 반드시 넘어가야 한다.
    await Promise.race([anim.finished.catch(() => undefined), sleep(900)])
    // CLEAR 원화와 최종 보상등급을 빵빠레 첫 구절 동안 읽을 수 있게 유지한다.
    await sleep(1300)
  }

  /** 클리어 보상을 중앙 배지에서 좌상단 보유 영감으로 옮기고 실제 지급값까지 카운트업한다. */
  private async collectClearInspiration() {
    const gained = clearRewardValue(this.grade, this.cardHand.savedDraws)
    const wallet = this.q<HTMLElement>('.inspiration-wallet')
    const balance = wallet.querySelector<HTMLElement>('.inspiration-wallet-copy b')
    const source = this.q<HTMLElement>('#grade-badge')
    if (!balance || gained <= 0) return

    const finalBalance = this.inspiration + gained
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduceMotion ? 80 : 720
    const sourceRect = source.getBoundingClientRect()
    const targetRect = wallet.querySelector<HTMLElement>('.inspiration-mark')?.getBoundingClientRect()
      ?? wallet.getBoundingClientRect()
    const pop = document.createElement('span')
    pop.className = 'inspiration-gain-pop'
    pop.textContent = `+${gained}`
    wallet.appendChild(pop)
    wallet.classList.add('is-collecting')
    wallet.setAttribute('aria-label', `보유 영감 ${finalBalance}`)

    if (!reduceMotion) {
      const moteCount = Math.max(3, Math.min(9, gained))
      for (let i = 0; i < moteCount; i += 1) {
        const mote = document.createElement('span')
        mote.className = 'clear-inspiration-flight'
        mote.textContent = '◈'
        mote.style.left = `${sourceRect.left + sourceRect.width * (.36 + (i % 4) * .09)}px`
        mote.style.top = `${sourceRect.top + sourceRect.height * (.38 + (i % 3) * .12)}px`
        document.body.appendChild(mote)
        const startX = Number.parseFloat(mote.style.left)
        const startY = Number.parseFloat(mote.style.top)
        const dx = targetRect.left + targetRect.width * .5 - startX
        const dy = targetRect.top + targetRect.height * .5 - startY
        const arc = 54 + (i % 3) * 24
        const delay = i * 55
        const animation = mote.animate([
          { transform: 'translate(-50%, -50%) scale(.45) rotate(0deg)', opacity: 0 },
          { transform: `translate(${dx * .28}px, ${dy * .28 - arc}px) scale(1.16) rotate(80deg)`, opacity: 1, offset: .3 },
          { transform: `translate(${dx * .72}px, ${dy * .72 - arc * .35}px) scale(.82) rotate(190deg)`, opacity: 1, offset: .72 },
          { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(280deg)`, opacity: 0 },
        ], { duration: duration - 70, delay, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'forwards' })
        const remove = () => mote.remove()
        animation.onfinish = remove
        this.timers.push(window.setTimeout(remove, duration + delay + 120))
      }
    }

    const started = performance.now()
    const count = (now: number) => {
      const progress = Math.min(1, (now - started) / Math.max(1, duration))
      const eased = 1 - Math.pow(1 - progress, 3)
      balance.textContent = String(this.inspiration + Math.round(gained * eased))
      if (progress < 1 && this.root.isConnected) requestAnimationFrame(count)
    }
    requestAnimationFrame(count)
    GameAudio.play('contextBonus')
    await sleep(duration + (reduceMotion ? 20 : 430))
    balance.textContent = String(finalBalance)
    wallet.classList.remove('is-collecting')
    pop.remove()
  }

  // 턴 경과 감쇠 — 배지가 살짝 가라앉으며 식는다.
  private tickGradeDown() {
    this.renderGrade()
    const badge = this.q('#grade-badge')
    badge.classList.remove('down')
    void (badge as HTMLElement).offsetWidth
    badge.classList.add('down')
  }

  // 중앙에서 타오르는 초과 피해 숫자. 콤보가 높으면 더 뜨겁게 빛난다.
  private showEmber(n: number, combo = 1): HTMLElement {
    const el = document.createElement('div')
    el.className = 'ember-num' + (combo >= 3 ? ' hot' : '')
    el.textContent = String(n)
    this.q('#pbox').appendChild(el)
    return el
  }

  // 수치가 중앙에서 플레이어에게 날아가 꽂힌다.
  private async flyToPlayer(text: string, cls: string, theme: 'self' | 'heal' | 'guard') {
    const pboxEl = this.q('#pbox')
    const you = this.q<HTMLElement>('.actor.you')
    const modelShell = you.querySelector<HTMLElement>(':scope > .model-shell') ?? you
    const to = this.toStageCenter(modelShell.getBoundingClientRect())
    const fx = pboxEl.offsetWidth / 2
    const fy = pboxEl.offsetHeight * 0.5
    const p = document.createElement('div')
    p.className = `pop ${cls} big`
    p.textContent = text
    p.style.left = `${fx - 24}px`
    p.style.top = `${fy}px`
    p.style.animation = 'none'
    pboxEl.appendChild(p)
    const fly = p.animate(
      [
        { transform: 'translate(0,0) scale(0.6)', opacity: 0 },
        { transform: 'translate(0,0) scale(1.15)', opacity: 1, offset: 0.22 },
        { transform: `translate(${to.x - fx}px, ${to.y - fy}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${to.x - fx}px, ${to.y - fy}px) scale(0.7)`, opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(0.4,0,0.3,1)' },
    )
    // 애니메이션이 진행되지 않는 상황에서도 턴은 흘러가야 한다 — 여기서 멈추면
    // 손패가 사라진 채로 전투가 갇힌다.
    await Promise.race([fly.finished.catch(() => undefined), sleep(700)])
    SquareBurst.playOn(you, theme, { spread: 95 })
    this.hitOne(you)
    p.remove()
  }

  // 강한 낫이 실제 체력 피해를 냈을 때만 붉은 잉크 방울이 플레이어에게서 보스로 흐른다.
  private async playEnemyLifesteal(enemyIdx: number, amount: number) {
    const you = this.q<HTMLElement>('.actor.you .model-shell')
    const foe = this.q<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"] .model-shell`)
    const from = this.toStageCenter(you.getBoundingClientRect())
    const to = this.toStageCenter(foe.getBoundingClientRect())
    const fx = document.createElement('div')
    fx.className = 'lifesteal-fx'
    fx.textContent = `♥ +${amount}`
    fx.style.left = `${from.x - 22}px`
    fx.style.top = `${from.y - 18}px`
    this.q('#pbox').appendChild(fx)
    const fly = fx.animate(
      [
        { transform: 'translate(0,0) scale(.55)', opacity: 0 },
        { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .18 },
        { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.82)`, opacity: 1, offset: .82 },
        { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(.45)`, opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(.3,.1,.25,1)' },
    )
    await Promise.race([fly.finished.catch(() => undefined), sleep(760)])
    SquareBurst.playOn(foe, 'heal', { spread: 80 })
    this.popAt(enemyIdx, `${amount}`, 'heal')
    fx.remove()
  }

  private async playTurnSummons(summons: TurnSummon[]) {
    for (const summon of summons) {
      const worker = this.root.querySelector<HTMLElement>(
        `.actor.foe[data-i="${summon.idx}"] .queen-worker[data-side="${summon.side}"][data-slot="${summon.slot}"]`,
      )
      if (!worker) continue
      playCharacterAnimation(worker, 'appear')
      worker.classList.remove('summoning')
      void worker.offsetWidth
      worker.classList.add('summoning')
      this.popAt(summon.idx, `${summon.name} ${summon.count}/${summon.max}`, 'buff')
      this.log(`${this.state.enemies[summon.idx].def.name}이 ${summon.name}을 불렀다 — 호위 ${summon.count}/${summon.max}`)
      await sleep(260)
      worker.classList.remove('summoning')
    }
  }

  private async playSummonDispersal(
    enemyIdx: number,
    count: number,
    damage: number,
    backlashDamage = 0,
    focusedBacklash = false,
    groggyTriggered = false,
    carriesToBody = false,
    renderAfter = true,
  ) {
    const visibleWorkers = [...this.root.querySelectorAll<HTMLElement>(
      `.actor.foe[data-i="${enemyIdx}"] .queen-worker:not([hidden])`,
    )]
    const workers = count > 0 ? visibleWorkers.slice(-count) : []
    const queen = this.root.querySelector<HTMLElement>(
      `.actor.foe[data-i="${enemyIdx}"] > .model-shell`,
    )
    workers.forEach((worker, index) => {
      playCharacterAnimation(worker, 'defeat')
      worker.animate(
        [
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${index % 2 ? 105 : -105}px, -110px) rotate(${index % 2 ? 24 : -24}deg) scale(.55)`, opacity: 0 },
        ],
        { duration: 240, delay: index * 34, easing: 'cubic-bezier(.3,.1,.7,1)', fill: 'forwards' },
      )
      SquareBurst.playOn(worker, 'damage', { spread: 72 + index * 10 })
    })
    this.popAt(enemyIdx, count > 0 ? `일벌 ${damage} 피해 · ${count}마리 퇴치` : `일벌 ${damage} 피해`, count > 0 ? 'guard big' : 'dmg')
    await sleep(count > 0 ? Math.min(250, 130 + count * 28) : 120)
    if (carriesToBody && queen) {
      const from = workers[workers.length - 1] ?? queen
      this.playQueenChainLink(from, queen)
      this.popAt(enemyIdx, '연쇄 관통 → 본체!', 'dmg big weak')
      await sleep(90)
    }
    if (backlashDamage > 0) {
      this.popAt(enemyIdx, focusedBacklash ? `분노 집중! 본체 ${backlashDamage}` : `본체 ${backlashDamage}`, 'dmg big')
      this.log(`${focusedBacklash ? '분노 단일 공격으로 반동이 2배가 되어, 쓰러진' : '쓰러진'} 일벌이 여왕벌 본체에 ${backlashDamage} 피해를 되돌렸다.`)
    }
    if (groggyTriggered) {
      this.popAt(enemyIdx, '일벌 전멸! 다음 턴 행동 불가!', 'buff big')
      this.log('일벌 네 마리를 모두 퇴치해 여왕벌이 그로기됐다. 다음 턴은 회복만 하고, 그 다음 턴에 일벌 넷을 다시 부른다.')
      this.resolveBossPattern(bossTokenLine('queenOpportunity', 'relief'))
      this.showBossSentenceEvent(bossText('workersGone'))
      await sleep(260)
    } else if (count > 0) {
      this.showBossSentenceEvent(bossText('workersErased', { count }))
    }
    if (renderAfter) this.renderActors()
    if (!groggyTriggered) this.resolveBossPattern(TOKEN_BOSS_HINTS.queenBeeDispersed)
  }

  /** 마지막 일벌에서 여왕 본체까지 남은 피해가 같은 검기로 이어지는 경로를 그린다. */
  private playQueenChainLink(fromEl: HTMLElement, toEl: HTMLElement) {
    const from = this.toStageCenter(fromEl.getBoundingClientRect())
    const to = this.toStageCenter(toEl.getBoundingClientRect())
    const dx = to.x - from.x
    const dy = to.y - from.y
    const link = document.createElement('i')
    link.className = 'queen-chain-link'
    link.style.left = `${from.x}px`
    link.style.top = `${from.y}px`
    link.style.width = `${Math.max(1, Math.hypot(dx, dy))}px`
    link.style.setProperty('--angle', `${Math.atan2(dy, dx) * 180 / Math.PI}deg`)
    this.q('#pbox').append(link)
    this.timers.push(window.setTimeout(() => link.remove(), 520))
  }

  private async playSwarmRelease(enemyIdx: number): Promise<void> {
    const workers = [...this.root.querySelectorAll<HTMLElement>(
      `.actor.foe[data-i="${enemyIdx}"] .queen-worker:not([hidden])`,
    )]
    const player = this.root.querySelector<HTMLElement>('.actor.you .model-shell')
    if (!player || workers.length === 0) return
    const target = player.getBoundingClientRect()
    workers.forEach((worker, index) => {
      playCharacterAnimation(worker, 'attack')
      const from = worker.getBoundingClientRect()
      const dx = target.left + target.width * .65 - (from.left + from.width / 2)
      const dy = target.top + target.height * .45 - (from.top + from.height / 2)
      worker.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx * .22}px, ${dy * .08 - 34}px) scale(1.12)`, opacity: 1, offset: .3 },
          { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 },
        ],
        {
          duration: 390 + index * 35,
          delay: index * 28,
          easing: 'cubic-bezier(.46,.02,.72,.35)',
          fill: 'forwards',
        },
      )
    })
    this.popAt(enemyIdx, '벌떼 돌격!', 'dmg big')
    await sleep(500)
  }

  // 적 턴 연출 — 최전방 적이 돌진해 플레이어에게 사각 블라스트.
  private async enemyPhase(phase: 'first' | 'second') {
    for (const st of enemyTurn(this.state, Math.random, phase)) {
      const foe = this.q<HTMLElement>(`#actors .actor.foe[data-i="${st.idx}"]`)
      const enemy = this.state.enemies[st.idx]
      // 방어가 피해를 전부 흡수하거나 카운터가 발동해도 적은 실제 공격 행동을
      // 수행했다. 결과 수치와 무관하게 먼저 attack 클립과 돌진을 보여 준다.
      // 사마귀의 강공격 예고는 준비 동작(attack2)을 거치지 않고 큰낫을 든
      // 대기 자세(idle2)로 곧바로 전환해 다음 내려베기까지 유지한다.
      const animation: BattleAnimation = enemy?.def.id === 'mantis' && st.telegraphText
        ? 'idle2'
        : st.animationStage === 1 ? 'attack' : `attack${st.animationStage}`
      playCharacterAnimation(foe ?? null, animation)
      if (!st.telegraphText) GameAudio.playEnemyAttack(st.animationStage)
      if (st.telegraphText) {
        foe?.querySelector<HTMLElement>(':scope > .model-shell')?.animate(
          [
            { transform: 'rotate(0deg) scale(1)' },
            { transform: 'rotate(-2deg) scale(1.035)', offset: .55 },
            { transform: 'rotate(0deg) scale(1)' },
          ],
          { duration: 520, easing: 'cubic-bezier(.25,.8,.3,1)' },
        )
        if (enemy?.def.boss) this.playBossSignatureEffect(enemy.def.id, 'telegraph', foe ?? null)
      } else {
        foe?.classList.add('lunge')
        if (enemy?.def.boss) {
          const signature = st.summonsReleased > 0 ? 'swarm' : st.animationStage >= 3 ? 'heavy' : 'attack'
          this.playBossSignatureEffect(enemy.def.id, signature, foe ?? null)
        }
      }
      const swarmFlight = st.summonsReleased > 0
        ? this.playSwarmRelease(st.idx)
        : Promise.resolve()
      await sleep(170)
      // 적의 타격이 닿는 순간 실제 흡수 뒤 남은 방어막을 체력바에 반영한다.
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      // 실제로 체력을 깎은 벌레를 기억한다 — 여기서 쓰러지면 이 벌레가 결과 화면의
      // "나를 갉아먹은 것"이 된다. 방어에 다 막혔으면(dealt<=0) 사인이 아니다.
      if (st.dealt > 0) this.noteAttacker(st.idx)
      if (st.dealt <= 0) {
        this.log(st.text)
        if (st.magicShieldBroken) {
          const you = this.q<HTMLElement>('.actor.you')
          SquareBurst.playOn(you, 'guard', { spread: 130 })
          this.popPlayer(BUILD_EFFECT_TEXT.blocked, 'guard big')
          this.log(BUILD_EFFECT_TEXT.magicBlocked)
        }
        if (st.telegraphText) {
          if (this.state.enemies[st.idx]?.def.id === 'mantis') {
            this.showBossTokenHint(TOKEN_BOSS_HINTS.mantisTelegraph)
          }
          this.popAt(st.idx, '강공격 준비!', 'buff')
          this.log(`${this.state.enemies[st.idx].def.name} — ${st.telegraphText}`)
        }
        if (st.guardShattered) {
          const you = this.q<HTMLElement>('.actor.you')
          SquareBurst.playOn(you, 'guard', { spread: 115 })
          await this.breakMantisGuardCue()
          this.popPlayer('실드 파괴 · 강공격 취소!', 'guard big')
        }
        if (st.counterHit) {
          if (st.counterHit.magicShieldBroken) {
            await this.playSpellShieldImpact(st.counterHit.target, st.counterHit.magicShieldRemaining)
          }
          else if (st.counterHit.dmg > 0) {
            this.popAt(st.counterHit.target, `카운터 ${st.counterHit.dmg}`, 'dmg big')
            if (foe) this.hitOne(foe)
          }
          if (this.state.enemies[st.counterHit.target]?.dead) await this.playDeath(st.counterHit.target)
        }
      } else {
        const you = this.q<HTMLElement>('.actor.you')
        SquareBurst.playOn(you, 'damage', { spread: 100 })
        this.hitOne(you)
        this.popPlayer(`${st.dealt}`, 'dmg big')
        this.log(st.text)
      }
      if (st.lifeStolen > 0) {
        this.renderActors()
        await this.playEnemyLifesteal(st.idx, st.lifeStolen)
        // 흡혈은 내려베기를 못 막았다는 뜻이다. 실패한 그 순간에 다음 대응을 다시 말해 준다.
        if (this.state.enemies[st.idx]?.def.id === 'mantis') {
          this.showBossTokenHint(TOKEN_BOSS_HINTS.mantisPunished)
          this.showBossSentenceEvent(bossText('mantisFailed'))
        }
      }
      if (st.groggyEntered) {
        this.popAt(st.idx, '그로기!', 'buff big')
        this.log(`${this.state.enemies[st.idx].def.name}이 빈틈을 보였다 — 받는 피해 ×${st.groggyDamageMult.toFixed(1)} · 예정된 다음 공격을 한 턴 거른다`)
        if (this.state.enemies[st.idx]?.def.id === 'mantis') {
          this.resolveBossPattern(TOKEN_BOSS_HINTS.mantisGroggy)
          this.showBossSentenceEvent(bossText('mantisCorrected'))
        }
      }
      if (st.summonsReleased > 0) {
        await swarmFlight
        this.log(`모인 일벌 ${st.summonsReleased}마리가 돌격하고 여왕의 양옆이 비었다.`)
      }
      await sleep(240)
      if (!st.telegraphText) foe?.classList.remove('lunge')
    }
    this.renderActors()
  }

  /** 세 보스의 핵심 공격을 같은 사각 블라스트 대신 고유한 실루엣으로 읽히게 한다. */
  private playBossSignatureEffect(
    enemyId: string,
    phase: 'telegraph' | 'attack' | 'heavy' | 'swarm',
    foe: HTMLElement | null,
  ) {
    if (this.motionOff()) return
    const pbox = this.q<HTMLElement>('#pbox')
    const player = this.root.querySelector<HTMLElement>('.actor.you > .model-shell')
    const target = player ? this.toStageCenter(player.getBoundingClientRect()) : { x: pbox.offsetWidth * .28, y: pbox.offsetHeight * .62 }
    const source = foe ? this.toStageCenter((foe.querySelector<HTMLElement>(':scope > .model-shell') ?? foe).getBoundingClientRect()) : target
    const fx = document.createElement('div')

    if (enemyId === 'mantis') {
      fx.className = `boss-signature-fx mantis-${phase === 'telegraph' ? 'telegraph' : phase === 'heavy' ? 'cleave' : 'slash'}`
      const at = phase === 'telegraph' ? source : target
      fx.style.left = `${at.x}px`
      fx.style.top = `${at.y}px`
      fx.innerHTML = phase === 'telegraph'
        ? '<i class="sickle"></i><b>큰낫이 빛난다</b>'
        : '<i class="blade"></i><i class="blade echo"></i><i class="cut-ring"></i>'
    } else if (enemyId === 'queenBee') {
      fx.className = `boss-signature-fx queen-${phase === 'swarm' ? 'swarm' : 'sting'}`
      fx.style.left = `${target.x}px`
      fx.style.top = `${target.y}px`
      fx.innerHTML = phase === 'swarm'
        ? '<i class="hex h1"></i><i class="hex h2"></i><i class="sting s1"></i><i class="sting s2"></i><i class="sting s3"></i><b>벌떼 돌격</b>'
        : '<i class="sting s1"></i><i class="sting s2"></i>'
    } else if (enemyId === 'elderSpider') {
      fx.className = 'boss-signature-fx spider-bind'
      fx.style.left = `${target.x}px`
      fx.style.top = `${target.y}px`
      fx.innerHTML = '<i class="web-ring r1"></i><i class="web-ring r2"></i><i class="web-cross"></i><b>방어 관통</b>'
    } else {
      return
    }

    pbox.append(fx)
    this.timers.push(window.setTimeout(() => fx.remove(), phase === 'telegraph' ? 920 : 760))
  }

  // 중앙 총합 카운트업(띠리리릭).
  private async rollTotal(val: number, cls: string) {
    const host = this.q('#pbox')
    const el = document.createElement('div')
    el.className = `big-total ${cls}`
    host.appendChild(el)
    const dur = 440
    const t0 = performance.now()
    // rAF는 탭이 가려지면 멈춘다. 굴림이 안 끝나도 턴은 이어지도록 시간 제한을 둔다.
    const rollUp = new Promise<void>((resolve) => {
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur)
        el.textContent = String(Math.round(val * (0.15 + 0.85 * p)))
        if (p < 1) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    await Promise.race([rollUp, sleep(dur + 220)])
    el.textContent = String(val)
    await sleep(160)
    el.classList.add('out')
    this.timers.push(window.setTimeout(() => el.remove(), 400))
  }

  // ── 피드백 ──
  private toStage(rect: DOMRect): { x: number; y: number } {
    const pboxEl = this.q('#pbox')
    const box = pboxEl.getBoundingClientRect()
    const scale = box.width / pboxEl.offsetWidth
    return { x: (rect.left + rect.width / 2 - box.left) / scale, y: (rect.top - box.top) / scale }
  }
  private toStageCenter(rect: DOMRect): { x: number; y: number } {
    const pboxEl = this.q('#pbox')
    const box = pboxEl.getBoundingClientRect()
    const scale = box.width / pboxEl.offsetWidth
    return {
      x: (rect.left + rect.width / 2 - box.left) / scale,
      y: (rect.top + rect.height / 2 - box.top) / scale,
    }
  }
  private popEl(el: HTMLElement, txt: string, cls: string) {
    const { x, y } = this.toStage(el.getBoundingClientRect())
    this.spawnPop(x, y - 4, txt, cls)
  }
  private popAt(enemyIdx: number, txt: string, cls: string) {
    const el = this.q('#actors').querySelector<HTMLElement>(`.actor.foe[data-i="${enemyIdx}"]`)
    if (!el) return
    const { x, y } = this.toStage(el.getBoundingClientRect())
    this.spawnPop(x, y + 30, txt, cls)
  }
  private popPlayer(txt: string, cls: string) {
    this.spawnPop(320, 120, txt, cls)
  }
  private spawnPop(x: number, y: number, txt: string, cls: string) {
    const p = document.createElement('div')
    p.className = `pop ${cls}`
    p.textContent = (cls.includes('heal') ? '+' : '') + txt
    p.style.left = `${x - 24}px`
    p.style.top = `${Math.max(10, y)}px`
    this.q('#pbox').appendChild(p)
    this.timers.push(window.setTimeout(() => p.remove(), 1000))
  }
  private hitOne(el: HTMLElement) {
    el.classList.remove('hit')
    void el.offsetWidth
    el.classList.add('hit')
  }

  /** attack 애니메이션이 직접 닿은 첫 대상과 공격자만 붙든다. 관통 연쇄에는 적용하지 않는다. */
  private async attackHitStop(actor: HTMLElement, target: HTMLElement | null, durationMs: number) {
    if (this.motionOff()) return
    const stoppedActors = target && target !== actor ? [actor, target] : [actor]
    // 방금 붙인 피격 셰이크는 첫 프레임을 커밋하기 전까지 pending일 수 있다.
    const animations = stoppedActors.flatMap((stoppedActor) => stoppedActor.getAnimations({ subtree: true }))
      .filter((animation) => animation.playState === 'running' || animation.pending)

    stoppedActors.forEach((stoppedActor) => freezeCharacterAnimation(stoppedActor, true))
    animations.forEach((animation) => animation.pause())
    await sleep(durationMs)
    stoppedActors.forEach((stoppedActor) => freezeCharacterAnimation(stoppedActor, false))
    animations.forEach((animation) => {
      if (animation.playState === 'paused') animation.play()
    })
  }
  private log(html: string, _tally?: Tally) {
    const host = this.q('#log')
    const line = document.createElement('div')
    line.className = 'log-line'
    line.innerHTML = html
    host.appendChild(line)
    this.timers.push(window.setTimeout(() => line.remove(), 3100))
    while (host.children.length > 3) host.removeChild(host.firstChild!)

  }
}
