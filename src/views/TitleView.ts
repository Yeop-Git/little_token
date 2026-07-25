import { TITLE } from '@/assets'
import { GameAudio } from '@/audio/GameAudio'

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
            <!-- 지글지글(왜곡)은 0에서 시작한다. 시네마틱이 포개지는 동안엔 영상과 같은
                 맨 화면이어야 이음매가 안 보이고, 그 뒤 아주 천천히 차오른다. -->
            <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G">
              <!-- 지글거림은 튀는 순간 없이 오직 서서히 배어 나오기만 한다.
                   앞 18%는 0에 머물러 '한참 뒤에' 시작하는 느낌을 만들고,
                   그 뒤 완만한 곡선으로 상시값(3)까지 차오른다. -->
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
          <nav class="title-menu" aria-label="타이틀 메뉴">
            ${
              this.opts.hasSave
                ? `<button class="tmenu-btn" type="button" data-act="continue">이어하기</button>
            <button class="tmenu-btn" type="button" data-act="fresh">새로하기</button>`
                : `<button class="tmenu-btn" type="button" data-act="continue">시작하기</button>`
            }
            <button class="tmenu-btn" type="button" data-act="settings">설정하기</button>
            <button class="tmenu-btn" type="button" data-act="guide">도움말</button>
            <button class="tmenu-btn is-exit" type="button" data-act="exit">나가기</button>
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
    const preload = [TITLE.bg, TITLE.logo].map(
      (src) =>
        new Promise<void>((res) => {
          const im = new Image()
          im.onload = im.onerror = () => res()
          im.src = src
        }),
    )
    if (this.opts.holdUi) reveal?.classList.add('ui-held')
    // 떠오름이 끝나면 흐림을 뗀다(위 .settled 참고). 여기서 안 떼면 시네마틱이 걷히는
    // 동안 영상 위에 타이틀 화면 전체를 굽는 필터 패스가 하나 더 얹힌다.
    // transitionend가 빠른 길이고, 타이머는 그게 안 올 때를 받친다(탭이 뒤에 있었거나
    // 감속 모션이라 트랜지션이 아예 안 붙는 경우). 늦게 떼는 건 괜찮지만 안 떼면 곤란하다.
    const settle = () => reveal?.classList.add('settled')
    reveal?.addEventListener('transitionend', (e) => {
      if (e.target === reveal && e.propertyName === 'filter') settle()
    })
    Promise.all(preload).then(() => {
      requestAnimationFrame(() => {
        reveal?.classList.add('ready')
        this.settleTimer = window.setTimeout(settle, SETTLE_FALLBACK_MS)
        // 붙잡아 둔 상태에서는 아직 누를 게 없다 — 포커스도 놓아줄 때 준다.
        if (this.opts.holdUi) return
        this.focusMenu()
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
    this.focusMenu()
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

  /**
   * 배경 일렁임을 켠다 — SMIL은 지금 시작하고, CSS 필터는 조금 늦게 건다.
   *
   * #title-sizzle은 앞 18%(11초 중 약 2초) 동안 scale을 0에 눌러 둔다. 그 구간의
   * 필터는 원본과 픽셀 단위로 같은 그림을 내놓으면서 화면 전체 feTurbulence 비용만
   * 문다. 특히 시네마틱이 걷히는 동안 이게 돌면 영상·타이틀이 함께 그려지는 그 1초를
   * 갉아먹는다. 그래서 필터 자체는 지글거림이 실제로 올라오기 직전에 붙인다.
   * (필터가 붙는 순간 레이어가 한 번 승격되는데, 로고가 천천히 떠오르는 중이라 안 보인다.)
   */
  private startWarp() {
    this.beginAnim('#title-sizzle')
    const reveal = this.root.querySelector<HTMLElement>('.title-reveal')
    this.warpTimer = window.setTimeout(() => reveal?.classList.add('warping'), WARP_ON_MS)
  }

  private focusMenu() {
    this.root.querySelector<HTMLButtonElement>('[data-act="continue"]')?.focus()
  }

  private onAct(act: string) {
    if (act === 'continue') return this.start(false)
    if (act === 'fresh') return this.askFresh()
    if (act === 'guide') return this.opts.onGuide?.()
    if (act === 'settings') return this.opts.onSettings ? this.opts.onSettings() : this.toast('설정은 곧 추가돼요')
    if (act === 'exit') {
      if (this.opts.onExit) return this.opts.onExit()
      window.close() // 스크립트로 연 창이 아니면 무시된다
      this.toast('브라우저 탭을 닫아 주세요')
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
    btn.textContent = '정말 새로할까요?'
    this.toast('여태 쓴 일기가 지워져요')
    clearTimeout(this.confirmTimer)
    this.confirmTimer = window.setTimeout(() => {
      btn.classList.remove('is-danger')
      btn.textContent = '새로하기'
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

  // 은은한 반딧불이 — 불규칙하게 배회하며 반짝인다. 가산 합성으로 부드럽게 발광.
  private setupFireflies(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    this.onResize = resize
    window.addEventListener('resize', resize)

    const flies: Fly[] = Array.from({ length: 20 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1.1 + Math.random() * 2.3,
      a: Math.random() * Math.PI * 2,
      spd: 5 + Math.random() * 11,
      tw: Math.random() * Math.PI * 2,
      twSpd: 0.5 + Math.random() * 1.5,
      hue: 40 + Math.random() * 16, // 따뜻한 노랑~호박색
    }))

    this.flyLast = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - this.flyLast) / 1000)
      this.flyLast = now
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (const f of flies) {
        f.a += (Math.random() - 0.5) * 0.7 // 불규칙 배회
        f.x += Math.cos(f.a) * f.spd * dt
        f.y += Math.sin(f.a) * f.spd * dt - 4 * dt // 살짝 위로 떠오름
        if (f.x < -12) f.x = w + 12
        else if (f.x > w + 12) f.x = -12
        if (f.y < -12) f.y = h + 12
        else if (f.y > h + 12) f.y = -12
        f.tw += f.twSpd * dt
        const glow = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(f.tw))
        const rad = f.r * (2.2 + glow * 3.2)
        const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad)
        g.addColorStop(0, `hsla(${f.hue}, 95%, 74%, ${0.85 * glow})`)
        g.addColorStop(0.4, `hsla(${f.hue}, 95%, 64%, ${0.3 * glow})`)
        g.addColorStop(1, `hsla(${f.hue}, 95%, 60%, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(f.x, f.y, rad, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `hsla(${f.hue}, 100%, 88%, ${0.9 * glow})`
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r * 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      this.raf = requestAnimationFrame(tick)
    }
    this.flyTick = tick
    this.raf = requestAnimationFrame(tick)
  }
}
