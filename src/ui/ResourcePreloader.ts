import { BACKGROUNDS, ITEM_ART, SKILL_ART } from '@/assets'
import type { Word } from '@core/types'
import { CHARACTER_VISUALS } from '@data/characters'
import { preloadCharacterModelResources } from '@views/BattleCharacterModel'
import { preloadImages } from '@/ui/ResourceLibrary'

/**
 * 현재 덱·가방으로 다음 전투에 실제 쓰일 배경·카드·캐릭터 리소스만 예열한다.
 * 가방은 전투 중에 열리므로 보유 아이템 일러스트도 미리 디코딩해 둔다.
 */
export function preloadBattleResources(
  deck: Record<string, Word[]>,
  items: { art: string }[] = [],
  encounter: string[] = [],
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
  const encounterVisuals = encounter.flatMap((id) => {
    const visual = CHARACTER_VISUALS[id as keyof typeof CHARACTER_VISUALS]
    return visual ? [visual] : []
  })
  const visuals = [
    CHARACTER_VISUALS.player,
    ...encounterVisuals,
    ...(encounter.includes('queenBee') ? [CHARACTER_VISUALS.workerBee] : []),
    ...(encounter.some((id) => id === 'queenBee' || id === 'elderSpider')
      ? [CHARACTER_VISUALS.token]
      : []),
  ]
  const characterArt = visuals.map((visual) => visual.portrait2d)
  const urls = [
    ...new Set([...Object.values(BACKGROUNDS), ...characterArt, ...cardArt, ...bagArt]),
  ]
  return Promise.all([
    preloadImages(urls),
    preloadCharacterModelResources(visuals),
  ]).then(() => undefined)
}
