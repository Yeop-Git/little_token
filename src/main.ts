/**
 * 부트 + 무대 스케일러 + 런 루프 컨트롤러.
 * 고정 1920x1080 무대를 뷰포트에 맞춰 scale()로 레터박스.
 * 런: 하루 전투 클리어 → 보상(문장=스킬업 / 아이템=스펙업) → 다음날(더 강한 스테이지).
 */

import './style.css'
import type { BattleView as BattleViewType } from '@views/BattleView'
import { RewardView } from '@views/RewardView'
import { DeckDiscardView } from '@views/DeckDiscardView'
import { ItemExclaimView } from '@views/ItemExclaimView'
import { TitleView } from '@views/TitleView'
import { CombatGuideView } from '@views/CombatGuideView'
import { RunResultView, type RunOutcome } from '@views/RunResultView'
import type { DefeatCause } from '@core/run'
import { EndingView } from '@views/EndingView'
import { FontManager } from '@/ui/FontManager'
import { ALL_ITEMS, ITEMS, type ItemDef } from '@data/items'
import { makeEarlyTables } from '@data/earlyWords'
import { STORY_FLOORS, floorInCycle, stageFor } from '@data/stages'
import { genRewards, REWARD_REFRESH_COST, rewardOfferRng, rewardPrice, type RewardOption } from '@data/rewards'
import { applyItemReward, checkpointStoryEnding, completeStoryEnding, newRun, preparePendingReward, registerWord, spendInspiration, type RewardPhase, type RewardPickRef } from '@core/run'
import { startGrade } from '@core/grade'
import { clearAllRecords, clearRun, loadRun, markTutorialSeen, saveRun } from '@core/save'
import { sharedTokenMind } from '@core/tokenMind'
import packageInfo from '../package.json'
import { GraphicsSettings } from '@/ui/GameSettings'
import { ALL_REWARD_WORDS, EARLY_WORDS, GROW_WORDS, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { RARITY_LABEL, type Word } from '@core/types'
import { openSettingsModal } from '@/ui/SettingsModal'
import { CinematicIntro } from '@views/CinematicIntro'
import { BossCinematic } from '@views/BossCinematic'
import { VIDEO } from '@/assets'
import { GameAudio } from '@/audio/GameAudio'
import { installFoilShaders } from '@/ui/FoilShader'
import { CustomCursor } from '@/ui/CustomCursor'
import { ClickScribble } from '@/ui/ClickScribble'
import { applyLocaleToDocument, currentLocale } from '@/localization'
import { applyContentLocalization } from '@/localization/content'
import { applyDetailedContentLocalization } from '@/localization/contentDetails'
import { installDomLocalization } from '@/localization/dom'
import { DEMO_FLOORS, FEEDBACK_URL, IS_DEMO, STRICT_RESOURCE_LOADING, isEditionFinalFloor } from '@/config/edition'
import { installResourceFailureMonitor } from '@/ui/ResourceFailures'
import { pickFieldBackground, type FieldBackground } from '@data/backgrounds'
import { installMobileViewport } from '@/ui/MobileViewport'

/** 시네마틱이 걷힌 뒤 제목·메뉴를 올리기까지 두는 시간. */
const TITLE_UI_HOLD_MS = 850
/**
 * 걷힘이 끝난 뒤 얼려 둔 배경을 도로 푸는 시각.
 * 걷힘이 끝나는 프레임과 제목이 올라오는 순간(TITLE_UI_HOLD_MS) 둘 다에서 떨어져야
 * 한다 — 어느 쪽에 붙어도 그 순간이 한 번 걸린다. 그 사이 조용한 틈에 넣는다.
 */
const AMBIENT_THAW_MS = 260
const STAGE_TRANSITION_COVER_MS = 320
const STAGE_TRANSITION_REVEAL_MS = 520
/** 백틱 키 또는 좌상단 모서리 5회 클릭으로 여는 숨은 검수 기능. */
const DEV_CHEAT_ENABLED = import.meta.env.DEV
const viewport = document.getElementById('viewport') as HTMLElement
const stage = document.getElementById('stage') as HTMLElement
let devCheatCleanup: (() => void) | null = null
let cinematicCleanup: (() => void) | null = null
let battleRequest = 0
let preparedBackground: { day: number; value: FieldBackground } | null = null
installResourceFailureMonitor()
applyLocaleToDocument()
applyContentLocalization()
if (currentLocale !== 'ko') applyDetailedContentLocalization(currentLocale)
installDomLocalization()
GraphicsSettings.apply()
GameAudio.installButtonSounds()
installFoilShaders()
if (!matchMedia('(pointer: coarse)').matches) {
  CustomCursor.install()
  ClickScribble.install()
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('profile') === '1') {
  void import('@/ui/RuntimeProfiler').then(({ startRuntimeProfiler }) => startRuntimeProfiler())
}

installMobileViewport(stage)

// 저장된 런이 있으면 그 다음 전투를 예열한다. 항상 새 런부터 예열하면 이어하기에서
// 1층 모델을 받은 직후 현재 층 모델을 또 받아 네트워크·파싱 비용이 두 번 든다.
let run = loadRun() ?? newRun()
// 타이틀을 보는 동안 현재 덱의 전투 리소스를 디코딩해 첫 스테이지의 검은 프레임을 막는다.
// 보상으로 덱이 바뀌면 goBattle에서 새 카드만 이어서 예열한다.
void preloadUpcomingBattle().catch((error) => {
  if (STRICT_RESOURCE_LOADING) throw error
})
type CurrentView = { destroy?: () => void } & Partial<Pick<BattleViewType,
  'debugDefeat' | 'debugSetCombatModes' | 'debugSpawnCard'>>
let current: CurrentView | null = null
type SceneName = 'title' | 'guide' | 'intro' | 'battle' | 'reward' | 'item' | 'ending' | 'defeat'
// 디버그 지급 후 어느 씬으로 되돌아갈지.
let lastScene: SceneName = 'battle'
// 저장 파일과 실제 밸런스에는 남기지 않는, 이번 실행 동안만 쓰는 전투 치트다.
const debugCombatModes = {
  invincible: false,
  attackMultiplier: 1,
}

// 디버그 아이템 지급 — 감탄사 화면을 건너뛰고 기본 스탯만 얹는다.
// 전설(규칙) 아이템은 기본 스탯이 0이라 패시브만 붙는다.
function grantItem(def: ItemDef) {
  applyItemReward(run.player, {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    art: def.art,
    line: '디버그 지급',
    stats: { ...def.base },
    passive: def.passive,
  })
  saveRun(run)
  // 슬롯을 늘리는 패시브는 테이블을 다시 만들어야 하므로 현재 씬을 새로 연다.
  if (lastScene === 'reward') goReward()
  else goBattle()
}

// 디버그 단어 해금 — 실제 보상과 같은 등록 경로를 타므로 이미 보유한 카드는 반복강화된다.
function grantWord(word: Word) {
  const back = () => {
    saveRun(run)
    if (lastScene === 'reward') goReward()
    else goBattle()
  }
  const result = registerWord(run.player, word)
  // 칸이 가득 차면 보상과 같은 교체 화면을 연다. 그냥 흘리면 버튼이 먹통인 것처럼 보인다.
  if (result.kind === 'needs-discard') {
    goDiscard(word, result.candidates, back)
    return
  }
  back()
}

function cardCatalog(): Word[] {
  return [...Object.values(EARLY_WORDS).flat(), ...ALL_REWARD_WORDS].filter(
    (word, index, all) => all.findIndex((entry) => entry.id === word.id) === index,
  )
}

function spawnCardCatalog(): Word[] {
  return [...cardCatalog(), ...GROW_WORDS, ...PUNCT_WORDS].filter(
    (word, index, all) => all.findIndex((entry) => entry.id === word.id) === index,
  )
}

function unlockAllCards() {
  const owned = new Set(Object.values(run.player.deck).flat().map((word) => word.id))
  for (const word of cardCatalog()) {
    if (!owned.has(word.id)) registerWord(run.player, word)
  }
  saveRun(run)
  if (lastScene === 'reward') goReward()
  else goBattle()
}

function reinforceAllCards() {
  const owned = Object.values(run.player.deck).flat()
  for (const word of owned) registerWord(run.player, word)
  saveRun(run)
  if (lastScene === 'reward') goReward()
  else goBattle()
}

function defeatPlayer() {
  current?.debugDefeat?.()
}

function applyDebugCombatModes() {
  current?.debugSetCombatModes?.(debugCombatModes)
}

// 디버그 스테이지 이동 — 날짜만 바꾼 뒤 일반 전투 진입 경로를 다시 타게 해
// 적 편성, 필드, 배율과 저장 상태가 서로 어긋나지 않게 한다.
const DEBUG_BOSSES = [
  { day: 5, name: '사마귀' },
  { day: 10, name: '여왕벌' },
  { day: 15, name: '장로거미' },
] as const

function jumpToStage(day: number) {
  if (!Number.isFinite(day)) return
  run.day = Math.max(1, Math.floor(day))
  if (run.day > STORY_FLOORS) {
    run.endless = true
    run.endingSeen = true
  }
  saveRun(run)
  void goBattle()
}

// 좌상단 모서리를 다섯 번 누르면 열리는 개발용 치트 패널.
function mountDevCheat(active: SceneName) {
  const owned = new Set(run.player.items.map((it) => it.id))
  const ownedWords = new Set(Object.values(run.player.deck).flat().map((word) => word.id))
  const rewardWords = Object.values(REWARD_WORDS).flat()
  const spawnWords = spawnCardCatalog()
  const normalItems = Object.values(ALL_ITEMS).filter((item) => !item.passive)
  const ruleItems = Object.values(ALL_ITEMS).filter((item) => item.passive)
  const stagePresets = [1, 5, 10, 15]
  const sceneLabel: Record<Exclude<SceneName, 'defeat'>, string> = { title: '타이틀', guide: '설명서', intro: '인트로', battle: '전투', reward: '보상', item: '감탄', ending: '엔딩' }
  const itemButton = (def: ItemDef) =>
    `<button type="button" class="dev-cheat-item${def.passive ? ' passive' : ''}${owned.has(def.id) ? ' owned' : ''}" data-item="${def.id}">
      <b>${def.name}</b><span>${def.passive ? '문장 규칙' : '스탯 아이템'}${owned.has(def.id) ? ' · 보유 중' : ''}</span>
    </button>`
  const shell = document.createElement('div')
  shell.className = 'dev-cheat-shell'
  shell.innerHTML = `
    <section class="dev-cheat" aria-label="개발 치트" aria-hidden="true">
      <header><span>DEV CHEAT</span><b>${active.toUpperCase()}</b><button type="button" data-close aria-label="닫기">×</button></header>
      <div class="dev-cheat-body">
        <section class="dev-cheat-section dev-cheat-navigation">
          <div class="dev-cheat-section-heading">
            <div><h3>NAVIGATION</h3><p>화면 또는 원하는 스테이지로 즉시 이동</p></div>
            <strong>현재 ${run.day} 스테이지</strong>
          </div>
          <div class="dev-cheat-nav-grid">
            <div>
              <h4>화면 이동</h4>
              <div class="dev-cheat-scenes">
                ${(['title', 'intro', 'battle', 'reward', 'item', 'ending'] as Exclude<SceneName, 'defeat'>[]).map((scene) => `<button type="button" data-scene="${scene}"${scene === active ? ' class="on"' : ''}>${sceneLabel[scene]}</button>`).join('')}
              </div>
            </div>
            <div>
              <h4>스테이지 이동</h4>
              <form class="dev-cheat-stage-jump" data-stage-jump>
                <label><span>STAGE</span><input type="number" name="stage" min="1" step="1" value="${run.day}" aria-label="이동할 스테이지" required></label>
                <button type="submit">전투로 이동</button>
              </form>
              <div class="dev-cheat-stage-presets" aria-label="추천 스테이지">
                ${stagePresets.map((day) => `<button type="button" data-stage-preset="${day}"${day === run.day ? ' class="on"' : ''}>${day}${day % 5 === 0 ? ' · BOSS' : ''}</button>`).join('')}
              </div>
              <div class="dev-cheat-bosses" aria-label="보스 바로가기">
                ${DEBUG_BOSSES.map((boss) => `<button type="button" data-boss-day="${boss.day}"><small>${boss.day} STAGE</small><b>${boss.name}</b></button>`).join('')}
              </div>
            </div>
          </div>
        </section>
        <div class="dev-cheat-content-grid">
          <section class="dev-cheat-section dev-cheat-card-section">
            <div class="dev-cheat-section-heading"><div><h3>ITEM GRANT</h3><p>클릭 즉시 획득</p></div></div>
            <h4>스탯 아이템</h4>
            <div class="dev-cheat-items dev-cheat-items-normal">${normalItems.map(itemButton).join('')}</div>
            <h4>문장 규칙 아이템</h4>
            <div class="dev-cheat-items">${ruleItems.map(itemButton).join('')}</div>
          </section>
          <div class="dev-cheat-word-column">
            <section class="dev-cheat-section dev-cheat-card-section">
              <div class="dev-cheat-section-heading"><div><h3>WORD CARD</h3><p>단어장 등록 또는 현재 손패 생성</p></div></div>
              <h4>단어장에 등록</h4>
              <div class="dev-cheat-word-grant">
                <select id="dev-word-select" aria-label="해금할 단어 카드">
                  ${rewardWords.map((word) => `<option value="${word.id}">${word.text} · ${word.slot} · ${RARITY_LABEL[word.rarity ?? 'common']}${ownedWords.has(word.id) ? ' · 보유 중(강화)' : ''}</option>`).join('')}
                </select>
                <button type="button" data-word-grant>등록</button>
              </div>
              <h4>현재 손패에 생성</h4>
              <div class="dev-cheat-card-spawn">
                <select id="dev-card-spawn-select" aria-label="손패에 생성할 단어 카드">
                  ${spawnWords.map((word) => `<option value="${word.id}">${word.text} · ${word.slot} · ${RARITY_LABEL[word.rarity ?? 'common']}</option>`).join('')}
                </select>
                <button type="button" data-card-spawn${active === 'battle' ? '' : ' disabled'}>생성</button>
              </div>
              <p class="dev-cheat-result" data-card-spawn-result aria-live="polite">전투 중 현재 슬롯과 같은 종류만 생성할 수 있습니다.</p>
            </section>
            <section class="dev-cheat-section dev-cheat-card-section">
              <div class="dev-cheat-section-heading"><div><h3>RUN TOOLS</h3><p>런 상태 일괄 조작</p></div></div>
              <div class="dev-cheat-run-tools">
                <button type="button" data-run-tool="defeat"${active === 'battle' || active === 'intro' ? '' : ' disabled'}>캐릭터 사망</button>
                <button type="button" class="is-toggle${debugCombatModes.invincible ? ' on' : ''}" data-run-tool="invincible" aria-pressed="${debugCombatModes.invincible}">무적 모드 · ${debugCombatModes.invincible ? 'ON' : 'OFF'}</button>
                <button type="button" class="is-toggle${debugCombatModes.attackMultiplier > 1 ? ' on' : ''}" data-run-tool="attack-boost" aria-pressed="${debugCombatModes.attackMultiplier > 1}">공격력 ×100 · ${debugCombatModes.attackMultiplier > 1 ? 'ON' : 'OFF'}</button>
                <button type="button" data-run-tool="unlock-all">모든 카드 해금</button>
                <button type="button" data-run-tool="reinforce-all">보유 카드 강화</button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>`

  const panel = shell.querySelector<HTMLElement>('.dev-cheat')!
  const open = () => {
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')
  }
  const close = () => {
    panel.classList.remove('open')
    panel.setAttribute('aria-hidden', 'true')
  }
  const toggleWithBackquote = (event: KeyboardEvent) => {
    if (event.code !== 'Backquote' || event.repeat) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (panel.classList.contains('open')) close()
    else open()
  }
  const goScene = (scene: SceneName) => {
    if (scene === 'title') goTitle()
    else if (scene === 'guide') goCombatGuide()
    else if (scene === 'intro') goBattle(true)
    else if (scene === 'battle') goBattle()
    else if (scene === 'reward') goReward()
    else if (scene === 'item') goItem(ITEMS.candle)
    else goEnding(startGrade(run.player.stats.luck))
  }
  let cornerClicks = 0
  const corner = document.createElement('button')
  corner.className = 'dev-cheat-corner'
  corner.type = 'button'
  corner.setAttribute('aria-label', '개발 치트 열기')
  corner.addEventListener('click', () => {
    cornerClicks++
    if (cornerClicks < 5) return
    cornerClicks = 0
    if (panel.classList.contains('open')) close()
    else open()
  })
  shell.querySelector<HTMLElement>('[data-close]')!.addEventListener('click', close)
  shell.querySelectorAll<HTMLElement>('[data-scene]').forEach((button) =>
    button.addEventListener('click', () => goScene(button.dataset.scene as SceneName)),
  )
  const stageForm = shell.querySelector<HTMLFormElement>('[data-stage-jump]')!
  const stageInput = stageForm.elements.namedItem('stage') as HTMLInputElement
  stageForm.addEventListener('submit', (event) => {
    event.preventDefault()
    jumpToStage(stageInput.valueAsNumber)
  })
  shell.querySelectorAll<HTMLButtonElement>('[data-stage-preset]').forEach((button) =>
    button.addEventListener('click', () => jumpToStage(Number(button.dataset.stagePreset))),
  )
  shell.querySelectorAll<HTMLButtonElement>('[data-boss-day]').forEach((button) =>
    button.addEventListener('click', () => jumpToStage(Number(button.dataset.bossDay))),
  )
  shell.querySelectorAll<HTMLElement>('[data-item]').forEach((button) =>
    button.addEventListener('click', () => grantItem(ALL_ITEMS[button.dataset.item!])),
  )
  shell.querySelector<HTMLElement>('[data-word-grant]')!.addEventListener('click', () => {
    const selected = shell.querySelector<HTMLSelectElement>('#dev-word-select')!.value
    const word = rewardWords.find((entry) => entry.id === selected)
    if (word) grantWord(word)
  })
  shell.querySelector<HTMLButtonElement>('[data-card-spawn]')!.addEventListener('click', async () => {
    const selected = shell.querySelector<HTMLSelectElement>('#dev-card-spawn-select')!.value
    const word = spawnWords.find((entry) => entry.id === selected)
    const result = shell.querySelector<HTMLElement>('[data-card-spawn-result]')!
    if (!word || !current?.debugSpawnCard) {
      result.textContent = '전투 화면에서만 카드를 생성할 수 있습니다.'
      return
    }
    result.textContent = await current.debugSpawnCard(word)
  })
  shell.querySelectorAll<HTMLButtonElement>('[data-run-tool]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.runTool === 'defeat') {
        defeatPlayer()
        return
      }
      if (button.dataset.runTool === 'invincible') {
        debugCombatModes.invincible = !debugCombatModes.invincible
        button.classList.toggle('on', debugCombatModes.invincible)
        button.setAttribute('aria-pressed', String(debugCombatModes.invincible))
        button.textContent = `무적 모드 · ${debugCombatModes.invincible ? 'ON' : 'OFF'}`
        applyDebugCombatModes()
        return
      }
      if (button.dataset.runTool === 'attack-boost') {
        debugCombatModes.attackMultiplier = debugCombatModes.attackMultiplier > 1 ? 1 : 100
        const enabled = debugCombatModes.attackMultiplier > 1
        button.classList.toggle('on', enabled)
        button.setAttribute('aria-pressed', String(enabled))
        button.textContent = `공격력 ×100 · ${enabled ? 'ON' : 'OFF'}`
        applyDebugCombatModes()
        return
      }
      if (button.dataset.runTool === 'unlock-all') unlockAllCards()
      else reinforceAllCards()
    }),
  )
  stage.appendChild(shell)
  viewport.appendChild(corner)

  // 고정 무대 왼쪽에 레터박스가 생기면 그 여백 전체도 숨은 클릭 영역에 포함한다.
  const fitCorner = () => {
    const rect = stage.getBoundingClientRect()
    const scale = rect.width / Math.max(1, stage.offsetWidth) || 1
    corner.style.width = `${Math.max(34, rect.left + 34 * scale)}px`
    corner.style.height = rect.left > 1 ? `${window.innerHeight}px` : `${Math.max(34, rect.top + 34 * scale)}px`
  }
  fitCorner()
  window.addEventListener('resize', fitCorner)
  // 한/영 상태와 무관하게 물리 백틱 키로 열고 닫는다. 캡처 단계에서 받아
  // 시네마틱의 '아무 키나 건너뛰기' 같은 씬별 단축키보다 먼저 처리한다.
  window.addEventListener('keydown', toggleWithBackquote, true)
  devCheatCleanup = () => {
    window.removeEventListener('resize', fitCorner)
    window.removeEventListener('keydown', toggleWithBackquote, true)
    corner.remove()
    devCheatCleanup = null
  }
}

function mountVersion() {
  const badge = document.createElement('div')
  badge.className = 'version-badge'
  badge.textContent = `v_${packageInfo.version}`
  badge.setAttribute('aria-label', `게임 버전 ${packageInfo.version}`)
  stage.appendChild(badge)
}

function mountMeta(active: SceneName) {
  lastScene = active
  if (DEV_CHEAT_ENABLED) mountDevCheat(active)
  mountVersion()
}

function reset() {
  current?.destroy?.()
  devCheatCleanup?.()
  cinematicCleanup?.()
  cinematicCleanup = null
  stage.innerHTML = ''
}

const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const waitForMs = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/** 보상 종이를 덮은 뒤 무거운 전투 리소스를 준비해 로딩 프레임을 감춘다. */
async function coverStageForNextBattle(): Promise<void> {
  stage.classList.add('stage-transition-active')
  await waitForFrame()
  stage.classList.add('is-stage-covered')
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) await waitForMs(STAGE_TRANSITION_COVER_MS)
}

/** 새 전장이 완전히 마운트된 다음에만 덮개를 걷는다. */
function revealPreparedStage(): void {
  if (!stage.classList.contains('stage-transition-active')) return
  void waitForFrame().then(() => {
    stage.classList.remove('is-stage-covered')
    window.setTimeout(() => stage.classList.remove('stage-transition-active'), STAGE_TRANSITION_REVEAL_MS)
  })
}

function startNewRunBattle() {
  // 새 런의 첫 장면은 이전 튜토리얼 열람 기록과 무관하게 항상 다시 보여 준다.
  void goBattle(true, markTutorialSeen)
}

function resetAllRecordsAndStart() {
  clearAllRecords()
  run = newRun()
  saveRun(run)
  void goBattle(true, markTutorialSeen)
}

/**
 * 첫 부팅에서만 오프닝 시네마틱을 얹는다. 타이틀을 먼저 다 그려 둔 위에 덮고,
 * 영상이 끝나기 전에 걷히게 해서 마지막 장면이 타이틀 배경으로 포개지게 한다.
 * '홈으로'처럼 다시 타이틀에 올 때는 틀지 않는다 — 매번 보면 지겹다.
 *
 * 이 함수는 버튼 핸들러로도 불릴 자리가 많다. 그때 넘어오는 이벤트 객체가
 * 곧 "시네마틱을 켜라"로 읽히지 않도록 인자를 true인지로만 판단한다.
 */
function goTitle(withIntro: unknown = false) {
  const playIntro = withIntro === true
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  const title = new TitleView(stage, {
    hasSave: !!loadRun(),
    holdUi: playIntro,
    onSettings: () => openSettingsModal(stage, { onResetAll: resetAllRecordsAndStart }),
    onGuide: goCombatGuide,
    onStart: (fresh) => {
      if (fresh) clearRun()
      const saved = fresh ? null : loadRun()
      run = saved ?? newRun()
      // 새로 시작하는 런은 토큰의 기분도 평정에서 다시 시작한다. 유대·성향·기억은 남는다.
      if (!saved) sharedTokenMind().beginRun()
      if (!saved) saveRun(run)
      if (fresh || !saved) startNewRunBattle()
      else if (run.pendingEndingGrade != null) goEnding(run.pendingEndingGrade, run.pendingEndingEarned ?? run.pendingEndingGrade)
      else if (run.reward?.day === run.day) {
        if (run.reward.phase === 'complete') finishReward()
        else goReward(run.reward.grade, run.reward.phase)
      }
      else void goBattle()
    },
  })
  current = title
  mountMeta('title')
  if (!playIntro) return
  // 영상이 배경으로 다 포개진 뒤 잠깐 둔다 — 방금 본 장면이 타이틀이 됐다는 걸
  // 알아볼 시간을 주고 나서 제목과 메뉴를 올린다.
  let holdTimer = 0
  let thawTimer = 0
  const intro = new CinematicIntro(stage, {
    // 걷히는 동안엔 타이틀 배경도 같이 세운다 — 두 화면이 동시에 그려지는 유일한
    // 구간이라, 여기서 도는 건 전부 두 배로 비싸다(TitleView.freezeAmbient 참고).
    onFadeStart: () => title.freezeAmbient(),
    // 영상 끝자락에 반딧불이를 영상 위에도 얹는다. 타이틀과 같은 무리를 그리므로
    // 겹이 바뀌는 순간에도 자리가 안 튄다(TitleView.addFireflyLayer 참고).
    onFireflyLayer: (canvas) => title.addFireflyLayer(canvas),
    onFireflyLayerDone: (canvas) => title.removeFireflyLayer(canvas),
    onDone: () => {
      // 얼린 걸 푸는 것도 한 덩어리 작업이다(애니메이션 여섯 개 재개 + 캔버스 루프 재시작).
      // 걷힘이 끝나는 프레임 바로 옆에 두면 그 순간이 걸리므로 조용한 틈으로 보낸다.
      // (rAF 한 프레임은 너무 가까웠다. 타이머라 탭이 뒤에 있어도 확실히 돈다.)
      thawTimer = window.setTimeout(() => title.thawAmbient(), AMBIENT_THAW_MS)
      holdTimer = window.setTimeout(() => title.revealUi(), TITLE_UI_HOLD_MS)
    },
  })
  cinematicCleanup = () => {
    clearTimeout(holdTimer)
    clearTimeout(thawTimer)
    intro.destroy()
  }
}

function goCombatGuide() {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  // 클릭 이벤트가 인자로 새어 들어가면 로비로 돌아올 때마다 오프닝이 다시 돈다.
  current = new CombatGuideView(stage, { onBack: () => goTitle() })
  mountMeta('guide')
}

/**
 * 보스 조우 시네마틱이 붙는 층 — 지금은 5층 사마귀뿐이다. 영상이 더 들어오면
 * 여기에 층과 파일을 나란히 적는다.
 */
const BOSS_CINEMATICS: Record<number, string> = {
  5: VIDEO.bossCinematic1,
}

/**
 * 전리품을 다 고른 뒤 보스전으로 들어가는 길. 시네마틱이 있는 층이면 까맣게
 * 덮고 영상을 돌린 다음, 마지막 프레임 아래에 전장을 세워 스르륵 걷어 낸다.
 * 같은 층을 다시 들어올 때(이어하기·치트 이동)는 컷을 반복하지 않는다.
 */
function goBattleWithBossIntro() {
  const src = BOSS_CINEMATICS[floorInCycle(run.day)]
  if (!src || run.bossCinematicSeen?.includes(run.day)) {
    void goBattle()
    return
  }
  // 본 컷은 저장에 남긴다 — 같은 보스를 다시 만날 때 매번 7초를 다시 볼 이유가 없다.
  run.bossCinematicSeen = [...(run.bossCinematicSeen ?? []), run.day]
  saveRun(run)
  new BossCinematic({
    src,
    // 마지막 프레임이 화면을 붙들고 있는 사이에 전장을 세운다. Promise를 그대로
    // 돌려줘야 컷이 전장 준비를 끝까지 기다린다 — 안 기다리면 컷이 걷힌 자리에
    // 아직 살아 있는 전리품 화면이 다시 보였다가 뒤늦게 전장으로 갈린다.
    onCurtainReady: () => goBattle(),
    onDone: () => {},
  })
}

async function goBattle(intro = false, onIntroComplete?: () => void) {
  const request = ++battleRequest
  // 전투 내부 상태는 저장하지 않는다. 홈 이동이나 강제 종료는 이 완전한 시작 상태로 돌아온다.
  const battleCheckpoint = structuredClone(run)
  const st = stageFor(run.day)
  const background = backgroundFor(run.day, st.isBoss, st.encounter[0])
  const [{ BattleView }, { preloadBattleResources }] = await Promise.all([
    import('@views/BattleView'),
    import('@/ui/ResourcePreloader'),
  ])
  await Promise.all([
    preloadBattleResources(run.player.deck, run.player.items, st.encounter, [background.next, background.prev].filter((src): src is string => !!src)),
    GameAudio.preloadBattleAudio(run.day, st.isBoss ? st.encounter[0] : undefined),
  ])
  if (request !== battleRequest) return
  reset()
  GameAudio.playBattleBgm(run.day, st.isBoss ? st.encounter[0] : undefined)
  stage.setAttribute('data-theme', st.field.theme)
  current = new BattleView(stage, {
    field: st.field,
    encounter: st.encounter,
    hpMult: st.hpMult,
    atkMult: st.atkMult,
    isBoss: st.isBoss,
    day: run.day,
    background,
    inspiration: run.inspiration,
    bossHealthBars: st.bossHealthBars,
    player: run.player,
    record: run.record,
    resources: run.combat,
    tables: makeEarlyTables(run.player.deck, run.player),
    debugCombat: debugCombatModes,
    onWin: handleBattleWin,
    onLose: (cause) => {
      // 저장은 지우지만 메모리의 run은 그대로 둔다 — 결과 종이가 이 값들을 읽는다.
      clearRun()
      goResult('lost', cause)
    },
    onHome: () => {
      run = battleCheckpoint
      saveRun(run)
      goTitle()
    }, // 인트로 없이 — 시네마틱은 첫 부팅에서만 튼다
    onResetAll: resetAllRecordsAndStart,

    intro,
    onIntroComplete,
  })
  mountMeta(intro ? 'intro' : 'battle')
  revealPreparedStage()
}

/** 타이틀 첫 화면을 막지 않고 다음 전투 런타임과 실제 편성 리소스를 뒤에서 준비한다. */
async function preloadUpcomingBattle() {
  const { preloadBattleResources } = await import('@/ui/ResourcePreloader')
  const st = stageFor(run.day)
  const background = backgroundFor(run.day, st.isBoss, st.encounter[0])
  await Promise.all([
    preloadBattleResources(run.player.deck, run.player.items, st.encounter, [background.next, background.prev].filter((src): src is string => !!src)),
    GameAudio.preloadBattleAudio(run.day, st.isBoss ? st.encounter[0] : undefined),
  ])
}

function backgroundFor(day: number, isBoss: boolean, bossId?: string): FieldBackground {
  if (preparedBackground?.day === day) return preparedBackground.value
  const value = pickFieldBackground(day, isBoss, bossId)
  preparedBackground = { day, value }
  return value
}

function handleBattleWin(grade: number, resources: { hp: number; guard: number }, earned: number = grade) {
  run.combat = resources
  // 넘긴 날 — 결과 종이가 "어디까지 갔는지"로 읽는 값이다.
  run.record.daysCleared += 1
  if (floorInCycle(run.day) === STORY_FLOORS && !run.endless && !run.endingSeen) {
    checkpointStoryEnding(run, grade, earned)
    saveRun(run)
    goEnding(grade, earned)
    return
  }
  beginReward(grade, earned)
}

function goEnding(
  grade = run.pendingEndingGrade ?? startGrade(run.player.stats.luck),
  earned = run.pendingEndingEarned ?? grade,
) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'night')
  current = new EndingView(stage, {
    onComplete: () => {
      completeStoryEnding(run)
      prepareReward(grade, earned)
      // 컷씬이 끝나면 이 판의 기록을 종이 한 장으로 정산해 보여 주고, 거기서
      // 엔들리스로 이어 간다. 승리도 패배와 같은 종이를 쓴다(도장만 다르다).
      goResult('won', null, () => goReward(grade, 'subject'))
    },
  })
  mountMeta('ending')
}

function prepareReward(grade: number, earned: number = grade) {
  preparePendingReward(run, grade, Math.floor(Math.random() * 0x7fffffff), earned)
  saveRun(run)
}

function beginReward(grade: number, earned: number = grade) {
  prepareReward(grade, earned)
  goReward(grade, 'subject')
}

function rewardPickRef(opt: RewardOption): RewardPickRef {
  return {
    kind: opt.kind,
    id: opt.word?.id ?? opt.item!.id,
    reinforce: opt.reinforce,
  }
}

function advanceReward(grade: number, phase: RewardPhase, pick?: RewardPickRef) {
  // 전리품을 고른 순간 토큰의 기분이 오른다. 기분은 런 안에서만 사는 값이라
  // 화면이 바뀌어도 같은 마음 한 벌(sharedTokenMind)이 그대로 들고 다음 전투로 간다.
  if (pick) sharedTokenMind().feel('rewardTaken')
  const picks = [...(run.reward?.picks ?? [])]
  const seed = run.reward?.seed ?? Math.floor(Math.random() * 0x7fffffff)
  const earned = run.reward?.earned ?? Math.max(0, Math.round(grade))
  const refreshes = run.reward?.refreshes ?? { subject: 0, item: 0, verb: 0 }
  if (pick) picks.push(pick)
  if (phase === 'subject') {
    run.reward = { day: run.day, grade, earned, phase: 'item', picks, seed, refreshes }
    saveRun(run)
    goReward(grade, 'item')
    return
  }
  if (phase === 'item') {
    run.reward = { day: run.day, grade, earned, phase: 'verb', picks, seed, refreshes }
    saveRun(run)
    goReward(grade, 'verb')
    return
  }
  finishReward()
}

async function finishReward() {
  run.reward = null
  if (IS_DEMO && isEditionFinalFloor(run.day)) {
    clearRun()
    goResult('won', null, undefined, true)
    return
  }
  run.day++
  saveRun(run)
  await coverStageForNextBattle()
  goBattleWithBossIntro()
}

/** 교체를 마친 뒤 어디로 돌아갈지는 부르는 쪽이 정한다 — 보상 흐름과 치트가 같은 화면을 쓴다. */
function goDiscard(incoming: Word, candidates: Word[], onDone: () => void) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new DeckDiscardView(stage, {
    incoming,
    candidates,
    onDiscard: (discarded) => {
      const result = registerWord(run.player, incoming, discarded.id)
      if (result.kind === 'needs-discard') return
      onDone()
    },
  })
}

// 전투 등급에 현재 15층 사이클의 진행도를 더해 실제 희귀도 가중치를 정한다.
function goReward(
  grade = run.reward?.grade ?? startGrade(run.player.stats.luck),
  phase: RewardPhase = run.reward?.phase === 'complete' ? 'subject' : run.reward?.phase ?? 'subject',
) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  const seed = run.reward?.seed ?? 0
  const refreshes = run.reward?.refreshes?.[phase] ?? 0
  const options = genRewards(
    run.player,
    grade,
    run.day,
    phase,
    rewardOfferRng(seed, phase, refreshes),
    run.inspiration,
  )
  // 후보 자체가 없거나 잔액이 0이라 살 수 있는 후보가 존재하지 않을 때만 넘긴다.
  // 그 외에는 생성기가 세 장 중 적어도 한 장을 현재 잔액 안으로 맞춘다.
  if (options.length === 0 || options.every((option) => rewardPrice(option) > run.inspiration)) {
    advanceReward(grade, phase)
    return
  }
  current = new RewardView(stage, {
    day: run.day,
    deck: run.player.deck,
    inspiration: run.inspiration,
    earned: run.reward?.earned ?? Math.max(0, Math.round(grade)),
    phase,
    options,
    onPick: (opt) => {
      const cost = rewardPrice(opt)
      if (run.inspiration < cost) {
        advanceReward(grade, phase)
        return
      }
      const pick = rewardPickRef(opt)
      if (opt.kind === 'word' && opt.word) {
        const result = registerWord(run.player, opt.word)
        if (result.kind === 'needs-discard') {
          goDiscard(opt.word, result.candidates, () => {
            spendInspiration(run, cost)
            advanceReward(grade, phase, pick)
          })
        } else {
          spendInspiration(run, cost)
          advanceReward(grade, phase, pick)
        }
      } else if (opt.item) {
        goItem(opt.item, grade, phase, pick, cost)
      }
    },
    onRefresh: () => {
      if (!spendInspiration(run, REWARD_REFRESH_COST)) return false
      const pending = run.reward
      if (!pending) return false
      pending.refreshes[phase] += 1
      saveRun(run)
      goReward(grade, phase)
      return true
    },
    onSkip: () => advanceReward(grade, phase),
  })
  mountMeta('reward')
}

function goItem(
  itemDef: ItemDef,
  grade = startGrade(run.player.stats.luck),
  rewardPhase?: RewardPhase,
  pick?: RewardPickRef,
  inspirationCost = 0,
) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new ItemExclaimView(stage, {
    item: itemDef,
    grade,
    onDone: (result) => {
      if (inspirationCost > 0 && !spendInspiration(run, inspirationCost)) {
        if (rewardPhase) advanceReward(grade, rewardPhase)
        return
      }
      applyItemReward(run.player, result)
      if (rewardPhase && pick) {
        advanceReward(grade, rewardPhase, pick)
      } else {
        run.day++
        saveRun(run)
        goBattleWithBossIntro()
      }
    },
  })
  mountMeta('item')
}

/**
 * 런 결과 종이 — 승리와 패배가 같은 화면을 쓰고 도장만 갈린다.
 * 저장은 이미 지워졌어도 메모리의 run에는 이 판의 기록이 남아 있어서 그걸 읽는다.
 */
function goResult(
  outcome: RunOutcome,
  cause?: DefeatCause | null,
  onContinue?: () => void,
  demoComplete = false,
) {
  battleRequest++
  // 런이 끝나는 유일한 길목. 토큰은 여기서만 이번 런을 기억에 넣고 성향이 조금 움직인다 —
  // 승패가 함께 지나는 곳이라 한쪽만 세는 일이 생기지 않는다.
  sharedTokenMind().endRun({
    day: run.day,
    outcome: outcome === 'won' ? 'clear' : 'defeat',
    cause: cause?.kind === 'enemy' ? cause.name : undefined,
  })
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new RunResultView(stage, {
    outcome,
    day: run.day,
    player: run.player,
    record: run.record,
    cause,
    demoComplete,
    buildVersion: packageInfo.version,
    feedbackUrl: FEEDBACK_URL,
    onNewRun: () => {
      run = newRun()
      sharedTokenMind().beginRun()
      saveRun(run)
      startNewRunBattle()
    },
    onTitle: () => goTitle(),
    onContinue,
  })
  mountMeta('defeat')
}

function goDefeat() {
  goResult('lost', null)
}

/** 개발용 데모 결과 화면에 실제 런에 가까운 밀도의 기록을 채운다. */
function prepareDemoResultFixture() {
  run.day = DEMO_FLOORS
  run.record.daysCleared = DEMO_FLOORS
  run.record.sentences = 18
  run.record.bestMult = 4.2
  run.record.bestCombo = 3
  run.record.bestHit = { dmg: 86, sentence: '나는 미친듯이 때렸다' }
  registerWord(run.player, ALL_REWARD_WORDS[0])
  registerWord(run.player, ALL_REWARD_WORDS[1])
  registerWord(run.player, run.player.deck.subj[0])
  const item = ITEMS.candle
  applyItemReward(run.player, {
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    art: item.art,
    line: '데모 결과 검수',
    stats: { ...item.base },
    passive: item.passive,
  })
}

// ?scene= 로 직접 진입(스샷/검수용). ?day= 를 붙이면 그 날짜의 편성으로 바로 들어간다.
const params = import.meta.env.DEV ? new URLSearchParams(location.search) : new URLSearchParams()
if (import.meta.env.DEV && STRICT_RESOURCE_LOADING && params.get('qaMissingResource') === 'image') {
  void import('@/ui/ResourceLibrary').then(({ preloadImage }) => preloadImage('/__qa_missing_image__.webp'))
}
const start = (params.get('scene') as SceneName) || 'title'
const dayParam = Number(params.get('day'))
if (Number.isFinite(dayParam) && dayParam >= 1) run.day = Math.floor(dayParam)
// 1MB에 가까운 장식 폰트가 내려오는 동안 화면 전체를 비워 두지 않는다.
// 폴백으로 즉시 첫 씬을 그리고, 로드가 끝나면 FontManager가 같은 CSS 변수만 교체한다.
void FontManager.load()
if (start === 'reward') goReward()
else if (start === 'item') goItem(ITEMS.candle)
else if (start === 'ending') goEnding()
else if (start === 'defeat' && params.get('demo') === '1') {
  prepareDemoResultFixture()
  goResult('won', null, undefined, true)
}
else if (start === 'defeat') goDefeat()
else if (start === 'intro') goBattle(true)
else if (start === 'battle') goBattle()
else if (start === 'guide') goCombatGuide()
// 부팅으로 들어온 타이틀에서만 오프닝 시네마틱을 튼다(?scene=title이면 검수용이라 건너뛴다).
else goTitle(!params.get('scene'))
