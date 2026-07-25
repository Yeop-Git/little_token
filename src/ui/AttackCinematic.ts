/**
 * 공격 액션 컷 — 수치가 크게 부풀었을 때 왼쪽에서 정보 패널처럼 밀려 들어오는 영상.
 *
 * 두 편이 있고 무엇이 나오는지가 곧 그 일격의 등급이다.
 *   pump  이번 문장이 이 판을 크게 깎아낸다
 *   wipe  그 일격이 남은 적을 전부 쓸어버린다
 *
 * 영상은 전투가 시작될 때 화면 밖에서 미리 다 받아 둔다. 터질 때 비로소 받기 시작하면
 * 가장 짜릿해야 할 순간에 검은 사각형이 먼저 뜬다 — 그래서 붙자마자 preload한다.
 *
 * 재생은 끝까지 가지 않는다. 컷의 뒷부분은 대개 힘이 빠지는 구간이라, 한창일 때
 * 끊고 다시 왼쪽으로 밀어 치운다. 들어올 때보다 나갈 때가 빨라야 전투가 안 늘어진다.
 */

import { VIDEO } from '@/assets'
import {
  acquireVideo,
  isVideoWarmed,
  markVideoWarmed,
  releaseVideo,
} from '@/ui/ResourceLibrary'

export type AttackCut = 'pump' | 'wipe'

/** 들어오고 나가는 데 걸리는 시간. style.css의 .atk-cine 트랜지션과 같아야 한다. */
const IN_MS = 340
const OUT_MS = 260
/**
 * 영상을 얼마나 보여줄지(최대). 컷이 이보다 짧으면 아래 END_LEAD_MS 규칙이 먼저 걸린다.
 * 전투 한 턴에 끼어드는 연출이라 길면 흐름이 끊긴다.
 */
const HOLD_MS = 780
/** 끝나기 이만큼 전에 끊는다 — 마지막 프레임까지 보여주면 힘이 빠진 채로 나간다. */
const END_LEAD_MS = 420

export class AttackCinematic {
  private el: HTMLElement
  private videos: Record<AttackCut, HTMLVideoElement>
  private warmups = new Map<AttackCut, Promise<void>>()
  private readonly readyCuts = new Set<AttackCut>()
  private idleWarmup = 0
  private timers = new Map<number, () => void>()
  private playing = false
  private lastPlayedAt = -Infinity
  private destroyed = false

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'atk-cine'
    this.el.setAttribute('aria-hidden', 'true')
    this.el.innerHTML = `
      <div class="atk-cine-frame">
        <div class="atk-cine-sheen" aria-hidden="true"></div>
        <div class="atk-cine-edge" aria-hidden="true"></div>
      </div>`
    const pump = this.acquireCut('pump', VIDEO.attack1)
    const wipe = this.acquireCut('wipe', VIDEO.attack2)
    this.el.querySelector<HTMLElement>('.atk-cine-frame')!.prepend(pump, wipe)
    host.appendChild(this.el)
    this.videos = { pump, wipe }
    // preload/load는 파일만 먼저 가져올 뿐 첫 프레임 디코딩과 GPU 업로드까지
    // 보장하지 않는다. 전투 첫 화면을 그린 뒤 한가한 틈에 실제로 한 프레임씩
    // 재생해 두면, 컷이 터지는 순간 미디어 파이프라인이 처음 열리며 끊기지 않는다.
    this.idleWarmup = this.requestIdleWarmup(() => {
      void this.warm('pump').then(() => this.warm('wipe'))
    }, 3600)
  }

  destroy() {
    if (this.destroyed) return
    this.destroyed = true
    this.cancelIdleWarmup(this.idleWarmup)
    this.idleWarmup = 0
    for (const [timer, resolve] of this.timers) {
      clearTimeout(timer)
      resolve()
    }
    this.timers.clear()
    this.playing = false
    this.el.classList.remove('is-in', 'is-out')
    for (const v of Object.values(this.videos)) {
      releaseVideo(v)
    }
    this.el.remove()
  }

  /**
   * 한 편을 끌어와 보여주고 스스로 물러난다. 끝날 때까지 기다린다.
   * 이미 재생 중이면 겹쳐 틀지 않는다 — 한 턴에 두 번 터질 일은 없지만,
   * 겹치면 패널이 두 번 밀려 들어오는 꼴이 된다.
   */
  async play(cut: AttackCut): Promise<void> {
    if (!this.open(cut)) return
    await this.wait(IN_MS + this.holdMsFor(cut))
    await this.close()
  }

  /**
   * 패널만 밀어 넣고 바로 반환한다 — 물러날 시점은 부르는 쪽이 정한다.
   * 강타 연출은 프롬이 검을 들어올린 채 멈춘 동안 이 패널을 겹쳐 틀고,
   * 내리치기 시작할 때 close()로 치운다. 컷과 칼질이 한 절정에 모여야 한다.
   * @returns 이번에 열렸는지 — 재생 중이거나 아직 안 데워졌거나 쿨다운이면 false.
   */
  open(cut: AttackCut): boolean {
    const now = performance.now()
    if (this.destroyed || this.playing || !this.readyCuts.has(cut) || now - this.lastPlayedAt < 4500) return false
    this.playing = true
    this.lastPlayedAt = now
    const video = this.videos[cut]

    // 아직 데워지지 않은 컷은 기다리지 않고 건너뛴다(위 readyCuts 검사) — 가장
    // 짜릿해야 할 순간에 검은 첫 프레임을 내보내거나 턴을 붙잡는 쪽이 더 나쁘다.
    if (this.destroyed) {
      this.playing = false
      return false
    }

    this.el.dataset.cut = cut
    video.currentTime = 0
    this.el.classList.remove('is-out')
    this.el.classList.add('is-in')
    void video.play().catch(() => {}) // 못 틀어도 패널 자체는 지나가게 둔다
    return true
  }

  /** 한창일 때 멈춘 그림을 그대로 들고 물러난다. 다 치워질 때까지 기다린다. */
  async close(): Promise<void> {
    if (!this.playing) return
    for (const v of Object.values(this.videos)) v.pause()
    this.el.classList.remove('is-in')
    this.el.classList.add('is-out')
    await this.wait(OUT_MS)
    if (this.destroyed) return
    this.el.classList.remove('is-out')
    this.playing = false
  }

  /** 들어온 뒤 얼마나 붙들고 있을지. 컷이 짧으면 끝자락을 남기고 끊는다. */
  holdMsFor(cut: AttackCut): number {
    const video = this.videos[cut]
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : Infinity
    return Math.max(600, Math.min(HOLD_MS, dur - END_LEAD_MS))
  }

  /** 패널이 밀려 들어오는 데 걸리는 시간 — 강타 연출이 정점 정지 길이를 맞출 때 본다. */
  get enterMs(): number {
    return IN_MS
  }

  private warm(cut: AttackCut): Promise<void> {
    const video = this.videos[cut]
    if (isVideoWarmed(video)) {
      this.readyCuts.add(cut)
      return Promise.resolve()
    }
    const current = this.warmups.get(cut)
    if (current) return current

    const warmup = this.warmVideo(video).then((ready) => {
      if (ready) this.readyCuts.add(cut)
      else this.warmups.delete(cut)
    })
    this.warmups.set(cut, warmup)
    return warmup
  }

  /**
   * 첫 영상 프레임을 디코더와 합성기에 한 번 통과시킨 뒤 0초로 되감는다.
   * 네트워크/코덱 오류가 있어도 컷 패널 자체의 진행은 막지 않는다.
   */
  private async warmVideo(video: HTMLVideoElement): Promise<boolean> {
    try {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await this.onceOrTimeout(video, 'loadeddata', 4000)
      }
      if (this.destroyed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false

      video.currentTime = 0
      await video.play()
      await this.firstVideoFrameOrTimeout(video, 700)
      if (this.destroyed) return false
      video.pause()
      video.currentTime = 0
      markVideoWarmed(video)
      return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    } catch {
      if (!this.destroyed) video.pause()
      // 재생 시점의 기존 fallback이 처리한다. 워밍업 실패는 전투를 막을 이유가 없다.
      return false
    }
  }

  private acquireCut(cut: AttackCut, src: string): HTMLVideoElement {
    const video = acquireVideo({ key: `attack-${cut}`, src, type: 'video/webm' })
    video.className = 'atk-cine-video'
    video.dataset.cut = cut
    return video
  }

  private onceOrTimeout(target: EventTarget, event: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let timer = 0
      const finish = () => {
        target.removeEventListener(event, finish)
        clearTimeout(timer)
        this.timers.delete(timer)
        resolve()
      }
      target.addEventListener(event, finish, { once: true })
      timer = window.setTimeout(finish, ms)
      this.timers.set(timer, finish)
    })
  }

  private firstVideoFrameOrTimeout(video: HTMLVideoElement, ms: number): Promise<void> {
    return new Promise((resolve) => {
      let done = false
      let timer = 0
      let frameId: number | null = null
      const frameVideo = video as HTMLVideoElement & {
        requestVideoFrameCallback?: (callback: () => void) => number
        cancelVideoFrameCallback?: (handle: number) => void
      }
      const onTimeUpdate = () => finish()
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        this.timers.delete(timer)
        video.removeEventListener('timeupdate', onTimeUpdate)
        if (frameId != null) frameVideo.cancelVideoFrameCallback?.(frameId)
        resolve()
      }
      timer = window.setTimeout(finish, ms)
      this.timers.set(timer, finish)
      if (typeof frameVideo.requestVideoFrameCallback === 'function') {
        frameId = frameVideo.requestVideoFrameCallback(() => {
          frameId = null
          finish()
        })
      }
      else video.addEventListener('timeupdate', onTimeUpdate, { once: true })
    })
  }

  private requestIdleWarmup(run: () => void, timeout = 1200): number {
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      setTimeout: typeof window.setTimeout
    }
    if (typeof idleWindow.requestIdleCallback === 'function') {
      return idleWindow.requestIdleCallback(run, { timeout })
    }
    return idleWindow.setTimeout(run, Math.min(timeout, 1600))
  }

  private cancelIdleWarmup(id: number) {
    if (!id) return
    const idleWindow = window as unknown as {
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof idleWindow.cancelIdleCallback === 'function') idleWindow.cancelIdleCallback(id)
    else clearTimeout(id)
  }

  private wait(ms: number) {
    return new Promise<void>((res) => {
      const timer = window.setTimeout(() => {
        this.timers.delete(timer)
        res()
      }, ms)
      this.timers.set(timer, res)
    })
  }
}

/**
 * 어떤 컷을 틀지 — 문턱 둘을 **동시에** 넘어야 한다.
 *
 * ① 판 크기 대비 피해 — 깡수치로 잡으면 초반엔 영영 안 터지고 후반엔 매 턴 터진다.
 *    층이 오르면 적 체력도 함께 커지므로 기준을 판 크기 비율로 두면 저절로 따라 올라간다.
 * ② 배율 — 이 연출의 이름이 '펌핑'인 이유다. 깡으로 센 한 방은 해당이 없고,
 *    맥락과 공명이 겹겹이 쌓여 곱이 부푼 문장이어야 한다.
 *
 * ①만 두면 1층(적 체력 합 12)에서 6만 넣어도 터져서 매 턴 나온다. 배율을 함께 걸면
 * 초반에도 '진짜 잘 쌓은 문장'에만 붙어서 희소성이 층과 무관하게 유지된다.
 *
 * @param dmg          이번 문장이 꽂는 피해
 * @param encounterHp  전투 시작 시 적 전체의 최대 체력 합 — 이 판의 크기
 * @param mult         이 문장에 실제로 실린 배율
 * @param wipesAll     이 일격으로 남은 적이 전부 쓰러지는가
 */
export function attackCutFor(
  dmg: number,
  encounterHp: number,
  mult: number,
  wipesAll: boolean,
): AttackCut | null {
  if (encounterHp <= 0 || dmg <= 0) return null
  if (dmg / encounterHp < PUMP_RATIO) return null
  if (mult < PUMP_MULT) return null
  return wipesAll ? 'wipe' : 'pump'
}

/** 이 판의 몇 할을 한 문장으로 지워야 컷이 붙는가. */
export const PUMP_RATIO = 0.45
/** 그와 동시에 배율이 이만큼은 실려 있어야 '펌핑'이라 부를 수 있다. */
export const PUMP_MULT = 2
