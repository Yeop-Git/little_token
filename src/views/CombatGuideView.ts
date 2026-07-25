import { EMOTION_ICON } from '@core/types'
import { GUIDE_ART } from '@/assets'

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
            <button type="button" class="guide-back guide-back-top">← 뒤로 돌아가기</button>
          </header>
          <section class="guide-block">
            <h2>1. 문장 완성</h2>
            <p><b>첫 조각(주어) → 이어 붙이기(수식) → 마무리(동사)</b> 순서로 세 장을 고른다. 주어와 수식은 문장 배율을 보태고, 동사는 공격·방어·회복처럼 문장이 실제로 할 일을 정한다. 카드에 적힌 <b>위력·배율·효과</b>가 완성 문장의 결과가 된다.</p>
            <div class="guide-steps" aria-label="문장 만들기 순서">
              <div><b>① 주어</b><span>문장의 시작과 대상 방향</span></div>
              <div><b>② 수식</b><span>배율·대성공을 보태기</span></div>
              <div><b>③ 동사</b><span>공격·방어·회복 실행</span></div>
            </div>
          </section>
          <figure class="guide-figure">
            <img src="${GUIDE_ART.combat}" alt="세 장의 카드 연결, 감정 공명, 방어막과 매직실드, 다중 대상 공격을 보여 주는 그림일기 전투 안내 그림">
            <figcaption>카드를 이어 문장을 만들고, 감정을 맞춰 더 크게 공격한다.</figcaption>
          </figure>
          <section class="guide-grid">
            <div class="guide-block">
              <h2>2. 감정 공명</h2>
              <ul class="guide-emotions">
                ${emotion('joy', '기쁨', '밝게 번지는 마음')}
                ${emotion('anger', '분노', '세게 밀어붙이는 마음')}
                ${emotion('sorrow', '슬픔', '젖은 잉크처럼 남는 마음')}
                ${emotion('pleasure', '즐거움', '신나게 튀는 마음')}
              </ul>
              <p>같은 감정 2장은 <b>×1.15</b>, 3장은 <b>×1.30</b> 공명이다. 주어도 공명에 참여한다. <b>무감정</b> 카드는 효과는 그대로지만 공명 수에는 세지 않는다.</p>
              <h2>3. 맥락과 배율</h2>
              <p>카드의 태그 조합이 관용구 조건을 채우면 <b>완벽한 맥락</b>이 발동해 배율이 더해진다. 카드 상세의 <b>가능한 맥락</b>은 지금 가진 덱에서 그 카드와 이어 볼 수 있는 조합이다. 어긋나는 태그 조합은 카드가 이유와 함께 배율 감소로 표시한다.</p>
            </div>
            <div class="guide-block">
              <h2>4. 적의 약점</h2>
              <p>적 HP바 옆 감정이 약점이다. 그 감정이 문장에 있으면 피해가 <b>×1.25</b>가 된다.</p>
              <h2>5. 방어와 타격</h2>
              <p><b>방어막</b>은 피해를 먼저 받으며, <b>관통</b>은 이를 무시하고 방어막도 깎지 않는다. <b>매직실드</b>는 한 타격을 완전히 막고 1겹을 소비한다. 관통도 매직실드는 넘지 못하므로 <b>연타</b>로 먼저 벗길 수 있다.</p>
            </div>
          </section>
          <section class="guide-grid guide-grid-lower">
            <div class="guide-block">
              <h2>6. 특수 카드 읽기</h2>
              <ul class="guide-rules">
                <li><b>2명·3명</b> — 앞줄부터 <b>100% → 70% → 50%</b> 피해.</li>
                <li><b>전체</b> — 살아 있는 모든 적을 같은 위력으로 공격.</li>
                <li><b>2연타·3연타</b> — 최전방 하나만 여러 번 타격. 쓰러지면 남은 타격은 다음 적으로 넘지 않는다.</li>
                <li><b>다음 턴 발동</b> — 타격 수·범위·관통·감정까지 보존해 다음 턴에 실행.</li>
              </ul>
            </div>
            <div class="guide-block">
              <h2>7. 턴과 카운터</h2>
              <p>문장을 완성하면 방어 효과를 먼저 준비한다. 그다음 <b>선공 적 → 내 문장 → 후공 적</b> 순으로 처리한다. 방어는 피해를 흡수한 만큼만 줄고 남은 양은 유지되며, 새 방어는 기존 방어에 합산된다.</p>
              <p class="guide-tight"><b>카운터</b>는 방어가 실제로 흡수한 피해에 카드의 계수를 곱해 즉시 최전방 적에게 되돌린다. 예: 방어로 4를 막고 카운터 ×1.50이면 6 피해.</p>
            </div>
          </section>
          <section class="guide-block guide-footer-note">
            <h2>8. 승리 뒤</h2>
            <p>모든 적을 쓰러뜨리면 단어 카드 또는 아이템 전리품 중 하나를 고른다. 단어 카드는 새 선택지를 늘리고, 같은 카드를 다시 얻으면 강화된다. 전리품 카드의 감정 스티커도 공명 경로를 고를 때 참고하면 좋다.</p>
            <button type="button" class="guide-back guide-back-bottom">← 뒤로 돌아가기</button>
          </section>
        </article>
      </main>`
    this.root.querySelectorAll<HTMLButtonElement>('.guide-back').forEach((button) => button.addEventListener('click', this.opts.onBack))
    window.addEventListener('keydown', this.onKey)
  }
}
