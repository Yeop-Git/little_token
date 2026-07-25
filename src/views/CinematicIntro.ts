/**
 * 오프닝 시네마틱 — 첫 부팅에서 검은 화면 → 로딩 → 영상 → 타이틀 순으로 이어진다.
 *
 * 영상의 마지막 장면과 타이틀 배경은 같은 그림이다. 그래서 씬을 "교체"하지 않고
 * 이미 다 그려 둔 타이틀 **위에** 영상을 덮어 두었다가, 영상이 끝나기 전에 흐려지며
 * 걷히게 한다. 아래가 같은 그림이라 컷 없이 두 화면이 포개지는 것처럼 보인다.
 *
 * 컷보다 먼저 걷히는 게 핵심이라 페이드는 재생이 끝나기 FADE_MS 전에 시작한다.
 */

import { VIDEO } from '@/assets'

interface Opts {
  /** 영상이 완전히 걷힌 뒤 — 이 시점엔 타이틀만 남는다. */
  onDone: () => void
}

/**
 * 재생 속도. 1보다 크면 빨라진다(1.5 = 10초짜리가 약 6.7초).
 * 원본을 다시 굽지 않고 여기 한 줄로 조절한다 — 아래 페이드 시점이 알아서 따라온다.
 */
const SPEED = 0.73
/** 걷히는 데 걸리는 시간. style.css의 .cine-veil 트랜지션과 같은 값이어야 한다. */
const FADE_MS = 1800
/**
 * 컷 몇 초(실제 시간) 전에 걷기 시작하는가. 작을수록 영상 끝자락에 붙는다.
 * 페이드가 컷보다 길어도 된다 — 마지막 프레임에 멈춘 채로 마저 흐려지고,
 * 그 프레임이 곧 타이틀 배경이라 멈춘 티가 안 난다.
 */
const FADE_LEAD_SEC = 0.8
/**
 * 늘어지는 구간만 살짝 빨리 넘긴다(초는 영상 원본 시간 기준).
 * 요정이 같은 자리에 떠 있기만 하는 대목이라 화면이 거의 안 바뀐다 —
 * 그래서 속도를 올려도 빨라진 티는 안 나고 체류감만 걷힌다.
 */
const TRIM = { from: 2.2, to: 5.1, boost: 1.7 }
/** 영상을 못 틀 때(코덱·정책·네트워크) 이만큼 기다렸다 그냥 타이틀로 간다. */
const GIVE_UP_MS = 6000

export class CinematicIntro {
  private el: HTMLElement
  private video: HTMLVideoElement
  private fadeTimer = 0
  private giveUpTimer = 0
  private safetyTimer = 0
  private fading = false
  private finished = false

  constructor(host: HTMLElement, private opts: Opts) {
    this.el = document.createElement('div')
    this.el.className = 'cine-veil'
    this.el.setAttribute('aria-hidden', 'true')
    // 발광·비네트는 타이틀 화면과 같은 레이어를 쓴다(style.css에서 선택자를 공유).
    // 톤이 맞는 건 물론이고, 겹치는 순간 두 화면의 가장자리 어둠까지 포개져 이음매가 사라진다.
    this.el.innerHTML = `
      <div class="cine-stage">
        <video class="cine-video" playsinline preload="auto">
          <source src="${VIDEO.cinematic}" type="video/webm" />
        </video>
        <div class="cine-glow"></div>
        <div class="cine-vignette"></div>
      </div>`
    this.video = this.el.querySelector('video')!
    this.video.playbackRate = SPEED
    host.appendChild(this.el)

    // 아무 입력이나 들어오면 건너뛴다 — 두 번째부터는 기다리고 싶지 않다.
    this.el.addEventListener('click', this.skip)
    window.addEventListener('keydown', this.skip)

    // 재생이 끝나도 바로 걷어내지 않는다 — 페이드는 영상이 끝나는 순간 딱 끝나도록
    // 잡혀 있어서, 여기서 finish를 부르면 남은 페이드가 잘려 화면이 툭 튄다.
    // 마지막 프레임에 멈춘 채로 남은 페이드를 마저 진행한다(그 프레임이 곧 타이틀 배경이다).
    this.video.addEventListener('ended', this.beginFade)
    this.video.addEventListener('error', this.finish)
    // rAF은 탭이 화면에 안 그려지면 멈춘다 — 페이드 시점은 미디어 시계로 잡는다.
    this.video.addEventListener('timeupdate', this.tick)
    // 첫 프레임이 준비돼야 검은 화면을 걷는다 — 안 그러면 흰 깜빡임이 생긴다.
    this.video.addEventListener('loadeddata', () => this.el.classList.add('playing'), { once: true })

    this.giveUpTimer = window.setTimeout(this.finish, GIVE_UP_MS)
    void this.play()
  }

  destroy() {
    clearTimeout(this.fadeTimer)
    clearTimeout(this.giveUpTimer)
    clearTimeout(this.safetyTimer)
    this.video.removeEventListener('timeupdate', this.tick)
    this.el.removeEventListener('click', this.skip)
    window.removeEventListener('keydown', this.skip)
    this.video.pause()
    this.video.removeAttribute('src')
    this.el.remove()
  }

  /**
   * 소리를 켠 채로 먼저 시도하고, 브라우저가 자동재생을 막으면 음소거로 되돌린다.
   * (사용자 입력 전에는 대개 막히지만, 이미 이 사이트를 만진 적이 있으면 소리가 난다.)
   */
  private async play() {
    try {
      this.video.playbackRate = SPEED // 소스 로드 중에 초기화되는 브라우저가 있어 한 번 더 건다
      await this.video.play()
    } catch {
      this.video.muted = true
      try {
        await this.video.play()
      } catch {
        return this.finish() // 그래도 안 되면 영상 없이 타이틀로
      }
    }
    clearTimeout(this.giveUpTimer)
    // 버퍼링으로 timeupdate가 끊겨도 영원히 덮여 있지는 않게 한다.
    const { duration } = this.video
    if (Number.isFinite(duration) && duration > 0) {
      this.safetyTimer = window.setTimeout(this.beginFade, (duration / SPEED + 1) * 1000)
    }
  }

  /**
   * 남은 시간이 페이드 길이보다 짧아지면 걷기 시작한다.
   * currentTime은 배속과 무관한 '영상 속 시간'이라, 실제 1.8초를 벌려면 남은 영상 시간을
   * 배속만큼 넉넉히 잡아야 한다(2배속이면 3.6초 남았을 때 시작해야 1.8초가 걸린다).
   */
  private tick = () => {
    const { duration, currentTime } = this.video
    if (!Number.isFinite(duration) || duration <= 0) return
    const inTrim = currentTime >= TRIM.from && currentTime < TRIM.to
    const rate = inTrim ? SPEED * TRIM.boost : SPEED
    if (this.video.playbackRate !== rate) this.video.playbackRate = rate
    if (duration - currentTime <= FADE_LEAD_SEC * SPEED) this.beginFade()
  }

  private skip = () => this.beginFade()

  private beginFade = () => {
    if (this.fading) return
    this.fading = true
    clearTimeout(this.giveUpTimer)
    clearTimeout(this.safetyTimer)
    this.el.classList.add('leaving')
    this.fadeTimer = window.setTimeout(this.finish, FADE_MS)
  }

  private finish = () => {
    if (this.finished) return
    this.finished = true
    this.destroy()
    this.opts.onDone()
  }
}
