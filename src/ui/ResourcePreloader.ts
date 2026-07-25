import { BACKGROUNDS, ITEM_ART, SKILL_ART, SPRITES } from '@/assets'
import type { Word } from '@core/types'
import { CHARACTER_VISUALS } from '@data/characters'
import { preloadCharacterModelResources } from '@views/BattleCharacterModel'

// URL별 Promise를 기억하면 씬을 다시 열거나 덱이 성장해도 이미 예열한 이미지를
// 다시 만들지 않는다. 새로 얻은 카드 일러스트만 다음 전투 진입 전에 추가된다.
const imageLoads = new Map<string, Promise<void>>()

function loadImage(src: string): Promise<void> {
  const cached = imageLoads.get(src)
  if (cached) return cached

  const pending = new Promise<void>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      // decode()까지 기다려 첫 전투 프레임에서 메인 스레드 디코딩이 몰리지 않게 한다.
      void image.decode().catch(() => undefined).finally(resolve)
    }
    image.onerror = () => resolve()
    image.src = src
  })
  imageLoads.set(src, pending)
  return pending
}

/**
 * 현재 덱·가방으로 다음 전투에 실제 쓰일 배경·카드·캐릭터 리소스만 예열한다.
 * 가방은 전투 중에 열리므로 보유 아이템 일러스트도 미리 디코딩해 둔다.
 */
export function preloadBattleResources(
  deck: Record<string, Word[]>,
  items: { art: string }[] = [],
): Promise<void> {
  const cardArt = Object.values(deck)
    .flat()
    .flatMap((word) => {
      const src = word.art ? SKILL_ART[word.art] : undefined
      return src ? [src] : []
    })
  const bagArt = items.flatMap((it) => {
    const src = ITEM_ART[it.art]
    return src ? [src] : []
  })
  const urls = [
    ...new Set([...Object.values(BACKGROUNDS), ...Object.values(SPRITES), ...cardArt, ...bagArt]),
  ]
  return Promise.all([
    ...urls.map(loadImage),
    preloadCharacterModelResources(Object.values(CHARACTER_VISUALS)),
  ]).then(() => undefined)
}
