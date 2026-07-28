import { TITLE } from '@/assets'
import { GameAudio } from '@/audio/GameAudio'
import { GraphicsSettings } from '@/ui/GameSettings'
import { t } from '@/localization'
import { preloadImages } from '@/ui/ResourceLibrary'

interface Opts {
  /** fresh=true면 이어하던 런을 버리고 처음부터 시작한다. */
  onStart: (fresh: boolean) => void
  onSettings?: () => void
  onGuide?: () => void
  onExit?: () => void
  /** 이어할 런이 있으면 메뉴가 이어하기/새로하기로 갈린다. */
  hasSave?: boolean
  /**
   * 배경만 먼저 드러내고 제목·메뉴는 붙잡아 둔다(오프닝 시네마틱용).
   * 영상이 배경으로 포개진 걸 플레이어가 알아본 뒤에 revealUi()로 놓아준다.
   */
  holdUi?: boolean
}

/**
 * 지글거림 SMIL을 시작한 뒤 실제 CSS 필터를 걸기까지 두는 시간.
 * #title-sizzle이 scale 0에 머무는 구간(11s × 0.18 ≈ 1.98s)보다 반드시 짧아야 한다 —
 * 늦으면 이미 0을 넘긴 값으로 필터가 붙어 배경이 툭 뒤틀린다.
 */
const WARP_ON_MS = 1200

/** 떠오름 트랜지션(가장 긴 게 transform 1.5s)이 다 끝났다고 볼 시각. 넉넉히 잡는다. */
const SETTLE_FALLBACK_MS = 1700

interface Fly {
  x: number
  y: number
  r: number
  a: number // 배회 각도
  spd: number // px/s
  tw: number // 반짝임 위상
  twSpd: number
  hue: number
  sprite: HTMLCanvasElement
}

export class TitleView {
  private started = false
  private raf = 0
  private onResize = () => {}
  private toastTimer = 0
  private startTimer = 0
  private confirmTimer = 0
  private warpTimer = 0
  private settleTimer = 0
  /** 얼렸다 풀 때 같은 루프를 이어 돌리려고 들고 있는다(freezeAmbient/thawAmbient). */
  private flyTick: ((now: number) => void) | null = null
  private flyLast = 0
  /** 같은 반딧불이 무리를 그려 줄 캔버스들(시네마틱이 영상 위에 한 겹 더 얹는다). */
  private flyTargets: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = []
  private flySize: ((c: HTMLCanvasElement, cx: CanvasRenderingContext2D) => void) | null = null

  constructor(
    private root: HTMLElement,
    private opts: Opts,
  ) {
    this.mount()
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.toastTimer)
    clearTimeout(this.startTimer)
    clearTimeout(this.confirmTimer)
    clearTimeout(this.warpTimer)
    clearTimeout(this.settleTimer)
    window.removeEventListener('resize', this.onResize)
  }

  private mount() {
    this.root.innerHTML = `
      <main class="scene title-scene">
        <svg class="title-warp-defs" aria-hidden="true" width="0" height="0">
          <filter id="title-warp" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.005 0.009" numOctaves="2" seed="7" result="n">
              <animate attributeName="baseFrequency" dur="16s" repeatCount="indefinite"
                calcMode="spline" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1"
                values="0.005 0.009;0.010 0.006;0.005 0.009" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">
              <animate id="title-sizzle" attributeName="scale" begin="indefinite"
                dur="11s" values="0;0;3" keyTimes="0;0.18;1" calcMode="spline"
                keySplines="0 0 1 1;0.65 0 0.5 1" fill="freeze" />
            </feDisplacementMap>
          </filter>
        </svg>
        <div class="title-reveal">
          <div class="title-atmos" style="background-image:url(${TITLE.bg})">
            <div class="title-glow" aria-hidden="true"></div>
            <div class="title-vignette" aria-hidden="true"></div>
          </div>
          <div class="title-scrim-left" aria-hidden="true"></div>
          <canvas class="title-fireflies" aria-hidden="true"></canvas>
          <div class="title-logo-wrap" aria-hidden="true">
            <img class="title-logo" src="${TITLE.logo}" alt="Little Token" />
          </div>
          <h1 class="sr-only">Little Token</h1>
          <nav class="title-menu" aria-label="${t('titleMenu', '타이틀 메뉴')}">
            ${
              this.opts.hasSave
                ? `<button class="tmenu-btn" type="button" data-act="continue">${t('continue', '이어하기')}</button>
            <button class="tmenu-btn" type="button" data-act="fresh">${t('newGame', '새로하기')}</button>`
                : `<button class="tmenu-btn" type="button" data-act="continue">${t('start', '시작하기')}</button>`
            }
            <button class="tmenu-btn" type="button" data-act="settings">${t('settingsAction', '설정하기')}</button>
            <button class="tmenu-btn" type="button" data-act="guide">${t('help', '도움말')}</button>
            <button class="tmenu-btn is-exit" type="button" data-act="exit">${t('exit', '나가기')}</button>
          </nav>
          <div class="title-toast" id="title-toast" aria-live="polite"></div>
          <div class="title-loadmask" aria-hidden="true"></div>
        </div>
        <div class="title-darken" aria-hidden="true"></div>
      </main>`

    this.root.querySelectorAll<HTMLButtonElement>('.tmenu-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.onAct(btn.dataset.act ?? ''))
    })

    this.setupFireflies(this.root.querySelector<HTMLCanvasElement>('.title-fireflies')!)

    // 로딩 전에는 검은 화면 — 배경/로고가 준비되면 흐릿하게 전체 페이드인(중앙이 조금 더 먼저).
    const reveal = this.root.querySelector<HTMLElement>('.title-reveal')
    const preload = preloadImages([TITLE.bg, TITLE.logo])
    if (this.opts.holdUi) reveal?.classList.add('ui-held')
    // 떠오름이 끝나면 흐림을 뗀다(위 .settled 참고). 여기서 안 떼면 시네마틱이 걷히는
    // 동안 영상 위에 타이틀 화면 전체를 굽는 필터 패스가 하나 더 얹힌다.
    // transitionend가 빠른 길이고, 타이머는 그게 안 올 때를 받친다(탭이 뒤에 있었거나
    // 감속 모션이라 트랜지션이 아예 안 붙는 경우). 늦게 떼는 건 괜찮지만 안 떼면 곤란하다.
    const settle = () => reveal?.classList.add('settled')
    reveal?.addEventListener('transitionend', (e) => {
      if (e.target === reveal && e.propertyName === 'filter') settle()
    })
    preload.then(() => {
      requestAnimationFrame(() => {
        reveal?.classList.add('ready')
        this.settleTimer = window.setTimeout(settle, SETTLE_FALLBACK_MS)
        // 붙잡아 둔 상태에서는 아직 보여 줄 게 없다 — 일렁임도 놓아줄 때 시작한다.
        if (this.opts.holdUi) return
        this.startWarp()
      })
    })
  }

  /**
   * 붙잡아 둔 제목·메뉴를 놓아준다. 배경이 한 번 일렁이고 그 위로 떠오른다.
   * 시네마틱이 배경으로 다 포개진 뒤에 불린다.
   */
  revealUi() {
    const reveal = this.root.querySelector<HTMLElement>('.title-reveal')
    if (!reveal?.classList.contains('ui-held')) return
    // 배경 페이드인이 아직이면(이미지가 늦거나 rAF가 묶였을 때) 여기서 확실히 켠다 —
    // 놓아줬는데 화면이 까맣게 남는 상황은 없어야 한다.
    reveal.classList.add('ready')
    reveal.classList.remove('ui-held')
    reveal.classList.add('ui-in')
    // 이 경로로 처음 ready가 붙었을 수도 있다(이미지가 늦거나 탭이 뒤에 있어 rAF가 묶였을 때).
    // 그러면 mount에서 건 안전망이 아직 안 돌았으니 여기서 다시 건다.
    clearTimeout(this.settleTimer)
    this.settleTimer = window.setTimeout(() => reveal.classList.add('settled'), SETTLE_FALLBACK_MS)
    this.startWarp()
  }

  /**
   * 시네마틱이 걷히는 동안 배경을 얼린다 — 반딧불이 캔버스를 세우고, 발광·비네트의
   * 무한 애니메이션도 CSS에서 멈춘다(.cine-crossfade).
   * 걷힘은 영상과 타이틀이 함께 그려지는 유일한 구간이라, 여기서 도는 건 전부
   * 두 배로 비싸다. 다 세워 두면 정지 그림 두 장의 크로스페이드가 된다.
   */
  freezeAmbient() {
    this.root.closest('#stage')?.classList.add('cine-crossfade')
    cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  /**
   * 반딧불이를 그릴 캔버스를 하나 더 받는다 — 시네마틱이 영상 위에 얹는 겹이다.
   * 무리는 공유하므로 두 캔버스의 반딧불이는 언제나 같은 자리에 있고, 그래서
   * 영상이 걷히며 겹이 바뀌어도 티가 안 난다.
   */
  addFireflyLayer(canvas: HTMLCanvasElement) {
    if (!this.flySize || this.flyTargets.some((t) => t.canvas === canvas)) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    this.flySize(canvas, ctx)
    this.flyTargets.push({ canvas, ctx })
  }

  removeFireflyLayer(canvas: HTMLCanvasElement) {
    this.flyTargets = this.flyTargets.filter((t) => t.canvas !== canvas)
  }

  /** 걷힘이 끝나면 도로 풀어 준다. */
  thawAmbient() {
    this.root.closest('#stage')?.classList.remove('cine-crossfade')
    if (!this.raf && this.flyTick) {
      this.flyLast = performance.now()
      this.raf = requestAnimationFrame(this.flyTick)
    }
  }

  private beginAnim(sel: string) {
    this.root.querySelector<SVGAnimateElement>(sel)?.beginElement?.()
  }

  private startWarp() {
    this.beginAnim('#title-sizzle')
    const reveal = this.root.querySelector<HTMLElement>('.title-reveal')
    this.warpTimer = window.setTimeout(() => reveal?.classList.add('warping'), WARP_ON_MS)
  }

  /*
   * 예전엔 여기서 이어하기에 포커스를 줬는데(focusMenu), 화면이 뜨자마자 그 버튼만
   * 호버된 것처럼 보였다. 첫 로드라 아직 사용자 입력이 없으면 브라우저는 프로그램적
   * 포커스에도 :focus-visible을 켜고, 아래 스타일은 :focus-visible에 호버와 똑같은
   * 대우(오른쪽으로 밀고 확대 + ✦ 표식)를 주면서 outline까지 지워 놨다.
   * 그래서 '포커스 표시'가 아니라 '마우스가 얹힌 상태'로 읽혔다.
   *
   * 방향키 메뉴 이동 같은 게 없어서 미리 포커스를 줘도 얻는 게 없다. 그냥 주지 않는다.
   * 키보드 사용자는 Tab으로 들어오고, 그때는 :focus-visible이 제대로 켜져 어디에 있는지
   * 분명히 보인다.
   */

  private onAct(act: string) {
    if (act === 'continue') return this.start(false)
    if (act === 'fresh') return this.askFresh()
    if (act === 'guide') return this.opts.onGuide?.()
    if (act === 'settings') return this.opts.onSettings ? this.opts.onSettings() : this.toast('설정은 곧 추가돼요')
    if (act === 'exit') {
      if (this.opts.onExit) return this.opts.onExit()
      window.close() // 스크립트로 연 창이 아니면 무시된다
      this.toast(t('closeTab', '브라우저 탭을 닫아 주세요'))
    }
  }

  private toast(msg: string) {
    const el = this.root.querySelector<HTMLElement>('#title-toast')
    if (!el) return
    el.textContent = msg
    el.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200)
  }

  // 새로하기는 진행 중인 런을 지운다 — 실수로 날리지 않게 한 번 더 눌러야 확정된다.
  private askFresh() {
    const btn = this.root.querySelector<HTMLButtonElement>('[data-act="fresh"]')
    if (!btn) return
    if (btn.classList.contains('is-danger')) return this.start(true)
    btn.classList.add('is-danger')
    btn.textContent = t('confirmNew', '정말 새로할까요?')
    this.toast(t('diaryWillErase', '여태 쓴 일기가 지워져요'))
    clearTimeout(this.confirmTimer)
    this.confirmTimer = window.setTimeout(() => {
      btn.classList.remove('is-danger')
      btn.textContent = t('newGame', '새로하기')
    }, 3400)
  }

  // 시작 → 화면이 은은하게 어두워진 뒤 다음 화면으로 넘어간다(로딩은 대개 이미 끝나 즉시).
  private start(fresh: boolean) {
    if (this.started) return
    this.started = true
    GameAudio.startBgm()
    this.root.querySelector('.title-scene')?.classList.add('starting')
    this.startTimer = window.setTimeout(() => this.opts.onStart(fresh), 560)
  }

  /**
   * 은은한 반딧불이 — 불규칙하게 배회하며 반짝인다. 가산 합성으로 부드럽게 발광.
   *
   * 그리는 곳이 여럿일 수 있다. 시네마틱이 걷힐 때, 영상 위에도 같은 반딧불이를 얹으려면
   * **같은 무리를 같은 자리에** 그려야 한다 — 캔버스를 따로 돌리면 두 무리가 서로 다른
   * 자리에 떠서 겹치는 순간 개수가 두 배로 보이거나 툭 옮겨 앉는다.
   * 그래서 무리는 하나만 두고 그리기 대상만 늘린다(addFireflyLayer).
   */
  private setupFireflies(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // 1920×1080 전면 캔버스를 DPR 2로 만들면 반딧불이 20개를 위해 매 드로우마다
    // 4K(3840×2160) 표면 전체를 지우게 된다. 작은 방사형 발광은 1배에서도 충분히
    // 부드럽고, 실제 무대는 대부분 축소 표시되므로 전용 표면은 DPR 1로 고정한다.
    const dpr = 1
    let w = 0
    let h = 0
    const sizeOne = (c: HTMLCanvasElement, cx: CanvasRenderingContext2D) => {
      c.width = Math.max(1, Math.round(w * dpr))
      c.height = Math.max(1, Math.round(h * dpr))
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      for (const t of this.flyTargets) sizeOne(t.canvas, t.ctx)
    }
    this.flyTargets = [{ canvas, ctx }]
    this.flySize = sizeOne
    resize()
    this.onResize = resize
    window.addEventListener('resize', resize)

    const makeGlowSprite = (hue: number) => {
      const sprite = document.createElement('canvas')
      sprite.width = 64
      sprite.height = 64
      const spriteContext = sprite.getContext('2d')!
      const gradient = spriteContext.createRadialGradient(32, 32, 0, 32, 32, 31)
      gradient.addColorStop(0, `hsla(${hue}, 100%, 88%, 1)`)
      gradient.addColorStop(0.14, `hsla(${hue}, 95%, 74%, .9)`)
      gradient.addColorStop(0.42, `hsla(${hue}, 95%, 64%, .32)`)
      gradient.addColorStop(1, `hsla(${hue}, 95%, 60%, 0)`)
      spriteContext.fillStyle = gradient
      spriteContext.fillRect(0, 0, 64, 64)
      return sprite
    }

    const flies: Fly[] = Array.from({ length: 20 }, () => {
      const hue = 40 + Math.random() * 16
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1.1 + Math.random() * 2.3,
        a: Math.random() * Math.PI * 2,
        spd: 5 + Math.random() * 11,
        tw: Math.random() * Math.PI * 2,
        twSpd: 0.5 + Math.random() * 1.5,
        hue, // 따뜻한 노랑~호박색
        sprite: makeGlowSprite(hue),
      }
    })

    this.flyLast = performance.now()
    const tick = (now: number) => {
      // 절전 모드에서는 캔버스를 CSS로 숨긴다. 숨긴 표면을 계속 그리면 설정의
      // 의도와 달리 GPU 비용은 그대로이므로 루프만 유지하고 드로우는 건너뛴다.
      const profile = GraphicsSettings.profile()
      if (document.hidden || profile.foilFps === 0) {
        this.flyLast = now
        this.raf = requestAnimationFrame(tick)
        return
      }
      // 전체 화면 캔버스에 방사형 그라디언트 20개를 그리는 효과라 60fps에서는
      // 타이틀 대기 중에도 GPU 합성 비용이 크다. 느린 부유물은 30fps로 충분하다.
      if (now - this.flyLast < 1000 / Math.min(30, profile.activeFps)) {
        this.raf = requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(0.05, (now - this.flyLast) / 1000)
      this.flyLast = now
      // 자리 계산은 한 번, 그리기는 등록된 캔버스마다.
      for (const f of flies) {
        f.a += (Math.random() - 0.5) * 0.7 // 불규칙 배회
        f.x += Math.cos(f.a) * f.spd * dt
        f.y += Math.sin(f.a) * f.spd * dt - 4 * dt // 살짝 위로 떠오름
        if (f.x < -12) f.x = w + 12
        else if (f.x > w + 12) f.x = -12
        if (f.y < -12) f.y = h + 12
        else if (f.y > h + 12) f.y = -12
        f.tw += f.twSpd * dt
      }
      for (const { ctx: cx } of this.flyTargets) {
        cx.clearRect(0, 0, w, h)
        cx.globalCompositeOperation = 'lighter'
        for (const f of flies) {
          const glow = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(f.tw))
          const rad = f.r * (2.2 + glow * 3.2)
          cx.globalAlpha = glow
          cx.drawImage(f.sprite, f.x - rad, f.y - rad, rad * 2, rad * 2)
        }
        cx.globalAlpha = 1
        cx.globalCompositeOperation = 'source-over'
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.flyTick = tick
    this.raf = requestAnimationFrame(tick)
  }
}
