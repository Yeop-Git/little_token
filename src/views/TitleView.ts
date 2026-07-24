import { BACKGROUNDS } from '@/assets'

interface Opts {
  onStart: () => void
}

export class TitleView {
  private started = false
  private keyHandler = (event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    this.start()
  }

  constructor(private root: HTMLElement, private opts: Opts) {
    this.mount()
    window.addEventListener('keydown', this.keyHandler)
  }

  destroy() {
    window.removeEventListener('keydown', this.keyHandler)
  }

  private mount() {
    this.root.innerHTML = `
      <main class="scene title-scene" style="background-image:url(${BACKGROUNDS.bg001})">
        <div class="title-shade" aria-hidden="true"></div>
        <div class="title-art-space" aria-hidden="true"></div>
        <h1 class="game-title">그림일기</h1>
        <button class="title-start" type="button" aria-label="게임 시작">
          <span>터치해서 시작</span>
        </button>
      </main>`

    this.root.querySelector<HTMLElement>('.title-start')!.addEventListener('click', () => this.start())
  }

  private start() {
    if (this.started) return
    this.started = true
    this.opts.onStart()
  }
}
