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

// 좌상단 모서리를 다섯 번 누르면 열리는 개발용 채팅 패널.
function mountDev(active: SceneName) {
  const owned = new Set(run.player.items.map((it) => it.id))
  const shell = document.createElement('div')
  shell.className = 'dev-chat-shell'
  shell.innerHTML = `
    <button class="dev-corner" type="button" aria-label="개발 패널 열기"></button>
    <section class="dev-chat" aria-label="개발 채팅" aria-hidden="true">
      <header><span>DEV CHAT</span><b>${active.toUpperCase()}</b><button type="button" data-close aria-label="닫기">×</button></header>
      <div class="dev-chat-log" aria-live="polite"></div>
      <div class="dev-chat-scenes">
        ${(['title', 'intro', 'battle', 'reward', 'item'] as SceneName[]).map((scene) => `<button type="button" data-scene="${scene}"${scene === active ? ' class="on"' : ''}>${scene}</button>`).join('')}
      </div>
      <form><span>›</span><input name="command" autocomplete="off" spellcheck="false" placeholder="help 또는 명령어 입력" aria-label="개발 명령어" /></form>
    </section>`

  const panel = shell.querySelector<HTMLElement>('.dev-chat')!
  const log = shell.querySelector<HTMLElement>('.dev-chat-log')!
  const input = shell.querySelector<HTMLInputElement>('input')!
  const say = (text: string, kind: 'system' | 'user' = 'system') => {
    const line = document.createElement('p')
    const sender = document.createElement('span')
    line.className = kind
    sender.textContent = kind === 'user' ? 'YOU' : 'DEV'
    line.append(sender, document.createTextNode(text))
    log.append(line)
    log.scrollTop = log.scrollHeight
  }
  const open = () => {
    panel.classList.add('open')
    panel.setAttribute('aria-hidden', 'false')
    say('연결됨. help로 명령어를 확인하세요.')
    window.setTimeout(() => input.focus(), 0)
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
  const execute = (raw: string) => {
    const command = raw.trim()
    if (!command) return
    say(command, 'user')
    const [verb = '', ...args] = command.split(/\s+/)
    const lower = verb.toLowerCase().replace(/^\//, '')
    if (lower === 'help' || lower === '도움') {
      say('scene [title|intro|battle|reward|item] · item [이름 또는 id] · clear · close')
      return
    }
    if (lower === 'clear') {
      log.innerHTML = ''
      return
    }
    if (lower === 'close' || lower === '닫기') {
      close()
      return
    }
    if (lower === 'scene' || lower === '씬') {
      const scene = args[0]?.toLowerCase() as SceneName
      if (['title', 'intro', 'battle', 'reward', 'item'].includes(scene)) goScene(scene)
      else say('알 수 없는 씬입니다.')
      return
    }
    if (lower === 'item' || lower === '아이템') {
      const query = args.join(' ').toLowerCase()
      const def = Object.values(ALL_ITEMS).find((item) => item.id.toLowerCase() === query || item.name.toLowerCase() === query)
      if (!def) say('아이템을 찾지 못했습니다.')
      else if (owned.has(def.id)) say(`${def.name}: 이미 보유 중입니다.`)
      else grantItem(def)
      return
    }
    if (['title', 'intro', 'battle', 'reward', 'item'].includes(lower)) {
      goScene(lower as SceneName)
      return
    }
    say('알 수 없는 명령입니다. help를 입력하세요.')
  }

  let cornerClicks = 0
  shell.querySelector<HTMLElement>('.dev-corner')!.addEventListener('click', () => {
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
  shell.querySelector('form')!.addEventListener('submit', (event) => {
    event.preventDefault()
    execute(input.value)
    input.value = ''
  })
  stage.appendChild(shell)
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
