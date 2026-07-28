/**
 * 오프닝 다이얼로그 — 토큰의 첫 만남 컷신.
 * 전투 무대 위에 어두운 딤이 깔리고, 하단 대화창 + 상단 표정 초상(잔상 2겹)이
 * 글자별 바운스 타자로 대사를 출력한다. `p`(플레이어) 대사는 버튼이 아니라
 * 인게임 맥락조합의 축소 체험: 단어 칩을 단방향으로 하나씩 골라 문장을 만든다.
 * 표시/연출 전담 — 전투 상태는 건드리지 않고 끝나면 onComplete만 부른다.
 */

import { TOKEN_FACES } from '@/assets'
import type { Word } from '@core/types'
import { wordCardInnerHtml, wordMood } from '@/ui/WordCardFace'

export interface IntroDialogueHandlers {
  /** 마지막 대사 후(또는 SKIP) 딤이 걷히고 대화창이 사라진 뒤 호출된다. */
  onComplete: () => void
}

type Portrait = keyof typeof TOKEN_FACES

type ScriptLine =
  | { kind: 'token'; portrait: Portrait; text: string }
  /** 플레이어 대사 — 단어 칩을 순서대로 골라 문장을 조립한다. */
  | { kind: 'player'; words: string[] }

const TOKEN_NAME = '토큰'
const PLAYER_NAME = '프롬'

// 타자 속도와, 다 출력된 뒤 클릭 진행 게이트: ADVANCE_LOCK_MS 동안 무시 →
// 이후 클릭 또는 ADVANCE_TIMEOUT_MS 경과 시 다음 대사.
const TYPE_MS = 32
const ADVANCE_LOCK_MS = 750
const ADVANCE_TIMEOUT_MS = 6000
// 플레이어가 직접 완성한 문장은 여운만 짧게 두고 이어간다.
const PLAYER_ADVANCE_TIMEOUT_MS = 2800
const PORTRAIT_SWAP_OUT_MS = 110
const PORTRAIT_SWAP_IN_MS = 260

const SCRIPT: ScriptLine[] = [
  { kind: 'token', portrait: 'neutral', text: '어서 일어나!' },
  { kind: 'player', words: ['. . . 여긴 어디야?'] },
  { kind: 'token', portrait: 'neutral', text: '이런... 설마 또 기억을 잃은 거야?' },
  { kind: 'player', words: ['기억을', '잃다니', '무슨', '소리야.'] },
  { kind: 'token', portrait: 'sad', text: '젠장... 또 이야기를 빼앗겼다니!' },
  { kind: 'token', portrait: 'sad', text: '괜찮아...' },
  { kind: 'token', portrait: 'neutral', text: '다시 되찾을 수 있으니까. 매번 그래왔잖아 그치?' },
  { kind: 'player', words: ['아무것도', '기억이', '안 나.'] },
  { kind: 'token', portrait: 'neutral', text: '내가 다시 차근차근 알려줄게.' },
  { kind: 'token', portrait: 'smile', text: '우린 최고의 파트너니까!' },
  { kind: 'token', portrait: 'smile', text: '같은 색 감정을 모으면 강력한 힘이 나가!' },
  { kind: 'token', portrait: 'smile', text: '우선 눈 앞에 이야기를 좀먹는 녀석들을 처리해야해!' },
  { kind: 'player', words: ['그게', '누군데?'] },
]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export class IntroDialogue {
  private readonly root: HTMLElement
  private readonly stageEl: HTMLElement
  private readonly portraitMain: HTMLImageElement
  private readonly portraitShadow: HTMLImageElement
  private readonly boxEl: HTMLElement
  private readonly nameEl: HTMLElement
  private readonly textEl: HTMLElement
  private readonly choiceEl: HTMLElement

  private skipTyping: (() => void) | null = null
  private advanceNow: (() => void) | null = null
  private advanceForce: (() => void) | null = null
  private currentPortrait: Portrait | null = null
  /**
   * 첫 단어 칩에만 "여길 눌러" 화살표를 띄웠는지. 발광만으로는 이게 눌러야 하는
   * 물건인 줄 모르고 넘어가는 사람이 있어서, 처음 한 번만 크게 손가락질한다.
   */
  private hintedFirstChoice = false
  // SKIP — 남은 스크립트를 버리고 곧장 finish()로 점프한다.
  private skipped = false
  private finishStarted = false
  private destroyed = false

  constructor(
    root: HTMLElement,
    private readonly handlers: IntroDialogueHandlers,
  ) {
    this.root = document.createElement('div')
    this.root.className = 'intro-dialogue'
    this.root.innerHTML = `
      <div class="intro-dlg-dim" aria-hidden="true"></div>
      <div class="intro-dlg-stage" aria-hidden="true">
        <img class="intro-dlg-portrait-shadow" alt="" />
        <img class="intro-dlg-portrait-main" alt="" />
      </div>
      <div class="intro-dlg-choice" aria-label="대사 단어 선택"></div>
      <div class="intro-dlg-box">
        <div class="intro-dlg-box-inner">
          <div class="intro-dlg-name">${TOKEN_NAME}</div>
          <div class="intro-dlg-divider" aria-hidden="true"></div>
          <div class="intro-dlg-text"></div>
          <span class="intro-dlg-next" aria-hidden="true"></span>
        </div>
      </div>
      <button type="button" class="intro-dlg-skip">SKIP ▸</button>`
    root.appendChild(this.root)

    this.stageEl = this.root.querySelector('.intro-dlg-stage') as HTMLElement
    this.portraitMain = this.root.querySelector('.intro-dlg-portrait-main') as HTMLImageElement
    this.portraitShadow = this.root.querySelector('.intro-dlg-portrait-shadow') as HTMLImageElement
    this.boxEl = this.root.querySelector('.intro-dlg-box') as HTMLElement
    this.nameEl = this.root.querySelector('.intro-dlg-name') as HTMLElement
    this.textEl = this.root.querySelector('.intro-dlg-text') as HTMLElement
    this.choiceEl = this.root.querySelector('.intro-dlg-choice') as HTMLElement

    this.root.addEventListener('click', () => this.handleClick())
    const skipBtn = this.root.querySelector('.intro-dlg-skip') as HTMLButtonElement
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation() // 대사 진행 클릭과 겹치지 않게
      this.handleSkip()
    })

    void this.play()
  }

  /** 씬 전환 등 외부 파기 — 진행 중인 루프는 조용히 빠져나가고 onComplete는 안 부른다. */
  destroy(): void {
    this.destroyed = true
    this.finishStarted = true
    this.skipped = true
    this.skipTyping?.()
    this.advanceForce?.()
    this.root.remove()
  }

  private handleSkip(): void {
    if (this.skipped || this.finishStarted) return
    this.skipped = true
    this.skipTyping?.()
    this.advanceForce?.()
  }

  private handleClick(): void {
    if (this.skipTyping) {
      this.skipTyping()
      return
    }
    this.advanceNow?.()
  }

  private async play(): Promise<void> {
    requestAnimationFrame(() => this.root.classList.add('is-dim-visible'))
    await wait(650)
    this.root.classList.add('is-box-visible')
    await wait(250)

    for (const line of SCRIPT) {
      if (this.skipped) break
      if (line.kind === 'token') await this.showLine(line.portrait, line.text)
      else await this.showChoiceLine(line.words)
    }
    if (!this.destroyed) await this.finish()
  }

  /** 화자 전환 — 이름/톤을 토큰(청색)·프롬(금빛)로 스르륵 갈아끼운다. */
  private setSpeaker(speaker: 'token' | 'player'): void {
    this.nameEl.textContent = speaker === 'token' ? TOKEN_NAME : PLAYER_NAME
    this.boxEl.classList.toggle('is-player-line', speaker === 'player')
  }

  /** 초상 스왑 — 첫 등장은 페이드인, 이후엔 잔상과 함께 빠르게 교체된다. */
  private setPortrait(portrait: Portrait): void {
    if (this.currentPortrait === portrait) return
    const first = this.currentPortrait === null
    this.currentPortrait = portrait
    const src = TOKEN_FACES[portrait]

    if (first) {
      this.portraitMain.src = src
      this.portraitShadow.src = src
      requestAnimationFrame(() => this.stageEl.classList.add('is-portrait-visible'))
      return
    }

    this.portraitMain.classList.add('is-swap-out')
    window.setTimeout(() => {
      this.portraitMain.src = src
      this.portraitShadow.src = src
      this.portraitMain.classList.remove('is-swap-out')
      this.portraitMain.classList.add('is-swap-in')
      window.setTimeout(() => this.portraitMain.classList.remove('is-swap-in'), PORTRAIT_SWAP_IN_MS)
    }, PORTRAIT_SWAP_OUT_MS)
  }

  /** 글자별 팝인 타자 — 클릭 시 남은 글자 즉시 완성. */
  private typeText(text: string): Promise<void> {
    let revealed = 0
    let fastForward = false
    return new Promise<void>((resolve) => {
      this.skipTyping = () => {
        fastForward = true
      }
      const timer = window.setInterval(() => {
        const target = fastForward ? text.length : revealed + 1
        while (revealed < target) {
          // 드러나는 순간 글자마다 span을 붙여 "다라라락 띠용띠용" 바운스를 낸다.
          const span = document.createElement('span')
          span.className = 'intro-dlg-char'
          // inline-block은 낱개 공백을 자기 포맷 문맥의 여백으로 지워버린다 — nbsp로 보존.
          span.textContent = text[revealed] === ' ' ? ' ' : text[revealed]
          this.textEl.appendChild(span)
          revealed++
        }
        if (revealed >= text.length) {
          window.clearInterval(timer)
          this.skipTyping = null
          resolve()
        }
      }, TYPE_MS)
    })
  }

  /** 완성된 대사의 진행 게이트 — 잠금 후 클릭 또는 타임아웃으로 넘어간다. */
  private waitAdvance(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let locked = true
      const finish = (): void => {
        window.clearTimeout(unlockTimer)
        window.clearTimeout(autoTimer)
        this.boxEl.classList.remove('is-waiting')
        this.advanceNow = null
        this.advanceForce = null
        resolve()
      }
      const unlockTimer = window.setTimeout(() => {
        locked = false
        // 이제부터 클릭이 먹는다 — 말풍선에 "누르세요" 화살표를 띄운다.
        this.boxEl.classList.add('is-waiting')
      }, ADVANCE_LOCK_MS)
      const autoTimer = window.setTimeout(finish, timeoutMs)
      this.advanceNow = () => {
        if (!locked) finish()
      }
      // SKIP은 잠금을 무시한다.
      this.advanceForce = finish
    })
  }

  private async showLine(portrait: Portrait, text: string): Promise<void> {
    this.setSpeaker('token')
    this.setPortrait(portrait)
    this.textEl.textContent = ''
    this.textEl.classList.remove('is-line-settled')

    await this.typeText(text)
    this.textEl.classList.add('is-line-settled')
    // SKIP이 타자 중에 걸렸다면 진행 게이트를 기다리지 않는다.
    if (this.skipped) return
    await this.waitAdvance(ADVANCE_TIMEOUT_MS)
  }

  /** 플레이어 대사 — 인게임 맥락조합의 맛보기. 대화창 위에 단어 칩이 순서대로
   * 떠오르고, 지금 고를 수 있는 칩(맨 앞)만 손짓하듯 발광한다. 고른 단어는
   * 그대로 대화창 문장에 타자되어 이어붙는다. */
  private async showChoiceLine(words: string[]): Promise<void> {
    this.setSpeaker('player')
    this.textEl.textContent = ''
    this.textEl.classList.remove('is-line-settled')

    // 초상이 좌측으로 비켜서고 중앙 무대가 단어 칩 차지가 된다
    this.root.classList.add('is-choice')
    this.choiceEl.innerHTML = ''
    this.choiceEl.classList.remove('is-leaving')
    const chips = words.map((word, i) => {
      const cardWord: Word = {
        id: `tutorial-dialogue-${i}`,
        text: word,
        slot: 'dialogue',
        tags: [],
        emotion: 'neutral',
        note: '문장에 넣기',
        rarity: 'common',
      }
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = `intro-word-chip word-card mood-${wordMood(cardWord)} emotion-neutral rarity-common is-entering`
      chip.dataset.word = word
      chip.setAttribute('aria-label', `${word} 선택`)
      chip.innerHTML = wordCardInnerHtml(cardWord, {
        note: '문장에 넣기',
        footer: `${i + 1}번째 단어`,
      })
      chip.disabled = true
      chip.style.setProperty('--chip-delay', `${i * 90}ms`)
      // 이 런에서 처음 마주하는 선택 — 칩 위에 큰 화살표가 점멸하며 내려찍는다.
      if (i === 0 && !this.hintedFirstChoice) {
        chip.dataset.hint = 'first'
        this.hintedFirstChoice = true
      }
      this.choiceEl.appendChild(chip)
      window.setTimeout(() => chip.classList.remove('is-entering'), 60 + i * 90)
      return chip
    })

    let picked = 0
    const pickNext = (): Promise<void> =>
      new Promise<void>((resolve) => {
        const chip = chips[picked]
        chip.disabled = false
        chip.classList.add('is-next')
        const onPick = async (e: MouseEvent): Promise<void> => {
          e.stopPropagation() // 배경 클릭(타자 스킵/진행)과 분리
          chip.removeEventListener('click', onPick)
          chip.disabled = true
          chip.classList.remove('is-next')
          chip.classList.add('is-done')
          delete chip.dataset.hint // 한 번 눌렀으면 손가락질은 그만둔다
          const selectedWord = chip.dataset.word ?? ''
          const text = picked === 0 ? selectedWord : ` ${selectedWord}`
          picked++
          await this.typeText(text)
          resolve()
        }
        chip.addEventListener('click', onPick)
        // SKIP — 남은 단어를 전부 자동 완성하고 빠져나간다.
        this.advanceForce = () => {
          chip.removeEventListener('click', onPick)
          const rest = words.slice(picked).join(' ')
          this.textEl.textContent = (this.textEl.textContent ?? '') + (picked === 0 ? rest : ` ${rest}`)
          picked = words.length
          resolve()
        }
      })

    while (picked < words.length && !this.skipped) await pickNext()
    this.advanceForce = null

    this.textEl.classList.add('is-line-settled')
    this.root.classList.remove('is-choice')
    this.choiceEl.classList.add('is-leaving')
    window.setTimeout(() => {
      this.choiceEl.innerHTML = ''
      this.choiceEl.classList.remove('is-leaving')
    }, 480)
    if (this.skipped) return
    await this.waitAdvance(PLAYER_ADVANCE_TIMEOUT_MS)
  }

  /** 마무리 — 딤이 걷혀 무대가 드러나고 대화창/초상이 슈루룩 사라진 뒤
   * onComplete(적들이 천천히 밀려들어오는 시작 연출)로 넘긴다. */
  private async finish(): Promise<void> {
    if (this.finishStarted) return
    this.finishStarted = true
    this.root.classList.add('is-dim-clearing')
    await wait(1000)
    this.root.classList.add('is-gone')
    await wait(600)
    this.root.remove()
    this.handlers.onComplete()
  }
}
