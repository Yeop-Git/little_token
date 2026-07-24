/**
 * 부트 + 무대 스케일러 + 런 루프 컨트롤러.
 * 고정 1920x1080 무대를 뷰포트에 맞춰 scale()로 레터박스.
 * 런: 하루 전투 클리어 → 보상(문장=스킬업 / 아이템=스펙업) → 다음날(더 강한 스테이지).
 */

import './style.css'
import { BattleView } from '@views/BattleView'
import { RewardView } from '@views/RewardView'
import { ItemExclaimView } from '@views/ItemExclaimView'
import { FontManager } from '@/ui/FontManager'
import { ITEMS, type ItemDef } from '@data/items'
import { makeEarlyTables } from '@data/earlyWords'
import { stageFor } from '@data/stages'
import { genRewards } from '@data/rewards'
import { newRun, registerWord, applyItemReward } from '@core/run'
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

const run = newRun()
let current: { destroy?: () => void } | null = null
type SceneName = 'battle' | 'reward' | 'item'

// 개발/검수용 씬 점퍼.
function mountDev(active: SceneName) {
  const b = (id: SceneName, label: string) => `<button data-scene="${id}" class="${id === active ? 'on' : ''}">${label}</button>`
  const bar = document.createElement('div')
  bar.className = 'dev-jump'
  bar.innerHTML = b('battle', '전투') + b('reward', '보상') + b('item', '아이템')
  bar.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', () => {
      const s = (btn as HTMLElement).dataset.scene as SceneName
      if (s === 'battle') goBattle()
      else if (s === 'reward') goReward()
      else goItem(ITEMS.candle)
    }),
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
  mountDev(active)
  mountVersion()
}

function reset() {
  current?.destroy?.()
  stage.innerHTML = ''
}

function goBattle() {
  reset()
  const st = stageFor(run.day)
  stage.setAttribute('data-theme', st.field.theme)
  current = new BattleView(stage, {
    field: st.field,
    encounter: st.encounter,
    hpMult: st.hpMult,
    atkMult: st.atkMult,
    player: run.player,
    tables: makeEarlyTables(run.player.deck),
    onWin: () => goReward(),
  })
  mountMeta('battle')
}

function goReward() {
  reset()
  stage.setAttribute('data-theme', 'day')
  const options = genRewards(run.player.stats.luck)
  current = new RewardView(stage, {
    day: run.day,
    nextField: stageFor(run.day + 1).field,
    options,
    onPick: (opt) => {
      if (opt.kind === 'word' && opt.word) {
        registerWord(run.player, opt.word) // 문장 = 스킬업
        run.day++
        goBattle()
      } else if (opt.item) {
        goItem(opt.item) // 아이템 = 감탄사 커스텀(스펙업)
      }
    },
  })
  mountMeta('reward')
}

function goItem(itemDef: ItemDef) {
  reset()
  stage.setAttribute('data-theme', 'day')
  current = new ItemExclaimView(stage, {
    item: itemDef,
    onDone: (result) => {
      applyItemReward(run.player, result)
      run.day++
      goBattle()
    },
  })
  mountMeta('item')
}

// ?scene= 로 직접 진입(스샷/검수용). 폰트 로드 후 시작.
const start = (new URLSearchParams(location.search).get('scene') as SceneName) || 'battle'
FontManager.load().finally(() => {
  if (start === 'reward') goReward()
  else if (start === 'item') goItem(ITEMS.candle)
  else goBattle()
})
