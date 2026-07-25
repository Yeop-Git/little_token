/**
 * 부트 + 무대 스케일러 + 런 루프 컨트롤러.
 * 고정 1920x1080 무대를 뷰포트에 맞춰 scale()로 레터박스.
 * 런: 하루 전투 클리어 → 보상(문장=스킬업 / 아이템=스펙업) → 다음날(더 강한 스테이지).
 */

import './style.css'
import { BattleView } from '@views/BattleView'
import { RewardView } from '@views/RewardView'
import { ItemExclaimView } from '@views/ItemExclaimView'
import { TitleView } from '@views/TitleView'
import { CombatGuideView } from '@views/CombatGuideView'
import { DefeatView } from '@views/DefeatView'
import { EndingView } from '@views/EndingView'
import { FontManager } from '@/ui/FontManager'
import { ALL_ITEMS, ITEMS, type ItemDef } from '@data/items'
import { makeEarlyTables } from '@data/earlyWords'
import { stageFor } from '@data/stages'
import { genRewards } from '@data/rewards'
import { newRun, registerWord, applyItemReward } from '@core/run'
import { startGrade } from '@core/grade'
import { clearAllRecords, clearRun, hasSeenTutorial, loadRun, markTutorialSeen, saveRun } from '@core/save'
import packageInfo from '../package.json'
import { GraphicsSettings } from '@/ui/GameSettings'
import { ALL_REWARD_WORDS, EARLY_WORDS, GROW_WORDS, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { RARITY_LABEL, type Word } from '@core/types'
import { preloadBattleResources } from '@/ui/ResourcePreloader'
import { openSettingsModal } from '@/ui/SettingsModal'
import { CinematicIntro } from '@views/CinematicIntro'
import { GameAudio } from '@/audio/GameAudio'
import { installFoilShaders } from '@/ui/FoilShader'

const STAGE_W = 1920
const STAGE_H = 1080
/** 시네마틱이 걷힌 뒤 제목·메뉴를 올리기까지 두는 시간. */
const TITLE_UI_HOLD_MS = 850
/**
 * 걷힘이 끝난 뒤 얼려 둔 배경을 도로 푸는 시각.
 * 걷힘이 끝나는 프레임과 제목이 올라오는 순간(TITLE_UI_HOLD_MS) 둘 다에서 떨어져야
 * 한다 — 어느 쪽에 붙어도 그 순간이 한 번 걸린다. 그 사이 조용한 틈에 넣는다.
 */
const AMBIENT_THAW_MS = 260
const viewport = document.getElementById('viewport') as HTMLElement
const stage = document.getElementById('stage') as HTMLElement
let devCheatCleanup: (() => void) | null = null
let cinematicCleanup: (() => void) | null = null
let battleRequest = 0
GraphicsSettings.apply()
GameAudio.installButtonSounds()
installFoilShaders()

function fit() {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  stage.style.setProperty('--scale', String(s))
}
window.addEventListener('resize', fit)
fit()

let run = newRun()
// 타이틀을 보는 동안 현재 덱의 전투 리소스를 디코딩해 첫 스테이지의 검은 프레임을 막는다.
// 보상으로 덱이 바뀌면 goBattle에서 새 카드만 이어서 예열한다.
void preloadBattleResources(run.player.deck, run.player.items)
let current: { destroy?: () => void } | null = null
type SceneName = 'title' | 'intro' | 'battle' | 'reward' | 'item' | 'ending' | 'defeat'
// 디버그 지급 후 어느 씬으로 되돌아갈지.
let lastScene: SceneName = 'battle'

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
  registerWord(run.player, word)
  saveRun(run)
  if (lastScene === 'reward') goReward()
  else goBattle()
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
  if (current instanceof BattleView) current.debugDefeat()
}

// 디버그 스테이지 이동 — 날짜만 바꾼 뒤 일반 전투 진입 경로를 다시 타게 해
// 적 편성, 필드, 배율과 저장 상태가 서로 어긋나지 않게 한다.
const DEBUG_BOSSES = [
  { day: 5, name: '소금쟁이' },
  { day: 10, name: '여왕벌' },
  { day: 15, name: '장로거미' },
] as const

function jumpToStage(day: number) {
  if (!Number.isFinite(day)) return
  run.day = Math.max(1, Math.floor(day))
  if (run.day > 15) {
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
  const sceneLabel: Record<Exclude<SceneName, 'defeat'>, string> = { title: '타이틀', intro: '인트로', battle: '전투', reward: '보상', item: '감탄', ending: '엔딩' }
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
  const goScene = (scene: SceneName) => {
    if (scene === 'title') goTitle()
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
    if (!word || !(current instanceof BattleView)) {
      result.textContent = '전투 화면에서만 카드를 생성할 수 있습니다.'
      return
    }
    result.textContent = await current.debugSpawnCard(word)
  })
  shell.querySelectorAll<HTMLButtonElement>('[data-run-tool]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.runTool === 'defeat') defeatPlayer()
      else if (button.dataset.runTool === 'unlock-all') unlockAllCards()
      else reinforceAllCards()
    }),
  )
  stage.appendChild(shell)
  viewport.appendChild(corner)

  // 고정 무대 왼쪽에 레터박스가 생기면 그 여백 전체도 숨은 클릭 영역에 포함한다.
  const fitCorner = () => {
    const rect = stage.getBoundingClientRect()
    const scale = rect.width / STAGE_W || 1
    corner.style.width = `${Math.max(34, rect.left + 34 * scale)}px`
    corner.style.height = rect.left > 1 ? `${window.innerHeight}px` : `${Math.max(34, rect.top + 34 * scale)}px`
  }
  fitCorner()
  window.addEventListener('resize', fitCorner)
  devCheatCleanup = () => {
    window.removeEventListener('resize', fitCorner)
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
  mountDevCheat(active)
  mountVersion()
}

function reset() {
  current?.destroy?.()
  devCheatCleanup?.()
  cinematicCleanup?.()
  cinematicCleanup = null
  stage.innerHTML = ''
}

function startNewRunBattle() {
  const intro = !hasSeenTutorial()
  void goBattle(intro, intro ? markTutorialSeen : undefined)
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
 */
function goTitle(withIntro = false) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  const title = new TitleView(stage, {
    hasSave: !!loadRun(),
    holdUi: withIntro,
    onSettings: () => openSettingsModal(stage, { onResetAll: resetAllRecordsAndStart }),
    onGuide: goCombatGuide,
    onStart: (fresh) => {
      if (fresh) clearRun()
      const saved = fresh ? null : loadRun()
      run = saved ?? newRun()
      if (!saved) saveRun(run)
      startNewRunBattle()
    },
  })
  current = title
  mountMeta('title')
  if (!withIntro) return
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
  current = new CombatGuideView(stage, { onBack: goTitle })
  mountMeta('title')
}

async function goBattle(intro = false, onIntroComplete?: () => void) {
  const request = ++battleRequest
  await preloadBattleResources(run.player.deck, run.player.items)
  if (request !== battleRequest) return
  reset()
  const st = stageFor(run.day)
  GameAudio.playBattleBgm(run.day, st.isBoss ? st.encounter[0] : undefined)
  stage.setAttribute('data-theme', st.field.theme)
  current = new BattleView(stage, {
    field: st.field,
    encounter: st.encounter,
    hpMult: st.hpMult,
    atkMult: st.atkMult,
    isBoss: st.isBoss,
    bossHealthBars: st.bossHealthBars,
    modeLabel: st.endlessCycle > 0 ? `ENDLESS ${st.endlessCycle} · ${st.floor}층` : undefined,
    player: run.player,
    tables: makeEarlyTables(run.player.deck, run.player),
    onWin: handleBattleWin,
    onLose: () => {
      clearRun()
      goDefeat()
    },
    onHome: () => goTitle(), // 인트로 없이 — 시네마틱은 첫 부팅에서만 튼다
    onResetAll: resetAllRecordsAndStart,

    intro,
    onIntroComplete,
  })
  mountMeta(intro ? 'intro' : 'battle')
}

function handleBattleWin(grade: number) {
  if (run.day === 15 && !run.endingSeen) {
    goEnding(grade)
    return
  }
  goReward(grade)
}

function goEnding(grade = startGrade(run.player.stats.luck)) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'night')
  current = new EndingView(stage, {
    onComplete: () => {
      run.endingSeen = true
      run.endless = true
      saveRun(run)
      goReward(grade)
    },
  })
  mountMeta('ending')
}

// 전투에서 들고 나온 보상등급이 희귀도 확률을 정한다. 씬 점퍼 직행이면 운 기준 시작 등급.
function goReward(grade = startGrade(run.player.stats.luck)) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  const options = genRewards(run.player, grade, run.day)
  current = new RewardView(stage, {
    day: run.day,
    deck: run.player.deck,
    grade,
    nextField: stageFor(run.day + 1).field,
    options,
    onPick: (opt) => {
      if (opt.kind === 'word' && opt.word) {
        registerWord(run.player, opt.word) // 문장 = 스킬업
        run.day++
        saveRun(run)
        goBattle()
      } else if (opt.item) {
        goItem(opt.item, grade) // 아이템 = 감탄사 커스텀(스펙업) — 등급이 행운 감탄 확률이 된다
      }
    },
  })
  mountMeta('reward')
}

function goItem(itemDef: ItemDef, grade = startGrade(run.player.stats.luck)) {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new ItemExclaimView(stage, {
    item: itemDef,
    grade,
    onDone: (result) => {
      applyItemReward(run.player, result)
      run.day++
      saveRun(run)
      goBattle()
    },
  })
  mountMeta('item')
}

function goDefeat() {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new DefeatView(stage, {
    day: run.day,
    onNewRun: () => {
      run = newRun()
      saveRun(run)
      startNewRunBattle()
    },
    onTitle: () => goTitle(),
  })
  mountMeta('defeat')
}

// ?scene= 로 직접 진입(스샷/검수용). ?day= 를 붙이면 그 날짜의 편성으로 바로 들어간다.
const params = new URLSearchParams(location.search)
const start = (params.get('scene') as SceneName) || 'title'
const dayParam = Number(params.get('day'))
if (Number.isFinite(dayParam) && dayParam >= 1) run.day = Math.floor(dayParam)
// 1MB에 가까운 장식 폰트가 내려오는 동안 화면 전체를 비워 두지 않는다.
// 폴백으로 즉시 첫 씬을 그리고, 로드가 끝나면 FontManager가 같은 CSS 변수만 교체한다.
void FontManager.load()
if (start === 'reward') goReward()
else if (start === 'item') goItem(ITEMS.candle)
else if (start === 'ending') goEnding()
else if (start === 'defeat') goDefeat()
else if (start === 'intro') goBattle(true)
else if (start === 'battle') goBattle()
// 부팅으로 들어온 타이틀에서만 오프닝 시네마틱을 튼다(?scene=title이면 검수용이라 건너뛴다).
else goTitle(!params.get('scene'))
