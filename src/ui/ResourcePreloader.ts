import { BACKGROUNDS, SKILL_ART, SPRITES } from '@/assets'

let battlePreload: Promise<void> | null = null

function loadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      // decode()까지 기다려 첫 전투 프레임에서 메인 스레드 디코딩이 몰리지 않게 한다.
      void image.decode().catch(() => undefined).finally(resolve)
    }
    image.onerror = () => resolve()
    image.src = src
  })
}

/** 타이틀 체류 중 전투에 쓰이는 배경·카드·캐릭터 리소스를 한 번만 예열한다. */
export function preloadBattleResources(): Promise<void> {
  if (battlePreload) return battlePreload
  const urls = [...new Set([...Object.values(BACKGROUNDS), ...Object.values(SPRITES), ...Object.values(SKILL_ART)])]
  battlePreload = Promise.all(urls.map(loadImage)).then(() => undefined)
  return battlePreload
}
