import { GameAudio } from '@/audio/GameAudio'
import {
  GraphicsSettings,
  type AntiAliasingQuality,
  type EffectsQuality,
  type FrameRateLimit,
  type GraphicsQuality,
  type PostProcessingQuality,
  type ResolutionScale,
} from '@/ui/GameSettings'
import { icon } from '@/ui/Icons'

type SettingsTab = 'graphics' | 'sound' | 'other'

/** 전투와 타이틀이 같은 저장값·마크업을 쓰는 공용 설정 모달. */
export function openSettingsModal(root: HTMLElement, opts: { onResetAll: () => void }) {
  let host = root.querySelector<HTMLElement>('#overlay')
  if (!host) {
    host = document.createElement('div')
    host.id = 'overlay'
    root.append(host)
  }
  const volume = Math.round(GameAudio.getVolume() * 100)
  const graphics = GraphicsSettings.matchingPreset()
  const antiAliasing = GraphicsSettings.getAntiAliasing()
  const resolution = GraphicsSettings.getResolution()
  const fps = GraphicsSettings.getFps()
  const effects = GraphicsSettings.getEffects()
  const postprocessing = GraphicsSettings.getPostProcessing()

  host.innerHTML = `
    <div class="ov-backdrop"></div>
    <section class="ov-panel glass settings-panel" aria-label="설정">
      <div class="ov-head"><div class="ov-title">${icon('settings')} 설정</div><button class="ov-close" id="ov-x" type="button" aria-label="닫기">${icon('close')}</button></div>
      <div class="settings-tabs" role="tablist" aria-label="설정 분류">
        <button type="button" role="tab" data-settings-tab="graphics" aria-selected="true">그래픽</button>
        <button type="button" role="tab" data-settings-tab="sound" aria-selected="false">사운드</button>
        <button type="button" role="tab" data-settings-tab="other" aria-selected="false">기타</button>
      </div>
      <div class="settings-tab-panel graphics-settings-panel" data-settings-panel="graphics" role="tabpanel">
        <div class="settings-group settings-wide">
          <div class="settings-label"><b>품질 프리셋</b><span>세부 항목을 한 번에 설정</span></div>
          <div class="graphics-options" role="group" aria-label="그래픽 품질">
            <button type="button" data-quality="low" class="${graphics === 'low' ? 'on' : ''}"><b>낮음</b><span>가볍고 빠르게</span></button>
            <button type="button" data-quality="medium" class="${graphics === 'medium' ? 'on' : ''}"><b>보통</b><span>성능과 품질 균형</span></button>
            <button type="button" data-quality="high" class="${graphics === 'high' ? 'on' : ''}"><b>높음</b><span>선명하고 풍부하게</span></button>
            <button type="button" data-quality="ultra" class="${graphics === 'ultra' ? 'on' : ''}"><b>울트라</b><span>모든 품질 최대</span></button>
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-label"><b>해상도</b><span>캐릭터 렌더 배율</span></div>
          <div class="graphics-options compact-options" role="group" aria-label="해상도 배율">
            ${['75', '100', '125', '150'].map((value) => `<button type="button" data-resolution="${value}" class="${resolution === value ? 'on' : ''}"><b>${value}%</b></button>`).join('')}
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-label"><b>최대 FPS</b><span>렌더 갱신 빈도</span></div>
          <div class="graphics-options compact-options" role="group" aria-label="최대 FPS">
            ${['30', '45', '60', 'unlimited'].map((value) => `<button type="button" data-fps="${value}" class="${fps === value ? 'on' : ''}"><b>${value === 'unlimited' ? '무제한' : value}</b></button>`).join('')}
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-label"><b>이펙트</b><span>파편·불꽃 밀도</span></div>
          <div class="graphics-options triple-options" role="group" aria-label="이펙트 품질">
            <button type="button" data-effects="low" class="${effects === 'low' ? 'on' : ''}"><b>낮음</b></button>
            <button type="button" data-effects="medium" class="${effects === 'medium' ? 'on' : ''}"><b>보통</b></button>
            <button type="button" data-effects="high" class="${effects === 'high' ? 'on' : ''}"><b>높음</b></button>
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-label"><b>후처리</b><span>블러·색감·비네팅</span></div>
          <div class="graphics-options triple-options" role="group" aria-label="후처리 품질">
            <button type="button" data-postprocessing="off" class="${postprocessing === 'off' ? 'on' : ''}"><b>끔</b></button>
            <button type="button" data-postprocessing="medium" class="${postprocessing === 'medium' ? 'on' : ''}"><b>보통</b></button>
            <button type="button" data-postprocessing="high" class="${postprocessing === 'high' ? 'on' : ''}"><b>높음</b></button>
          </div>
        </div>
        <div class="settings-group settings-wide">
          <div class="settings-label"><b>안티앨리어싱</b><span>캐릭터 가장자리</span></div>
          <div class="graphics-options triple-options" role="group" aria-label="안티앨리어싱 품질">
            <button type="button" data-aa="off" class="${antiAliasing === 'off' ? 'on' : ''}"><b>끔</b><span>추가 샘플링 없음</span></button>
            <button type="button" data-aa="medium" class="${antiAliasing === 'medium' ? 'on' : ''}"><b>보통</b><span>1.35배 선명화</span></button>
            <button type="button" data-aa="high" class="${antiAliasing === 'high' ? 'on' : ''}"><b>높음</b><span>1.7배 선명화</span></button>
          </div>
        </div>
      </div>
      <div class="settings-tab-panel" data-settings-panel="sound" role="tabpanel" hidden>
        <div class="settings-group">
          <div class="settings-label"><b>마스터 볼륨</b><span id="volume-value">${volume}%</span></div>
          <input id="volume-range" type="range" min="0" max="100" step="5" value="${volume}" aria-label="마스터 볼륨">
          <p>배경음악과 효과음의 전체 크기를 조절합니다.</p>
        </div>
      </div>
      <div class="settings-tab-panel" data-settings-panel="other" role="tabpanel" hidden>
        <div class="settings-group records-reset-group">
          <div class="settings-label"><b>플레이 기록</b><span>처음부터 다시 쓰기</span></div>
          <button id="records-reset" class="settings-reset-btn" type="button">모든 기록 삭제하고 새 게임</button>
          <p id="records-reset-note" aria-live="polite">진행 중인 일기와 튜토리얼 기록을 모두 삭제하고, 튜토리얼부터 바로 시작합니다.</p>
        </div>
      </div>
    </section>`
  host.classList.add('open')

  const close = () => {
    host!.classList.remove('open')
    host!.innerHTML = ''
  }
  host.querySelector('#ov-x')!.addEventListener('click', close)
  host.querySelector('.ov-backdrop')!.addEventListener('click', close)

  const activateTab = (tab: SettingsTab) => {
    host!.querySelectorAll<HTMLElement>('[data-settings-panel]').forEach((panel) => { panel.hidden = panel.dataset.settingsPanel !== tab })
    host!.querySelectorAll<HTMLElement>('[data-settings-tab]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.settingsTab === tab)))
  }
  host.querySelectorAll<HTMLButtonElement>('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => activateTab(button.dataset.settingsTab as SettingsTab)))

  const syncGraphicsSelection = () => {
    const values: Record<string, string> = {
      quality: GraphicsSettings.matchingPreset() ?? '',
      aa: GraphicsSettings.getAntiAliasing(),
      resolution: GraphicsSettings.getResolution(),
      fps: GraphicsSettings.getFps(),
      effects: GraphicsSettings.getEffects(),
      postprocessing: GraphicsSettings.getPostProcessing(),
    }
    Object.entries(values).forEach(([key, value]) => host!.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((item) => item.classList.toggle('on', item.dataset[key] === value)))
  }
  host.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.set(button.dataset.quality as GraphicsQuality); syncGraphicsSelection() }))
  host.querySelectorAll<HTMLButtonElement>('[data-aa]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.setAntiAliasing(button.dataset.aa as AntiAliasingQuality); syncGraphicsSelection() }))
  host.querySelectorAll<HTMLButtonElement>('[data-resolution]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.setResolution(button.dataset.resolution as ResolutionScale); syncGraphicsSelection() }))
  host.querySelectorAll<HTMLButtonElement>('[data-fps]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.setFps(button.dataset.fps as FrameRateLimit); syncGraphicsSelection() }))
  host.querySelectorAll<HTMLButtonElement>('[data-effects]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.setEffects(button.dataset.effects as EffectsQuality); syncGraphicsSelection() }))
  host.querySelectorAll<HTMLButtonElement>('[data-postprocessing]').forEach((button) => button.addEventListener('click', () => { GraphicsSettings.setPostProcessing(button.dataset.postprocessing as PostProcessingQuality); syncGraphicsSelection() }))

  const range = host.querySelector<HTMLInputElement>('#volume-range')!
  const value = host.querySelector<HTMLElement>('#volume-value')!
  range.addEventListener('input', () => {
    const next = Number(range.value)
    value.textContent = `${next}%`
    GameAudio.setVolume(next / 100)
  })

  const recordsReset = host.querySelector<HTMLButtonElement>('#records-reset')!
  let resetConfirmTimer = 0
  recordsReset.addEventListener('click', () => {
    if (!recordsReset.classList.contains('is-danger')) {
      recordsReset.classList.add('is-danger')
      recordsReset.textContent = '정말 모두 삭제할까요?'
      host!.querySelector<HTMLElement>('#records-reset-note')!.textContent = '한 번 더 누르면 삭제 후 새 게임을 시작합니다.'
      resetConfirmTimer = window.setTimeout(() => {
        recordsReset.classList.remove('is-danger')
        recordsReset.textContent = '모든 기록 삭제하고 새 게임'
        host?.querySelector<HTMLElement>('#records-reset-note')?.replaceChildren('진행 중인 일기와 튜토리얼 기록을 모두 삭제하고, 튜토리얼부터 바로 시작합니다.')
      }, 3400)
      return
    }
    clearTimeout(resetConfirmTimer)
    opts.onResetAll()
  })
}
