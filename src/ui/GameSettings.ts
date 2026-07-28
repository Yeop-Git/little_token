export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'
export type AntiAliasingQuality = 'off' | 'medium' | 'high'

export interface GraphicsProfile {
  pixelRatioCap: number
  activeFps: number
  waitingFps: number
  foilFps: number
}

const GRAPHICS_KEY = 'little-token-graphics-quality'
const ANTI_ALIASING_KEY = 'little-token-antialiasing-quality'

const GRAPHICS_QUALITIES = new Set<GraphicsQuality>(['low', 'medium', 'high', 'ultra'])
const ANTI_ALIASING_QUALITIES = new Set<AntiAliasingQuality>(['off', 'medium', 'high'])

const GRAPHICS_PROFILES: Record<GraphicsQuality, GraphicsProfile> = {
  low: { pixelRatioCap: 0.8, activeFps: 30, waitingFps: 24, foilFps: 0 },
  medium: { pixelRatioCap: 1, activeFps: 45, waitingFps: 30, foilFps: 30 },
  high: { pixelRatioCap: 1.5, activeFps: 60, waitingFps: 45, foilFps: 45 },
  ultra: { pixelRatioCap: 2, activeFps: 60, waitingFps: 60, foilFps: 60 },
}

const ANTI_ALIASING_SCALE: Record<AntiAliasingQuality, number> = {
  off: 1,
  medium: 1.35,
  high: 1.7,
}

const savedQuality = (): GraphicsQuality => {
  try {
    const value = localStorage.getItem(GRAPHICS_KEY) as GraphicsQuality | null
    return value && GRAPHICS_QUALITIES.has(value) ? value : 'high'
  } catch {
    return 'high'
  }
}

const savedAntiAliasing = (): AntiAliasingQuality => {
  try {
    const value = localStorage.getItem(ANTI_ALIASING_KEY) as AntiAliasingQuality | null
    return value && ANTI_ALIASING_QUALITIES.has(value) ? value : 'medium'
  } catch {
    return 'medium'
  }
}

export const GraphicsSettings = {
  get(): GraphicsQuality {
    return savedQuality()
  },
  set(quality: GraphicsQuality) {
    try {
      localStorage.setItem(GRAPHICS_KEY, quality)
    } catch {
      // 저장소를 쓸 수 없어도 현재 화면에는 적용한다.
    }
    this.apply(quality)
  },
  getAntiAliasing(): AntiAliasingQuality {
    return savedAntiAliasing()
  },
  setAntiAliasing(quality: AntiAliasingQuality) {
    try {
      localStorage.setItem(ANTI_ALIASING_KEY, quality)
    } catch {
      // 저장소를 쓸 수 없어도 현재 화면에는 적용한다.
    }
    this.apply(undefined, quality)
  },
  apply(quality = savedQuality(), antiAliasing = savedAntiAliasing()) {
    document.documentElement.dataset.graphics = quality
    document.documentElement.dataset.antialiasing = antiAliasing
  },
  profile(): GraphicsProfile {
    const quality = document.documentElement.dataset.graphics as GraphicsQuality | undefined
    return GRAPHICS_PROFILES[quality && GRAPHICS_QUALITIES.has(quality) ? quality : savedQuality()]
  },
  antiAliasingScale(): number {
    const quality = document.documentElement.dataset.antialiasing as AntiAliasingQuality | undefined
    return ANTI_ALIASING_SCALE[quality && ANTI_ALIASING_QUALITIES.has(quality) ? quality : savedAntiAliasing()]
  },
}
