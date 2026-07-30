export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra'
export type AntiAliasingQuality = 'off' | 'medium' | 'high'
export type ResolutionScale = '75' | '100' | '125' | '150'
export type FrameRateLimit = '30' | '45' | '60' | 'unlimited'
export type EffectsQuality = 'low' | 'medium' | 'high'
export type PostProcessingQuality = 'off' | 'medium' | 'high'

export interface GraphicsProfile {
  resolutionScale: number
  activeFps: number
  waitingFps: number
  foilFps: number
  effectScale: number
}

const KEYS = {
  graphics: 'little-token-graphics-quality',
  antialiasing: 'little-token-antialiasing-quality',
  resolution: 'little-token-resolution-scale',
  fps: 'little-token-frame-rate-limit',
  effects: 'little-token-effects-quality',
  postprocessing: 'little-token-postprocessing-quality',
} as const

const GRAPHICS_QUALITIES = new Set<GraphicsQuality>(['low', 'medium', 'high', 'ultra'])
const ANTI_ALIASING_QUALITIES = new Set<AntiAliasingQuality>(['off', 'medium', 'high'])
const RESOLUTION_SCALES = new Set<ResolutionScale>(['75', '100', '125', '150'])
const FRAME_RATE_LIMITS = new Set<FrameRateLimit>(['30', '45', '60', 'unlimited'])
const EFFECTS_QUALITIES = new Set<EffectsQuality>(['low', 'medium', 'high'])
const POSTPROCESSING_QUALITIES = new Set<PostProcessingQuality>(['off', 'medium', 'high'])

const PRESETS: Record<GraphicsQuality, {
  antialiasing: AntiAliasingQuality
  resolution: ResolutionScale
  fps: FrameRateLimit
  effects: EffectsQuality
  postprocessing: PostProcessingQuality
}> = {
  low: { antialiasing: 'off', resolution: '75', fps: '30', effects: 'low', postprocessing: 'off' },
  medium: { antialiasing: 'medium', resolution: '100', fps: '45', effects: 'medium', postprocessing: 'medium' },
  high: { antialiasing: 'medium', resolution: '125', fps: '60', effects: 'high', postprocessing: 'high' },
  ultra: { antialiasing: 'high', resolution: '150', fps: 'unlimited', effects: 'high', postprocessing: 'high' },
}

const ANTI_ALIASING_SCALE: Record<AntiAliasingQuality, number> = { off: 1, medium: 1.35, high: 1.7 }
const EFFECT_SCALE: Record<EffectsQuality, number> = { low: 0.45, medium: 0.72, high: 1 }

function readChoice<T extends string>(key: string, choices: Set<T>, fallback: T): T {
  try {
    const value = localStorage.getItem(key) as T | null
    return value && choices.has(value) ? value : fallback
  } catch {
    return fallback
  }
}

function writeChoice(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 저장소를 쓸 수 없어도 현재 화면에는 적용한다.
  }
}

const defaultQuality = (): GraphicsQuality => {
  if (!matchMedia('(pointer: coarse)').matches) return 'high'
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return deviceMemory != null && deviceMemory <= 4 ? 'low' : 'medium'
}
const savedQuality = () => readChoice(KEYS.graphics, GRAPHICS_QUALITIES, defaultQuality())
const presetFallback = () => PRESETS[savedQuality()]
const savedAntiAliasing = () => readChoice(KEYS.antialiasing, ANTI_ALIASING_QUALITIES, presetFallback().antialiasing)
const savedResolution = () => readChoice(KEYS.resolution, RESOLUTION_SCALES, presetFallback().resolution)
const savedFps = () => readChoice(KEYS.fps, FRAME_RATE_LIMITS, presetFallback().fps)
const savedEffects = () => readChoice(KEYS.effects, EFFECTS_QUALITIES, presetFallback().effects)
const savedPostProcessing = () => readChoice(KEYS.postprocessing, POSTPROCESSING_QUALITIES, presetFallback().postprocessing)

function activeChoice<T extends string>(datasetKey: string, choices: Set<T>, fallback: () => T): T {
  const value = document.documentElement.dataset[datasetKey] as T | undefined
  return value && choices.has(value) ? value : fallback()
}

export const GraphicsSettings = {
  get: savedQuality,
  getAntiAliasing: savedAntiAliasing,
  getResolution: savedResolution,
  getFps: savedFps,
  getEffects: savedEffects,
  getPostProcessing: savedPostProcessing,

  set(quality: GraphicsQuality) {
    writeChoice(KEYS.graphics, quality)
    const preset = PRESETS[quality]
    writeChoice(KEYS.antialiasing, preset.antialiasing)
    writeChoice(KEYS.resolution, preset.resolution)
    writeChoice(KEYS.fps, preset.fps)
    writeChoice(KEYS.effects, preset.effects)
    writeChoice(KEYS.postprocessing, preset.postprocessing)
    this.apply()
  },
  setAntiAliasing(value: AntiAliasingQuality) {
    writeChoice(KEYS.antialiasing, value)
    document.documentElement.dataset.antialiasing = value
  },
  setResolution(value: ResolutionScale) {
    writeChoice(KEYS.resolution, value)
    document.documentElement.dataset.resolution = value
  },
  setFps(value: FrameRateLimit) {
    writeChoice(KEYS.fps, value)
    document.documentElement.dataset.fps = value
  },
  setEffects(value: EffectsQuality) {
    writeChoice(KEYS.effects, value)
    document.documentElement.dataset.effects = value
  },
  setPostProcessing(value: PostProcessingQuality) {
    writeChoice(KEYS.postprocessing, value)
    document.documentElement.dataset.postprocessing = value
  },
  apply() {
    const root = document.documentElement
    root.dataset.graphics = savedQuality()
    root.dataset.antialiasing = savedAntiAliasing()
    root.dataset.resolution = savedResolution()
    root.dataset.fps = savedFps()
    root.dataset.effects = savedEffects()
    root.dataset.postprocessing = savedPostProcessing()
  },
  matchingPreset(): GraphicsQuality | null {
    const current = {
      antialiasing: savedAntiAliasing(),
      resolution: savedResolution(),
      fps: savedFps(),
      effects: savedEffects(),
      postprocessing: savedPostProcessing(),
    }
    return (['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).find((quality) => {
      const preset = PRESETS[quality]
      return preset.antialiasing === current.antialiasing
        && preset.resolution === current.resolution
        && preset.fps === current.fps
        && preset.effects === current.effects
        && preset.postprocessing === current.postprocessing
    }) ?? null
  },
  profile(): GraphicsProfile {
    const resolution = activeChoice('resolution', RESOLUTION_SCALES, savedResolution)
    const fps = activeChoice('fps', FRAME_RATE_LIMITS, savedFps)
    const effects = activeChoice('effects', EFFECTS_QUALITIES, savedEffects)
    const activeFps = fps === 'unlimited' ? 120 : Number(fps)
    return {
      resolutionScale: Number(resolution) / 100,
      activeFps,
      waitingFps: activeFps <= 30 ? 24 : activeFps <= 45 ? 30 : activeFps <= 60 ? 45 : 60,
      foilFps: effects === 'low' ? 0 : Math.min(activeFps, effects === 'medium' ? 30 : 60),
      effectScale: EFFECT_SCALE[effects],
    }
  },
  antiAliasingScale(): number {
    const quality = activeChoice('antialiasing', ANTI_ALIASING_QUALITIES, savedAntiAliasing)
    return ANTI_ALIASING_SCALE[quality]
  },
}
