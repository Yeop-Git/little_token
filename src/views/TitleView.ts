import { TITLE } from '@/assets'

interface Opts {
  onStart: () => void
  onSettings?: () => void
  onExit?: () => void
}

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
            <feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" />
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
            <button class="tmenu-btn" type="button" data-act="start">시작하기</button>
            <button class="tmenu-btn" type="button" data-act="settings">설정하기</button>
            <button class="tmenu-btn" type="button" data-act="exit">나가기</button>
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
    Promise.all(preload).then(() => {
      requestAnimationFrame(() => {
        reveal?.classList.add('ready')
        this.root.querySelector<HTMLButtonElement>('[data-act="start"]')?.focus()
      })
    })
  }

  private onAct(act: string) {
    if (act === 'start') return this.start()
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

  // 시작 → 화면이 은은하게 어두워진 뒤 다음 화면으로 넘어간다(로딩은 대개 이미 끝나 즉시).
  private start() {
    if (this.started) return
    this.started = true
    this.root.querySelector('.title-scene')?.classList.add('starting')
    this.startTimer = window.setTimeout(() => this.opts.onStart(), 560)
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

    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
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
    this.raf = requestAnimationFrame(tick)
  }
}
