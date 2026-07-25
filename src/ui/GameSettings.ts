export type GraphicsQuality = 'high' | 'low'

const GRAPHICS_KEY = 'little-token-graphics-quality'

const savedQuality = (): GraphicsQuality => {
  try {
    return localStorage.getItem(GRAPHICS_KEY) === 'low' ? 'low' : 'high'
  } catch {
    return 'high'
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
  apply(quality = savedQuality()) {
    document.documentElement.dataset.graphics = quality
  },
}
