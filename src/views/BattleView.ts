/**
 * 전투 뷰 v4 — 배경 일러스트 위 쉐이더틱 UI.
 *  · 상단: 완성 중인 문장(체인) 그림자 강조
 *  · 중앙 하단: 단어를 가로 배치하고 클릭으로 발동. 전부 채우면 자동 완성(반짝 후 발동)
 *  · 되돌리기: 하단 중앙 회색 연한 글자, 한 단계씩 되돌림
 *  · 좌측: 스탯표 + 단어장(전체 덱 오버레이) 버튼
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
  wordFlat,
  PREEMPT_TAG,
  STAT_NAME,
  type ResolvedMult,
} from '@core/compiler'
import { conflictReason, pruneConflicts } from '@core/validator'
import type { CompileMods, Intent, Selection, Tables, Word, FieldDef } from '@core/types'
import { TABLES } from '@data/tables'
import { ENEMIES } from '@data/enemies'
import {
  allDead,
  aliveIdx,
  applyIntent,
  applyPreparation,
  enemyTurn,
  frontIdx,
  makeEnemy,
  type BattleState,
  type EnemyInst,
} from '@/sim/reference'
import { BACKGROUNDS, SKILL_ART } from '@/assets'
import { weatherIcon } from './sprites'
import { icon, itemArt } from '@/ui/Icons'
import { SquareBurst } from '@/ui/SquareBurst'
import { GRADE_MAX, bumpGrade, decayGrade, gradeTier, overkillGain, startGrade } from '@core/grade'
import { defaultPlayer, STAT_META, type PlayerState, type OwnedItem } from '@core/player'
import { hasPassive, modsFor, passivesOf, PASSIVES } from '@core/passives'
import { STAT_LABEL, type StatKey } from '@data/items'
import { CHARACTER_VISUALS, type CharacterVisualDef } from '@data/characters'
import { CardHand } from '@/ui/CardHand'
import { GameAudio } from '@/audio/GameAudio'
import { IntroDialogue } from '@views/IntroDialogue'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface Opts {
  field: FieldDef
  encounter: string[]
  /** 전투가 끝난 시점의 보상등급을 들고 나간다 — 보상 희귀도 확률에 쓰인다. */
  onWin: (grade: number) => void
  player?: PlayerState
  tables?: Tables
  hpMult?: number
  atkMult?: number
  /** 오프닝 다이얼로그(토큰 컷신)를 이 전투 위에서 먼저 재생한다. */
  intro?: boolean
}

type Mood = 'attack' | 'guard' | 'heal' | 'gamble' | 'sacrifice' | 'buff'
const STAT_ORDER: StatKey[] = ['hp', 'atk', 'guard', 'heal', 'luck']
const RARITY_LABEL: Record<string, string> = { common: '흔함', rare: '희귀', epic: '영웅', legendary: '전설' }

// 적 레일 — rank 0이 최전방. 우측 정보창(오른쪽에서 406px)에 뒷줄이 깔리지 않도록
// 라인 전체를 플레이어 쪽으로 당겨 두었다.
const RAIL_FRONT_RIGHT = 860
const RAIL_GAP = 215
// 맨 뒤가 여기보다 오른쪽으로 가면 정보창에 가린다. 마릿수가 늘면 간격을 좁혀 이 안에 접는다.
const RAIL_BACK_RIGHT = 430
// 체력 표기는 여기까지 — 0은 또렷, 1은 은은, 그 뒤는 감춤.
const HP_VISIBLE_RANK = 1
// 이름표 폭(210)이 겹치지 않을 최소 간격. 이보다 좁으면 최전방 것만 남긴다.
const PLATE_MIN_GAP = 170

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
  // 보상등급 — 운으로 시작·바닥, 턴 경과로 감소, 한 턴 멀티킬로 상승.
  private grade = 0
  private player: PlayerState
  private state: BattleState
  private sel: Selection = {}
  private slotIndex = 0
  private target = 0
  private busy = false
  private over = false
  private bagMode = false
  private timers: number[] = []
  private cardHand!: CardHand
  private introDialogue: IntroDialogue | null = null
  private castLog: { turn: number; kind: 'cast' | 'enemy' | 'system'; text: string; tally?: Tally }[] = []
  private dockMode: 'log' | 'word' | 'item' | 'character' = 'log'
  // 정보창 유지용 — 클릭 중 호버가 잠깐 풀려도 패널이 꺼지지 않게 붙잡는다.
  // 배율 릴 세대 — 새 선택이 들어오면 이전 릴은 조용히 물러난다.
  private multReelToken = 0
  private parkedTally: HTMLElement | null = null
  private dockRestore: (() => void) | null = null
  private dockTimer = 0
  private pointerDown = false
  /** 아기돼지 바베큐 — 이번 전투에서 지금까지 잡은 적 수(배율에 들어간다). */
  private killsThisBattle = 0

  constructor(private root: HTMLElement, opts: Opts) {
    this.field = opts.field
    this.onWin = opts.onWin
    this.t = opts.tables ?? TABLES
    this.player = opts.player ?? defaultPlayer()
    const atkMult = opts.atkMult ?? this.field.enemyAtkMult ?? 1
    const enemies = opts.encounter.map((id) => makeEnemy(ENEMIES[id], atkMult, opts.hpMult ?? 1))
    // 체력 스탯 = 최대 체력.
    const maxHp = this.player.stats.hp
    this.state = { playerHp: maxHp, playerMax: maxHp, guard: 0, turn: 1, enemies, pending: null }
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
        scene.classList.add('is-enemies-arriving')
        requestAnimationFrame(() => scene.classList.remove('is-intro-hold'))
        this.timers.push(window.setTimeout(() => scene.classList.remove('is-enemies-arriving'), 4000))
      },
    })
  }

  private mount() {
    this.root.innerHTML = `
      <div class="scene battle" data-weather="${this.field.weather}" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="vignette"></div>
        <div class="weather-wash"></div>

        <div class="hud-top">
          <div class="hud-left">
            <div class="hud-weather"><span id="f-weather"></span></div>
            <div class="hud-date" id="f-date" aria-label="현재 날짜"></div>
          </div>
          <div class="hud-title glass"><div class="t" id="f-title"></div><div class="s" id="f-desc"></div></div>
          <div class="hud-status">
            <div class="top-badges">
              <div class="grade-badge glass" id="grade-badge" title="보상등급 — 오래 끌면 내려가고, 한 턴에 쓸어담으면 오른다"><span>보상</span><b id="grade"></b></div>
              <div class="turn-badge glass"><span>턴 <b id="turn">1</b></span><em id="phase">주어 선택</em></div>
            </div>
            <div class="effect-log" id="log"></div>
          </div>
        </div>

        <div class="stage-area" id="pbox">
          <div class="chain-rail" id="chain"></div>
          <div class="mult-now" id="mult-now" aria-live="polite"></div>
          <div class="combo-flash" id="combo"></div>
          <div class="flash" id="flash"></div>
          <div id="actors"></div>
          <button class="backpack" id="bag" title="가방">${icon('backpack')}<span>가방</span></button>
        </div>

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

        <div class="stat-dock glass">
          <div class="dock-title">프롬</div>
          <div class="stat-list" id="stats"></div>
          <button class="wordbook-btn" id="deck-btn">${icon('book')}<span>단어장</span></button>
        </div>

        <aside class="info-dock glass cast-dock" id="detail" aria-live="polite"></aside>

        <div id="overlay"></div>
      </div>`

    this.q('#f-date').textContent = this.field.date
    this.q('#f-title').textContent = this.field.title
    this.q('#f-desc').textContent = this.field.desc.replace(/<[^>]+>/g, '')
    this.q('#f-weather').innerHTML = weatherIcon(this.field.weather)
    this.renderGrade()

    this.q('#bag').addEventListener('click', () => this.toggleBag())
    this.q('#deck-btn').addEventListener('click', () => this.openDeck())

    this.cardHand = new CardHand({
      handRoot: this.q('#card-hand'),
      deckButton: this.q<HTMLButtonElement>('#draw-deck'),
      onConfirm: (word) => {
        if (!this.busy && !this.over) this.pick(word.id)
      },
      onPreview: (word) => {
        this.keepDock()
        this.renderDetail(word)
      },
      onPreviewEnd: () => this.fadeDock(() => this.renderDetail(null)),
    })
    document.addEventListener('pointerdown', this.onPointerDown, true)
    document.addEventListener('pointerup', this.onPointerUp, true)
    document.addEventListener('pointercancel', this.onPointerUp, true)
    this.renderActors()
    this.renderChain()
    this.renderWords()
    this.renderStats()
    this.renderBag()
    this.renderCastLog()
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T
  }
  private order() {
    return this.t.template.slots.map((s) => s.key)
  }
  private filledCount() {
    return this.order().filter((k) => this.sel[k]).length
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
    // 무리가 커지면 간격을 좁혀 레일을 화면 안에 접는다(뒤로 갈수록 작아지니 겹쳐도 깊이로 읽힌다).
    const gap = Math.min(RAIL_GAP, (RAIL_FRONT_RIGHT - RAIL_BACK_RIGHT) / Math.max(1, alive.length - 1))
    // 간격이 좁아진 만큼 뒷줄을 위로 물려 세운다 — 가로로만 접으면 한 덩어리로 뭉개진다.
    const lift = Math.min(38, (RAIL_GAP - gap) * 0.3)

    let you = host.querySelector<HTMLElement>('.actor.you')
    if (!you) {
      host.insertAdjacentHTML('beforeend', this.playerHtml())
      you = host.querySelector<HTMLElement>('.actor.you')!
      this.bindActor(you)
    }
    this.updatePlayer(you)

    s.enemies.forEach((e, i) => {
      let el = host.querySelector<HTMLElement>(`.actor.foe[data-i="${i}"]`)
      if (e.dead) {
        el?.remove()
        return
      }
      if (!el) {
        host.insertAdjacentHTML('beforeend', this.foeHtml(i, e))
        el = host.querySelector<HTMLElement>(`.actor.foe[data-i="${i}"]`)!
        this.bindActor(el)
      }
      this.updateFoe(el, e, alive.indexOf(i), gap, lift)
    })
  }

  private playerHtml(): string {
    return `
      <div class="actor you" data-character="player" role="button" tabindex="0" aria-label="프롬 상세 보기">
        <div class="nameplate glass">
          <div class="row"><span class="nm">프롬</span><span class="hpn"></span></div>
          <div class="hpbar you"><div class="fill"></div></div>
        </div>
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="fallback-2d"><img class="battle-sprite" src="${CHARACTER_VISUALS.player.portrait2d}" alt="프롬"></div>
        <span class="inspect-hint">마우스를 올려 상세 보기</span>
      </div>`
  }

  private updatePlayer(el: HTMLElement) {
    const s = this.state
    el.querySelector<HTMLElement>('.hpn')!.innerHTML =
      `${Math.max(0, s.playerHp)}/${s.playerMax} ${s.guard ? `<span class="shield-chip">◈${s.guard}</span>` : ''}`
    el.querySelector<HTMLElement>('.hpbar.you > .fill')!.style.width =
      `${Math.max(0, (s.playerHp / s.playerMax) * 100)}%`
  }

  private foeHtml(i: number, e: EnemyInst): string {
    const visual = CHARACTER_VISUALS[e.def.id as 'moth' | 'roach']
    return `
      <div class="actor foe" data-i="${i}" data-character="${visual.id}"
        role="button" tabindex="0" aria-label="${e.def.name} 상세 보기">
        <div class="nameplate glass">
          <div class="row">
            <span class="nm">${e.def.name}</span>
            <span class="hpn"></span>
          </div>
          <div class="hp-row">
            <div class="hpbar foe"><div class="fill"></div></div>
          </div>
        </div>
        <span class="first-mark" title="선공 — 내 문장 직후, 나보다 먼저 때린다">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 22 20H2z"/><path class="bang" d="M12 9v5M12 17.2v.1"/></svg><b>선공</b>
        </span>
        <div class="shadow"></div>
        <div class="model-shell" data-model-status="fallback-2d"><img class="battle-sprite" src="${visual.portrait2d}" alt="${e.def.name}"></div>
        <span class="guard-hint" aria-hidden="true">우선 방어하세요!</span>
        <span class="inspect-hint">마우스를 올려 상세 보기</span>
      </div>`
  }

  private updateFoe(el: HTMLElement, e: EnemyInst, rank: number, gap: number, lift: number) {
    const front = rank === 0
    el.style.right = `${(RAIL_FRONT_RIGHT - rank * gap).toFixed(0)}px`
    el.style.bottom = `${(26 + rank * lift).toFixed(0)}px`
    el.style.zIndex = String(40 - rank) // 앞줄이 뒷줄을 가린다
    el.style.opacity = Math.max(0.34, 1 - rank * 0.19).toFixed(2)
    el.style.setProperty('--model-scale', Math.max(0.44, 1 - rank * 0.13).toFixed(2))
    el.style.setProperty('--model-blur', `${Math.min(7, rank * 2.2).toFixed(1)}px`)
    el.classList.toggle('front', front)
    el.classList.toggle('target', front)
    el.classList.toggle('back', !front)

    // 체력은 2번째 적까지만 — 최전방은 또렷하게, 그 뒤는 은은하게, 더 뒤는 감춘다.
    // 다만 무리가 커져 간격이 좁아지면 이름표끼리 겹치므로 최전방만 남긴다.
    const plate = el.querySelector<HTMLElement>('.nameplate')!
    const faint = rank > 0 && rank <= HP_VISIBLE_RANK && gap >= PLATE_MIN_GAP
    plate.classList.toggle('faint', faint)
    plate.classList.toggle('gone', rank > 0 && !faint)
    plate.querySelector<HTMLElement>('.hpn')!.textContent = `${Math.max(0, e.hp)}/${e.maxHp}`
    plate.querySelector<HTMLElement>('.fill')!.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`
    // 선공 상태는 딱지 대신 캐릭터 자체의 붉은 발광 + "먼저 공격!" 경고로 보여준다(후공은 무표시).
    el.classList.toggle('strikes-first', !e.dead && e.initiativePhase === 'first')
    el.querySelector<HTMLElement>('.inspect-hint')!.classList.toggle('gone', !front)
  }

  private bindActor(actor: HTMLElement) {
    const show = () => {
      this.keepDock()
      const id = actor.dataset.character as CharacterVisualDef['id']
      this.renderCharacterDetail(id, actor.dataset.i == null ? null : Number(actor.dataset.i))
    }
    const leave = () => this.fadeDock(() => this.renderCastLog())
    actor.addEventListener('mouseenter', show)
    actor.addEventListener('mouseleave', leave)
    actor.addEventListener('focus', show)
    actor.addEventListener('blur', leave)
    actor.addEventListener('click', show)
    actor.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        show()
      }
    })
  }

  private setPhase(label: string) {
    const el = this.root.querySelector<HTMLElement>('#phase')
    if (el) el.textContent = label
  }

  // 캐릭터 호버 상세는 우측 캐스트 로그 패널 위에 그대로 겹쳐 표시한다.
  private renderCharacterDetail(id: CharacterVisualDef['id'], enemyIndex: number | null) {
    const visual = CHARACTER_VISUALS[id]
    const host = this.q('#detail')
    this.dockMode = 'character'
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
      stats = enemy
        ? [
            ['체력', `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`],
            ['공격', String(Math.round(enemy.def.atk * enemy.atkMult))],
            ['행동 주기', `${enemy.def.every}턴`],
            ['다음 순서', enemy.initiativePhase === 'first' ? '선공' : '후공'],
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

  private renderCastLog() {
    const host = this.q('#detail')
    this.dockMode = 'log'
    host.className = 'info-dock glass cast-dock'
    const rows = [...this.castLog]
      .reverse()
      .map((entry) => `<div class="cast-entry ${entry.kind}">
        <div class="cast-meta"><span>TURN ${entry.turn}</span><b>${entry.kind === 'cast' ? '문장' : entry.kind === 'enemy' ? '적 행동' : '기록'}</b></div>
        <div class="cast-text">${entry.text}</div>
        ${entry.tally ? this.tallyLogHtml(entry.tally) : ''}
      </div>`)
      .join('')
    host.innerHTML = `
      <div class="cast-head"><span class="cast-kicker">DIARY CAST</span><h2>문장 캐스트 로그</h2></div>
      <div class="cast-list">${rows || '<div class="cast-empty">아직 발동한 문장이 없다.<br>첫 문장을 완성해 이야기를 시작하자.</div>'}</div>`
  }

  // 로그 아래 한 줄 요약 — "깡 24 × 배율 3.20 = 77" + 무엇이 그 배율을 줬는지.
  private tallyLogHtml(t: Tally): string {
    const chips = [...t.flats.map((f) => ({ ...f, text: `${f.label} +${f.value}` })), ...t.mults.map((m) => ({ ...m, text: `${m.label} ×${m.value.toFixed(2)}` }))]
      .map((c) => `<span class="cs-chip ${c.cls}">${c.text}</span>`)
      .join('')
    return `<div class="cast-score ${t.kind}">
      <span class="cs-cell"><em>깡</em><b>${t.base}</b></span>
      <span class="cs-op">×</span>
      <span class="cs-cell"><em>배율</em><b>${t.mult.toFixed(2)}</b></span>
      <span class="cs-op">=</span>
      <span class="cs-cell total"><em>${t.kind === 'dmg' ? '피해' : '회복'}</em><b>${t.total}</b></span>
    </div>
    <div class="cast-chips">${chips}</div>`
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
      // 부조화(어긋난 맥락) — 위력이 깎인다는 걸 실행 전에 보여준다.
      if (intent.penalties.length) {
        extra += `<span class="chain-word ctx broken"><b class="cw-text">어긋남</b><em class="cw-note down">×${intent.coherence.toFixed(2)} · ${intent.penalties[0]}</em></span>`
      }
    }
    host.innerHTML = words + extra
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

  // 숫자 릴 — 무작위 값이 몇 번 튀다가 실제 값에 멈추고 팅! 하며 발광한다.
  private async spinMult(el: HTMLElement, target: number, host: HTMLElement) {
    const token = ++this.multReelToken
    host.classList.add('spinning')
    host.classList.remove('landed', 'hot')
    for (let i = 0; i < 5; i++) {
      if (token !== this.multReelToken) return
      const jitter = Math.max(0.2, target * (0.55 + Math.random() * 0.9))
      el.textContent = jitter.toFixed(2)
      await sleep(48)
    }
    if (token !== this.multReelToken) return
    el.textContent = target.toFixed(2)
    host.classList.remove('spinning')
    host.classList.add('landed')
    // 배율이 크게 붙었으면 더 뜨겁게 빛난다.
    host.classList.toggle('hot', target >= 2)
    GameAudio.play('wordSelect')
    this.timers.push(window.setTimeout(() => host.classList.remove('landed'), 620))
  }

  // 체인에 붙는 한 줄 설명 — 동사는 "공격 ×1 = 3", 주어/수식은 배율.
  private chainNote(w: Word): { text: string; cls: string } | null {
    const flat = wordFlat(w, this.player.stats)
    if (flat > 0) {
      const cls = w.kind === 'heal' ? 'heal' : w.kind === 'guard' ? 'guard' : 'dmg'
      // 스탯 비례 단어는 출처가 곧 이름이다 — "방어 ×1 = 2".
      if (w.stat && w.statMult != null) return { text: `${STAT_NAME[w.stat]} ×${w.statMult} = ${flat}`, cls }
      const lane = w.kind === 'guard' ? '방어' : w.kind === 'heal' ? '회복' : '깡'
      return { text: `${lane} ${flat}`, cls }
    }
    const risk = [
      w.effects?.recoil ? `자해 ${w.effects.recoil}` : '',
      w.targetMode === 'both' ? '피해 40% 되돌아옴' : '',
    ].filter(Boolean).join(' · ')
    // 도박 범위 — 낮은 배율에 "가끔 크게 터진다"를 붙인 카드.
    if (w.variance) {
      const v = w.variance
      const text = `도박 ${Math.round(v.p * 100)}% — ×${v.hi.toFixed(2)} / ×${v.lo.toFixed(2)}`
      return { text: risk ? `${text} · ${risk}` : text, cls: 'gamble' }
    }
    if (w.bonus || risk) {
      const odds = [
        w.crit ? `대성공 ${Math.round(w.crit * 100)}%` : '',
        w.fail ? `실패 ${Math.round(w.fail * 100)}%` : '',
      ].filter(Boolean).join(' · ')
      // 기준 스탯은 확률을 조용히 밀어 줄 뿐이라 화면에 이름을 드러내지 않는다.
      const parts = [`배율 ×${(1 + (w.bonus ?? 0)).toFixed(2)}`, odds, risk].filter(Boolean)
      return { text: parts.join(' · '), cls: risk ? 'down' : (w.bonus ?? 0) >= 0 ? 'buff' : 'down' }
    }
    // 대성공만 밀어 주는 단어('?')와 순수 규칙 단어('!')는 배율이 아니라 그 규칙을 적는다.
    if (w.crit) return { text: `대성공 +${Math.round(w.crit * 100)}%`, cls: 'buff' }
    if (w.tags.includes(PREEMPT_TAG)) return { text: w.note, cls: 'buff' }
    return { text: '배율 ×1.00', cls: 'flat' }
  }

  // ── 중앙 하단: 슬롯 스텝 + 가로 단어 ──
  private renderWords() {
    this.q('#steps').innerHTML = this.t.template.slots
      .map((s, i) => {
        const key = s.key
        const cls = i === this.slotIndex ? 'active' : this.sel[key] ? 'done' : ''
        return `<button class="step ${cls}" data-i="${i}"><b>${i + 1}</b> ${s.label}</button>`
      })
      .join('<span class="sep">·</span>')
    this.q('#steps')
      .querySelectorAll<HTMLElement>('.step')
      .forEach((st) =>
        st.addEventListener('click', () => {
          const i = Number(st.dataset.i)
          if (i <= this.filledCount()) this.setSlot(i)
        }),
      )

    const key = this.order()[this.slotIndex]
    const words = this.player.deck[key] ?? this.t.words[key] ?? []
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
      this.renderCastLog()
      return
    }
    this.dockMode = 'word'
    // 슬롯 키로 잡는다 — 겹동사(verb2)처럼 한 단어가 여러 칸에 들어갈 수 있어서
    // w.slot을 쓰면 지금 고르는 칸이 아니라 원래 칸을 가리킨다.
    const slotLabel = this.t.template.slots.find((s) => s.key === key)?.label ?? ''
    const mood = this.moodOf(w)
    const values = this.wordOwnValues(w)
    // 현재 문장에 이 단어를 끼우면 맥락이 어긋나는지 미리 경고(실행 전 학습).
    const trial: Selection = { ...this.sel, [key]: w }
    const intent = compile(trial, this.t, this.player.stats, this.mods())
    const warn = intent.penalties.length
      ? `<div class="wd-warn">⚠ ${intent.penalties[0]} · 위력 ×${intent.coherence.toFixed(2)}</div>`
      : ''

    // 일러스트가 있으면 패널 전체에 풀로 깔고, 글은 아래쪽 스크림 위에 얹는다.
    const art = w.art ? SKILL_ART[w.art] : undefined
    detail.className = `info-dock glass word-detail mood-${mood}`
    detail.innerHTML = `
      ${art ? `<div class="wd-art"><img src="${art}" alt="" /></div>` : ''}
      <div class="wd-scrim" aria-hidden="true"></div>
      <div class="wd-body">
        <div class="wd-name">${w.text}</div>
        <div class="wd-grade">✦ ${slotLabel} · ${RARITY_LABEL[w.rarity ?? 'common']}${(w.level ?? 1) > 1 ? ` · Lv.${w.level}` : ''}</div>
        ${this.projectionHtml(w, key)}
        <div class="wd-values">${values.map((v) => `<div class="v ${v.cls}">${v.text}</div>`).join('')}</div>
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

  // 단어 하나의 고유 수치 — 누적하지 않는다.
  private wordOwnValues(w: Word): { text: string; cls: string }[] {
    const out: { text: string; cls: string }[] = []
    if (w.power) out.push({ text: `기본 위력 +${w.power}`, cls: 'dmg' })
    if (w.kind === 'attack' && !w.power) out.push({ text: '적을 공격', cls: 'dmg' })
    if (w.bonus) out.push({ text: `위력 배수 ${w.bonus >= 0 ? '+' : ''}${Math.round(w.bonus * 100)}%`, cls: 'buff' })
    if (w.effects?.guard) out.push({ text: `방어(임시 체력) ${w.effects.guard >= 0 ? '+' : ''}${w.effects.guard}`, cls: 'guard' })
    if (w.effects?.heal) out.push({ text: `회복 +${w.effects.heal}`, cls: 'heal' })
    if (w.effects?.recoil) out.push({ text: `자해 ${w.effects.recoil}`, cls: 'self' })
    if (w.effects?.evade) out.push({ text: `회피 +${w.effects.evade}`, cls: 'guard' })
    if (w.variance) out.push({ text: `도박 ${Math.round(w.variance.p * 100)}%: ×${w.variance.hi} / ×${w.variance.lo}`, cls: 'buff' })
    if (w.timing === 'delayed') out.push({ text: '다음 턴에 발동', cls: '' })
    if (w.aoe === 'all') out.push({ text: '적 전체 적중', cls: 'dmg' })
    if (w.targetMode === 'both') out.push({ text: '피해 40% 나에게 되돌아옴', cls: 'self' })
    if (!out.length) out.push({ text: w.note, cls: '' })
    return out
  }

  // ── 우측 스탯표 ──
  private renderStats() {
    // 스탯 아래에 지금 걸려 있는 규칙(전설 아이템 패시브)을 늘 보이게 둔다.
    const passives = passivesOf(this.player)
      .map((p) => `<div class="stat-passive" title="${p.desc}">✦ ${p.name}</div>`)
      .join('')
    this.q('#stats').innerHTML =
      STAT_META.map(
        (m) => `<div class="stat" title="${m.desc}">
        <span class="si">${icon(m.icon)}</span>
        <span class="sl">${m.label}</span>
        <span class="sv">${this.player.stats[m.key]}</span>
      </div>`,
      ).join('') + passives
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
      this.renderCastLog()
      return
    }
    this.dockMode = 'item'
    const rows = STAT_ORDER.filter((k) => item.stats[k])
      .map((k) => `<div class="idrow"><span>${STAT_LABEL[k]}</span><span class="iv">+${item.stats[k]}</span></div>`)
      .join('')
    // 전설 아이템은 스탯이 아니라 규칙을 준다 — 그 규칙을 그대로 적어 준다.
    const p = item.passive ? PASSIVES[item.passive] : null
    const passive = p ? `<div class="id-passive"><b>${p.name}</b><span>${p.desc}</span></div>` : ''
    detail.className = `info-dock glass item-detail${p ? ' is-passive' : ''}`
    detail.innerHTML = `
      <div class="wd-name">${item.name}</div>
      <div class="wd-grade">✦ ${item.grade} · 「${item.line}」</div>
      ${passive}
      <div class="id-stats">${rows}</div>
      <div class="id-art">${itemArt(item.art)}</div>`
  }

  // ── 단어장(전체 덱) 오버레이 ──
  private openDeck() {
    const host = this.q('#overlay')
    const slots = this.t.template.slots
    host.innerHTML = `
      <div class="ov-backdrop"></div>
      <div class="ov-panel glass deck-panel">
        <div class="ov-head"><div class="ov-title">${icon('book')} 단어장</div><button class="ov-close" id="ov-x">${icon('close')}</button></div>
        <div class="deck-cols">
          ${slots
            .map(
              (s, i) => `<div class="deck-col">
              <div class="deck-col-h"><b>${i + 1}</b> ${s.label}</div>
              ${(this.player.deck[s.key] ?? [])
                .map(
                  (w) => `<div class="deck-word mood-${this.moodOf(w)}">
                    <span class="dw">${w.text}</span><span class="dn">${w.note}</span>
                  </div>`,
                )
                .join('')}
            </div>`,
            )
            .join('')}
        </div>
      </div>`
    host.classList.add('open')
    const close = () => this.closeOverlay()
    host.querySelector('#ov-x')!.addEventListener('click', close)
    host.querySelector('.ov-backdrop')!.addEventListener('click', close)
  }
  private closeOverlay() {
    const host = this.q('#overlay')
    host.classList.remove('open')
    host.innerHTML = ''
  }

  private setSlot(i: number) {
    this.slotIndex = Math.max(0, Math.min(i, this.order().length - 1))
    this.renderWords()
  }

  private pick(id: string) {
    const key = this.order()[this.slotIndex]
    const w = this.t.words[key].find((x) => x.id === id)!
    GameAudio.play('wordSelect')
    this.sel = { ...this.sel, [key]: w }
    this.sel = pruneConflicts(this.sel, this.slotIndex, this.t)
    const order = this.order()
    let next = this.slotIndex + 1
    while (next < order.length && this.sel[order[next]]) next++
    this.slotIndex = Math.min(next, order.length - 1)
    this.setPhase(this.complete() ? '단어 완성' : `${this.t.template.slots[this.slotIndex].label} 선택`)
    this.renderChain()
    this.renderWords()
    // 전부 채우면 자동 완성(반짝 → 발동)
    if (this.complete() && !this.busy && !this.over) {
      GameAudio.play('sentenceComplete')
      void this.autoComplete()
    }
  }

  private complete(): boolean {
    return this.order().every((k) => !!this.sel[k])
  }

  private async autoComplete() {
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
    const cls = (p: { source: string; value: number }) =>
      p.source === 'combo' ? 'combo' : p.source === 'coherence' ? 'down' : p.source === 'stat' ? 'stat' : p.value < 1 ? 'down' : 'buff'
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
      <div class="tally-feed"></div>
      <div class="tally-total"></div>`
    this.q('#pbox').appendChild(el)
    requestAnimationFrame(() => el.classList.add('in'))
    const baseBox = el.querySelector<HTMLElement>('.tally-box.base')!
    const multBox = el.querySelector<HTMLElement>('.tally-box.mult')!
    const feed = el.querySelector<HTMLElement>('.tally-feed')!
    await sleep(200)

    let base = 0
    for (const f of tally.flats) {
      base += f.value
      baseBox.querySelector('b')!.textContent = String(base)
      this.tallyChip(feed, `${f.label} +${f.value}`, f.cls)
      this.bump(baseBox)
      await sleep(165)
    }
    let mult = 1
    for (const [i, m] of tally.mults.entries()) {
      mult *= m.value
      multBox.querySelector('b')!.textContent = mult.toFixed(2)
      this.tallyChip(feed, `${m.label} ×${m.value.toFixed(2)}`, m.cls)
      // 배율이 겹칠수록 판이 뜨거워진다.
      el.style.setProperty('--heat', Math.min(1, (i + 1) / 4).toFixed(2))
      this.bump(multBox)
      await sleep(185)
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
      if (i % 2 === 0) GameAudio.play('wordSelect')
    }
    total.textContent = String(tally.total)
    this.applyHeatTier(el, tally.total)
    total.classList.remove('tick')
    total.classList.add('slam')
    GameAudio.play('sentenceComplete') // 팅!!!!
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
    if (!this.complete() || this.busy || this.over) return
    this.busy = true
    // 정산이 도는 동안 손패는 "이미 쓴" 상태로 흐려지고 입력을 받지 않는다(연타 방지).
    this.q('.word-zone').classList.add('is-resolving')

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

    // 맥락(관용구) 발동 배너
    if (intent.combos.length) {
      const combos = matchCombos(this.sel, this.t.combos, order)
      const comboMult = combos.reduce((m, c) => m * c.mult, 1)
      const el = this.q('#combo')
      el.innerHTML = `<div class="kicker">맥락 발동</div><div class="name">${intent.combos.join(' · ')}</div><div class="mult">위력 ×${comboMult.toFixed(1)}</div>`
      el.classList.remove('show')
      void el.offsetWidth
      el.classList.add('show')
      await sleep(760)
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
      await this.rollTotal(prep.guardGain, 'guard')
      await this.flyToPlayer(`방어+${prep.guardGain}`, 'guard', 'guard')
      this.log(`${intent.sentence} → 방어 ${prep.guardGain} 준비`)
    }
    this.renderActors()

    // 6) 선공 상대 행동 — 이번 문장의 준비 효과를 받은 뒤 공격한다.
    //    문장부호 '!'가 붙었으면 이 페이즈를 건너뛴다. 선공 적은 이번 턴에 못 때리고,
    //    쿨다운도 소모하지 않으므로 다음 턴에 그대로 돌아온다(미루기지 없애기가 아니다).
    if (intent.preempt) {
      this.setPhase('선수 · 먼저 움직였다')
      this.log('느낌표 — 상대보다 먼저 움직였다.')
      await sleep(260)
    } else {
      this.setPhase('선공 상대 행동')
      await this.enemyPhase('first')
      if (this.state.playerHp <= 0) {
        this.releaseTally()
        this.over = true
        this.setPhase('패배')
        this.log('일기장이 너무 상했다… (패배)')
        return
      }
    }

    // 7) 본인 캐릭터 행동 — 아까 띄워 둔 총합이 그대로 적에게 꽂힌다.
    this.setPhase('본인 캐릭터 행동')

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
    if (res.overflow > 0 && !allDead(this.state)) kills += await this.resolveOverflow(res.overflow, sweep)

    // 누댕의 메아리 — 대성공한 문장은 한 번 더 발동한다. 준비 효과와 적 페이즈는
    // 다시 돌지 않는다(문장만 메아리친다). 이미 전멸했으면 울릴 곳이 없다.
    if (resolved.outcome === 'crit' && hasPassive(this.player, 'echo') && !allDead(this.state)) {
      kills += await this.echoStrike(intent, mult, sweep)
    }

    // 아기돼지 바베큐 — 잡은 수가 다음 문장의 배율이 된다.
    this.killsThisBattle += kills

    // 한 턴에 두 마리 이상 쓸어담으면 보상등급이 띵·띵·띵 오른다. 전멸 마무리면 +1.
    const gradeGain = overkillGain(kills, allDead(this.state))
    if (gradeGain > 0) await this.dingGrade(gradeGain)

    if (allDead(this.state)) {
      this.over = true
      this.setPhase('전투 승리')
      this.log('마지막 벌레가 책장 밖으로 떨어졌다.')
      await sleep(500)
      await this.gradeFinale()
      this.onWin(this.grade)
      return
    }

    // 8) 후공 상대 행동 — 플레이어 본행동이 끝난 뒤 행동한다.
    this.setPhase('후공 상대 행동')
    await this.enemyPhase('second')

    if (this.state.pending) {
      const p = this.state.pending
      const targets = p.aoe ? aliveIdx(this.state) : [p.target]
      const killed: number[] = []
      for (const ti of targets) {
        const e = this.state.enemies[ti]
        if (!e || e.dead) continue
        e.hp -= p.dmg
        const el = this.q(`#actors .actor.foe[data-i="${ti}"]`)
        if (el) SquareBurst.playOn(el, 'damage', { spread: 100 })
        this.popAt(ti, `${p.dmg}`, 'dmg big')
        if (e.hp <= 0) {
          e.dead = true
          killed.push(ti)
        }
      }
      this.log(`예약된 문장 발동 → ${p.dmg} 피해`)
      this.state.pending = null
      await sleep(300)
      for (const k of killed) await this.playDeath(k, 1)
      this.renderActors()
      // 예약 문장의 몰살도 오버킬로 인정한다.
      const pendingGain = overkillGain(killed.length, allDead(this.state))
      if (pendingGain > 0) await this.dingGrade(pendingGain)
    }

    if (this.state.playerHp <= 0) {
      this.over = true
      this.setPhase('패배')
      this.log('일기장이 너무 상했다… (패배)')
    } else if (allDead(this.state)) {
      this.over = true
      this.setPhase('전투 승리')
      await sleep(300)
      await this.gradeFinale()
      this.onWin(this.grade)
      return
    }

    this.sel = {}
    this.slotIndex = 0
    this.state.turn++
    this.q('#turn').textContent = String(this.state.turn)
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

  /**
   * 무럭무럭 — 최대 체력이 영구히 자란다. 배율을 받지 않는 고정 수치다.
   * 런 전체에 남아야 하므로 플레이어 스탯(hp)까지 함께 올린다.
   * 겹칠수록 이름이 길어진다: 무럭무럭 → 무럭무럭무럭무럭.
   */
  private async growUp(n: number): Promise<void> {
    this.player.stats.hp += n
    this.state.playerMax += n
    this.state.playerHp += n
    const label = '무럭'.repeat(Math.min(n * 2, 8)) + (n * 2 > 8 ? '…' : '')
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
    GameAudio.play('sentenceComplete')
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
      hits: { target: number; dmg: number }[]
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
      const el = this.q<HTMLElement>(`#actors .actor.foe[data-i="${h.target}"]`)
      if (el) {
        SquareBurst.playOn(el, 'damage', { spread: 120 })
        this.hitOne(el)
      }
      this.popAt(h.target, `${h.dmg}`, 'dmg big')
    }
    if (attacking) {
      await sleep(250)
      you.classList.remove('lunge')
    }
    // 회복/자해 수치도 플레이어에게 각각 날아가 꽂힌다. 방어는 준비 단계에서 처리한다.
    if (res.selfDmg) await this.flyToPlayer(`${res.selfDmg}`, 'self', 'self')
    if (res.heal) await this.flyToPlayer(`+${res.heal}`, 'heal', 'heal')
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
    el.classList.add('dying')
    if (fast) el.classList.add('fast')
    this.spawnSparks(el, 8 + combo * 5)
    await sleep(fast ? 190 : 560)
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
      GameAudio.play('wordSelect')
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
    GameAudio.play('sentenceComplete')
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
    const to = this.toStage(you.getBoundingClientRect())
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
        { transform: `translate(${to.x - fx}px, ${to.y + 40 - fy}px) scale(1)`, opacity: 1, offset: 0.85 },
        { transform: `translate(${to.x - fx}px, ${to.y + 40 - fy}px) scale(0.7)`, opacity: 0 },
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
      if (st.dealt <= 0) {
        this.log(st.text)
        continue
      }
      foe?.classList.add('lunge')
      await sleep(170)
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
  private log(html: string, tally?: Tally) {
    const host = this.q('#log')
    const line = document.createElement('div')
    line.className = 'log-line'
    line.innerHTML = html
    host.appendChild(line)
    this.timers.push(window.setTimeout(() => line.remove(), 3100))
    while (host.children.length > 3) host.removeChild(host.firstChild!)

    const kind = html.includes('습격') ? 'enemy' : html.includes('→') ? 'cast' : 'system'
    this.castLog.push({ turn: this.state.turn, kind, text: html, tally })
    if (this.castLog.length > 8) this.castLog.shift()
    if (this.dockMode === 'log') this.renderCastLog()
  }
}
