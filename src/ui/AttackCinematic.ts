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

export type AttackCut = 'pump' | 'wipe'

/** 들어오고 나가는 데 걸리는 시간. style.css의 .atk-cine 트랜지션과 같아야 한다. */
const IN_MS = 340
const OUT_MS = 260
/**
 * 영상을 얼마나 보여줄지(최대). 컷이 이보다 짧으면 아래 END_LEAD_MS 규칙이 먼저 걸린다.
 * 전투 한 턴에 끼어드는 연출이라 길면 흐름이 끊긴다.
 */
const HOLD_MS = 1500
/** 끝나기 이만큼 전에 끊는다 — 마지막 프레임까지 보여주면 힘이 빠진 채로 나간다. */
const END_LEAD_MS = 420

export class AttackCinematic {
  private el: HTMLElement
  private videos: Record<AttackCut, HTMLVideoElement>
  private timers: number[] = []
  private playing = false

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'atk-cine'
    this.el.setAttribute('aria-hidden', 'true')
    this.el.innerHTML = `
      <div class="atk-cine-frame">
        <video class="atk-cine-video" data-cut="pump" muted playsinline preload="auto">
          <source src="${VIDEO.attack1}" type="video/webm" />
        </video>
        <video class="atk-cine-video" data-cut="wipe" muted playsinline preload="auto">
          <source src="${VIDEO.attack2}" type="video/webm" />
        </video>
        <div class="atk-cine-sheen" aria-hidden="true"></div>
        <div class="atk-cine-edge" aria-hidden="true"></div>
      </div>`
    host.appendChild(this.el)
    this.videos = {
      pump: this.el.querySelector('[data-cut="pump"]')!,
      wipe: this.el.querySelector('[data-cut="wipe"]')!,
    }
    // 화면 밖에 둔 채로 먼저 받아 둔다. muted라 정책에 막히지 않는다.
    for (const v of Object.values(this.videos)) v.load()
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    for (const v of Object.values(this.videos)) {
      v.pause()
      v.querySelector('source')?.remove()
      v.removeAttribute('src')
      v.load()
    }
    this.el.remove()
  }

  /**
   * 한 편을 끌어와 보여주고 스스로 물러난다. 끝날 때까지 기다린다.
   * 이미 재생 중이면 겹쳐 틀지 않는다 — 한 턴에 두 번 터질 일은 없지만,
   * 겹치면 패널이 두 번 밀려 들어오는 꼴이 된다.
   */
  async play(cut: AttackCut): Promise<void> {
    if (this.playing) return
    this.playing = true
    const video = this.videos[cut]
    this.el.dataset.cut = cut
    video.currentTime = 0

    // 컷 길이를 알면 끝자락을 남기고 끊는다. 아직 모르면 최대치로 잡는다.
    const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : Infinity
    const hold = Math.max(600, Math.min(HOLD_MS, dur - END_LEAD_MS))

    this.el.classList.add('is-in')
    void video.play().catch(() => {}) // 못 틀어도 패널 자체는 지나가게 둔다

    await this.wait(IN_MS + hold)
    // 한창일 때 멈춘 그림을 그대로 들고 물러난다.
    video.pause()
    this.el.classList.remove('is-in')
    this.el.classList.add('is-out')
    await this.wait(OUT_MS)
    this.el.classList.remove('is-out')
    this.playing = false
  }

  private wait(ms: number) {
    return new Promise<void>((res) => {
      this.timers.push(window.setTimeout(res, ms))
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
