import { BACKGROUNDS } from '@/assets'

interface Opts {
  canContinue: boolean
  onContinue: () => void
  onNewGame: () => void
}

const MOTION_KEY = 'little-token.reduce-motion'

export class TitleView {
  private keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.closePanel()
  }

  constructor(private root: HTMLElement, private opts: Opts) {
    document.body.dataset.reduceMotion = String(localStorage.getItem(MOTION_KEY) === 'true')
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
        <section class="title-menu" aria-label="주 메뉴">
          <p class="title-kicker">소년의 그림일기</p>
          <nav>
            ${
              this.opts.canContinue
                ? '<button class="title-menu-button primary" data-action="continue"><span>계속하기</span><small>쓰던 이야기를 이어서</small></button>'
                : ''
            }
            <button class="title-menu-button ${this.opts.canContinue ? '' : 'primary'}" data-action="new"><span>새 게임</span><small>첫 장부터 다시 쓰기</small></button>
            <button class="title-menu-button" data-action="settings"><span>설정</span></button>
            <button class="title-menu-button" data-action="exit"><span>종료</span></button>
          </nav>
        </section>
        <div class="title-panel-backdrop" data-panel hidden>
          <section class="title-panel glass" role="dialog" aria-modal="true" aria-labelledby="title-panel-heading">
            <button class="title-panel-close" type="button" aria-label="닫기">×</button>
            <div data-panel-content></div>
          </section>
        </div>
      </main>`

    this.root.querySelector<HTMLElement>('[data-action="continue"]')?.addEventListener('click', this.opts.onContinue)
    this.root.querySelector<HTMLElement>('[data-action="new"]')?.addEventListener('click', () => {
      if (!this.opts.canContinue) {
        this.opts.onNewGame()
        return
      }
      this.openPanel(`
        <p class="title-panel-kicker">새 이야기</p>
        <h1 id="title-panel-heading">지금까지 쓴 일기를 덮을까?</h1>
        <p>새 게임을 시작하면 이 기기의 현재 진행 기록이 새로운 이야기로 바뀝니다.</p>
        <div class="title-panel-actions">
          <button class="paper-button" data-confirm-new>새로 시작하기</button>
          <button class="text-button" data-cancel>돌아가기</button>
        </div>`)
      this.root.querySelector<HTMLElement>('[data-confirm-new]')?.addEventListener('click', this.opts.onNewGame)
      this.root.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', () => this.closePanel())
    })
    this.root.querySelector<HTMLElement>('[data-action="settings"]')?.addEventListener('click', () => this.openSettings())
    this.root.querySelector<HTMLElement>('[data-action="exit"]')?.addEventListener('click', () => {
      window.close()
      this.openPanel(`
        <p class="title-panel-kicker">오늘의 일기 끝</p>
        <h1 id="title-panel-heading">창을 닫아 게임을 종료해 주세요</h1>
        <p>브라우저에서는 게임이 직접 창을 닫을 수 없어요. 진행 기록은 이 기기에 남아 있습니다.</p>
        <div class="title-panel-actions"><button class="paper-button" data-cancel>확인</button></div>`)
      this.root.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', () => this.closePanel())
    })
    this.root.querySelector<HTMLElement>('.title-panel-close')?.addEventListener('click', () => this.closePanel())
    this.root.querySelector<HTMLElement>('[data-panel]')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.closePanel()
    })
    this.root.querySelector<HTMLElement>('.title-menu-button')?.focus()
  }

  private openSettings() {
    const reduceMotion = localStorage.getItem(MOTION_KEY) === 'true'
    this.openPanel(`
      <p class="title-panel-kicker">설정</p>
      <h1 id="title-panel-heading">읽기 편한 일기장</h1>
      <label class="setting-row">
        <span><b>연출 줄이기</b><small>화면 이동과 반짝임을 줄입니다.</small></span>
        <input type="checkbox" data-reduce-motion ${reduceMotion ? 'checked' : ''}>
      </label>
      <div class="title-panel-actions"><button class="paper-button" data-cancel>완료</button></div>`)
    this.root.querySelector<HTMLInputElement>('[data-reduce-motion]')?.addEventListener('change', (event) => {
      const checked = (event.currentTarget as HTMLInputElement).checked
      localStorage.setItem(MOTION_KEY, String(checked))
      document.body.dataset.reduceMotion = String(checked)
    })
    this.root.querySelector<HTMLElement>('[data-cancel]')?.addEventListener('click', () => this.closePanel())
  }

  private openPanel(content: string) {
    const panel = this.root.querySelector<HTMLElement>('[data-panel]')!
    this.root.querySelector<HTMLElement>('[data-panel-content]')!.innerHTML = content
    panel.hidden = false
    panel.querySelector<HTMLElement>('button, input')?.focus()
  }

  private closePanel() {
    const panel = this.root.querySelector<HTMLElement>('[data-panel]')
    if (!panel || panel.hidden) return
    panel.hidden = true
    this.root.querySelector<HTMLElement>('[data-action="settings"]')?.focus()
  }
}
