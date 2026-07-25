import { GameAudio } from '@/audio/GameAudio'
import { GraphicsSettings, type GraphicsQuality } from '@/ui/GameSettings'
import { icon } from '@/ui/Icons'

/** 전투와 타이틀이 같은 저장값·마크업을 쓰는 공용 설정 모달. */
export function openSettingsModal(root: HTMLElement) {
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
}
