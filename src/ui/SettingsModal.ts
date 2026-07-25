import { GameAudio } from '@/audio/GameAudio'
import { GraphicsSettings, type GraphicsQuality } from '@/ui/GameSettings'
import { icon } from '@/ui/Icons'

/** 전투와 타이틀이 같은 저장값·마크업을 쓰는 공용 설정 모달. */
export function openSettingsModal(root: HTMLElement, opts: { onResetAll: () => void }) {
  let host = root.querySelector<HTMLElement>('#overlay')
  if (!host) {
    host = document.createElement('div')
    host.id = 'overlay'
    root.append(host)
  }
  const volume = Math.round(GameAudio.getVolume() * 100)
  const graphics = GraphicsSettings.get()
  host.innerHTML = `
    <div class="ov-backdrop"></div>
    <section class="ov-panel glass settings-panel" aria-label="설정">
      <div class="ov-head"><div class="ov-title">${icon('settings')} 설정</div><button class="ov-close" id="ov-x" type="button" aria-label="닫기">${icon('close')}</button></div>
      <div class="settings-group">
        <div class="settings-label"><b>오디오</b><span id="volume-value">${volume}%</span></div>
        <input id="volume-range" type="range" min="0" max="100" step="5" value="${volume}" aria-label="마스터 볼륨">
        <p>배경음악과 효과음의 전체 크기를 조절합니다.</p>
      </div>
      <div class="settings-group">
        <div class="settings-label"><b>그래픽</b><span>효과 품질</span></div>
        <div class="graphics-options" role="group" aria-label="그래픽 품질">
          <button type="button" data-quality="high" class="${graphics === 'high' ? 'on' : ''}"><b>고급</b><span>블러·포일·배경 효과</span></button>
          <button type="button" data-quality="low" class="${graphics === 'low' ? 'on' : ''}"><b>절전</b><span>효과를 줄여 가볍게</span></button>
        </div>
      </div>
      <div class="settings-group records-reset-group">
        <div class="settings-label"><b>플레이 기록</b><span>처음부터 다시 쓰기</span></div>
        <button id="records-reset" class="settings-reset-btn" type="button">모든 기록 삭제하고 새 게임</button>
        <p id="records-reset-note" aria-live="polite">진행 중인 일기와 튜토리얼 기록을 모두 삭제하고, 튜토리얼부터 바로 시작합니다.</p>
      </div>
    </section>`
  host.classList.add('open')

  const close = () => {
    host!.classList.remove('open')
    host!.innerHTML = ''
  }
  host.querySelector('#ov-x')!.addEventListener('click', close)
  host.querySelector('.ov-backdrop')!.addEventListener('click', close)
  const range = host.querySelector<HTMLInputElement>('#volume-range')!
  const value = host.querySelector<HTMLElement>('#volume-value')!
  range.addEventListener('input', () => {
    const next = Number(range.value)
    value.textContent = `${next}%`
    GameAudio.setVolume(next / 100)
  })
  host.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach((button) => {
    button.addEventListener('click', () => {
      GraphicsSettings.set(button.dataset.quality as GraphicsQuality)
      host!.querySelectorAll('[data-quality]').forEach((item) => item.classList.remove('on'))
      button.classList.add('on')
    })
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
