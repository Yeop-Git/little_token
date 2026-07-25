import { EMOTION_ICON } from '@core/types'

interface Opts {
  onBack: () => void
}

/** 타이틀에서만 여는 그림일기형 전투 규칙 페이지. 전투 화면을 가리지 않는다. */
export class CombatGuideView {
  private onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.opts.onBack()
  }

  constructor(private root: HTMLElement, private opts: Opts) {
    this.mount()
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey)
  }

  private mount() {
    const emotion = (key: 'joy' | 'anger' | 'sorrow' | 'pleasure', name: string, desc: string) =>
      `<li class="guide-emotion ${key}"><b>${EMOTION_ICON[key]} ${name}</b><span>${desc}</span></li>`
    this.root.innerHTML = `
      <main class="scene guide-scene">
        <article class="guide-paper" aria-labelledby="guide-title">
          <header class="guide-head">
            <p>그림일기 전투 설명서</p>
            <h1 id="guide-title">오늘의 전투는 이렇게 쓴다</h1>
            <button type="button" class="guide-back">타이틀로 돌아가기</button>
          </header>
          <section class="guide-block">
            <h2>1. 문장 완성</h2>
            <p><b>첫 조각 → 이어 붙이기 → 마무리</b> 세 장을 고른다. 앞 카드의 출구 기호와 다음 카드의 입구 기호가 맞으면 연결 배율이 오른다.</p>
          </section>
          <section class="guide-grid">
            <div class="guide-block">
              <h2>2. 감정 공명</h2>
              <ul class="guide-emotions">
                ${emotion('joy', '기쁨', '밝게 번지는 마음')}
                ${emotion('anger', '분노', '세게 밀어붙이는 마음')}
                ${emotion('sorrow', '슬픔', '젖은 잉크처럼 남는 마음')}
                ${emotion('pleasure', '즐거움', '신나게 튀는 마음')}
              </ul>
              <p>같은 감정 2장은 <b>×1.15</b>, 3장은 <b>×1.30</b> 공명. <b>무감정</b> 카드는 공명에 참여하지 않는다.</p>
            </div>
            <div class="guide-block">
              <h2>3. 적의 약점</h2>
              <p>적 HP바 옆 감정이 약점이다. 그 감정이 문장에 있으면 피해가 <b>×1.25</b>가 된다.</p>
              <h2>4. 방어와 타격</h2>
              <p><b>방어막</b>은 피해를 먼저 받는다. <b>관통</b>은 방어막을 무시한다. <b>매직실드</b>는 한 타격을 막으므로 <b>연타</b>로 벗긴다.</p>
            </div>
          </section>
          <section class="guide-block guide-footer-note">
            <h2>5. 특수 카드</h2>
            <p><b>2명·3명</b> 공격은 앞줄부터 100% → 70% → 50% 피해. <b>카운터</b>는 실제로 막은 피해를 즉시 되돌린다.</p>
          </section>
        </article>
      </main>`
    this.root.querySelector<HTMLButtonElement>('.guide-back')!.addEventListener('click', this.opts.onBack)
    window.addEventListener('keydown', this.onKey)
  }
}
