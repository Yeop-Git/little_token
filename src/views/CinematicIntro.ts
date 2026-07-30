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
import { reportResourceFailure } from '@/ui/ResourceFailures'

interface Opts {
  /** 영상이 완전히 걷힌 뒤 — 이 시점엔 타이틀만 남는다. */
  onDone: () => void
  /**
   * 걷히기 시작할 때. 아래 화면도 같이 얼려 달라는 신호다(자세한 건 beginFade 주석).
   * 걷힘이 끝나면 onDone에서 도로 풀어 주면 된다.
   */
  onFadeStart?: () => void
  /**
   * 영상 끝자락에 반딧불이를 영상 위에도 얹어 달라는 신호.
   * 타이틀과 **같은 무리**를 받아야 겹이 바뀌는 순간 자리가 안 튄다.
   */
  onFireflyLayer?: (canvas: HTMLCanvasElement) => void
  /** 덮개가 사라질 때 그 겹을 도로 거둔다. */
  onFireflyLayerDone?: (canvas: HTMLCanvasElement) => void
}

/**
 * 재생 속도. 1보다 크면 빨라진다(1.5 = 10초짜리가 약 6.7초).
 * 원본을 다시 굽지 않고 여기 한 줄로 조절한다 — 아래 페이드 시점이 알아서 따라온다.
 */
const SPEED = 0.73
/**
 * 걷기 시작해서 완전히 넘어가기까지. style.css의 .cine-veil 트랜지션 합과 같아야 한다.
 * 앞 0.62초는 영상을 불투명한 채로 타이틀 화각까지 밀어 넣는 시간이고,
 * 실제로 걷히는 건 뒤의 0.28초뿐이다 — 다 맞아떨어진 자리에서 짧게 끊어 낸다.
 */
const FADE_MS = 620 + 280
/**
 * 걷힘이 끝난 걸 알아채는 건 transitionend가 맡고, 이 타이머는 그게 안 올 때만 쓴다
 * (탭이 뒤로 가 있거나 트랜지션 자체가 안 붙는 경우). 실제 길이보다 넉넉해야
 * 타이머가 먼저 터져서 걷히다 만 화면을 잘라내는 일이 없다.
 */
const FADE_FALLBACK_MS = FADE_MS + 500
/**
 * 다 세운 뒤 실제로 걷기 시작하기까지 두는 시간(rAF이 안 돌 때만 쓰는 상한).
 * 보통은 두 프레임 뒤에 시작하고 이 타이머는 안 쓰인다.
 */
const LEAVE_DEFER_MS = 120
/**
 * 넘겨준 뒤 영상 자원을 놓기까지 두는 시간.
 * 디코더를 푸는 건 메인 스레드를 꽤 잡아먹어서, 화면이 막 넘어간 프레임에 얹으면
 * 그 순간이 툭 끊긴다. 한가한 틈을 기다리되(requestIdleCallback), 그 틈이 안 오면
 * 이 시각에는 그냥 놓는다 — 계속 물고 있는 것보다는 낫다.
 */
const RELEASE_DELAY_MS = 3000
/**
 * 컷 몇 초(실제 시간) 전에 걷기 시작하는가.
 * 예전엔 0.8초를 앞당겨 재생 중인 영상 위로 걷어냈는데, 그러면 걷히는 내내 영상
 * 디코딩과 합성이 같이 돌아 화면이 끊겼다. 이제는 끝에 바짝 붙여 놓고 걷기 직전에
 * 영상을 세운다 — 마지막 프레임이 곧 타이틀 배경이라 멈춘 티가 안 난다.
 */
const FADE_LEAD_SEC = 0.15
/**
 * 반딧불이를 영상 위에 띄우기 시작하는 시점(컷 몇 초 전, 실제 시간).
 * 아래 CSS의 페이드 길이보다 넉넉해야 다 배어 나온 뒤에 화면이 넘어간다.
 */
const FIREFLY_LEAD_SEC = 3.2
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
  private stage: HTMLElement
  private fireflies: HTMLCanvasElement
  private video: HTMLVideoElement
  private fadeTimer = 0
  private giveUpTimer = 0
  private safetyTimer = 0
  private releaseTimer = 0
  private leaveTimer = 0
  private fading = false
  private leaving = false
  private fliesShown = false
  private finished = false
  private released = false

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
        <canvas class="cine-fireflies" aria-hidden="true"></canvas>
      </div>`
    this.stage = this.el.querySelector('.cine-stage')!
    this.fireflies = this.el.querySelector('canvas')!
    this.video = this.el.querySelector('video')!
    this.video.playbackRate = SPEED
    host.appendChild(this.el)

    // 아무 입력이나 들어오면 건너뛴다 — 두 번째부터는 기다리고 싶지 않다.
    this.el.addEventListener('click', this.skip)
    window.addEventListener('keydown', this.onKey)

    // 재생이 끝나도 바로 걷어내지 않는다 — 페이드는 영상이 끝나는 순간 딱 끝나도록
    // 잡혀 있어서, 여기서 finish를 부르면 남은 페이드가 잘려 화면이 툭 튄다.
    // 마지막 프레임에 멈춘 채로 남은 페이드를 마저 진행한다(그 프레임이 곧 타이틀 배경이다).
    this.video.addEventListener('ended', this.beginFade)
    this.video.addEventListener('error', () => {
      reportResourceFailure('opening video load', this.video.currentSrc || this.video.src)
      this.finish()
    })
    // rAF은 탭이 화면에 안 그려지면 멈춘다 — 페이드 시점은 미디어 시계로 잡는다.
    this.video.addEventListener('timeupdate', this.tick)
    // 첫 프레임이 준비돼야 검은 화면을 걷는다 — 안 그러면 흰 깜빡임이 생긴다.
    this.video.addEventListener('loadeddata', () => this.el.classList.add('playing'), { once: true })
    // 떠오름·걷힘이 실제로 끝나는 순간을 트랜지션한테 직접 듣는다(아래 onTransitionEnd 참고).
    this.el.addEventListener('transitionend', this.onTransitionEnd)

    this.giveUpTimer = window.setTimeout(this.finish, GIVE_UP_MS)
    void this.play()
  }

  destroy() {
    clearTimeout(this.fadeTimer)
    clearTimeout(this.giveUpTimer)
    clearTimeout(this.safetyTimer)
    clearTimeout(this.releaseTimer)
    clearTimeout(this.leaveTimer)
    this.video.removeEventListener('timeupdate', this.tick)
    this.el.removeEventListener('transitionend', this.onTransitionEnd)
    this.el.removeEventListener('click', this.skip)
    window.removeEventListener('keydown', this.onKey)
    // 덮개가 사라지면 이 겹도 같이 사라진다 — 계속 그리게 두면 헛일이다.
    this.opts.onFireflyLayerDone?.(this.fireflies)
    this.release()
    this.el.remove()
  }

  /**
   * 디코더와 버퍼를 실제로 놓아준다.
   * 소스를 <source> 자식으로 물렸을 땐 src 속성을 지워 봐야 아무 일도 안 일어난다 —
   * 자식을 떼고 load()까지 불러야 파이프라인이 풀린다. 예전엔 이게 헛돌아서
   * 영상 자원이 GC 때까지 살아 있었고, 그 정리가 아무 때나 튀어나왔다.
   */
  private release() {
    if (this.released) return
    this.released = true
    this.video.pause()
    this.video.querySelector('source')?.remove()
    this.video.removeAttribute('src')
    this.video.load()
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
      } catch (error) {
        reportResourceFailure('opening video play', this.video.currentSrc || this.video.src, error)
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
    if (duration - currentTime <= FIREFLY_LEAD_SEC * SPEED) this.showFireflies()
    if (duration - currentTime <= FADE_LEAD_SEC * SPEED) this.beginFade()
  }

  /**
   * 영상이 끝나기 전에 반딧불이를 미리 띄운다.
   * 걷힌 다음에 켜면 없던 것들이 한꺼번에 생겨서 티가 확 난다. 영상 끝자락부터
   * 천천히 배어 나오면 화면이 넘어갈 즈음엔 이미 거기 있던 것처럼 보인다.
   * 타이틀과 같은 무리를 그리므로 겹이 바뀌어도 자리가 안 튄다.
   */
  private showFireflies = () => {
    if (this.fliesShown) return
    this.fliesShown = true
    this.opts.onFireflyLayer?.(this.fireflies)
    this.el.classList.add('fireflies')
  }

  /**
   * 키로 건너뛰기 — 다만 브라우저에게 말을 거는 키는 빼야 한다.
   * 예전엔 keydown이면 무조건 건너뛰어서, 전체화면(F11)을 누르는 순간 시네마틱이
   * 같이 날아갔다. 창 모드를 바꾸려던 것뿐인데 영상을 잃는다.
   * 기능키와 조합키(Ctrl/Alt/Meta), 조합용 수식키 자체는 '넘겨 달라'는 뜻이 아니다.
   */
  private onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    if (/^F\d{1,2}$/.test(e.key)) return
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return
    this.skip()
  }

  private skip = () => this.beginFade()

  /**
   * 걷기 시작 — 그 전에 움직이는 걸 전부 세운다.
   *
   * 걷힘은 영상과 타이틀이 동시에 화면에 있는 유일한 구간이다. 여기서 재던 걸
   * 실제로 세어 보니 전면 애니메이션 열한 개가 겹쳐 돌고 영상까지 재생 중이었다.
   * 특히 양쪽 발광(.cine-glow / .title-glow)이 mix-blend-mode: screen을 쓰면서
   * 무한 애니메이션을 도는 탓에, 브라우저가 매 프레임 화면 전체를 다시 합성해야 해서
   * 불투명도를 컴포지터에 넘기지 못했다 — 지지직거리던 게 이거다.
   *
   * 그래서 걷기 직전에 영상을 세우고 양쪽 장식 애니메이션을 멈춘다. 안이 한 픽셀도
   * 안 바뀌면 브라우저는 한 번 구운 결과를 그대로 재사용하고, 그 위에서 불투명도만
   * 흘린다. 정지 그림 두 장의 크로스페이드라 구조적으로 끊길 수가 없다.
   */
  private beginFade = () => {
    if (this.fading) return
    this.fading = true
    clearTimeout(this.giveUpTimer)
    clearTimeout(this.safetyTimer)

    // ① 먼저 전부 세운다. 여기서 레이어와 표면이 한꺼번에 갈아엎힌다 —
    //    영상 레이어가 강등되고, 전면 필터 표면이 사라지고, 양쪽 장식이 멈추면서
    //    덮개와 타이틀 양쪽에 스타일 재계산이 걸린다. 다 합치면 한 프레임짜리 덩어리다.
    this.video.pause()
    // blur(0)이 남아 있으면 화면 전체가 필터 패스를 한 번 더 탄다. 떠오름은 진작
    // 끝났을 시점이라 결과는 그대로고 비용만 빠진다.
    // 트랜지션을 먼저 끊어야 한다 — .cine-stage는 filter를 2.9초에 걸쳐 흘리게 돼 있어서,
    // 그냥 none을 넣으면 흐림을 끄는 데 2.9초짜리 트랜지션이 새로 붙어 걷히는 내내
    // 필터 표면이 살아남는다. 끄려다 오히려 켜 두는 셈이 된다.
    this.stage.style.transition = 'none'
    this.stage.style.filter = 'none'
    // 반딧불이 겹의 페이드는 컷보다 먼저 끝나도록 잡아 뒀지만, 재생이 밀리거나
    // 건너뛰기가 들어오면 걷히는 중에 남을 수 있다. 얼린 화면에 움직이는 게 하나라도
    // 끼면 다시 컴포지터 밖으로 밀려나므로 여기서 확실히 끝점에 앉힌다.
    if (this.fliesShown) {
      this.fireflies.style.transition = 'none'
      this.fireflies.style.opacity = '1'
    }
    this.el.classList.add('frozen')
    this.opts.onFadeStart?.()

    // ② 그 덩어리가 화면에 한 번 나간 뒤에 페이드를 건다.
    //    같은 프레임에 몰면 갈아엎는 비용이 페이드의 첫 프레임에 그대로 얹혀서
    //    출발할 때 한 번 툭 걸린다("스르륵" 하다 걸리는 게 이거다).
    //    두 프레임을 두는 건 첫 프레임에 재래스터가 끝나고 두 번째에 실제로 표시되기 때문.
    requestAnimationFrame(() => requestAnimationFrame(this.startLeaving))
    // rAF이 안 도는 상황(탭이 뒤에 있는 경우)에서도 반드시 걷히도록 타이머로 받친다.
    this.leaveTimer = window.setTimeout(this.startLeaving, LEAVE_DEFER_MS)
    this.fadeTimer = window.setTimeout(this.finish, FADE_FALLBACK_MS)
  }

  private startLeaving = () => {
    if (this.leaving || this.finished) return
    this.leaving = true
    clearTimeout(this.leaveTimer)
    this.el.classList.add('leaving')
  }

  private onTransitionEnd = (e: TransitionEvent) => {
    /**
     * 걷힘이 끝나는 순간에 맞춰 넘긴다.
     * 트랜지션은 클래스가 붙은 프레임이 아니라 그 다음 스타일 계산부터 흐르기 시작한다.
     * 그래서 같은 길이의 타이머로 재면 늘 한 프레임씩 먼저 터져서, 아직 다 안 걷힌 화면을
     * 잘라내게 된다. 끝을 재는 건 트랜지션한테 맡긴다.
     */
    if (e.target === this.el && e.propertyName === 'opacity') return this.finish()
    /**
     * 떠오름이 끝났다 — 여기서 흐림을 아예 뗀다.
     * blur(0)은 '필터 없음'이 아니다. 값이 남아 있는 한 브라우저는 화면 전체를 별도
     * 표면에 한 번 더 굽고 필터 패스를 태운다. 결과는 원본과 픽셀 단위로 같은데
     * 비용만 계속 나가고, 하필 걷히는 동안 영상·타이틀이 같이 그려질 때 겹친다.
     */
    if (e.target === this.stage && e.propertyName === 'filter') this.stage.style.filter = 'none'
  }

  private finish = () => {
    if (this.finished) return
    this.finished = true
    clearTimeout(this.fadeTimer)
    clearTimeout(this.leaveTimer)
    // 걷힌 뒤라면 화면은 이미 넘어갔다. 여기서 5.6MB짜리 디코더까지 같이 풀면 넘겨주는
    // 그 한 프레임이 통째로 밀린다 — 넘기는 건 지금, 무거운 정리는 브라우저가 한가하다고
    // 알려줄 때. 고정 시간으로 미루면 하필 타이틀 UI가 올라오는 중에 터질 수 있다.
    // 영상을 아예 못 튼 경우엔 덮개가 아직 그대로라 미룰 수가 없다(미루면 검은 화면이 남는다).
    if (this.fading) this.scheduleRelease()
    else this.destroy()
    this.opts.onDone()
  }

  private scheduleRelease() {
    const idle = (window as Window & { requestIdleCallback?: typeof requestIdleCallback })
      .requestIdleCallback
    if (idle) idle(() => this.destroy(), { timeout: RELEASE_DELAY_MS })
    else this.releaseTimer = window.setTimeout(() => this.destroy(), RELEASE_DELAY_MS)
  }
}
