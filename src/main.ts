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
import { PASSIVES } from '@core/passives'
import { makeEarlyTables } from '@data/earlyWords'
import { stageFor } from '@data/stages'
import { genRewards } from '@data/rewards'
import { newRun, registerWord, applyItemReward } from '@core/run'
import { startGrade } from '@core/grade'
import { clearRun, loadRun, saveRun } from '@core/save'
import packageInfo from '../package.json'

const STAGE_W = 1920
const STAGE_H = 1080
const stage = document.getElementById('stage') as HTMLElement

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
    grade: def.grade,
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

// 개발/검수용 씬 점퍼 + 아이템 서랍.
function mountDev(active: SceneName) {
  const b = (id: SceneName, label: string) => `<button data-scene="${id}" class="${id === active ? 'on' : ''}">${label}</button>`
  const owned = new Set(run.player.items.map((it) => it.id))
  const chip = (def: ItemDef) =>
    `<button class="dev-item${def.passive ? ' is-passive' : ''}${owned.has(def.id) ? ' owned' : ''}" data-item="${def.id}">
      <b>${def.name}</b><span>${def.passive ? PASSIVES[def.passive].desc : '스탯 아이템'}</span>
    </button>`

  const bar = document.createElement('div')
  bar.className = 'dev-jump'
  bar.innerHTML =
    b('title', '타이틀') +
    b('intro', '인트로') +
    b('battle', '전투') +
    b('reward', '보상') +
    b('item', '감탄') +
    `<button class="dev-grant" data-grant="1">아이템 ▾</button>
     <div class="dev-drawer" id="devdrawer">
       <div class="dev-drawer-head">디버그 지급 — 누르면 바로 획득</div>
       <div class="dev-drawer-grid">${Object.values(ALL_ITEMS).map(chip).join('')}</div>
     </div>`

  bar.querySelectorAll<HTMLElement>('button[data-scene]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const s = btn.dataset.scene as SceneName
      if (s === 'title') goTitle()
      else if (s === 'intro') goBattle(true)
      else if (s === 'battle') goBattle()
      else if (s === 'reward') goReward()
      else goItem(ITEMS.candle)
    }),
  )
  const drawer = bar.querySelector<HTMLElement>('#devdrawer')!
  bar.querySelector<HTMLElement>('[data-grant]')!.addEventListener('click', () => drawer.classList.toggle('open'))
  bar.querySelectorAll<HTMLElement>('.dev-item').forEach((btn) =>
    btn.addEventListener('click', () => grantItem(ALL_ITEMS[btn.dataset.item!])),
  )
  stage.appendChild(bar)
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
  mountDev(active)
  mountVersion()
}

function reset() {
  current?.destroy?.()
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
  mountVersion()
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
