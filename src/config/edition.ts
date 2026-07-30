import { STORY_FLOORS, floorInCycle } from '@data/stages'

export type AppEdition = 'demo' | 'full'

const env = import.meta.env ?? {}

export const APP_EDITION: AppEdition = env.VITE_APP_EDITION === 'demo' ? 'demo' : 'full'
export const IS_DEMO = APP_EDITION === 'demo'
export const DEMO_FLOORS = 5
export const floorsForEdition = (edition: AppEdition): number => edition === 'demo' ? DEMO_FLOORS : STORY_FLOORS
export const DISPLAY_FLOORS = floorsForEdition(APP_EDITION)
export const isEditionFinalFloor = (day: number, edition: AppEdition = APP_EDITION): boolean =>
  floorInCycle(day) === floorsForEdition(edition)
export const FEEDBACK_URL = (env.VITE_FEEDBACK_URL ?? '').trim()
export const STRICT_RESOURCE_LOADING = env.VITE_STRICT_RESOURCES === '1'

export function strictResourceError(kind: string, src: string): Error {
  return new Error(`[resource:strict] ${kind} failed: ${src}`)
}
