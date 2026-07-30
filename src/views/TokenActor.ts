/**
 * TokenActor — 프롬 곁을 맴도는 요정 토큰의 자유 비행 배우.
 *
 * 예전의 토큰은 몸이 둘로 갈라져 있었다. 일반전에서는 프롬 모델 뷰포트 안에 얹힌
 * 서브 오브젝트라 프롬의 상자를 영영 벗어나지 못했고, 보스전에서만 독립 DOM으로 서서
 * 당황 선과 말풍선을 가졌다. 감정 연출이 한쪽에만 쌓이는 이유가 그 갈라짐이었다.
 * 여기서 둘을 하나로 합치고, 그 하나에 자유를 준다.
 *
 * 비행은 3D가 아니라 DOM이 맡는다. 공용 렌더러는 2048² 버퍼 한 장에 그린 뒤 배우마다
 * 2D 캔버스로 옮겨 붙이는 구조여서, 무대만 한 뷰포트를 하나 더 두면 매 프레임 옮겨
 * 붙이는 양이 지금 배우 전체를 합친 것보다 커진다. 그래서 모델은 작은 상자 안에서 fly
 * 클립만 돌리고, 무대를 가로지르는 건 상자 자체다. 말풍선과 감정 이펙트를 그 상자의
 * 자식으로 두었으므로 토큰이 어디로 가든 따라붙는다 — 좌표를 맞출 일이 없다.
 */

import { CHARACTER_VISUALS } from '@data/characters'
import type { TokenLine } from '@/localization/bossToken'
import { sharedTokenMind, TokenMind, type BondEvent, type MoodEvent } from '@core/tokenMind'
import { TokenPolicy, type PolicyAction, type TokenContext } from '@core/tokenPolicy'
import {
  destroyCharacterModels,
  mountCharacterModel,
  setCharacterModelYaw,
} from '@views/BattleCharacterModel'

/**
 * 자유 비행의 결. 셋은 토큰이 스스로 고르고(orbit·wander·inspect·peer), 둘은 바깥에서
 * 부른다(attend·alert) — 팁을 줄 때와 경고할 때는 요정의 변덕보다 용건이 앞선다.
 */
export type TokenBehavior = 'orbit' | 'wander' | 'inspect' | 'peer' | 'attend' | 'alert'

/**
 * 상자 한 변. **가장 가까이 왔을 때**(scale 1)를 기준으로 잡고 멀 때는 축소만 한다.
 * 반대로 잡으면 다가올 때마다 캔버스를 확대하게 되어 토큰만 뭉개진다.
 */
const BOX = 320
/**
 * 비행 가능 범위(무대 1920×1080 좌표, 상자 중심 기준).
 * 아래쪽 838은 손패 위가 아니라 **손패에 살짝 잠기는** 깊이다. 토큰은 UI 뒤로 지나가므로
 * 여기까지 내려오면 하반신이 카드에 가려졌다가 도로 떠오른다 — 가림이 곧 연출이다.
 */
const BOUNDS = { minX: 130, maxX: 1790, minY: 96, maxY: 838 }

/** 결마다 다른 비행 성질. 속도·가속·감속 반경이 곧 그 결의 인상이다. */
const FLIGHT: Record<TokenBehavior, { speed: number; accel: number; slow: number; scale: number }> = {
  // 맴돌기는 느리고 둥글다. 기본값이라 여기가 시끄러우면 화면 전체가 시끄러워진다.
  // 가속만은 넉넉히 준다 — 가로지르기에서 돌아올 때 제동이 약하면 800px씩 흘러가 버린다.
  orbit: { speed: 300, accel: 2000, slow: 130, scale: 0.6 },
  // 가로지르기만 유일하게 빠르다. "슈우웅"은 속도가 아니라 **다른 결과의 대비**에서 나온다.
  wander: { speed: 980, accel: 3000, slow: 240, scale: 0.52 },
  inspect: { speed: 420, accel: 1700, slow: 96, scale: 0.72 },
  peer: { speed: 620, accel: 2000, slow: 110, scale: 1 },
  attend: { speed: 760, accel: 2400, slow: 100, scale: 0.94 },
  alert: { speed: 360, accel: 2200, slow: 60, scale: 0.8 },
}

/** 자율 결의 지속 시간(ms) 범위. attend·alert는 바깥이 놓아줄 때까지라 여기 없다. */
const DURATION: Record<'orbit' | 'wander' | 'inspect' | 'peer', [number, number]> = {
  orbit: [4200, 7600],
  wander: [2600, 4200],
  inspect: [2200, 3800],
  peer: [2000, 3200],
}

/**
 * 들여다볼 만한 게임 안 사물. 있는 것만 골라 쓴다 — 일반전엔 보스 HUD가 없고
 * 보스전엔 대기 적 레일이 없다.
 */
const INSPECT_TARGETS = [
  '.actor.foe.front',
  '.actor.foe',
  '#card-hand',
  '.draw-deck',
  '.relic-strip',
  '.hud-left-status',
  '.boss-health-hud',
]

/** 이 안에 골랐으면 망설이지 않은 것으로 친다. */
const QUICK_DECISION_MS = 2500
/** 망설임 관측이 1에 닿는 시간. 이보다 오래 보고 있으면 확실히 고민 중이다. */
const HESITATION_FULL_MS = 6000
/** 손패 위 이 높이보다 아래에 있으면 카드를 덮은 것으로 본다(무대 y). */
const HAND_TOP_Y = 760

/** 정책이 고르는 결. attend·alert는 바깥이 부르므로 학습 대상이 아니다. */
const POLICY_BEHAVIOURS: readonly TokenBehavior[] = ['orbit', 'wander', 'inspect', 'peer']

const TAU = Math.PI * 2
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

interface Vec {
  x: number
  y: number
}

export class TokenActor {
  private readonly el: HTMLElement
  private readonly body: HTMLElement
  private readonly bubble: HTMLElement

  private behavior: TokenBehavior = 'orbit'
  private behaviorUntil = 0
  private readonly pos: Vec = { x: 420, y: 380 }
  private readonly vel: Vec = { x: 0, y: 0 }
  private readonly target: Vec = { x: 420, y: 380 }

  private orbitAngle = rand(0, TAU)
  /** inspect·peer가 바라보는 지점. aim()이 매 프레임 읽으므로 enter()에서 한 번만 정한다. */
  private focus: Vec = { x: 960, y: 420 }
  private waypoints: Vec[] = []
  private elapsed = 0
  private roll = 0
  private scale = FLIGHT.orbit.scale
  private yaw = 0

  /** 지금 이 구간에 벌어진 일. 결이 끝날 때 정책이 이걸 보고 배운다. */
  private episode = { tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: false }
  /** 무대에서 벌어지는 일을 뷰가 여기에 부어 준다. 정책의 관측이 된다. */
  private situation = { hpRatio: 1, enemyCount: 1, turnProgress: 0, hesitation: 0 }
  /** 사람이 손패 앞에 선 시각. 0이면 지금 고르는 중이 아니다. */
  private selectionStartedAt = 0

  private playerEl: HTMLElement | null = null
  private frame = 0
  private lastFrameAt = 0
  private speechHideTimer = 0
  private holdingSpeech = false
  private disposed = false
  private readonly reducedMotion: boolean

  /**
   * @param host 무대 좌표를 그대로 쓰는 컨테이너(.stage-area). 이 요소가 z-index 3이라
   *   토큰은 배우보다 앞, HUD·손패보다 뒤에 자동으로 놓인다 — UI 뒤로 지나가는 규칙이
   *   여기 한 줄에 담긴다.
   */
  /**
   * @param mind 기분·유대·성향. 토큰이 어떻게 날지의 절반은 여기서 나온다.
   * @param policy 자율 결을 고르는 정책. 사전 성향 위에 이 사람의 플레이에서 배운 만큼을 얹는다.
   */
  constructor(
    private readonly host: HTMLElement,
    private readonly mind: TokenMind = sharedTokenMind(),
    private readonly policy: TokenPolicy = new TokenPolicy(),
  ) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const visual = CHARACTER_VISUALS.token
    const modelStatus = visual.model3d ? 'preparing-3d' : 'fallback-2d'
    host.insertAdjacentHTML(
      'beforeend',
      `<div class="token-actor" data-behavior="orbit">
        <div class="token-body" aria-hidden="true">
          <div class="token-panic-lines"><i></i><i></i><i></i></div>
          <div class="model-shell" data-model-status="${modelStatus}">
            <img class="battle-sprite" src="${visual.portrait2d}" alt="">
          </div>
        </div>
        <div class="token-speech" role="status" aria-live="polite"></div>
      </div>`,
    )
    this.el = host.querySelector<HTMLElement>(':scope > .token-actor')!
    this.body = this.el.querySelector<HTMLElement>('.token-body')!
    this.bubble = this.el.querySelector<HTMLElement>('.token-speech')!
    // 지금은 만질 수 없다(CSS에서 pointer-events: none). 나중에 토큰을 붙잡아 흔드는
    // 장난을 넣는다면 여기서 .token-body에만 포인터를 열고, 잡힌 동안 비행 컨트롤러를
    // 멈춘 뒤 놓는 순간의 커서 속도를 this.vel에 실어 주면 그대로 튕겨 날아간다.
    mountCharacterModel(this.body, visual)
    this.applyMood()
    this.enter('orbit')
    this.pos.x = this.target.x
    this.pos.y = this.target.y
    this.paint()
    this.start()
  }

  /**
   * 기분을 DOM에 적어 CSS가 발광으로 받게 한다. 수치를 그대로 흘리지 않고 세 단계로
   * 뭉개는 이유는, 미세한 변화가 화면에서 깜빡임으로만 읽히기 때문이다.
   */
  private applyMood() {
    const mood = this.mind.mood
    this.el.dataset.mood = mood > 0.35 ? 'high' : mood < -0.35 ? 'low' : 'even'
  }

  /** 맴돌 대상. 프롬이 다시 그려지면 새 요소로 갈아 끼운다. */
  attachTo(playerEl: HTMLElement | null) {
    this.playerEl = playerEl
  }

  /** 무대의 형편. 정책의 관측이 되므로 뷰가 상태를 다시 그릴 때마다 부어 준다. */
  observeBattle(next: { hpRatio: number; enemyCount: number; turnProgress: number }) {
    this.situation.hpRatio = clamp(next.hpRatio, 0, 1)
    this.situation.enemyCount = Math.max(0, next.enemyCount)
    this.situation.turnProgress = clamp(next.turnProgress, 0, 1)
  }

  /**
   * 사건 하나가 기분을 흔든다. 맞은 순간에는 그때의 거리도 함께 적어 둔다 —
   * "곁에 없었다"는 정책이 배우는 가장 비싼 신호다.
   */
  feel(event: MoodEvent) {
    this.mind.feel(event)
    if (event === 'playerHurt' || event === 'playerNearDeath') {
      this.episode.tookDamage = true
      const anchor = this.playerAnchor()
      this.episode.distanceWhenHurt = Math.hypot(anchor.x - this.pos.x, anchor.y - this.pos.y)
    }
    this.applyMood()
  }

  /** 유대는 사건이 아니라 함께한 시간이다. 뷰가 그 순간을 알려 준다. */
  bindCloser(event: BondEvent) {
    this.mind.bindCloser(event)
  }

  /** 턴이 넘어갔다. 기분이 평정으로 조금 돌아온다. */
  passTurn() {
    this.mind.passTurn()
    this.applyMood()
  }

  /** 사람이 손패 앞에 섰다. 여기서부터 망설임을 잰다. */
  noteSelectionStart() {
    this.selectionStartedAt = performance.now()
  }

  /**
   * 사람이 골랐다. 빨리 골랐다면 그 구간의 거리감이 편했다는 뜻이라 정책에 좋은 신호로 간다.
   * @returns 이 한 칸을 고르는 데 걸린 시간(ms). 재지 못했으면 0.
   */
  noteSelectionMade(): number {
    if (!this.selectionStartedAt) return 0
    const elapsed = performance.now() - this.selectionStartedAt
    this.episode.decidedQuickly = elapsed < QUICK_DECISION_MS
    this.selectionStartedAt = 0
    this.situation.hesitation = 0
    return elapsed
  }

  /** 런이 끝났다. 기억에 남기고 성향이 아주 조금 움직인다. */
  endRun(memory: { day: number; outcome: 'clear' | 'defeat'; cause?: string }) {
    this.mind.endRun(memory)
  }

  /** 지난 런 하나를 떠올린다. 회상 대사의 사실 출처다. */
  recall() {
    return this.mind.recall()
  }

  get mindState() {
    return this.mind
  }

  /**
   * 한마디 시킨다. `hold`는 스스로 꺼지지 않는 경고다 — 큰낫이 올라간 걸 알려 놓고
   * 카드를 고르는 사이에 말풍선이 사라지면 경고를 본 의미가 없다.
   */
  say(line: TokenLine, hold = line.tone === 'warn') {
    if (this.disposed) return
    window.clearTimeout(this.speechHideTimer)
    const mark = line.tone === 'warn' ? '!' : line.tone === 'relief' ? '✓' : ''
    this.bubble.innerHTML =
      `${mark ? `<b class="token-speech-mark" aria-hidden="true">${mark}</b>` : ''}` +
      `<span class="token-speech-text">${line.text}</span>`
    this.bubble.dataset.tone = line.tone
    this.el.dataset.tone = line.tone
    this.bubble.classList.remove('is-speaking')
    // 연속 대사도 말풍선의 손글씨 팝업을 첫 프레임부터 다시 재생한다.
    void this.bubble.offsetWidth
    this.bubble.classList.add('is-speaking')

    this.holdingSpeech = hold
    // 용건이 생기면 변덕을 접고 프롬에게 온다. 경고는 바짝 붙고(alert), 팁은 앞에 선다(attend).
    this.enter(hold ? 'alert' : 'attend')
    if (hold) return
    this.speechHideTimer = window.setTimeout(() => {
      // 끝까지 떠 있었던 말만 "들려준 것"으로 친다. 다음 대사가 덮은 말은 세지 않는다.
      this.mind.bindCloser('adviceHeard')
      this.clearSpeech()
    }, line.tone === 'relief' ? 4200 : 3600)
  }

  /** 말풍선을 걷고 자유 비행으로 돌려보낸다. */
  clearSpeech() {
    if (this.disposed) return
    window.clearTimeout(this.speechHideTimer)
    this.holdingSpeech = false
    this.bubble.classList.remove('is-speaking')
    this.bubble.removeAttribute('data-tone')
    this.el.removeAttribute('data-tone')
    if (this.behavior === 'attend' || this.behavior === 'alert') this.enter('orbit')
  }

  /** 지금 붙잡힌 경고를 물고 있는가. 한가한 응원이 경고를 밀어내지 않게 하는 열쇠다. */
  get isHolding() {
    return this.holdingSpeech
  }

  get behaviorNow(): TokenBehavior {
    return this.behavior
  }

  destroy() {
    this.disposed = true
    window.clearTimeout(this.speechHideTimer)
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    destroyCharacterModels(this.el)
    this.el.remove()
  }

  // ── 비행 ──────────────────────────────────────────────────────────────────

  private start() {
    const tick = (now: number) => {
      if (this.disposed) return
      const delta = this.lastFrameAt ? Math.min((now - this.lastFrameAt) / 1000, 0.1) : 0
      this.lastFrameAt = now
      // 탭이 가려진 동안은 시간만 흘려보낸다. 안 그러면 돌아왔을 때 밀린 만큼 순간이동한다.
      if (!document.hidden && this.el.isConnected) this.step(delta, now)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private step(delta: number, now: number) {
    this.elapsed += delta
    if (this.selectionStartedAt) {
      this.situation.hesitation = clamp((now - this.selectionStartedAt) / HESITATION_FULL_MS, 0, 1)
      // 고르는 사람 앞에서 카드를 덮고 있었다는 사실은 한 번이라도 있었으면 남긴다.
      if (this.pos.y > HAND_TOP_Y) this.episode.occludedHand = true
    }
    if (!this.holdingSpeech && this.behaviorUntil && now >= this.behaviorUntil) this.enter(this.pickNext())
    this.aim(delta)
    this.steer(delta)
    this.paint()
  }

  /** 지금 결에 맞는 목표점을 갱신한다. 결마다 "어디를 보고 있는가"가 다르다. */
  private aim(delta: number) {
    const anchor = this.playerAnchor()
    switch (this.behavior) {
      case 'orbit': {
        // 프롬의 머리 위를 도는 납작한 타원. 세로를 눌러야 걸어다니는 게 아니라 떠 있는
        // 것으로 읽힌다.
        this.orbitAngle += delta * 0.9
        // 궤도면 자체가 아주 느리게 오르내린다. 고정 타원만 돌면 높이가 한 줄로 굳어
        // 프롬 머리 위에 매달아 둔 장식처럼 보인다.
        const drift = Math.sin(this.elapsed * 0.37) * 84
        // 걱정될수록 궤도가 좁아진다. 말로 하지 않고 거리로 말하는 부분이다.
        const closeness = this.mind.isWorried ? 0.58 : 1 - Math.max(0, -this.mind.mood) * 0.3
        this.target.x = anchor.x + Math.cos(this.orbitAngle) * 175 * closeness
        this.target.y = anchor.y + (Math.sin(this.orbitAngle) * 104 - 18 + drift) * closeness
        break
      }
      case 'wander': {
        // 웨이포인트를 차례로 찍는다. 도착 판정을 넉넉히 둬야 점마다 멈칫하지 않는다.
        const next = this.waypoints[0]
        if (!next) break
        this.target.x = next.x
        this.target.y = next.y
        if (Math.hypot(next.x - this.pos.x, next.y - this.pos.y) < 130) this.waypoints.shift()
        if (!this.waypoints.length) this.behaviorUntil = performance.now()
        break
      }
      case 'inspect': {
        // 사물 곁에 붙어 리사주 곡선으로 조금씩 옮겨 다닌다 — 한 점을 여러 각도에서
        // 훑어보는 것처럼 보이게 하는 최소한의 움직임이다.
        const t = this.elapsed
        this.target.x += (Math.cos(t * 1.7) * 34 + Math.sin(t * 0.6) * 22 - (this.target.x - this.focus.x)) * delta * 2.4
        this.target.y += (Math.sin(t * 2.3) * 26 - (this.target.y - this.focus.y)) * delta * 2.4
        break
      }
      case 'peer': {
        // 화면 앞으로 나와 유저 쪽을 들여다본다. 좌우로 아주 천천히 훑는 건 유리에
        // 얼굴을 붙이고 안을 살피는 몸짓이다.
        this.target.x = this.focus.x + Math.sin(this.elapsed * 0.9) * 210
        this.target.y = this.focus.y + Math.sin(this.elapsed * 1.5) * 42
        break
      }
      case 'attend': {
        // 프롬 앞 정위치. 말풍선이 오른쪽으로 펴질 자리를 남긴다.
        this.target.x = anchor.x + 26
        this.target.y = anchor.y - 66
        break
      }
      case 'alert': {
        // 바짝 붙어 덜덜 떤다. 진폭이 작고 빠른 게 핵심이다.
        this.target.x = anchor.x - 34 + Math.sin(this.elapsed * 17) * 9
        this.target.y = anchor.y - 52 + Math.sin(this.elapsed * 21) * 7
        break
      }
    }
    this.target.x = clamp(this.target.x, BOUNDS.minX, BOUNDS.maxX)
    this.target.y = clamp(this.target.y, BOUNDS.minY, BOUNDS.maxY)
  }

  /** 목표를 향해 감속 접근(arrive)한다. 관성이 있어야 방향을 틀 때 곡선이 남는다. */
  private steer(delta: number) {
    const flight = FLIGHT[this.behavior]
    const dx = this.target.x - this.pos.x
    const dy = this.target.y - this.pos.y
    const distance = Math.hypot(dx, dy) || 1
    // 들뜨면 빨라지고 가라앉으면 처진다. 같은 결이라도 기분에 따라 다른 몸짓이 된다.
    const spirit = 1 + this.mind.mood * 0.28
    const speed = flight.speed * spirit * Math.min(1, distance / flight.slow)
    const desiredX = (dx / distance) * speed
    const desiredY = (dy / distance) * speed

    const maxDelta = flight.accel * delta
    const steerX = clamp(desiredX - this.vel.x, -maxDelta, maxDelta)
    const steerY = clamp(desiredY - this.vel.y, -maxDelta, maxDelta)
    this.vel.x += steerX
    this.vel.y += steerY
    this.pos.x = clamp(this.pos.x + this.vel.x * delta, BOUNDS.minX, BOUNDS.maxX)
    this.pos.y = clamp(this.pos.y + this.vel.y * delta, BOUNDS.minY, BOUNDS.maxY)

    // 뱅킹 — 횡속도만큼 기운다. 이게 없으면 아무리 빨라도 미끄러지는 스티커로 보인다.
    const bank = clamp(this.vel.x / 900, -1, 1) * 26
    this.roll += (bank - this.roll) * Math.min(1, delta * 6)
    this.scale += (flight.scale - this.scale) * Math.min(1, delta * 4)

    // 몸통 방향. 들여다보는 두 결에서는 대상을 정면으로 마주하고, 그 밖에는 진행 방향을 본다.
    const facing =
      this.behavior === 'peer' ? 0
      : this.behavior === 'attend' ? 0.3
      : this.behavior === 'inspect' ? (this.focus.x > this.pos.x ? 0.7 : -0.7)
      : Math.abs(this.vel.x) > 60 ? (this.vel.x > 0 ? 0.85 : -0.85)
      : 0
    this.yaw += (facing - this.yaw) * Math.min(1, delta * 5)
    setCharacterModelYaw(this.body, this.yaw)
  }

  private paint() {
    // 상시 부유. 비행 좌표와 따로 얹어야 멈춰 선 순간에도 숨을 쉰다.
    const bob = this.reducedMotion
      ? 0
      : Math.sin(this.elapsed * 2.3) * 5 + Math.sin(this.elapsed * 1.1) * 3
    this.el.style.transform = `translate3d(${(this.pos.x - BOX / 2).toFixed(1)}px, ${(this.pos.y - BOX / 2 + bob).toFixed(1)}px, 0)`
    this.body.style.transform = `scale(${this.scale.toFixed(3)}) rotate(${this.roll.toFixed(2)}deg)`
    // 오른쪽 끝에서는 말풍선을 왼쪽으로 넘긴다 — 안 그러면 무대 밖으로 밀려 잘린다.
    this.bubble.dataset.side = this.pos.x > 1180 ? 'left' : 'right'
  }

  // ── 결 고르기 ─────────────────────────────────────────────────────────────

  private enter(behavior: TokenBehavior) {
    this.behavior = behavior
    this.el.dataset.behavior = behavior
    this.elapsed = 0
    const now = performance.now()

    if (behavior === 'attend' || behavior === 'alert') {
      this.behaviorUntil = 0
      return
    }
    const [min, max] = DURATION[behavior]
    this.behaviorUntil = now + rand(min, max)

    if (behavior === 'wander') {
      // 무대를 실제로 가로지르게 좌우를 번갈아 찍는다. 같은 쪽만 찍으면 "슈우웅"이 아니라
      // 제자리 진동이 된다.
      const startRight = this.pos.x < 960
      this.waypoints = Array.from({ length: 3 }, (_, i) => ({
        x: (startRight ? i % 2 === 0 : i % 2 === 1)
          ? rand(1240, BOUNDS.maxX)
          : rand(BOUNDS.minX, 700),
        // 세로도 무대 전체를 쓴다. 아래쪽 끝은 손패에 잠기는 깊이라, 가로지르는 길에
        // 카드 뒤로 사라졌다가 반대편에서 솟아오르는 순간이 나온다.
        y: rand(BOUNDS.minY + 20, BOUNDS.maxY - 40),
      }))
    }
    if (behavior === 'inspect') this.focus = this.pickInspectPoint()
    if (behavior === 'peer') this.focus = { x: rand(760, 1160), y: rand(360, 500) }
    if (behavior === 'orbit') this.orbitAngle = rand(0, TAU)
  }

  /**
   * 방금 끝난 구간을 정책에 돌려주고 다음 결을 받는다.
   * 같은 결이 연달아 나오면 아무 일도 일어나지 않은 것처럼 보이므로 직전 결은 제외한다.
   */
  private pickNext(): TokenBehavior {
    this.policy.learn(this.episode)
    this.episode = { tookDamage: false, distanceWhenHurt: 0, occludedHand: false, decidedQuickly: false }

    const previous = POLICY_BEHAVIOURS.includes(this.behavior as PolicyAction)
      ? (this.behavior as PolicyAction)
      : undefined
    const next = this.policy.choose(this.observe(), previous)
    // 움직임을 줄여 달라고 한 사람에게 무대를 가로지르는 결은 보여 주지 않는다.
    // 정책보다 이쪽이 위다 — 접근성은 학습이 뒤집을 수 있는 선호가 아니다.
    if (this.reducedMotion && (next === 'wander' || next === 'peer')) return 'orbit'
    return next
  }

  /** 지금 무대의 형편을 정책이 읽는 모양으로 옮긴다. */
  private observe(): TokenContext {
    const traits = this.mind.traits
    return {
      hpRatio: this.situation.hpRatio,
      recentlyHurt: this.mind.isWorried,
      enemyCount: this.situation.enemyCount,
      turnProgress: this.situation.turnProgress,
      mood: this.mind.mood,
      bond: this.mind.bond,
      curiosity: traits.curiosity,
      caution: traits.caution,
      playfulness: traits.playfulness,
      hesitation: this.situation.hesitation,
    }
  }

  /** 무대 좌표로 환산한 프롬의 머리 언저리. 프롬이 없으면 무대 왼쪽 위를 기본으로 쓴다. */
  private playerAnchor(): Vec {
    const player = this.playerEl
    if (!player || !player.isConnected) return { x: 420, y: 380 }
    const hostRect = this.host.getBoundingClientRect()
    const rect = player.getBoundingClientRect()
    // 무대는 통째로 scale()되므로 화면 px을 무대 px으로 되돌린다. --scale을 읽는 대신
    // 호스트 자신의 비율을 쓰면 스케일러 구현이 바뀌어도 따라온다.
    const scale = hostRect.width / (this.host.offsetWidth || 1) || 1
    return {
      x: (rect.left + rect.width / 2 - hostRect.left) / scale - 96,
      y: (rect.top - hostRect.top) / scale + 96,
    }
  }

  private pickInspectPoint(): Vec {
    const hostRect = this.host.getBoundingClientRect()
    const scale = hostRect.width / (this.host.offsetWidth || 1) || 1
    const scene = this.host.closest('.scene') ?? this.host
    const found = INSPECT_TARGETS.flatMap((selector) => {
      const el = scene.querySelector(selector)
      return el ? [el.getBoundingClientRect()] : []
    }).filter((rect) => rect.width > 0 && rect.height > 0)
    if (!found.length) return { x: rand(600, 1300), y: rand(220, 520) }
    const rect = found[Math.floor(Math.random() * found.length)]
    return {
      x: clamp((rect.left + rect.width / 2 - hostRect.left) / scale, BOUNDS.minX, BOUNDS.maxX),
      // 사물 위쪽에 뜬다. 정중앙에 겹치면 들여다보는 게 아니라 가리는 게 된다.
      y: clamp((rect.top - hostRect.top) / scale - 42, BOUNDS.minY, BOUNDS.maxY),
    }
  }
}
