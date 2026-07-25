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
import { FontManager } from '@/ui/FontManager'
import { ALL_ITEMS, ITEMS, type ItemDef } from '@data/items'
import { makeEarlyTables } from '@data/earlyWords'
import { stageFor } from '@data/stages'
import { genRewards } from '@data/rewards'
import { newRun, registerWord, applyItemReward } from '@core/run'
import { startGrade } from '@core/grade'
import { clearRun, hasSeenTutorial, loadRun, markTutorialSeen, saveRun } from '@core/save'
import packageInfo from '../package.json'
import { GraphicsSettings } from '@/ui/GameSettings'
import { ALL_REWARD_WORDS, EARLY_WORDS, GROW_WORDS, PUNCT_WORDS, REWARD_WORDS } from '@data/earlyWords'
import { RARITY_LABEL, type Word } from '@core/types'
import { preloadBattleResources } from '@/ui/ResourcePreloader'
import { openSettingsModal } from '@/ui/SettingsModal'
import { GameAudio } from '@/audio/GameAudio'
import { installFoilShaders } from '@/ui/FoilShader'

const STAGE_W = 1920
const STAGE_H = 1080
const viewport = document.getElementById('viewport') as HTMLElement
const stage = document.getElementById('stage') as HTMLElement
let devCheatCleanup: (() => void) | null = null
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
type SceneName = 'title' | 'intro' | 'battle' | 'reward' | 'item' | 'defeat'
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

// 좌상단 모서리를 다섯 번 누르면 열리는 개발용 치트 패널.
function mountDevCheat(active: SceneName) {
  const owned = new Set(run.player.items.map((it) => it.id))
  const ownedWords = new Set(Object.values(run.player.deck).flat().map((word) => word.id))
  const rewardWords = Object.values(REWARD_WORDS).flat()
  const spawnWords = spawnCardCatalog()
  const sceneLabel: Record<Exclude<SceneName, 'defeat'>, string> = { title: '타이틀', intro: '인트로', battle: '전투', reward: '보상', item: '감탄' }
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
        <section class="dev-cheat-section">
          <h3>SCENE JUMP</h3>
          <div class="dev-cheat-scenes">
            ${(['title', 'intro', 'battle', 'reward', 'item'] as Exclude<SceneName, 'defeat'>[]).map((scene) => `<button type="button" data-scene="${scene}"${scene === active ? ' class="on"' : ''}>${sceneLabel[scene]}</button>`).join('')}
          </div>
        </section>
        <section class="dev-cheat-section">
          <h3>ITEM GRANT</h3>
          <div class="dev-cheat-items">${Object.values(ALL_ITEMS).map(itemButton).join('')}</div>
        </section>
        <section class="dev-cheat-section">
          <h3>WORD CARD UNLOCK</h3>
          <div class="dev-cheat-word-grant">
            <select id="dev-word-select" aria-label="해금할 단어 카드">
              ${rewardWords.map((word) => `<option value="${word.id}">${word.text} · ${word.slot} · ${RARITY_LABEL[word.rarity ?? 'common']}${ownedWords.has(word.id) ? ' · 보유 중(강화)' : ''}</option>`).join('')}
            </select>
            <button type="button" data-word-grant>바로 해금</button>
          </div>
        </section>
        <section class="dev-cheat-section">
          <h3>WORD CARD SPAWN</h3>
          <div class="dev-cheat-card-spawn">
            <select id="dev-card-spawn-select" aria-label="손패에 생성할 단어 카드">
              ${spawnWords.map((word) => `<option value="${word.id}">${word.text} · ${word.slot} · ${RARITY_LABEL[word.rarity ?? 'common']}</option>`).join('')}
            </select>
            <button type="button" data-card-spawn${active === 'battle' ? '' : ' disabled'}>손패에 생성</button>
          </div>
          <p class="dev-cheat-result" data-card-spawn-result aria-live="polite">전투 중 현재 슬롯과 같은 종류의 카드를 즉시 생성합니다.</p>
        </section>
        <section class="dev-cheat-section">
          <h3>RUN TOOLS</h3>
          <div class="dev-cheat-run-tools">
            <button type="button" data-run-tool="defeat"${active === 'battle' || active === 'intro' ? '' : ' disabled'}>캐릭터 사망시키기</button>
            <button type="button" data-run-tool="unlock-all">모든 카드 해금</button>
            <button type="button" data-run-tool="reinforce-all">모든 카드 강화하기</button>
          </div>
        </section>
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
    else goItem(ITEMS.candle)
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
  stage.innerHTML = ''
}

function startNewRunBattle() {
  const intro = !hasSeenTutorial()
  if (intro) markTutorialSeen()
  void goBattle(intro)
}

function goTitle() {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new TitleView(stage, {
    hasSave: !!loadRun(),
    onSettings: () => openSettingsModal(stage),
    onGuide: goCombatGuide,
    onStart: (fresh) => {
      if (fresh) clearRun()
      const saved = fresh ? null : loadRun()
      run = saved ?? newRun()
      if (!saved) saveRun(run)
      // Existing runs predate the persistent tutorial flag, so do not replay their intro.
      if (saved) markTutorialSeen()
      startNewRunBattle()
    },
  })
  mountMeta('title')
}

function goCombatGuide() {
  battleRequest++
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new CombatGuideView(stage, { onBack: goTitle })
  mountMeta('title')
}

async function goBattle(intro = false) {
  const request = ++battleRequest
  await preloadBattleResources(run.player.deck, run.player.items)
  if (request !== battleRequest) return
  reset()
  const st = stageFor(run.day)
  stage.setAttribute('data-theme', st.field.theme)
  current = new BattleView(stage, {
    field: st.field,
    encounter: st.encounter,
    hpMult: st.hpMult,
    atkMult: st.atkMult,
    player: run.player,
    tables: makeEarlyTables(run.player.deck, run.player),
    onWin: (grade) => goReward(grade),
    onLose: () => {
      clearRun()
      goDefeat()
    },
    onHome: goTitle,
    intro,
  })
  mountMeta(intro ? 'intro' : 'battle')
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
    onTitle: goTitle,
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
else if (start === 'defeat') goDefeat()
else if (start === 'intro') goBattle(true)
else if (start === 'battle') goBattle()
else goTitle()
