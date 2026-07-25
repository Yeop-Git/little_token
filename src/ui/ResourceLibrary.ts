interface VideoAsset {
  key: string
  src: string
  type: string
}

interface PooledVideo {
  video: HTMLVideoElement
  releaseTimer: number
}

const imageLoads = new Map<string, Promise<void>>()
const videoPool = new Map<string, PooledVideo[]>()
const videoWarmState = new WeakSet<HTMLVideoElement>()
const pooledVideos = new WeakSet<HTMLVideoElement>()
const VIDEO_POOL_IDLE_MS = 120_000

/** URL별 이미지 다운로드·디코딩을 앱 전체에서 한 번만 수행한다. */
export function preloadImage(src: string): Promise<void> {
  const cached = imageLoads.get(src)
  if (cached) return cached

  const pending = new Promise<void>((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      void image.decode().catch(() => undefined).finally(resolve)
    }
    image.onerror = () => {
      // 일시적인 네트워크/HMR 오류를 성공으로 영구 캐시하지 않는다.
      imageLoads.delete(src)
      resolve()
    }
    image.src = src
  })
  imageLoads.set(src, pending)
  return pending
}

export function preloadImages(sources: Iterable<string>): Promise<void> {
  return Promise.all([...new Set(sources)].map(preloadImage)).then(() => undefined)
}

/**
 * 장면이 바뀌어도 이미 버퍼링·워밍업한 비디오 파이프라인을 재사용한다.
 * 동시에 같은 영상을 두 군데서 쓰는 경우에는 풀 항목이 없으므로 새 요소를 만든다.
 */
export function acquireVideo(asset: VideoAsset): HTMLVideoElement {
  const pool = videoPool.get(asset.key)
  const pooled = pool?.pop()
  if (pooled) {
    window.clearTimeout(pooled.releaseTimer)
    pooledVideos.delete(pooled.video)
    if (pool?.length === 0) videoPool.delete(asset.key)
  }
  const video = pooled?.video ?? createVideo(asset)
  video.dataset.resourceKey = asset.key
  return video
}

export function releaseVideo(video: HTMLVideoElement): void {
  // 중복 destroy 경로가 같은 요소를 풀에 두 번 넣지 못하게 한다.
  if (pooledVideos.has(video)) return
  const key = video.dataset.resourceKey
  resetVideo(video)
  if (!key) {
    unloadVideo(video)
    return
  }
  const pool = videoPool.get(key) ?? []
  if (pool.length >= 1) {
    // 동시 재생 때문에 추가 생성된 요소는 버퍼까지 즉시 해제한다.
    unloadVideo(video)
    return
  }
  const entry: PooledVideo = { video, releaseTimer: 0 }
  entry.releaseTimer = window.setTimeout(() => evictVideo(key, entry), VIDEO_POOL_IDLE_MS)
  pool.push(entry)
  pooledVideos.add(video)
  videoPool.set(key, pool)
}

export function isVideoWarmed(video: HTMLVideoElement): boolean {
  return videoWarmState.has(video)
}

export function markVideoWarmed(video: HTMLVideoElement): void {
  videoWarmState.add(video)
}

function createVideo(asset: VideoAsset): HTMLVideoElement {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  const source = document.createElement('source')
  source.src = asset.src
  source.type = asset.type
  video.append(source)
  video.load()
  return video
}

function evictVideo(key: string, entry: PooledVideo): void {
  const pool = videoPool.get(key)
  const index = pool?.indexOf(entry) ?? -1
  if (!pool || index < 0) return
  pool.splice(index, 1)
  if (pool.length === 0) videoPool.delete(key)
  pooledVideos.delete(entry.video)
  videoWarmState.delete(entry.video)
  unloadVideo(entry.video)
}

function resetVideo(video: HTMLVideoElement): void {
  video.pause()
  try {
    if (Number.isFinite(video.duration)) video.currentTime = 0
  } catch {
    // 메타데이터 로딩 중인 스트림은 아직 seek할 수 없다.
  }
  video.playbackRate = 1
  video.loop = false
  video.remove()
  video.removeAttribute('data-cut')
}

function unloadVideo(video: HTMLVideoElement): void {
  videoWarmState.delete(video)
  video.querySelectorAll('source').forEach((source) => source.remove())
  video.removeAttribute('src')
  video.removeAttribute('data-resource-key')
  video.load()
}
