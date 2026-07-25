import { BACKGROUNDS } from '@/assets'

interface Opts {
  day: number
  onNewRun: () => void
  onTitle: () => void
}

/** Terminal result page for a run; battle state is intentionally not retained here. */
export class DefeatView {
  private acted = false

  constructor(private root: HTMLElement, private opts: Opts) {
    this.mount()
  }

  destroy() {}

  private mount() {
    this.root.innerHTML = `
      <main class="scene defeat-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="defeat-paper" role="status" aria-live="polite">
          <div class="defeat-kicker">DIARY LOST</div>
          <h1 class="hand">일기장이 너무 상했다…</h1>
          <p class="defeat-day">${this.opts.day}일째, 벌레 무리가 이야기를 갉아먹었다.</p>
          <p class="defeat-note">이번 일기는 여기까지. 새 페이지에서 다시 이야기를 지켜 보자.</p>
          <div class="defeat-actions">
            <button class="defeat-new" type="button" data-act="new">새 일기 시작</button>
            <button class="defeat-title" type="button" data-act="title">타이틀로</button>
          </div>
        </div>
      </main>`

    this.root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((button) =>
      button.addEventListener('click', () => this.act(button.dataset.act ?? '')),
    )
    this.root.querySelector<HTMLButtonElement>('[data-act="new"]')?.focus()
  }

  private act(action: string) {
    if (this.acted) return
    this.acted = true
    if (action === 'new') this.opts.onNewRun()
    else this.opts.onTitle()
  }
}
