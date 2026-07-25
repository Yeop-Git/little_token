/**
 * 전투 뷰 v4 — 배경 일러스트 위 쉐이더틱 UI.
 *  · 상단: 완성 중인 문장(체인) 그림자 강조
 *  · 중앙 하단: 단어를 가로 배치하고 클릭으로 발동. 전부 채우면 자동 완성(반짝 후 발동)
 *  · 되돌리기: 하단 중앙 회색 연한 글자, 한 단계씩 되돌림
 *  · 좌측: 스탯표 · 우하단: 단어장과 가방 보조 버튼
 *  · 우측: 정보 패널 — "해당 단어"만의 효과/수치(누적 아님) 또는 가방 아이템 정보
 *  · 가방: 오버레이 대신, 하단 단어 영역이 내려가고 아이템 목록이 올라오는 토글
 */

import {
  compile,
  effectiveBase,
  isDamageIntent,
  matchCombos,
  resolveMultiplier,
  sentenceTokens,
  statBiasOf,
  type ResolvedMult,
} from '@core/compiler'
import { wordValueLines } from '@core/wordText'
import { conflictReason, pruneConflicts } from '@core/validator'
import { comboHintHtml } from '@/ui/ComboHint'
import { emotionBadgeContent, emotionIconBadge } from '@/ui/EmotionBadge'
import { emotionOrNeutral, RARITY_LABEL, type CompileMods, type Emotion, type Intent, type Selection, type Tables, type Word, type FieldDef } from '@core/types'
import { TABLES } from '@data/tables'
import { ANY_SLOT, EARLY_WORDS, growCardFor, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { ENEMIES } from '@data/enemies'
import {
  allDead,
  aliveIdx,
  applyIntent,
  applyPendingAttack,
  applyPreparation,
  enemyTurn,
  engageFront,
  engageInitialFront,
  frontIdx,
  makeEnemy,
  type BattleState,
  type EnemyInst,
} from '@/sim/reference'
import { BACKGROUNDS, SKILL_ART, SPRITES } from '@/assets'
import { icon, itemArt } from '@/ui/Icons'
import { SquareBurst } from '@/ui/SquareBurst'
import { GRADE_MAX, bumpGrade, decayGrade, gradeTier, overkillGain, startGrade } from '@core/grade'
import { defaultPlayer, ownedItemRarity, STAT_META, type PlayerState, type OwnedItem } from '@core/player'
import { DOUBT_RANGE, DOUBT_SUFFIX, hasPassive, modsFor, PASSIVES } from '@core/passives'
import { ALL_ITEMS, STAT_LABEL, type StatKey } from '@data/items'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'
import { CardHand, cardTitleStyle, type DebugCardSpawnResult } from '@/ui/CardHand'
import { GameAudio } from '@/audio/GameAudio'
import { IntroDialogue } from '@views/IntroDialogue'
import { AttackCinematic, attackCutFor, PUMP_RATIO } from '@/ui/AttackCinematic'
import { openSettingsModal } from '@/ui/SettingsModal'
import {
  destroyCharacterModels,
  freezeCharacterAnimation,
  isCharacterModelReady,
  mountCharacterModel,
  playCharacterAnimation,
  suspendCharacterModel,
} from '@views/BattleCharacterModel'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opts {
  field: FieldDef
  encounter: string[]
  /** 전투가 끝난 시점의 보상등급을 들고 나간다 — 보상 희귀도 확률에 쓰인다. */
  onWin: (grade: number) => void
  onLose: () => void
  onHome?: () => void
  onResetAll?: () => void
  player?: PlayerState
  tables?: Tables
  hpMult?: number
  atkMult?: number
  isBoss?: boolean
  /** 현재 보스의 체력 막 수. 일반 전투에는 전달하지 않는다. */
  bossHealthBars?: number
  /** 본편 이후 반복 구간에서 현재 엔드리스 회차와 층을 표시한다. */
  modeLabel?: string
  /** 오프닝 다이얼로그(토큰 컷신)를 이 전투 위에서 먼저 재생한다. */
  intro?: boolean
  /** 오프닝을 끝까지 보거나 SKIP으로 정상 종료한 뒤 호출한다. */
  onIntroComplete?: () => void
}

type Mood = 'attack' | 'guard' | 'heal' | 'gamble' | 'sacrifice' | 'buff'
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
// 적 레일 — 전장에는 앞의 세 마리만 세우고, 나머지는 대기 수로 요약한다.
// 전투 상태의 전체 적 배열은 유지하므로 관통·광역 피해 규칙에는 영향을 주지 않는다.
const RAIL_FRONT_RIGHT = 860
const RAIL_GAP = 260
const MAX_VISIBLE_ENEMIES = 3
const MAX_ACTION_ORDER_ENEMIES = 3
const TOKEN_BOSS_LINES = [
  '어떡하지...! 도와줘, 프롬!!',
  '프롬, 저 녀석 너무 커...!',
  '으으... 그래도 물러나면 안 돼!',
  '조심해! 뭔가 오고 있어!',
] as const
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
  kind: 'dmg' | 'heal'
}

export class BattleView {
  private t: Tables = TABLES
  private field: FieldDef
  private onWin: (grade: number) => void
  private onLose: () => void
  private onHome?: () => void
  private onResetAll?: () => void
  private onIntroComplete?: () => void
  private isBoss = false
  private playerVisual: CharacterVisualDef
  private modeLabel = ''
  // 보상등급 — 운으로 시작·바닥, 턴 경과로 감소, 한 턴 멀티킬로 상승.
  private grade = 0
  private player: PlayerState
  private state: BattleState
  /**
   * 이 판의 크기 — 전투 시작 시 적 전체의 최대 체력 합.
   * 집계판이 달아오르는 문턱도, 액션 컷이 터지는 문턱도 전부 이 값의 비율이다.
   * 깡수치로 잡으면 초반엔 영영 안 터지고 후반엔 매 턴 터진다.
   */
  private encounterHp = 0
  private attackCine: AttackCinematic | null = null
  private sel: Selection = {}
  private slotIndex = 0
  private target = 0
  private busy = false
  private over = false
  private bagMode = false
  private timers: number[] = []
  private cardHand!: CardHand
  private introDialogue: IntroDialogue | null = null
  // 정보창 유지용 — 클릭 중 호버가 잠깐 풀려도 패널이 꺼지지 않게 붙잡는다.
  // 배율 릴 세대 — 새 선택이 들어오면 이전 릴은 조용히 물러난다.
  private multReelToken = 0
  private parkedTally: HTMLElement | null = null
  private dockRestore: (() => void) | null = null
  private dockTimer = 0
  private pointerDown = false
  private phaseLabel = '주어 선택'
  private playerPreempting = false
  private actionOrderSignature = ''
  private readonly enemyPool = new Map<string, HTMLElement[]>()
  /** 손패에만 생성한 미보유 카드를 일반 테이블을 바꾸지 않고 선택하기 위한 임시 조회표. */
  private readonly debugSpawnedWords = new Map<string, Word>()
  /** 아기돼지 바베큐 — 이번 전투에서 지금까지 잡은 적 수(배율에 들어간다). */
  private killsThisBattle = 0
  private tokenSpeechIndex = 0

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    this.onLose = opts.onLose
    this.onHome = opts.onHome
    this.onResetAll = opts.onResetAll
    this.onIntroComplete = opts.onIntroComplete
    this.isBoss = !!opts.isBoss
    // 보스전은 카드 뒤에서 보스를 올려다보는 3인칭 구도다. 공용 플레이어
    // 매니페스트의 일반 전투 측면 방향은 유지하고, 이 뷰에서만 등을 돌린다.
    // 토큰은 보스전 전용 배우로 따로 렌더하므로 플레이어 모델의 동반자는 뺀다.
    this.playerVisual = this.isBoss
      ? { ...CHARACTER_VISUALS.player, modelYaw: Math.PI, companion: undefined }
      : CHARACTER_VISUALS.player
    this.modeLabel = opts.modeLabel ?? ''
    this.t = opts.tables ?? TABLES
    this.player = opts.player ?? defaultPlayer()
    const atkMult = opts.atkMult ?? this.field.enemyAtkMult ?? 1
    const enemies = opts.encounter.map((id) =>
      makeEnemy(ENEMIES[id], atkMult, opts.hpMult ?? 1, this.isBoss ? opts.bossHealthBars ?? 3 : 1),
    )
    // 체력 스탯 = 최대 체력.
    const maxHp = this.player.stats.hp
    this.state = { playerHp: maxHp, playerMax: maxHp, guard: 0, counterMultiplier: 0, turn: 1, enemies, pending: null }
    // 이 판의 크기 — 적 전체의 최대 체력 합. 연출 문턱을 깡수치가 아니라 이 값의 비율로
    // 잡으면 층이 올라 적이 단단해질수록 문턱도 저절로 따라 올라간다.
    this.encounterHp = enemies.reduce((n, e) => n + (e.maxHp ?? e.hp), 0)
    engageInitialFront(this.state)
    this.grade = startGrade(this.player.stats.luck)
    this.target = aliveIdx(this.state)[0] ?? 0
    this.mount()
    if (opts.intro) this.mountIntro()
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
    clearTimeout(this.dockTimer)
    document.removeEventListener('pointerdown', this.onPointerDown, true)
    document.removeEventListener('pointerup', this.onPointerUp, true)
    document.removeEventListener('pointercancel', this.onPointerUp, true)
    this.cardHand.destroy()
    this.introDialogue?.destroy()
    this.attackCine?.destroy()
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
      if (this.root.querySelector('.word-card:hover, .actor:hover, .bag-item:hover')) return
      this.dockRestore = null
      restore()
    }, delay)
  }

  // 오프닝 컷신 — 적들은 홀드로 어둠 밖에 묶어 두고, 다이얼로그가 끝나면
  // 홀드를 풀어 천천히 밀려들어오게 한다. 전투 상태는 손대지 않는다.
  private mountIntro() {
    const scene = this.q('.scene.battle')
    scene.classList.add('is-intro-hold')
    this.introDialogue = new IntroDialogue(scene, {
      onComplete: () => {
        this.introDialogue = null
        this.onIntroComplete?.()
        scene.classList.add('is-enemies-arriving')
        requestAnimationFrame(() => scene.classList.remove('is-intro-hold'))
        this.timers.push(window.setTimeout(() => scene.classList.remove('is-enemies-arriving'), 4000))
      },
    })
  }

  private mount() {
    this.root.innerHTML = `
      <div class="scene battle" data-weather="${this.field.weather}"${this.isBoss ? ' data-boss="true" data-entrance="fade"' : ''} style="background-image:url(${BACKGROUNDS.battleDark})">
        ${this.isBoss ? '<div class="boss-entry-fade" aria-hidden="true"></div>' : ''}
        <div class="vignette"></div>
        <div class="weather-wash"></div>

        <div class="hud-top">
          <div class="hud-left-stack">
            <div class="hud-left-status" aria-label="전투 상태">
              <div class="grade-badge glass" id="grade-badge" title="보상등급 — 오래 끌면 내려가고, 한 턴에 쓸어담으면 오른다"><span>보상</span><b id="grade"></b></div>
              <div class="hud-player-stats glass" id="stats" aria-label="주인공 상태"></div>
            </div>
            <aside class="action-order" aria-label="이번 문장 행동 순서">
              <div class="action-order-head"><span>이번 문장</span><b>행동 순서</b></div>
              <ol id="action-order-list"></ol>
            </aside>
          </div>
          <div class="hud-status">
            <div class="hud-status-bar">
              <div class="hud-actions glass" aria-label="시스템 메뉴">
                <button id="settings-btn" type="button" title="설정" aria-label="설정">${icon('settings')}</button>
                <button id="home-btn" type="button" title="홈" aria-label="홈으로">${icon('home')}</button>
              </div>
            </div>
            <div class="effect-log" id="log"></div>
          </div>
        </div>

        <div class="stage-area" id="pbox">
          ${this.modeLabel ? `<div class="endless-ribbon" role="status"><span>끝나지 않은 이야기</span><b>${this.modeLabel}</b></div>` : ''}
          ${this.isBoss ? this.bossHudHtml() : ''}
          ${this.isBoss ? this.bossTokenHtml() : ''}
          <div class="chain-rail" id="chain"></div>
          <div class="mult-now" id="mult-now" aria-live="polite"></div>
          <div class="combo-flash" id="combo"></div>
          <div class="resonance-flash" id="resonance" aria-live="polite"></div>
          <div class="flash" id="flash"></div>
          <div id="actors"></div>
        </div>

        ${this.isBoss ? this.bossPlayerHudHtml() : ''}

        <div class="word-zone">
          <div class="pane-stack">
            <div class="pane words">
              <div class="card-table" aria-label="단어 카드 선택 영역">
                <div class="card-hand" id="card-hand" aria-label="현재 손패"></div>
                <button class="draw-deck" id="draw-deck" type="button"></button>
              </div>
              <div class="slot-step" id="steps"></div>
            </div>
            <div class="pane bag">
              <div class="bag-row" id="bagrow"></div>
            </div>
          </div>
        </div>

        <div class="battle-tools" aria-label="전투 보조 메뉴">
          <button class="battle-tool backpack" id="bag" type="button" title="가방">${icon('backpack')}<span>가방</span></button>
          <button class="battle-tool codex-btn" id="codex-btn" type="button">${icon('collection')}<span>도감</span></button>
        </div>

        <aside class="info-dock detail-idle" id="detail" aria-live="polite"></aside>

        <div id="overlay"></div>
      </div>`

    this.renderGrade()

    // 액션 컷은 화면 밖에 붙여 두고 지금부터 받아 둔다 — 터질 때 받기 시작하면
    // 가장 짜릿해야 할 순간에 검은 사각형이 먼저 뜬다.
    this.attackCine = new AttackCinematic(this.q<HTMLElement>('.scene.battle'))

    this.q('#bag').addEventListener('click', () => this.toggleBag())
    this.q('#codex-btn').addEventListener('click', () => this.openCodex())
    this.q('#settings-btn').addEventListener('click', () => this.openSettings())
    this.q('#home-btn').addEventListener('click', () => this.onHome?.())

    this.cardHand = new CardHand({
      handRoot: this.q('#card-hand'),
      deckButton: this.q<HTMLButtonElement>('#draw-deck'),
      onConfirm: (word) => {
        if (!this.busy && !this.over) this.pick(word.id)
      },
      onHover: () => GameAudio.play('cardHover'),
      onPreview: (word) => {
        this.keepDock()
        this.renderDetail(word)
      },
      onPreviewEnd: () => this.fadeDock(() => this.renderDetail(null)),
    })
    this.q('#draw-deck').addEventListener('pointerenter', () => GameAudio.play('cardHover'))
    document.addEventListener('pointerdown', this.onPointerDown, true)
    document.addEventListener('pointerup', this.onPointerUp, true)
    document.addEventListener('pointercancel', this.onPointerUp, true)
    this.renderActors()
    this.renderActionOrder()
    this.renderChain()
    this.renderWords()
    this.renderStats()
    this.renderBag()
    this.clearDetailDock()
    if (this.isBoss) this.scheduleBossTokenSpeech(1800)
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
    if (this.isBoss) {
      const token = this.root.querySelector<HTMLElement>('.boss-token')
      if (token) mountCharacterModel(token, CHARACTER_VISUALS.token)
    }

    host.querySelectorAll<HTMLElement>('.actor.foe').forEach((el) => {
      if (!visibleSet.has(Number(el.dataset.i))) this.releaseFoe(el)
    })
    visible.forEach((i, rank) => {
      const e = s.enemies[i]
      let el = host.querySelector<HTMLElement>(`.actor.foe[data-i="${i}"]`)
      if (!el) {
        el = this.acquireFoe(i, e)
        host.append(el)
      }
      this.updateFoe(el, e, rank, visible.length)
    })
    this.renderEnemyOverflow(host, hiddenWaiting)
    this.renderStats()
    this.renderActionOrder()
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
    suspendCharacterModel(el)
    el.remove()
    if (!key) return
    const pool = this.enemyPool.get(key) ?? []
    pool.push(el)
    this.enemyPool.set(key, pool)
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

  private acquireFoe(i: number, enemy: EnemyInst): HTMLElement {
    const key = enemy.def.id
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
      this.bindActor(actor)
      return actor
    })()
    // 풀에 들어오기 전 경로와 무관하게 재취득 시 한 번 더 방어적으로 초기화한다.
    el.getAnimations().forEach((animation) => animation.cancel())
    el.classList.remove(...TRANSIENT_ACTOR_CLASSES)
    el.dataset.i = String(i)
    el.dataset.character = visual.id
    el.dataset.poolKey = key
    el.setAttribute('aria-label', `${enemy.def.name} 상세 보기`)
    el.querySelector<HTMLElement>('.nm')!.textContent = enemy.def.name
    const image = el.querySelector<HTMLImageElement>('.battle-sprite')!
    image.src = visual.portrait2d
    image.alt = enemy.def.name
    const modelShell = el.querySelector<HTMLElement>('.model-shell')!
    if (!visual.model3d) modelShell.dataset.modelStatus = 'fallback-2d'
    mountCharacterModel(el, visual)
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
    const enemyEntry = (timing: OrderEntry['timing'], note: string, active = false): OrderEntry => ({
      key: `enemy-${front}`,
      name: enemy!.def.name,
      portrait: this.visualForEnemy(enemy!).portrait2d,
      side: 'enemy',
      timing,
      note,
      active,
    })
    const playerEntry: OrderEntry = {
      key: 'player',
      name: '프롬',
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
        data-order-key="${entry.key}" style="--order-i:${index}">
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
  }

  private playerHtml(): string {
    const modelStatus = this.playerVisual.model3d ? 'preparing-3d' : 'fallback-2d'
    return `
      <div class="actor you" data-character="player" role="button" tabindex="0" aria-label="프롬과 도우미 토큰 상세 보기">
        ${this.isBoss ? '' : `<div class="nameplate glass">
          <div class="row"><span class="nm">프롬</span><span class="hpn"></span></div>
          <div class="hpbar you"><div class="fill"></div><div class="shield"></div></div>
        </div>`}
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="${modelStatus}"><img class="battle-sprite" src="${this.playerVisual.portrait2d}" alt="프롬"></div>
      </div>`
  }

  private bossPlayerHudHtml(): string {
    return `
      <section class="boss-player-health-hud nameplate glass" id="boss-player-health-hud" aria-label="프롬 체력">
        <div class="row"><span class="nm">프롬</span><span class="hpn"></span></div>
        <div class="hpbar you"><div class="fill"></div><div class="shield"></div></div>
      </section>`
  }

  private bossHudHtml(): string {
    const bossName = this.state.enemies[0]?.def.name ?? '보스'
    return `
      <section class="boss-health-hud" id="boss-health-hud" aria-label="${bossName} 보스 체력">
        <div class="boss-health-heading">
          <span class="boss-health-mark" aria-hidden="true">BOSS</span>
          <b class="nm">${bossName}</b>
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
        <div class="enemy-traits"></div>
      </section>`
  }

  private bossTokenHtml(): string {
    const token = CHARACTER_VISUALS.token
    const modelStatus = token.model3d ? 'preparing-3d' : 'fallback-2d'
    return `
      <div class="boss-token" aria-label="불안해하며 프롬을 응원하는 토큰">
        <div class="token-speech" role="status" aria-live="polite"></div>
        <div class="token-panic-lines" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="model-shell" data-model-status="${modelStatus}">
          <img class="battle-sprite" src="${token.portrait2d}" alt="토큰">
        </div>
      </div>`
  }

  private scheduleBossTokenSpeech(delay: number) {
    const timer = window.setTimeout(() => {
      if (this.over) return
      const bubble = this.root.querySelector<HTMLElement>('.token-speech')
      if (!bubble) return
      bubble.textContent = TOKEN_BOSS_LINES[this.tokenSpeechIndex % TOKEN_BOSS_LINES.length]
      this.tokenSpeechIndex += 1
      bubble.classList.remove('is-speaking')
      // 연속 대사도 말풍선의 손글씨 팝업을 첫 프레임부터 다시 재생한다.
      void bubble.offsetWidth
      bubble.classList.add('is-speaking')
      const hideTimer = window.setTimeout(() => bubble.classList.remove('is-speaking'), 3600)
      this.timers.push(hideTimer)
      this.scheduleBossTokenSpeech(7600)
    }, delay)
    this.timers.push(timer)
  }

  private updatePlayer(el: HTMLElement) {
    const s = this.state
    const hud = this.isBoss ? this.q('#boss-player-health-hud') : el
    hud.querySelector<HTMLElement>('.hpn')!.innerHTML =
      `${Math.max(0, s.playerHp)}/${s.playerMax} ${s.guard ? `<span class="shield-chip">◈${s.guard}</span>` : ''}`
    this.paintGuardedHpBar(hud.querySelector<HTMLElement>('.hpbar.you')!, s.playerHp, s.playerMax, s.guard)
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
    return `
      <div class="actor foe${e.def.boss ? ' boss' : ''}" data-i="${i}" data-character="${visual.id}"
        role="button" tabindex="0" aria-label="${e.def.name} 상세 보기">
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
          <div class="enemy-traits"></div>
        </div>
        <span class="first-mark" title="선공 — 내 문장 직후, 나보다 먼저 때린다">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/><path class="bang" d="M12 9v5M12 17.2v.1"/></svg><b>선공</b>
        </span>
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="${modelStatus}"><img class="battle-sprite" src="${visual.portrait2d}" alt="${e.def.name}"></div>
        <span class="guard-hint" aria-hidden="true">우선 방어하세요!</span>
      </div>`
  }

  private updateFoe(el: HTMLElement, e: EnemyInst, rank: number, visibleCount: number) {
    const front = rank === 0
    const depth = visibleCount <= 1 ? 0 : rank / (visibleCount - 1)
    el.style.right = this.isBoss && e.def.boss ? 'calc(50% - 195px)' : `${RAIL_FRONT_RIGHT - rank * RAIL_GAP}px`
    el.style.bottom = this.isBoss && e.def.boss ? '24px' : '26px'
    el.style.zIndex = String(40 - rank) // 앞줄이 뒷줄을 가린다
    // 뒤쪽도 적의 수와 종류를 읽을 수 있을 만큼 남긴다. 깊이감은 크기와 아주
    // 얕은 흐림으로만 표현하며, opacity로 사라지게 만들지 않는다.
    el.style.opacity = `${1 - depth * 0.2}`
    el.style.setProperty('--model-scale', `${1 - depth * 0.24}`)
    el.style.setProperty('--model-blur', `${depth * 1.5}px`)
    el.classList.toggle('front', front)
    el.classList.toggle('target', front)
    el.classList.toggle('back', !front)

    // 세 마리 모두 같은 축에서 읽히도록 이름표를 유지하되 대기 적만 은은하게 한다.
    const plate = el.querySelector<HTMLElement>('.nameplate')!
    plate.classList.toggle('faint', rank > 0)
    plate.classList.remove('gone')
    this.updateFoePlate(plate, e, false)
    if (e.def.boss) {
      const bossHud = this.root.querySelector<HTMLElement>('#boss-health-hud')
      if (bossHud) this.updateFoePlate(bossHud, e, true)
    }
    // 선공 상태는 딱지 대신 캐릭터 자체의 붉은 발광 + "먼저 공격!" 경고로 보여준다(후공은 무표시).
    el.classList.toggle('strikes-first', front && !e.dead && e.initiativePhase === 'first')
  }

  private updateFoePlate(plate: HTMLElement, e: EnemyInst, bossHud: boolean) {
    const remainingBars = Math.ceil(Math.max(0, e.hp) / e.hpPerBar)
    plate.querySelector<HTMLElement>('.hpn')!.textContent = e.healthBars > 1
      ? (bossHud ? `${Math.max(0, e.hp)} / ${e.maxHp}` : `${Math.max(0, e.hp)}/${e.maxHp} · ${remainingBars}막`)
      : `${Math.max(0, e.hp)}/${e.maxHp}`
    const hpbar = plate.querySelector<HTMLElement>('.hpbar.foe')!
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
    const traits = plate.querySelector<HTMLElement>('.enemy-traits')!
    const weak = e.def.weakEmotion
    traits.innerHTML = [
      weak ? `<span class="trait weak emotion-${weak}">${emotionBadgeContent(weak)}<strong>약점</strong></span>` : '',
      e.guard > 0 ? `<span class="trait guard">▰ 방어 ${e.guard}</span>` : '',
      e.magicShield > 0 ? `<span class="trait magic">✧ 매직실드 ${e.magicShield}</span>` : '',
      e.def.pierceGuard ? '<span class="trait pierce">◆ 방어 관통</span>' : '',
    ].join('')
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
      stats = enemy
        ? [
            ['체력', `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`],
            ['공격', String(Math.round(enemy.def.atk * enemy.atkMult))],
            ...(enemy.def.weakEmotion
              ? [['약점', `<span class="enemy-weakness emotion-${enemy.def.weakEmotion}">${emotionBadgeContent(enemy.def.weakEmotion)}</span>`]]
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
        return `<span class="chain-word${attach}" data-i="${i}">
          <b class="cw-text">${toks[i]}</b>
          ${note ? `<em class="cw-note ${note.cls}">${note.text}</em>` : ''}
        </span>`
      })
      .join('')
    let extra = ''
    if (anyPicked) {
      const intent = compile(this.sel, this.t, this.player.stats, this.mods())
      for (const c of matchCombos(this.sel, this.t.combos, order)) {
        extra += `<span class="chain-word ctx perfect"><b class="cw-text">「${c.name}」</b><em class="cw-note combo">완벽한 맥락 ×${c.mult}</em></span>`
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
    this.renderMultNow(anyPicked)
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
    const intent = compile(this.sel, this.t, this.player.stats, this.mods())
    const mult = resolveMultiplier(intent, this.multCtx(intent), 0.5).mult
    // 정산판과 같은 출처(컴파일러가 쌓아 둔 깡수치)를 쓴다 — 방어·회복 문장도 0이 되지 않는다.
    const flat = intent.breakdown.flats.reduce((n, f) => n + f.value, 0)
    const lane = isDamageIntent(intent) ? '위력' : intent.heal > 0 ? '회복' : intent.guard > 0 ? '방어' : '위력'
    if (!host.querySelector('.mn-mult')) {
      host.innerHTML = `<span class="mn-lane"></span><span class="mn-flat"></span><span class="mn-x">×</span><span class="mn-mult"></span>`
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
    const lines = wordValueLines(w, this.player.stats)
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
        // 한 번 고른 칸은 되돌리지 못한다 — 문장은 쓴 순서대로 흘러간다.
        // 스텝은 "지금 어디까지 왔나"를 읽는 표시일 뿐이라 누를 수 없다.
        return `<button class="step ${cls}" data-i="${g.indices[0]}" disabled><b>${no}</b> ${g.label}</button>`
      })
      .join('<span class="sep">·</span>')

    const key = this.order()[this.slotIndex]
    // 테이블 목록을 먼저 본다 — 덱에 없는 유령 카드(무럭무럭·문장부호)가 여기에만 있다.
    // 덱을 먼저 보면 주어·수식·동사 칸에서 유령 카드가 통째로 사라진다.
    const words = this.t.words[key] ?? this.player.deck[key] ?? []
    this.cardHand.showSlot(key, words, this.sel[key], (word) => conflictReason(word, this.slotIndex, this.sel, this.t))
    if (!this.bagMode) this.renderDetail(null)
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
    // 현재 문장에 이 단어를 끼우면 맥락이 어긋나는지 미리 경고(실행 전 학습).
    const trial: Selection = { ...this.sel, [key]: w }
    const intent = compile(trial, this.t, this.player.stats, this.mods())
    const warn = intent.penalties.length
      ? `<div class="wd-warn">⚠ ${intent.penalties[0]} · 위력 ×${intent.coherence.toFixed(2)}</div>`
      : ''

    // 일러스트가 있으면 패널 전체에 풀로 깔고, 글은 아래쪽 스크림 위에 얹는다.
    const art = w.art ? SKILL_ART[w.art] : undefined
    detail.className = `info-dock glass word-detail mood-${mood} emotion-${emotion}`
    detail.innerHTML = `
      ${art ? `<div class="wd-art"><img src="${art}" alt="" /><span class="wd-art-tint" aria-hidden="true"></span></div>` : ''}
      <div class="wd-scrim" aria-hidden="true"></div>
      <div class="wd-body">
        <div class="wd-title-row">${emotionIconBadge(emotion, 'wd-emotion')}<div class="wd-name">${w.text}</div></div>
        <div class="wd-grade">✦ ${slotLabel} · ${RARITY_LABEL[w.rarity ?? 'common']}${(w.level ?? 1) > 1 ? ` · Lv.${w.level}` : ''}</div>
        ${this.projectionHtml(w, key)}
        <div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
        ${comboHintHtml(w, { combos: this.t.combos, words: this.t.words }, intent.combos)}
        ${warn}
      </div>`
  }

  private multCtx(intent: Intent) {
    return { luck: this.player.stats.luck, statBias: statBiasOf(intent, this.player.stats) }
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
    const intent = compile(sel, this.t, this.player.stats, this.mods())
    const m = resolveMultiplier(intent, this.multCtx(intent), 0.5).mult
    const guard = Math.round(intent.guard * m)
    const heal = Math.round(intent.heal * m)
    const dmg = Math.round(effectiveBase(intent) * m)
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
    return wordValueLines(w, this.player.stats)
  }

  // ── 좌상단 아이콘 스탯 바 ──
  private renderStats() {
    // 아이템 규칙은 가방 상세에서 읽는다 — 스탯표 아래에 탭처럼 늘어놓지 않는다.
    this.q('#stats').innerHTML =
      '<span class="hud-player-name" aria-label="주인공 이름 프롬">프롬</span>' +
      STAT_META.map(
        (m) => {
          const value = m.key === 'hp' ? `${Math.max(0, this.state.playerHp)}/${this.state.playerMax}` : String(this.player.stats[m.key])
          return `<div class="hud-stat" data-stat-key="${m.key}" role="img" aria-label="${m.label} ${value}. ${m.desc}" data-tooltip="${m.label} · ${m.desc}" title="${m.label}: ${value} — ${m.desc}">
        <span class="si">${icon(m.icon)}</span>
        <b>${value}</b>
      </div>`
        },
      ).join('')
  }

  // ── 가방(아이템) — 하단 인라인 토글 ──
  private renderBag() {
    const row = this.q('#bagrow')
    if (!this.player.items.length) {
      row.innerHTML = `<div class="bag-empty">가방이 비었다.</div>`
      return
    }
    row.innerHTML = this.player.items
      .map(
        (it, i) => `<button class="bag-item" data-i="${i}">
        <div class="bag-art">${itemArt(it.art)}</div>
        <div class="bag-name">${it.name}</div>
      </button>`,
      )
      .join('')
    row.querySelectorAll<HTMLElement>('.bag-item').forEach((btn) => {
      const it = this.player.items[Number(btn.dataset.i)]
      btn.addEventListener('mouseenter', () => {
        this.keepDock()
        this.renderItemDetail(it)
      })
      btn.addEventListener('mouseleave', () => this.fadeDock(() => this.renderItemDetail(null)))
    })
  }

  private toggleBag() {
    this.bagMode = !this.bagMode
    this.q('.word-zone').classList.toggle('bag-mode', this.bagMode)
    this.q('#bag').classList.toggle('active', this.bagMode)
    this.renderItemDetail(null)
    if (!this.bagMode) this.renderDetail(null)
  }

  // 우측 정보 패널에 아이템 정보(스탯표 + 일러스트).
  private renderItemDetail(item: OwnedItem | null) {
    const detail = this.q('#detail')
    if (!item) {
      this.clearDetailDock()
      return
    }
    const rows = STAT_ORDER.filter((k) => item.stats[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${item.stats[k]}</span></div>`)
      .join('')
    // 전설 아이템은 스탯이 아니라 규칙을 준다 — 그 규칙을 그대로 적어 준다.
    const p = item.passive ? PASSIVES[item.passive] : null
    const passive = p ? `<div class="id-passive"><b>${p.name}</b><span>${p.desc}</span></div>` : ''
    detail.className = `info-dock glass item-detail${p ? ' is-passive' : ''}`
    detail.innerHTML = `
      <div class="wd-name">${item.name}</div>
      <div class="wd-grade">✦ ${RARITY_LABEL[ownedItemRarity(item)]} · 「${item.line}」</div>
      ${passive}
      <div class="id-stats">${rows}</div>
      <div class="id-art">${itemArt(item.art)}</div>`
  }

  private openSettings() {
    openSettingsModal(this.root, { onResetAll: () => this.onResetAll?.() })
  }

  // ── 단어장(전체 덱) 오버레이 ──
  private deckPreviewHtml(w: Word): string {
    const mood = this.moodOf(w)
    const emotion = emotionOrNeutral(w.emotion)
    const art = w.art ? SKILL_ART[w.art] : undefined
    const rarity = w.rarity ?? 'common'
    const level = w.level ?? 1
    const badge = `<span class="card-level rarity-${rarity}">${RARITY_LABEL[rarity]}${level > 1 ? ` Lv.${level}` : ''}</span>`
    const face = art
      ? `<div class="card-face card-front art">
          <img class="card-illus" src="${art}" alt="" aria-hidden="true">
          <span class="card-tint" aria-hidden="true"></span><span class="card-veil" aria-hidden="true"></span><span class="card-foil" aria-hidden="true"></span>
          ${badge}${emotionIconBadge(emotion, 'card-emotion')}<strong class="card-title" ${cardTitleStyle(w.text, true)}>${w.text}</strong><span class="card-note">${w.note}</span>
        </div>`
      : `<div class="card-face card-front">
          <span class="card-foil" aria-hidden="true"></span>${badge}${emotionIconBadge(emotion, 'card-emotion')}<span class="card-art" aria-hidden="true"><i></i><b>✦</b></span>
          <strong class="card-title" ${cardTitleStyle(w.text)}>${w.text}</strong><span class="card-note">${w.note}</span><small>WORD CARD</small>
        </div>`
    return `<div class="deck-hover-card mood-${mood} emotion-${emotion} rarity-${rarity}" aria-hidden="true">${face}</div>`
  }

  // ── 도감 — 현재 단어장과 카드·적·아이템 기록을 왼쪽 인덱스로 넘겨 본다. ──
  private openCodex() {
    const host = this.q('#overlay')
    const slots = this.t.template.slots
    const ownedWords = Object.values(this.player.deck).flat()
    // 문장부호는 덱에 들어오지 않는다 — 칸을 여는 아이템(올림프의 당근)을 얻으면 기록된다.
    // 무럭무럭은 카드풀에 유령처럼 섞이는 성장 카드라 도감에 남기지 않는다.
    const punctOwned = hasPassive(this.player, 'punct')
    const owned = new Set([
      ...Object.values(this.player.deck).flat().map((word) => word.id),
      ...(punctOwned ? PUNCT_WORDS.map((word) => word.id) : []),
    ])
    const catalog = [...Object.values(EARLY_WORDS).flat(), ...Object.values(REWARD_WORDS).flat(), ...PUNCT_WORDS]
      .filter((word, index, all) => all.findIndex((entry) => entry.id === word.id) === index)
    const found = catalog.filter((word) => owned.has(word.id)).length
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
            <span class="dw">${word.text}</span><span class="dn">${word.note}</span>
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
              <div><b>${discovered ? word.text : '미발견 카드'}</b><span>${discovered ? word.note : '보상에서 만나면 기록된다.'}</span></div>
            </article>`
          }).join('')}
        </div>
      </section>`).join('')}
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
            <button type="button" data-codex-tab="enemy" data-count="적 ${foundEnemies} / ${enemyCatalog.length}"><span>03</span><b>적 도감</b><small>${foundEnemies} / ${enemyCatalog.length}</small></button>
            <button type="button" data-codex-tab="item" data-count="아이템 ${foundItems} / ${itemCatalog.length}"><span>04</span><b>아이템 도감</b><small>${foundItems} / ${itemCatalog.length}</small></button>
          </nav>
          <div class="codex-content">
            ${ownedContent}
            ${cardContent}
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
        <p class="wd-flavor">${w.note}</p>
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
    const rows = STAT_ORDER.filter((k) => item.base[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${item.base[k]}</span></div>`)
      .join('')
    const p = item.passive ? PASSIVES[item.passive] : null
    const passive = p ? `<div class="id-passive"><b>${p.name}</b><span>${p.desc}</span></div>` : ''
    return `<div class="cdx-detail-card cdx-item${p ? ' is-passive' : ''}">
      <div class="cdx-detail-kicker">ITEM DETAIL</div>
      <div class="id-art">${itemArt(item.art)}</div>
      <div class="cdx-detail-copy">
        <div class="wd-name">${item.name}</div>
        <div class="wd-grade">✦ ${RARITY_LABEL[item.rarity]}</div>
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
    const key = this.order()[this.slotIndex]
    const debugKey = `${key}:${id}`
    const w = this.t.words[key].find((x) => x.id === id) ?? this.debugSpawnedWords.get(debugKey)
    if (!w) return
    this.debugSpawnedWords.delete(debugKey)
    GameAudio.play('paper')
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
    // 전부 채우면 자동 완성(반짝 → 발동)
    if (this.complete()) {
      GameAudio.play('sentenceComplete')
      void this.autoComplete()
    }
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
    // 피해도 회복도 없는 문장(순수 방어 등)은 집계판을 띄우지 않는다.
    const heals = !dealsDamage && intent.heal > 0
    if (!dealsDamage && !heals) return { flats: [], mults: [], base: 0, mult: 1, total: 0, kind: 'dmg' }

    // 깡수치·배율의 출처는 컴파일러가 이미 순서대로 쌓아 뒀다(문장 왼쪽부터 → 관용구 → 어긋남).
    const resonanceEmotion = this.resonantEmotion(intent.emotions)
    const cls = (p: { source: string; value: number }) =>
      p.source === 'emotion' && resonanceEmotion
        ? `resonance emotion-${resonanceEmotion}`
        : p.source === 'combo' ? 'combo' : p.source === 'coherence' ? 'down' : p.source === 'stat' ? 'stat' : p.value < 1 ? 'down' : 'buff'
    // 동사가 둘이면 한 문장이 피해와 회복을 동시에 만든다 — 집계판은 자기 풀만 더한다.
    // (안 그러면 방어 깡수치가 피해 총합에 섞여 화면 숫자와 실제 피해가 어긋난다.)
    const lane = dealsDamage ? 'damage' : 'heal'
    const flats: TallyPart[] = intent.breakdown.flats
      .filter((p) => (p.lane ?? 'damage') === lane)
      .map((p) => ({
        label: p.hint ? `${p.label} (${p.hint})` : p.label,
        value: p.value,
        cls: dealsDamage ? 'dmg' : 'heal',
      }))
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
    return { flats, mults, base, mult, total: Math.round(base * mult), kind: dealsDamage ? 'dmg' : 'heal' }
  }

  // 깡 점수가 하나씩 쌓이고 → 배율이 하나씩 꽂히고 → 총합이 쾅. 발라트로식 콤보 쾌감.
  private async playTally(tally: Tally): Promise<void> {
    const el = document.createElement('div')
    el.className = `tally ${tally.kind}`
    el.innerHTML = `
      <div class="tally-slots">
        <div class="tally-box base"><span class="tl">깡 점수</span><b>0</b></div>
        <div class="tally-x">×</div>
        <div class="tally-box mult"><span class="tl">배율</span><b>1.00</b></div>
      </div>
      <div class="tally-feed tally-flat-feed"></div>
      <div class="tally-phase" aria-hidden="true"><i></i><span>배율 누적</span><i></i></div>
      <div class="tally-feed tally-mult-feed"></div>
      <div class="tally-total"></div>`
    this.q('#pbox').appendChild(el)
    requestAnimationFrame(() => el.classList.add('in'))
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    const flatFeed = el.querySelector<HTMLElement>('.tally-flat-feed')!
    const multFeed = el.querySelector<HTMLElement>('.tally-mult-feed')!
    await sleep(200)

    let base = 0
    for (const f of tally.flats) {
      base += f.value
      baseBox.querySelector('b')!.textContent = String(base)
      this.tallyChip(flatFeed, `${f.label} +${f.value}`, f.cls)
      this.bump(baseBox)
      // 깡수치만으로도 판을 뒤흔들 만큼 쌓였으면 이미 달아오르기 시작한다.
      this.setFever(el, base)
      await sleep(165)
    }
    let mult = 1
    const hasRisingMultiplier = tally.mults.some((part) => part.value > 1)
    const multStarted = performance.now()
    if (hasRisingMultiplier) {
      el.classList.add('mult-rising')
      GameAudio.playMultiplierRise()
    }
    multBox.classList.add('rolling')
    for (const [i, m] of tally.mults.entries()) {
      const nextMult = mult * m.value
      this.tallyChip(multFeed, `${m.label} ×${m.value.toFixed(2)}`, m.cls)
      // 배율이 겹칠수록 판이 뜨거워진다.
      el.style.setProperty('--heat', Math.min(1, (i + 1) / 4).toFixed(2))
      await this.rollMultiplierValue(multBox.querySelector('b')!, mult, nextMult, 330)
      mult = nextMult
      this.bump(multBox)
      // 배율이 한 칸 꽂힐 때마다 지금까지의 예상 총합으로 열기를 다시 잰다 —
      // 곱이 겹칠수록 판이 커지고 흔들리고 불이 붙는다.
      this.setFever(el, base * mult)
      await sleep(36)
    }
    multBox.classList.remove('rolling')
    if (hasRisingMultiplier) {
      const remainingSoundMs = Math.max(0, 930 - (performance.now() - multStarted))
      if (remainingSoundMs) await sleep(remainingSoundMs)
      el.classList.remove('mult-rising')
      el.classList.add('mult-settled')
      await sleep(420)
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

  // 집계판 체류 — 기본 1.3초. 패널에 마우스를 올려두면 놓을 때까지(최대 8초) 기다리고,
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
        const holding = el.matches(':hover') && elapsed < 8000
        if (elapsed >= 1300 && !holding) return finish()
        this.timers.push(window.setTimeout(tick, 140))
      }
      tick()
    })
  }

  // 총합 문턱 — 넘을 때마다 판이 한 단계 더 화려해진다(발광·확대).
  private applyHeatTier(el: HTMLElement, v: number) {
    el.classList.toggle('hot1', v >= 50)
    el.classList.toggle('hot2', v >= 90)
    el.classList.toggle('hot3', v >= 140)
  }

  // 뽀로롱 롤업 — 스텝마다 깡/배율 상자에서 불꽃이 총합으로 날아가 꽂히고 숫자가 오른다.
  private async rollUpTotal(el: HTMLElement, tally: Tally) {
    const total = el.querySelector<HTMLElement>('.tally-total')!
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    total.textContent = '0'
    const steps = Math.min(11, Math.max(5, Math.round(tally.total / 14)))
    for (let i = 1; i <= steps; i++) {
      const eased = 1 - Math.pow(1 - i / steps, 2)
      void this.flingSpark(i % 2 ? baseBox : multBox, total, el)
      await sleep(i === steps ? 150 : 95)
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
    await sleep(380)
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
    GameAudio.playResonance(intent.emotions)
    await sleep(860)
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
    const intent = compile(this.sel, this.t, this.player.stats, this.mods())
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
    const dmg = Math.round(effectiveBase(intent) * mult)

    // 문장을 읽고 맥락을 확정한 뒤 준비 효과와 본행동을 시간순으로 나눈다.
    const chainEls = Array.from(this.q('#chain').querySelectorAll<HTMLElement>('.chain-word'))
    for (let i = 0; i < order.length; i++) {
      const w = this.sel[order[i]]
      const c = w ? this.contribOf(w) : null
      const el = chainEls[i]
      if (el) el.classList.add('wave')
      if (c && el) this.popEl(el, c.text, `tick ${c.cls}`)
      await sleep(95)
    }
    this.q('#flash').classList.add('go')
    await sleep(150)

    if (intent.emotionResonance > 1) await this.showEmotionResonance(intent)

    // 맥락(관용구) 발동 배너
    if (intent.combos.length) {
      GameAudio.play('contextBonus')
      const combos = matchCombos(this.sel, this.t.combos, order)
      const comboMult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div><div class="name">${intent.combos.join(' · ')}</div><div class="mult">위력 ×${comboMult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(900)
      el.classList.remove('show')
    }

    // 4) 점수 확정 — 깡수치와 배율이 팅·팅·팅 순서대로 꽂히고, 총합은 화면에 그대로 머문다.
    //    이 숫자를 들고 준비 효과 → 선공 → 내 공격까지 이어가므로 중간에 다시 계산하지 않는다.
    const tally = this.buildTally(intent, resolved, dealsDamage)
    if (tally.total > 0) await this.playTally(tally)

    // 무럭무럭 — 배율을 받지 않는 고정 성장이라 배율 정산과 별개로 먼저 자란다.
    // 최대 체력과 현재 체력을 함께 올려야 "자랐다"가 체감된다.
    if (intent.growHp > 0) await this.growUp(intent.growHp)

    // 5) 준비 효과 — 방어를 선공 공격보다 먼저 적용한다.
    this.setPhase('준비 효과')
    const prep = applyPreparation(this.state, intent, mult)
    if (prep.guardGain > 0) {
      playCharacterAnimation(this.q<HTMLElement>('.actor.you'), 'shield')
      // 캐릭터의 실드 형성과 같은 프레임에 체력바도 차오르기 시작한다.
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      await this.rollTotal(prep.guardGain, 'guard')
      await this.flyToPlayer(`방어+${prep.guardGain}`, 'guard', 'guard')
      this.log(`${intent.sentence} → 방어 ${prep.guardGain} 준비`)
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
      if (this.state.playerHp <= 0) {
        await this.lose()
        return
      }
    }

    // 7) 본인 캐릭터 행동 — 아까 띄워 둔 총합이 그대로 적에게 꽂힌다.
    this.setPhase('본인 캐릭터 행동')

    // 액션 컷 — 이 판을 크게 깎아내는 일격에만 붙는다. 남은 적을 전부 쓸어버리면 2번 컷.
    // 문턱은 판 크기 비율이라(encounterHp) 층이 올라도 희소성이 그대로 유지된다.
    if (dealsDamage) {
      const alive = aliveIdx(this.state)
      const wipesAll =
        alive.length > 0 && this.predictKills(dmg, this.target, intent.aoe === 'all') >= alive.length
      const cut = attackCutFor(dmg, this.encounterHp, mult, wipesAll)
      if (cut) await this.attackCine?.play(cut)
    }

    // 두 마리 이상이 쓸려나갈 일격이면 때리기 직전에 화면이 늘어졌다가, 꽂히는 순간 고속으로 풀린다.
    const sweep = dealsDamage && this.predictKills(dmg, this.target, intent.aoe === 'all') >= 2
    if (sweep) await this.slowmoWindup()

    // 실제 본행동 발동 + 꽂힘 연출
    const res = applyIntent(this.state, intent, mult, this.target)
    this.releaseTally()
    await this.strike(res, sweep)
    const rouletteNote = resolved.outcome === 'crit' ? ' · 대성공!' : resolved.outcome === 'fail' ? ' · 실패…' : ''
    this.log(
      res.text +
        (res.combos.length ? ` · ${res.combos.join(', ')}` : '') +
        rouletteNote +
        (intent.penalties.length ? ` · 어긋남 ×${intent.coherence.toFixed(2)}` : ''),
      tally.total > 0 ? tally : undefined,
    )
    this.renderActors()

    // 초과 피해(오버플로우): 앞 적을 넘겼으면 활활 타오르다 다음 적이 당겨오면 꽂힌다.
    let kills = res.killed.length
    if (this.state.playerHp <= 0) {
      await this.lose()
      return
    }

    if (res.overflow > 0 && !allDead(this.state)) kills += await this.resolveOverflow(res.overflow, sweep)

    // 누댕의 메아리 — 대성공한 문장은 한 번 더 발동한다. 준비 효과와 적 페이즈는
    // 다시 돌지 않는다(문장만 메아리친다). 이미 전멸했으면 울릴 곳이 없다.
    if (resolved.outcome === 'crit' && hasPassive(this.player, 'echo') && !allDead(this.state)) {
      kills += await this.echoStrike(intent, mult, sweep)
    }

    // 맞대던 적이 죽었으면 새 최전방을 여기서 맞댄다 — 행동 순서 표시도 같은 상태를 읽는다.
    if (kills > 0) engageFront(this.state)

    // 아기돼지 바베큐 — 잡은 수가 다음 문장의 배율이 된다.
    this.killsThisBattle += kills

    // 한 턴에 두 마리 이상 쓸어담으면 보상등급이 띵·띵·띵 오른다. 전멸 마무리면 +1.
    const gradeGain = overkillGain(kills, allDead(this.state))
    if (gradeGain > 0) await this.dingGrade(gradeGain)

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
          if (hit.magicShieldBroken) await this.playSpellShieldImpact(hit.target, hit.magicShieldRemaining)
          else if (hit.guardAbsorbed > 0 && hit.dmg === 0) this.popAt(hit.target, `방어 ${hit.guardAbsorbed}`, 'guard')
          else if (hit.dmg > 0) {
            if (el) SquareBurst.playOn(el, 'damage', { spread: 100 })
            this.popAt(hit.target, `${hit.dmg}`, hit.weak ? 'dmg big weak' : 'dmg big')
          }
        }
        this.log(result.text)
        await sleep(300)
        for (const k of result.killed) await this.playDeath(k, 1)
        this.renderActors()
        if (result.killed.length > 0) engageFront(this.state)
        // 예약 문장의 몰살도 오버킬로 인정한다.
        const pendingGain = overkillGain(result.killed.length, allDead(this.state))
        if (pendingGain > 0) await this.dingGrade(pendingGain)
      }
    }

    if (this.state.playerHp <= 0) {
      await this.lose()
      return
    } else if (allDead(this.state)) {
      await this.finishWin(300)
      return
    }

    this.sel = {}
    this.slotIndex = 0
    this.playerPreempting = false
    this.state.turn++
    // 턴이 넘어가면 등급이 식는다 — 운이 보장하는 바닥까지만.
    const prevGrade = this.grade
    this.grade = decayGrade(this.grade, this.player.stats.luck)
    if (this.grade < prevGrade) this.tickGradeDown()
    this.setPhase('주어 선택')
    this.busy = false
    this.q('.word-zone').classList.remove('is-resolving')
    this.cardHand.resetTurn()
    this.renderChain()
    this.renderWords()
  }

  /** 패배 — 진행 중 연출을 정리하고 그림일기 결과 화면으로 넘긴다. */
  private async lose(): Promise<void> {
    if (this.over) return
    this.releaseTally()
    this.over = true
    this.setPhase('패배')
    this.log('일기장이 너무 상했다…')
    this.renderActors()
    const defeatDuration = playCharacterAnimation(this.q<HTMLElement>('.actor.you'), 'defeat')
    await sleep(defeatDuration || 520)
    this.onLose()
  }

  /**
   * 무럭무럭 — 최대 체력이 영구히 자란다. 배율을 받지 않는 고정 수치다.
   * 런 전체에 남아야 하므로 플레이어 스탯(hp)까지 함께 올린다.
   * 겹칠수록 이름이 길어진다: 무럭무럭 → 무럭무럭무럭무럭.
   */
  private async growUp(n: number): Promise<void> {
    this.player.stats.hp += n
    this.state.playerMax += n
    this.state.playerHp += n
    // 카드 한 장이 +2라 자란 만큼 그대로 반복하면 한 장은 "무럭무럭"으로 읽힌다.
    const label = '무럭'.repeat(Math.min(n, 8)) + (n > 8 ? '…' : '')
    this.popPlayer(`${label} 최대체력+${n}`, 'heal')
    this.log(`${label} — 최대 체력이 ${n} 자랐다.`)
    this.renderStats()
    this.renderActors()
    await sleep(420)
  }

  /**
   * 메아리 재발동 — 같은 문장을 같은 배율로 한 번 더 꽂는다.
   * 배율을 다시 굴리지 않으므로 대성공 ×1.5가 두 번 그대로 들어간다.
   * 반환값은 이번 재발동으로 늘어난 처치 수(오버킬 등급에 합산).
   */
  private async echoStrike(intent: Intent, mult: number, sweep: boolean): Promise<number> {
    // 살아 있는 적으로 조준을 옮긴다 — 원래 대상이 이미 쓰러졌을 수 있다.
    if (this.state.enemies[this.target]?.dead) this.target = aliveIdx(this.state)[0] ?? this.target

    const banner = this.q('#combo')
    banner.innerHTML = `<div class="kicker">누댕의 메아리</div><div class="name">한 번 더</div><div class="mult">대성공</div>`
    banner.classList.remove('show')
    void banner.offsetWidth
    banner.classList.add('show')
    await sleep(420)

    const res = applyIntent(this.state, intent, mult, this.target)
    await this.strike(res, sweep)
    this.log(`${intent.sentence} → 메아리 · ${res.text.split('→ ').pop() ?? ''}`)
    this.renderActors()

    let kills = res.killed.length
    if (res.overflow > 0 && !allDead(this.state)) kills += await this.resolveOverflow(res.overflow, sweep)
    return kills
  }

  // 플레이어 공격/방어/회복 꽂힘 — 공격이면 돌진, 방어/회복/자해는 플레이어에게 날아가 꽂힘.
  private async strike(
    res: {
      hits: { target: number; dmg: number; magicShieldBroken: boolean; magicShieldRemaining: number }[]
      selfDmg: number
      heal: number
      killed: number[]
    },
    sweep = false,
  ) {
    const you = this.q<HTMLElement>('.actor.you')
    const attacking = res.hits.length > 0
    if (attacking) {
      GameAudio.play('paperAttack')
      playCharacterAnimation(you, 'attack')
      you.classList.add('lunge')
    }
    await sleep(attacking ? (sweep ? 120 : 170) : 40)
    // 꽂히는 순간 늘어졌던 시간이 풀리고 레일이 고속 모드로 전환된다.
    if (sweep) {
      this.endSlowmo()
      this.q('#actors').classList.add('rail-rush')
      this.shakeStage(1)
    }

    for (const h of res.hits) {
      if (h.magicShieldBroken) {
        await this.playSpellShieldImpact(h.target, h.magicShieldRemaining)
        continue
      }
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${h.target}"]`)
      if (el) {
        SquareBurst.playOn(el, 'damage', { spread: 120 })
        this.hitOne(el)
      }
      this.popAt(h.target, `${h.dmg}`, 'dmg big')
    }
    const hitTargets = res.hits
      .filter((hit) => hit.dmg > 0)
      .map((hit) => this.q<HTMLElement>(`#actors .actor.foe[data-i="${hit.target}"]`))
      .filter((actor): actor is HTMLElement => !!actor)
    if (hitTargets.length > 0) {
      const stopMs = Math.min(112, 62 + Math.max(0, hitTargets.length - 1) * 10 + res.killed.length * 14 + (sweep ? 20 : 0))
      await this.attackHitStop(you, stopMs)
    }
    if (attacking) {
      await sleep(250)
      you.classList.remove('lunge')
    }
    // 회복/자해 수치도 플레이어에게 각각 날아가 꽂힌다. 방어는 준비 단계에서 처리한다.
    if (res.selfDmg) await this.flyToPlayer(`${res.selfDmg}`, 'self', 'self')
    if (res.heal) {
      playCharacterAnimation(you, 'heal')
      await this.flyToPlayer(`+${res.heal}`, 'heal', 'heal')
    }
    // 처치된 적은 레일이 당겨지기 전에 카드가 쓰러지며 회색으로 소멸.
    for (const k of res.killed) await this.playDeath(k, 1, sweep)
  }

  // 적 사망 연출 — 카드가 살짝 젖혀졌다 옆으로 쓰러지고, 회색으로 변하며 소멸.
  // combo가 높을수록 튀는 불꽃이 많아 관통 콤보의 화려함이 커진다.
  // fast면 쓸려나가는 흐름이 끊기지 않게 짧고 세게 끝낸다.
  private async playDeath(idx: number, combo = 1, fast = false): Promise<void> {
    const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${idx}"]`)
    if (!el) return
    el.classList.remove('lunge')
    playCharacterAnimation(el, 'defeat')
    el.classList.add('dying')
    if (fast) el.classList.add('fast')
    this.spawnSparks(el, 8 + combo * 5)
    await sleep(fast ? 190 : 560)
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
  private async slowmoWindup() {
    const actors = this.q('#actors')
    const front = this.root.querySelector<HTMLElement>(`#actors .actor.foe[data-i="${this.target}"]`)
    if (front) {
      const box = this.q('#pbox')
      const x = this.toStage(front.getBoundingClientRect()).x
      const pct = `${((x / box.offsetWidth) * 100).toFixed(1)}%`
      actors.style.setProperty('--zoom-x', pct)
      this.q('.scene.battle').style.setProperty('--zoom-x', pct) // 씬 전체 딤도 같은 초점을 쓴다
    }
    actors.classList.add('slowmo')
    // 딤은 씬 전체에 건다 — 무대(.stage-area)에 걸면 하단 350px에서 잘린다.
    this.q('.scene.battle').classList.add('slowmo-veil')
    await sleep(340)
  }

  private endSlowmo() {
    this.q('#actors').classList.remove('slowmo')
    this.q('.scene.battle').classList.remove('slowmo-veil')
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
  // 반환값: 관통으로 추가 처치한 수(보상등급 오버킬 집계용).
  private async resolveOverflow(overflow: number, sweep = false): Promise<number> {
    const actors = this.q('#actors')
    if (sweep) actors.classList.add('rail-rush')
    let combo = 1 // strike의 첫 처치가 콤보 1. 관통마다 +1.
    let killedCount = 0
    while (overflow > 0 && !allDead(this.state)) {
      this.renderActors() // 다음 적이 최전방으로 당겨온다
      const front = frontIdx(this.state)
      if (front < 0) break
      combo++
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${front}"]`)
      const ember = this.showEmber(overflow, combo)
      // 콤보가 오를수록 대기가 짧아져 관통이 빨라진다(빠·바·바·박).
      // 쓸어담기 중이면 아예 고속도로 — 죽고 당겨오고가 끊김 없이 이어진다.
      await sleep(sweep ? Math.max(70, 180 - combo * 30) : Math.max(200, 480 - combo * 66))
      const e = this.state.enemies[front]
      const before = e.hp
      e.hp -= overflow
      // 깊고 화려한 관통 — 콤보에 따라 블라스트/불꽃/흔들림이 커진다.
      ember.classList.add('stab')
      this.showComboBadge(combo)
      if (el) {
        SquareBurst.playOn(el, 'damage', { spread: 120 + combo * 46 })
        this.hitOne(el)
        this.spawnSparks(el, 6 + combo * 4)
      }
      this.shakeStage(Math.min(1, combo / 5))
      this.popAt(front, `${overflow}`, 'dmg big')
      this.timers.push(window.setTimeout(() => ember.remove(), 220))
      // 또 넘겼으면 카드가 쓰러진 뒤 남은 초과 피해가 다음 적으로 연쇄된다.
      if (e.hp <= 0) {
        e.dead = true
        killedCount++
        await this.playDeath(front, combo, sweep)
        overflow = overflow - before
      } else {
        overflow = 0
        await sleep(sweep ? 160 : 320)
      }
    }
    this.renderActors()
    if (sweep) this.timers.push(window.setTimeout(() => actors.classList.remove('rail-rush'), 460))
    return killedCount
  }

  // 보상등급 배지 — 현재 등급 숫자와, 그 등급이면 노려볼 만한 희귀도의 색.
  private renderGrade() {
    const badge = this.q('#grade-badge')
    badge.classList.remove('rarity-common', 'rarity-rare', 'rarity-epic', 'rarity-legendary')
    badge.classList.add(`rarity-${gradeTier(this.grade)}`)
    this.q('#grade').textContent = `✦ ${this.grade}`
  }

  /**
   * 승리 마무리 — 아낀 카드 뽑기를 보상등급으로 바꾼 뒤 피날레를 돌린다.
   * 뽑기를 참으면 그만큼 전리품이 좋아지므로 "지금 손패로 버틸까"가 선택이 된다.
   */
  private async finishWin(pause: number): Promise<void> {
    this.over = true
    this.setPhase('전투 승리')
    const victoryStartedAt = performance.now()
    const victory = Math.random() < 0.5 ? 'victory1' : 'victory2'
    playCharacterAnimation(this.q<HTMLElement>('.actor.you'), victory)
    const victoryHighlightMs = CHARACTER_VISUALS.player.animations?.victoryHighlightMs ?? 2000
    const saved = this.cardHand.savedDraws
    if (saved > 0) {
      this.log(`카드 뽑기 ${saved}회를 아꼈다 — 보상등급 +${saved}`)
      await this.dingGrade(saved)
    }
    await sleep(pause)
    await this.gradeFinale()
    const victoryRemaining = victoryHighlightMs - (performance.now() - victoryStartedAt)
    if (victoryRemaining > 0) await sleep(victoryRemaining)
    this.onWin(this.grade)
  }

  // 띵·띵·띵 — 처치 수만큼 등급이 연타로 튀어오른다. 만렙이면 조용히 멈춘다.
  private async dingGrade(n: number) {
    const badge = this.q('#grade-badge')
    for (let i = 0; i < n; i++) {
      if (this.grade >= GRADE_MAX) break
      this.grade = bumpGrade(this.grade, 1)
      this.renderGrade()
      badge.classList.remove('ding')
      void (badge as HTMLElement).offsetWidth
      badge.classList.add('ding')
      const pop = document.createElement('span')
      pop.className = 'grade-pop'
      pop.textContent = '+1'
      badge.appendChild(pop)
      this.timers.push(window.setTimeout(() => pop.remove(), 700))
      await sleep(150)
    }
  }

  // 승리 피날레 — 보상등급 배지가 무대 중앙으로 날아와 커지며 팅! 하고 전리품에 적용된다.
  private async gradeFinale() {
    const badge = this.q('#grade-badge')
    const scene = this.q('.scene.battle')
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
    await sleep(420)
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
    const modelShell = you.querySelector<HTMLElement>('.model-shell') ?? you
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

  // 적 턴 연출 — 최전방 적이 돌진해 플레이어에게 사각 블라스트.
  private async enemyPhase(phase: 'first' | 'second') {
    for (const st of enemyTurn(this.state, Math.random, phase)) {
      const foe = this.q<HTMLElement>(`#actors .actor.foe[data-i="${st.idx}"]`)
      // 방어가 피해를 전부 흡수하거나 카운터가 발동해도 적은 실제 공격 행동을
      // 수행했다. 결과 수치와 무관하게 먼저 attack 클립과 돌진을 보여 준다.
      playCharacterAnimation(foe ?? null, 'attack')
      foe?.classList.add('lunge')
      await sleep(170)
      // 적의 타격이 닿는 순간 실제 흡수 뒤 남은 방어막을 체력바에 반영한다.
      this.updatePlayer(this.q<HTMLElement>('.actor.you'))
      if (st.dealt <= 0) {
        this.log(st.text)
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
        await sleep(240)
        foe?.classList.remove('lunge')
        continue
      }
      const you = this.q<HTMLElement>('.actor.you')
      SquareBurst.playOn(you, 'damage', { spread: 100 })
      this.hitOne(you)
      this.popPlayer(`${st.dealt}`, 'dmg big')
      this.log(st.text)
      await sleep(240)
      foe?.classList.remove('lunge')
    }
    this.renderActors()
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

  /** 첫 타격 프레임에서 주인공의 공격 클립과 돌진만 붙들며, 관통 연쇄에는 적용하지 않는다. */
  private async attackHitStop(actor: HTMLElement, durationMs: number) {
    const animations = actor.getAnimations()
      .filter((animation) => animation.playState === 'running')

    freezeCharacterAnimation(actor, true)
    animations.forEach((animation) => animation.pause())
    await sleep(durationMs)
    freezeCharacterAnimation(actor, false)
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
