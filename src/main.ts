/**
 * 부트 + 무대 스케일러 + 씬 라우터.
 * 고정 1920x1080 무대를 뷰포트에 맞춰 transform: scale()로 레터박스한다.
 * (유니티 이식 대비: 기준 해상도 고정 → 좌표를 그대로 옮기기 쉽다.)
 */

import './style.css'
import { BattleView } from '@views/BattleView'
import { RewardView } from '@views/RewardView'
import { ItemExclaimView } from '@views/ItemExclaimView'
import { FontManager } from '@/ui/FontManager'
import { FIELDS } from '@data/fields'
import { ITEMS } from '@data/items'
import { makeEarlyTables, EARLY_WORDS } from '@data/earlyWords'
import { defaultPlayer } from '@core/player'

const STAGE_W = 1920
const STAGE_H = 1080
const stage = document.getElementById('stage') as HTMLElement

function fit() {
  const s = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H)
  stage.style.setProperty('--scale', String(s))
}
window.addEventListener('resize', fit)
fit()

type SceneName = 'battle' | 'reward' | 'item'

// 개발/검수용 씬 점퍼. 스샷·플레이테스트에 쓴다.
function devBar(active: SceneName): string {
  const b = (id: SceneName, label: string) =>
    `<button data-scene="${id}" class="${id === active ? 'on' : ''}">${label}</button>`
  return `<div class="dev-jump">${b('battle', '전투')}${b('reward', '보상')}${b('item', '아이템')}</div>`
}

let current: { destroy?: () => void } | null = null

function go(scene: SceneName) {
  current?.destroy?.()
  stage.innerHTML = ''
  if (scene === 'battle') {
    stage.setAttribute('data-theme', FIELDS[0].theme)
    // 초기 레벨: 3단어(나는+방식+행동) 자연 문장, 간단한 때리기/막기 수치.
    const player = defaultPlayer()
    player.deck = EARLY_WORDS
    current = new BattleView(stage, {
      field: FIELDS[0],
      encounter: ['moth', 'roach', 'moth'],
      onWin: () => go('reward'),
      player,
      tables: makeEarlyTables(),
    })
  } else if (scene === 'reward') {
    stage.setAttribute('data-theme', 'day')
    current = new RewardView(stage, { nextField: FIELDS[1], onPickItem: () => go('item'), onPickWord: () => go('battle') })
  } else {
    stage.setAttribute('data-theme', 'day')
    current = new ItemExclaimView(stage, { item: ITEMS.candle, onDone: () => go('battle') })
  }
  // 씬 점퍼 부착
  const bar = document.createElement('div')
  bar.innerHTML = devBar(scene)
  const el = bar.firstElementChild as HTMLElement
  el.querySelectorAll('button').forEach((btn) =>
    btn.addEventListener('click', () => go(btn.dataset.scene as SceneName)),
  )
  stage.appendChild(el)
}

// URL ?scene= 로 직접 진입(스샷 자동화용). 폰트 로드 후 첫 씬 구성.
const start = (new URLSearchParams(location.search).get('scene') as SceneName) || 'battle'
FontManager.load().finally(() => go(start))
