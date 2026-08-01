/**
 * 오프닝 다이얼로그 — 토큰의 첫 만남 컷신.
 * 전투 무대 위에 어두운 딤이 깔리고, 하단 대화창 + 상단 표정 초상(잔상 2겹)이
 * 글자별 바운스 타자로 대사를 출력한다. `p`(플레이어) 대사는 버튼이 아니라
 * 인게임 맥락조합의 축소 체험: 단어 칩을 단방향으로 하나씩 골라 문장을 만든다.
 * 표시/연출 전담 — 전투 상태는 건드리지 않고 끝나면 onComplete만 부른다.
 */

import { TOKEN_FACES, TUTORIAL_CARD_ART } from '@/assets'
import type { Emotion, Word } from '@core/types'
import { wordCardInnerHtml, wordMood } from '@/ui/WordCardFace'
import { currentLocale, t, type LocaleCode } from '@/localization'
import { SENTENCE_BASE_INK, SENTENCE_CARRY_LIMIT, SENTENCE_MAX_INK, SENTENCE_OVERDRAW_LIMIT } from '@core/ink'

export interface IntroDialogueHandlers {
  /** 마지막 대사 후(또는 SKIP) 딤이 걷히고 대화창이 사라진 뒤 호출된다. */
  onComplete: () => void
}

type Portrait = keyof typeof TOKEN_FACES

type ScriptLine =
  | { kind: 'token'; portrait: Portrait; text: string }
  /** 플레이어 대사 — 단어 칩을 순서대로 골라 문장을 조립한다. */
  | { kind: 'player'; words: string[] }

const TOKEN_NAME = t('tokenName', '토큰')
const PLAYER_NAME = t('playerName', '프롬')

type PlayerTutorialLines = readonly [readonly string[], readonly string[], readonly string[], readonly string[]]
type TokenTutorialLines = readonly [string, string, string, string, string, string, string, string, string, string, string, string, string]

/** 튜토리얼 카드도 전투 카드와 같은 희·노·애·락 색 필터를 쓴다. */
const TUTORIAL_CARD_EMOTIONS: readonly Emotion[] = ['joy', 'anger', 'sorrow', 'pleasure']

const PLAYER_LINES: Record<LocaleCode, PlayerTutorialLines> = {
  ko: [['. . . 여긴 어디야?'], ['기억을', '잃다니', '무슨', '소리야.'], ['아무것도', '기억이', '안 나.'], ['내가', '다시', '기억해낼게.']],
  en: [['. . . Where am I?'], ['What do', 'you mean,', 'lost', 'my memory?'], ["I don't", 'remember', 'anything.'], ['I', 'will surely', 'remember.']],
  ja: [['. . . ここはどこ？'], ['記憶を', 'なくしたって', 'どういう', 'こと？'], ['何も', '思い出せ', 'ない。'], ['ぼくは', 'きっと', '思い出すよ。']],
  ru: [['. . . Где я?'], ['Что значит', 'я потерял', 'свою', 'память?'], ['Я ничего', 'не', 'помню.'], ['Я', 'обязательно', 'всё вспомню.']],
  'zh-Hans': [['. . . 这里是哪里？'], ['失忆', '到底是', '什么', '意思？'], ['我什么', '都不', '记得。'], ['我', '一定会', '想起来。']],
  'zh-Hant': [['. . . 這裡是哪裡？'], ['失憶', '到底是', '什麼', '意思？'], ['我什麼', '都不', '記得。'], ['我', '一定會', '想起來。']],
}

const TOKEN_LINES: Record<LocaleCode, TokenTutorialLines> = {
  ko: [
    `어서 일어나, ${PLAYER_NAME}! 내 말 들려?`,
    '네 일기장 속이야. 이런... 설마 또 기억을 잃은 거야?',
    '이야기를 갉아먹는 벌레들이 네 기억까지 빼앗아 간 거야.',
    '그래도 괜찮아.',
    '그래도 괜찮아. 우리가 다시 써 내려가면 되니까. 내가 옆에서 차근차근 알려 줄게.',
    '걱정 마. 내가 문장 쓰는 법부터 차근차근 알려 줄게.',
    '우린 최고의 파트너니까!',
    '좋아! 주어, 수식어, 동사를 차례로 고르면 한 문장이 완성돼.',
    '앞뒤 단어가 잘 맞으면 좋은 「맥락」이 생기고, 같은 색 감정이 모이면 「공명」해서 더 강해져!',
    '마지막 동사는 때릴지, 막을지, 회복할지를 정해.',
    `문장마다 기본 잉크는 ${SENTENCE_BASE_INK}이야. 남은 건 최대 ${SENTENCE_CARRY_LIMIT}까지 이월하고, 체력으로 ${SENTENCE_OVERDRAW_LIMIT}만큼 더 써서 최대 ${SENTENCE_MAX_INK}까지 쓸 수 있어. 잉크병이 미리 알려 줄 거야!`,
    '피해가 남으면 앞의 벌레를 넘어 다음 녀석까지 이어져!',
    '그럼 눈앞에서 이야기를 갉아먹는 녀석들부터 쫓아내자!',
  ],
  en: [
    `Wake up, ${PLAYER_NAME}! Can you hear me?`,
    'You are inside your diary. Oh no... Did you lose your memory again?',
    'The bugs gnawing at the story stole your memories too.',
    'But it is all right.',
    'But it is all right. We can write it all back. I will stay beside you and guide you step by step.',
    'Do not worry. I will teach you how to build a sentence, one step at a time.',
    'We are the best partners, after all!',
    'Good! Choose a subject, modifier, and verb in order to complete one sentence.',
    'When neighboring words fit, they create Context; words of the same emotion color Resonate and become even stronger!',
    'The final verb decides whether you attack, guard, or heal.',
    `Each sentence starts with ${SENTENCE_BASE_INK} Ink. Carry up to ${SENTENCE_CARRY_LIMIT}, then pay up to ${SENTENCE_OVERDRAW_LIMIT} Health to write as much as ${SENTENCE_MAX_INK}. The ink bottle will warn you first!`,
    'Any damage left over carries past the front bug into the next one!',
    'Now let us chase away the bugs gnawing at the story in front of us!',
  ],
  ja: [
    `起きて、${PLAYER_NAME}！ぼくの声が聞こえる？`,
    'ここは君の日記の中だよ。まさか…また記憶をなくしたの？',
    '物語をかじる虫たちが、君の記憶まで奪ったんだ。',
    'でも大丈夫。',
    'でも大丈夫。また書き直せばいい。ぼくがそばで一つずつ教えるよ。',
    '心配しないで。文の作り方から一つずつ教えるよ。',
    'ぼくらは最高の相棒だから！',
    'そう！主語、修飾語、動詞の順に選べば、一つの文が完成するよ。',
    '前後の言葉が合えば「文脈」になり、同じ色の感情が集まれば「共鳴」してもっと強くなる！',
    '最後の動詞が、攻撃するか、防ぐか、回復するかを決めるんだ。',
    `文ごとの基本インクは${SENTENCE_BASE_INK}。残りは最大${SENTENCE_CARRY_LIMIT}まで繰り越せて、体力で${SENTENCE_OVERDRAW_LIMIT}まで追加し、最大${SENTENCE_MAX_INK}まで書けるよ。インク瓶が先に知らせてくれる！`,
    '余ったダメージは前の虫を越えて、次の虫まで届くよ！',
    'さあ、目の前で物語をかじる虫たちを追い払おう！',
  ],
  ru: [
    `Просыпайся, ${PLAYER_NAME}! Ты меня слышишь?`,
    'Ты внутри своего дневника. О нет... Ты снова потерял память?',
    'Жуки, пожирающие историю, украли и твои воспоминания.',
    'Но всё хорошо.',
    'Но всё хорошо. Мы просто напишем всё заново. Я буду рядом и подскажу шаг за шагом.',
    'Не волнуйся. Я снова научу тебя составлять фразы, шаг за шагом.',
    'Ведь мы лучшие напарники!',
    'Отлично! Выбирай по порядку подлежащее, определение и глагол, чтобы закончить фразу.',
    'Соседние слова создают Контекст, а эмоции одного цвета входят в Резонанс и усиливают фразу!',
    'Последний глагол решает, атаковать, защищаться или лечиться.',
    `На каждую фразу даётся ${SENTENCE_BASE_INK} чернил. Можно перенести до ${SENTENCE_CARRY_LIMIT} и оплатить здоровьем ещё до ${SENTENCE_OVERDRAW_LIMIT}, чтобы использовать максимум ${SENTENCE_MAX_INK}. Чернильница предупредит заранее!`,
    'Лишний урон пройдёт сквозь первого жука и попадёт в следующего!',
    'А теперь прогоним жуков, которые пожирают историю прямо перед нами!',
  ],
  'zh-Hans': [
    `快醒醒，${PLAYER_NAME}！听得到我说话吗？`,
    '这里是你的日记里面。不会吧……你又失忆了吗？',
    '那些啃食故事的虫子连你的记忆也抢走了。',
    '不过没关系。',
    '不过没关系。我们重新写回来就好。我会陪在你身边，一步步告诉你。',
    '别担心。我会从造句开始，一步步重新教你。',
    '因为我们是最棒的搭档！',
    '很好！依次选择主语、修饰语和动词，就能完成一句话。',
    '前后词语契合会形成“语境”，同色情感聚集则会“共鸣”，让句子更强！',
    '最后的动词决定攻击、防御还是治疗。',
    `每句话有${SENTENCE_BASE_INK}点基础墨水，最多结转${SENTENCE_CARRY_LIMIT}点，再用体力超写${SENTENCE_OVERDRAW_LIMIT}点，最多可用${SENTENCE_MAX_INK}点。墨水瓶会提前提醒你！`,
    '多余的伤害会越过前面的虫子，继续打到下一只！',
    '那么，先赶走眼前这些啃食故事的虫子吧！',
  ],
  'zh-Hant': [
    `快醒醒，${PLAYER_NAME}！聽得到我說話嗎？`,
    '這裡是你的日記裡面。不會吧……你又失憶了嗎？',
    '那些啃食故事的蟲子連你的記憶也搶走了。',
    '不過沒關係。',
    '不過沒關係。我們重新寫回來就好。我會陪在你身邊，一步步告訴你。',
    '別擔心。我會從造句開始，一步步重新教你。',
    '因為我們是最棒的搭檔！',
    '很好！依次選擇主語、修飾語和動詞，就能完成一句話。',
    '前後詞語契合會形成「語境」，同色情感聚集則會「共鳴」，讓句子更強！',
    '最後的動詞決定攻擊、防禦還是治療。',
    `每句話有${SENTENCE_BASE_INK}點基礎墨水，最多結轉${SENTENCE_CARRY_LIMIT}點，再用體力超寫${SENTENCE_OVERDRAW_LIMIT}點，最多可用${SENTENCE_MAX_INK}點。墨水瓶會提前提醒你！`,
    '多餘的傷害會越過前面的蟲子，繼續打到下一隻！',
    '那麼，先趕走眼前這些啃食故事的蟲子吧！',
  ],
}

/** 인덱스를 전역에서 소모하지 않고 매 튜토리얼마다 같은 앞뒤 관계로 대사를 만든다. */
function tutorialScript(locale: LocaleCode): ScriptLine[] {
  const p = PLAYER_LINES[locale]
  const token = TOKEN_LINES[locale]
  return [
    { kind: 'token', portrait: 'neutral', text: token[0] },
    { kind: 'player', words: [...p[0]] },
    { kind: 'token', portrait: 'neutral', text: token[1] },
    { kind: 'player', words: [...p[1]] },
    { kind: 'token', portrait: 'sad', text: token[2] },
    { kind: 'token', portrait: 'neutral', text: token[4] },
    { kind: 'player', words: [...p[3]] },
    { kind: 'token', portrait: 'neutral', text: token[12] },
  ]
}

/** 새 튜토리얼 대사가 한 언어에만 추가되는 회귀를 빌드 검사에서 막는다. */
export function introDialogueLocalizationErrors(): string[] {
  const errors: string[] = []
  for (const [locale, lines] of Object.entries(TOKEN_LINES) as Array<[LocaleCode, TokenTutorialLines]>) {
    lines.forEach((text, index) => {
      if (!text.trim()) errors.push(`${locale}: empty Token tutorial line ${index}`)
      if (locale !== 'ko' && /[가-힣]/.test(text)) errors.push(`${locale}: Korean remains in Token tutorial line ${index}`)
    })
  }
  for (const [locale, lines] of Object.entries(PLAYER_LINES) as Array<[LocaleCode, PlayerTutorialLines]>) {
    lines.flat().forEach((text, index) => {
      if (!text.trim()) errors.push(`${locale}: empty player tutorial word ${index}`)
      if (locale !== 'ko' && /[가-힣]/.test(text)) errors.push(`${locale}: Korean remains in player tutorial word ${index}`)
    })
  }
  return errors
}

// 타자 속도와, 다 출력된 뒤 클릭 진행 게이트: ADVANCE_LOCK_MS 동안 무시 →
// 이후 클릭 또는 ADVANCE_TIMEOUT_MS 경과 시 다음 대사.
const TYPE_MS = 32
const ADVANCE_LOCK_MS = 750
const ADVANCE_TIMEOUT_MS = 6000
// 플레이어가 직접 완성한 문장은 여운만 짧게 두고 이어간다.
const PLAYER_ADVANCE_TIMEOUT_MS = 2800
const PORTRAIT_SWAP_OUT_MS = 110
const PORTRAIT_SWAP_IN_MS = 260

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

    for (const line of tutorialScript(currentLocale)) {
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
      const emotion = TUTORIAL_CARD_EMOTIONS[i % TUTORIAL_CARD_EMOTIONS.length]
      const cardWord: Word = {
        id: `tutorial-dialogue-${i}`,
        text: word,
        slot: 'dialogue',
        tags: [],
        emotion,
        note: '문장에 넣기',
        rarity: 'common',
      }
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = `intro-word-chip word-card mood-${wordMood(cardWord)} emotion-${emotion} is-entering`
      chip.dataset.word = word
      chip.setAttribute('aria-label', `${word} 선택`)
      chip.innerHTML = wordCardInnerHtml(cardWord, {
        note: '문장에 넣기',
        footer: `${i + 1}번째 단어`,
        artUrl: TUTORIAL_CARD_ART[i % TUTORIAL_CARD_ART.length],
        hideMeta: true,
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
