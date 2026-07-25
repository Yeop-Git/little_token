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
import { FontManager } from '@/ui/FontManager'
import { ALL_ITEMS, ITEMS, type ItemDef } from '@data/items'
import { makeEarlyTables } from '@data/earlyWords'
import { stageFor } from '@data/stages'
import { genRewards } from '@data/rewards'
import { newRun, registerWord, applyItemReward } from '@core/run'
import { startGrade } from '@core/grade'
import { clearRun, loadRun, saveRun } from '@core/save'
import packageInfo from '../package.json'

const STAGE_W = 1920
const STAGE_H = 1080
const viewport = document.getElementById('viewport') as HTMLElement
const stage = document.getElementById('stage') as HTMLElement
let devCheatCleanup: (() => void) | null = null

function fit() {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  stage.style.setProperty('--scale', String(s))
}
window.addEventListener('resize', fit)
fit()

let run = newRun()
let current: { destroy?: () => void } | null = null
type SceneName = 'title' | 'intro' | 'battle' | 'reward' | 'item'
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

// 좌상단 모서리를 다섯 번 누르면 열리는 개발용 치트 패널.
function mountDevCheat(active: SceneName) {
  const owned = new Set(run.player.items.map((it) => it.id))
  const sceneLabel: Record<SceneName, string> = { title: '타이틀', intro: '인트로', battle: '전투', reward: '보상', item: '감탄' }
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
            ${(['title', 'intro', 'battle', 'reward', 'item'] as SceneName[]).map((scene) => `<button type="button" data-scene="${scene}"${scene === active ? ' class="on"' : ''}>${sceneLabel[scene]}</button>`).join('')}
          </div>
        </section>
        <section class="dev-cheat-section">
          <h3>ITEM GRANT</h3>
          <div class="dev-cheat-items">${Object.values(ALL_ITEMS).map(itemButton).join('')}</div>
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

function goTitle() {
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new TitleView(stage, {
    hasSave: !!loadRun(),
    onStart: (fresh) => {
      if (fresh) clearRun()
      const saved = fresh ? null : loadRun()
      run = saved ?? newRun()
      if (!saved) saveRun(run)
      // 새 런 첫 진입에만 토큰의 오프닝 다이얼로그가 흐른다.
      goBattle(!saved)
    },
  })
  mountMeta('title')
}

function goBattle(intro = false) {
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
    intro,
  })
  mountMeta(intro ? 'intro' : 'battle')
}

// 전투에서 들고 나온 보상등급이 희귀도 확률을 정한다. 씬 점퍼 직행이면 운 기준 시작 등급.
function goReward(grade = startGrade(run.player.stats.luck)) {
  reset()
  stage.setAttribute('data-theme', 'day')
  const options = genRewards(run.player, grade, run.day)
  current = new RewardView(stage, {
    day: run.day,
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

// ?scene= 로 직접 진입(스샷/검수용). ?day= 를 붙이면 그 날짜의 편성으로 바로 들어간다.
const params = new URLSearchParams(location.search)
const start = (params.get('scene') as SceneName) || 'title'
const dayParam = Number(params.get('day'))
if (Number.isFinite(dayParam) && dayParam >= 1) run.day = Math.floor(dayParam)
FontManager.load().finally(() => {
  if (start === 'reward') goReward()
  else if (start === 'item') goItem(ITEMS.candle)
  else if (start === 'intro') goBattle(true)
  else if (start === 'battle') goBattle()
  else goTitle()
})
