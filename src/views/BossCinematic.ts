/**
 * 보스 조우 시네마틱 — 전리품을 다 고른 뒤 보스전으로 넘어가는 사이에 끼는 풀화면 영상.
 *
 * 흐름: 전리품 화면이 어두워지며 까매짐 → 한 박자 정적 → 영상 풀화면 재생 →
 * 마지막 프레임을 그대로 붙든 채 보스전을 그 아래에 세우고 → 영상만 스르륵 지워
 * 전장이 드러난다.
 *
 * 오버레이는 `document.body`에 붙인다. 씬 교체(reset)가 stage를 비워도 이 겹은 살아
 * 있어야, 영상이 걷히는 동안 이미 세워진 보스전이 그 아래에서 드러날 수 있다.
 */

import { GameAudio } from '@/audio/GameAudio'
import { acquireVideo, releaseVideo } from '@/ui/ResourceLibrary'
import { STRICT_RESOURCE_LOADING } from '@/config/edition'

interface Opts {
  /** 재생할 webm. */
  src: string
  /**
   * 영상이 끝나 마지막 프레임을 붙든 시점에 호출한다 — 여기서 보스전을 세운다.
   * Promise를 돌려주면 그게 끝날 때까지 마지막 프레임을 붙들고 기다린다. 전장 준비는
   * 리소스 로딩을 포함해 몇 백 ms가 걸리므로, 기다리지 않으면 커튼이 먼저 걷혀
   * 아직 살아 있는 전리품 화면이 잠깐 다시 드러난 뒤에야 전장이 뜬다.
   */
  onCurtainReady: () => void | Promise<void>
  /** 영상까지 완전히 걷혀 전장만 남은 시점. */
  onDone: () => void
}

/** 까매지는 시간. 전리품 화면이 사라지는 것과 같은 호흡으로 잡는다. */
const FADE_TO_BLACK_MS = 620
/** 완전한 암전에서 숨을 고르는 정적. 너무 길면 로딩처럼 읽힌다. */
const BLACK_HOLD_MS = 420
/** 마지막 프레임을 붙든 채 전장이 세워질 때까지 두는 시간. */
const CURTAIN_HOLD_MS = 240
/** 영상이 걷히며 전장이 드러나는 시간. 길게 겹쳐야 그림과 전장이 이어져 보인다. */
const REVEAL_MS = 900

export class BossCinematic {
  private el: HTMLElement
  private video: HTMLVideoElement
  private timers: number[] = []
  private finished = false
  private opts: Opts

  constructor(opts: Opts) {
    this.opts = opts
    this.el = document.createElement('div')
    this.el.className = 'boss-cine'
    this.el.setAttribute('aria-hidden', 'true')
    this.el.innerHTML = '<button class="boss-cine-skip" type="button">건너뛰기</button>'
    // 영상 요소는 공용 자원 풀에서 받는다 — 마크업에 직접 박으면 장면이 바뀔 때마다
    // 미디어 파이프라인을 새로 열게 되고, resources:check도 그걸 막는다.
    this.video = acquireVideo({ key: 'boss-cinematic-1', src: opts.src, type: 'video/webm' })
    this.video.className = 'boss-cine-video'
    this.el.prepend(this.video)
    document.body.appendChild(this.el)
    // 자동재생 정책에 막히지 않게 음소거로 시작한다. 배경음은 게임이 따로 깐다.
    this.video.muted = true

    this.el.querySelector<HTMLButtonElement>('.boss-cine-skip')?.addEventListener('click', () => this.skip())
    this.video.addEventListener('ended', () => void this.raiseCurtain())
    // 코덱·네트워크 문제로 못 틀어도 보스전으로는 반드시 넘어가야 한다.
    this.video.addEventListener('error', () => void this.raiseCurtain())

    void this.run()
  }

  destroy() {
    this.timers.forEach((t) => clearTimeout(t))
    this.timers = []
    this.video.pause()
    // 다음 회차에 다시 쓸 수 있게 풀로 돌려준다.
    releaseVideo(this.video)
    this.el.remove()
  }

  /** 사용자가 끊으면 남은 재생을 버리고 곧바로 전장을 연다. */
  private skip() {
    if (this.finished) return
    this.video.pause()
    void this.raiseCurtain()
  }

  private async run() {
    // ① 까매진다.
    await this.raf()
    this.el.classList.add('is-black')
    await this.wait(FADE_TO_BLACK_MS + BLACK_HOLD_MS)
    if (this.finished) return

    // ② 영상이 밝아지며 시작한다.
    this.el.classList.add('is-playing')
    try {
      this.video.currentTime = 0
      await this.video.play()
    } catch {
      // 재생이 거부되면 커튼만 올리고 넘어간다.
      await this.raiseCurtain()
    }
  }

  /**
   * 마지막 프레임을 붙든 채 전장을 세우고, 영상만 걷어 낸다.
   * 영상이 먼저 사라지고 나서 전장을 세우면 검은 화면이 한 번 번뜩인다.
   *
   * 전장이 **다 세워질 때까지** 붙들고 기다린다. 준비를 기다리지 않고 걷으면
   * 그 아래에는 아직 전리품 화면이 남아 있어, 컷이 끝난 뒤에 전리품이 한 번 더
   * 스쳐 지나가고 나서야 다음 층이 뜬다(순서가 뒤집혀 보이는 원인).
   */
  private async raiseCurtain() {
    if (this.finished) return
    this.finished = true
    this.video.pause() // 마지막 그림이 그대로 남는다
    this.el.classList.add('is-holding')
    // 전장 준비가 실패해도 컷은 반드시 걷어야 한다 — 여기서 멈추면 검은 화면에 갇힌다.
    try {
      await this.opts.onCurtainReady()
    } catch (error) {
      if (STRICT_RESOURCE_LOADING) throw error
      /* 준비 실패는 아래 걷기로 넘긴다 */
    }
    await this.wait(CURTAIN_HOLD_MS)
    this.el.classList.add('is-revealing')
    GameAudio.play('paperAttack')
    await this.wait(REVEAL_MS)
    this.opts.onDone()
    this.destroy()
  }

  private raf() {
    return new Promise<void>((res) => requestAnimationFrame(() => res()))
  }

  private wait(ms: number) {
    return new Promise<void>((res) => {
      this.timers.push(window.setTimeout(res, ms))
    })
  }
}
