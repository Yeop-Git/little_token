import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { CharacterVisualDef } from '@data/characters'
import { currentFieldLight } from '@data/backgrounds'

export type BattleAnimation = 'idle' | 'idle2' | 'walk' | 'appear' | 'attack' | 'attack2' | 'attack3' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat'
/** 한 번만 재생하고 끝나는 동작. idle 계열과 walk는 계속 도는 클립이라 여기 안 든다. */
type OneShotAnimation = Exclude<BattleAnimation, 'idle' | 'idle2' | 'walk'>
const MODEL_VIEW_HEIGHT = 3.6
// 360px 셸에서 약 278px로 보이게 해 전방 적 스프라이트의 불투명 픽셀 높이와 맞춘다.
const MODEL_FIT_HEIGHT = 2.78
const COMPANION_FIT_HEIGHT = 0.72
const TRANSITION_SECONDS = 0.18
const LOOP_BLEND_SAMPLE_RATE = 30
const MODEL_YAW_RETURN_SPEED = 9
const MODEL_YAW_RETURN_EPSILON = 0.001
const RETURN_TO_IDLE = new Set<BattleAnimation>(['appear', 'attack', 'attack2', 'attack3', 'heal', 'shield'])

type BattleWeather = 'sunny' | 'rain' | 'night'

interface BattleAtmosphere {
  skyTint: THREE.Color
  groundTint: THREE.Color
  skyLight: THREE.Color
  keyLight: THREE.Color
  skyMix: number
  groundMix: number
  skyLightIntensity: number
  keyLightIntensity: number
  keyLightPosition: readonly [number, number, number]
  emissiveIntensity: number
  exposure: number
}

/**
 * 배경 일러스트처럼 명부·중간톤·암부가 또렷한 3단 카툰 명암을 만든다.
 * 가장 어두운 단계도 완전한 검정으로 닫지 않아 원본 텍스처 디테일은 남긴다.
 */
function makeBattleToonGradient(): THREE.DataTexture {
  const values = [92, 174, 255]
  const data = new Uint8Array(values.flatMap((value) => [value, value, value, 255]))
  const texture = new THREE.DataTexture(data, values.length, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

const BATTLE_TOON_GRADIENT = makeBattleToonGradient()
let companionGlowTexture: THREE.CanvasTexture | null = null

function getCompanionGlowTexture(): THREE.CanvasTexture {
  if (companionGlowTexture) return companionGlowTexture
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, 'rgba(255,244,188,.12)')
  gradient.addColorStop(0.26, 'rgba(255,220,116,.16)')
  gradient.addColorStop(0.58, 'rgba(255,185,72,.1)')
  gradient.addColorStop(1, 'rgba(255,174,56,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  companionGlowTexture = new THREE.CanvasTexture(canvas)
  companionGlowTexture.colorSpace = THREE.SRGBColorSpace
  return companionGlowTexture
}

/**
 * 전장의 배경색을 캐릭터 텍스처에 아주 얕게 섞는다. 자체광 비중을 높여
 * 언릿 카툰 인상은 유지하고, 발밑은 배경의 청록색에 더 잠기며 머리 쪽은
 * 하늘색을 조금 받게 한다.
 */
const BATTLE_ATMOSPHERES: Record<BattleWeather, BattleAtmosphere> = {
  sunny: {
    skyTint: new THREE.Color(0xfff0c2),
    groundTint: new THREE.Color(0x53665f),
    skyLight: new THREE.Color(0xffe9bd),
    keyLight: new THREE.Color(0xffedc7),
    skyMix: 0.07,
    groundMix: 0.28,
    skyLightIntensity: 0.56,
    keyLightIntensity: 1.5,
    keyLightPosition: [-3.5, 6, 5],
    emissiveIntensity: 0.38,
    exposure: 0.96,
  },
  rain: {
    skyTint: new THREE.Color(0xaec8d0),
    groundTint: new THREE.Color(0x405665),
    skyLight: new THREE.Color(0xb8d0d7),
    keyLight: new THREE.Color(0xd7e4df),
    skyMix: 0.12,
    groundMix: 0.36,
    skyLightIntensity: 0.4,
    keyLightIntensity: 1.02,
    keyLightPosition: [-1.5, 7, 4],
    emissiveIntensity: 0.28,
    exposure: 0.84,
  },
  night: {
    skyTint: new THREE.Color(0x8998c4),
    groundTint: new THREE.Color(0x252c4d),
    skyLight: new THREE.Color(0x7188bd),
    keyLight: new THREE.Color(0xffc879),
    skyMix: 0.17,
    groundMix: 0.46,
    skyLightIntensity: 0.24,
    keyLightIntensity: 0.82,
    keyLightPosition: [-4, 3.2, 5.5],
    emissiveIntensity: 0.14,
    exposure: 0.7,
  },
}

function battleWeatherOf(shell: HTMLElement): BattleWeather {
  const weather = shell.closest<HTMLElement>('.battle')?.dataset.weather as BattleWeather | undefined
  return weather && weather in BATTLE_ATMOSPHERES ? weather : 'sunny'
}

interface PlusParticle {
  group: THREE.Group
  phase: number
  x: number
  y: number
}

interface EffectShard {
  group: THREE.Group
  material: THREE.MeshBasicMaterial
  distance: number
  delay: number
}

interface SpiderPartDissolve {
  id: string
  root: THREE.Object3D
  materials: THREE.MeshToonMaterial[]
  elapsed: number
  duration: number
  fallDirection: number
}

const SPIDER_PART_NODES: Record<string, string> = {
  'leg-joy': 'pasted__pasted__pasted__pasted__pasted__leg3',
  'leg-anger': 'pasted__pasted__pasted__pasted__leg3',
  'leg-sorrow': 'pasted__pasted__pasted__leg3',
  'leg-pleasure': 'pasted__pasted__pasted__pasted__leg3.001',
}
const SPIDER_PART_ORDER = ['leg-joy', 'leg-anger', 'leg-sorrow', 'leg-pleasure'] as const

const modelLoads = new Map<string, Promise<GLTF>>()
const modelLoader = new GLTFLoader()
const normalizedClipCache = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>()
// 모든 배우가 한 WebGL 컨텍스트를 공유한다. 배우마다 컨텍스트를 만들면 여왕벌전에서
// 같은 텍스처·셰이더를 일곱 번 GPU에 올려 첫 출력마다 수 초씩 메인 스레드가 멎는다.
const SHARED_RENDER_SIZE = 1024
let sharedRenderer: THREE.WebGLRenderer | null = null
// 출력 캔버스 DPR 1.5는 픽셀 작업량이 2.25배가 된다.
// 카툰 셰이더의 계단은 1.25에서도 거의 보이지 않으며, 전투 중 지속 GPU 부하는
// 1.5 대비 약 31% 줄어든다. 뒤쪽 적은 흐림·축소 연출이 있어 1배면 충분하다.
const FOREGROUND_PIXEL_RATIO_CAP = 1.25
const mountedModels = new WeakMap<HTMLElement, BattleCharacterModel>()
const activeModels = new Set<BattleCharacterModel>()
let animationFrame = 0
let previousFrame = 0
let slowFramePressure = 0
let adaptiveRenderReduction = false
let stableFrameTime = 0
let fullRatePressure = 0
let adaptiveFullRate = false

function syncModelPerformanceMode() {
  if (adaptiveRenderReduction) document.documentElement.dataset.modelPerformance = 'reduced'
  else if (adaptiveFullRate) document.documentElement.dataset.modelPerformance = 'full-rate'
  else delete document.documentElement.dataset.modelPerformance
}

function updateAdaptiveRenderBudget(frameMs: number) {
  // 일시적인 탭 전환·개발자 도구 정지는 품질 변경 근거로 삼지 않는다.
  if (frameMs <= 0 || frameMs >= 100) return

  const highQuality = document.documentElement.dataset.graphics !== 'low'
  if (!highQuality && adaptiveFullRate) {
    adaptiveFullRate = false
    stableFrameTime = 0
    fullRatePressure = 0
    syncModelPerformanceMode()
  }

  // 60Hz 기준으로 약 2.5초간 안정적인 프레임 여유가 확인되면 전경 idle 제한을
  // 30→60fps로 푼다. 해제 뒤 부하가 생기면 짧은 히스테리시스를 거쳐 즉시 원래
  // 제한으로 돌아가며, 다시 시험하기 전에는 충분한 안정 구간을 요구한다.
  if (!adaptiveRenderReduction && highQuality && activeModels.size >= 2) {
    if (adaptiveFullRate) {
      fullRatePressure = frameMs > 21
        ? Math.min(20, fullRatePressure + Math.max(0.75, (frameMs - 18) / 8))
        : Math.max(0, fullRatePressure - 0.5)
      if (fullRatePressure >= 10) {
        adaptiveFullRate = false
        stableFrameTime = -3_000
        fullRatePressure = 0
        syncModelPerformanceMode()
      }
    } else {
      stableFrameTime = frameMs <= 20 && slowFramePressure < 5
        ? Math.min(2_500, stableFrameTime + frameMs)
        : Math.max(-3_000, stableFrameTime - frameMs * 2)
      if (stableFrameTime >= 2_500) {
        adaptiveFullRate = true
        fullRatePressure = 0
        syncModelPerformanceMode()
      }
    }
  }

  // 배우가 둘 이상인 실제 전투에서 24ms 초과 프레임이 오래 누적되면 해제 여부와
  // 관계없이 기존 저사양 보호 단계까지 내린다.
  if (activeModels.size < 2) return
  slowFramePressure = frameMs > 24
    ? Math.min(45, slowFramePressure + Math.max(0.5, (frameMs - 20) / 16.67))
    : Math.max(0, slowFramePressure - 0.35)
  if (adaptiveRenderReduction || slowFramePressure < 30) return
  adaptiveRenderReduction = true
  adaptiveFullRate = false
  syncModelPerformanceMode()
}

function loadModel(url: string): Promise<GLTF> {
  const cached = modelLoads.get(url)
  if (cached) return cached
  const pending = modelLoader.loadAsync(url).catch((error) => {
    // 한 번의 전송/파싱 실패를 세션 전체의 영구 실패로 만들지 않는다.
    modelLoads.delete(url)
    throw error
  })
  modelLoads.set(url, pending)
  return pending
}

function acquireRenderer(): THREE.WebGLRenderer {
  if (sharedRenderer && !sharedRenderer.getContext().isContextLost()) return sharedRenderer
  sharedRenderer?.dispose()
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.autoClear = false
  renderer.setPixelRatio(1)
  renderer.setSize(SHARED_RENDER_SIZE, SHARED_RENDER_SIZE, false)
  sharedRenderer = renderer
  return sharedRenderer
}

function runAnimationFrame(now: number) {
  const frameMs = previousFrame ? now - previousFrame : 0
  const delta = Math.min(frameMs / 1000, 0.1)
  previousFrame = now
  if (!document.hidden) {
    updateAdaptiveRenderBudget(frameMs)
    const models = [...activeModels]
    const budget = adaptiveRenderReduction && models.length >= 3
      ? models.length >= 6 ? 2 : 1
      : models.length
    const allowed = new Set(
      models
        .filter((model) => model.wantsRender(now))
        .sort((a, b) => b.renderPriority(now) - a.renderPriority(now))
        .slice(0, budget),
    )
    models.forEach((model) => model.render(delta, now, allowed.has(model)))
  }
  animationFrame = activeModels.size ? requestAnimationFrame(runAnimationFrame) : 0
  if (!animationFrame) previousFrame = 0
}

function addToAnimationFrame(model: BattleCharacterModel) {
  activeModels.add(model)
  if (!animationFrame) animationFrame = requestAnimationFrame(runAnimationFrame)
}

function removeFromAnimationFrame(model: BattleCharacterModel) {
  activeModels.delete(model)
  if (activeModels.size) return
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
  previousFrame = 0
  slowFramePressure = 0
  adaptiveRenderReduction = false
  stableFrameTime = 0
  fullRatePressure = 0
  adaptiveFullRate = false
  syncModelPerformanceMode()
  sharedRenderer?.renderLists.dispose()
}

/**
 * 일부 DCC/엔진에서 내보낸 클립은 첫 키가 0초보다 늦어서 반복할 때 잠깐
 * 첫 자세에 멈춘 것처럼 보인다. 시간을 0초 기준으로 옮기고, 캐릭터별로
 * 불필요한 끝 구간을 덜어낸 뒤 idle의 마지막 구간을 첫 자세로 점진 보간해
 * 루프 경계에서도 포즈가 튀지 않게 한다.
 */
function normalizedClip(
  source: THREE.AnimationClip,
  seamlessLoop: boolean,
  loopBlendSeconds = 0,
  endTrimSeconds = 0,
): THREE.AnimationClip {
  const cacheKey = `${seamlessLoop ? 1 : 0}:${loopBlendSeconds}:${endTrimSeconds}`
  const variants = normalizedClipCache.get(source) ?? new Map<string, THREE.AnimationClip>()
  const cached = variants.get(cacheKey)
  if (cached) return cached
  const clip = source.clone()
  const firstTime = clip.tracks.reduce((earliest, track) => {
    const time = track.times[0]
    return time == null ? earliest : Math.min(earliest, time)
  }, Number.POSITIVE_INFINITY)

  if (Number.isFinite(firstTime) && firstTime > 0) {
    clip.tracks.forEach((track) => {
      for (let index = 0; index < track.times.length; index += 1) {
        track.times[index] -= firstTime
      }
    })
  }

  clip.resetDuration()

  if (endTrimSeconds > 0) {
    const trimmedEndTime = Math.max(0, clip.duration - endTrimSeconds)
    clip.tracks.forEach((track) => {
      const valueSize = track.getValueSize()
      const interpolatingTrack = track as typeof track & {
        createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> }
      }
      const endValue = Array.from(
        interpolatingTrack.createInterpolant(new Float32Array(valueSize)).evaluate(trimmedEndTime),
      )
      let keptKeyCount = track.times.length
      while (keptKeyCount > 0 && track.times[keptKeyCount - 1] > trimmedEndTime) keptKeyCount -= 1

      const times = Array.from(track.times.slice(0, keptKeyCount))
      const values = Array.from(track.values.slice(0, keptKeyCount * valueSize))
      const hasEndKey = Math.abs((times[times.length - 1] ?? -1) - trimmedEndTime) < 0.00001
      if (hasEndKey) values.splice(values.length - valueSize, valueSize, ...endValue)
      else {
        times.push(trimmedEndTime)
        values.push(...endValue)
      }
      track.times = new Float32Array(times)
      track.values = new Float32Array(values)
    })
    clip.resetDuration()
  }

  if (seamlessLoop) {
    clip.tracks.forEach((track) => {
      const valueSize = track.getValueSize()
      const endTime = track.times[track.times.length - 1] ?? clip.duration
      const blendDuration = Math.min(Math.max(0, loopBlendSeconds), endTime)
      if (blendDuration <= 0) {
        const lastOffset = track.values.length - valueSize
        if (lastOffset <= 0) return
        for (let component = 0; component < valueSize; component += 1) {
          track.values[lastOffset + component] = track.values[component]
        }
        return
      }

      const blendStart = endTime - blendDuration
      const firstValue = Array.from(track.values.slice(0, valueSize))
      const interpolatingTrack = track as typeof track & {
        createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> }
      }
      const interpolant = interpolatingTrack.createInterpolant(new Float32Array(valueSize))
      const times = Array.from(track.times).filter((time) => time < blendStart)
      const values = Array.from(track.values.slice(0, times.length * valueSize))
      const sampleCount = Math.max(2, Math.ceil(blendDuration * LOOP_BLEND_SAMPLE_RATE))

      // 원본 키가 성긴 클립도 실제 0.5초 동안 보간되도록 연결 구간을 다시
      // 샘플링한다. smootherstep은 구간 양끝의 속도와 가속도를 0으로 만들어
      // 원본 동작에서 연결 자세로 들어갈 때 생기던 작은 꺾임까지 감춘다.
      for (let sample = 0; sample <= sampleCount; sample += 1) {
        const progress = sample / sampleCount
        const time = blendStart + blendDuration * progress
        const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10)
        const sampledValue = Array.from(interpolant.evaluate(time))
        if (track instanceof THREE.QuaternionKeyframeTrack && valueSize === 4) {
          new THREE.Quaternion()
            .fromArray(sampledValue)
            .slerp(new THREE.Quaternion().fromArray(firstValue), eased)
            .toArray(sampledValue)
        } else {
          for (let component = 0; component < valueSize; component += 1) {
            sampledValue[component] = THREE.MathUtils.lerp(
              sampledValue[component],
              firstValue[component],
              eased,
            )
          }
        }
        times.push(time)
        values.push(...sampledValue)
      }

      track.times = new Float32Array(times)
      track.values = new Float32Array(values)
    })
  }

  clip.resetDuration()
  variants.set(cacheKey, clip)
  normalizedClipCache.set(source, variants)
  return clip
}

/**
 * 배우 하나를 기존 스프라이트 박스 안에 그리는 투명 WebGL 뷰포트.
 * 위치·크기·돌진·피격은 부모 .actor/.model-shell CSS가 계속 담당한다.
 */
class BattleCharacterModel {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(
    -1,
    1,
    MODEL_VIEW_HEIGHT / 2,
    -MODEL_VIEW_HEIGHT / 2,
    0.1,
    20,
  )
  private readonly renderer: THREE.WebGLRenderer
  private readonly outputCanvas: HTMLCanvasElement
  private readonly outputContext: CanvasRenderingContext2D
  private readonly resizeObserver: ResizeObserver
  private mixer: THREE.AnimationMixer | null = null
  private actions: Partial<Record<BattleAnimation, THREE.AnimationAction>> = {}
  private current: THREE.AnimationAction | null = null
  private model: THREE.Object3D | null = null
  private companion: THREE.Group | null = null
  private companionMixer: THREE.AnimationMixer | null = null
  private companionGlow: THREE.Sprite | null = null
  private companionElapsed = 0
  private companionActionElapsed = 0
  private cameraZoom = 1
  private cameraZoomTarget = 1
  private frozen = false
  private readonly effects = new THREE.Group()
  private healAura: THREE.Group | null = null
  private healMaterials: THREE.ShaderMaterial[] = []
  private plusParticles: PlusParticle[] = []
  private healShards: EffectShard[] = []
  private shieldShards: EffectShard[] = []
  private shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null
  private shieldBaseY = 1
  private effectKind: 'heal' | 'shield' | null = null
  private effectElapsed = 0
  private dragPointerId: number | null = null
  private dragStartX = 0
  private dragStartYaw = 0
  private dragDistance = 0
  private returningToDefaultYaw = false
  private suppressClick = false
  private disposed = false
  private active = true
  private firstFrameRendered = false
  private requestedAnimation: BattleAnimation = 'idle'
  private pendingRenderDelta = 0
  private lastRenderedAt = 0
  private renderedPixelRatio = 0
  private readonly brokenSpiderParts = new Set<string>()
  private readonly spiderPartOriginals = new Map<string, { root: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler }>()
  private spiderPartDissolves: SpiderPartDissolve[] = []

  constructor(private readonly shell: HTMLElement, private readonly visual: CharacterVisualDef) {
    this.renderer = acquireRenderer()
    this.outputCanvas = document.createElement('canvas')
    this.outputCanvas.className = 'battle-model'
    this.outputCanvas.setAttribute('aria-hidden', 'true')
    const outputContext = this.outputCanvas.getContext('2d', { alpha: true })
    if (!outputContext) throw new Error('2D 모델 출력 캔버스를 만들 수 없습니다.')
    this.outputContext = outputContext
    // 캐릭터 중심을 바라보는 약한 하향 시점이 기본이다. 깊이가 특히 긴
    // 모델은 매니페스트에서 직교 시점을 선택해 실루엣 왜곡을 막는다.
    this.camera.position.set(0, visual.cameraPositionY ?? 3, 7)
    this.camera.lookAt(0, visual.cameraTargetY ?? 1.45, 0)
    // 그림자를 만들지 않는 공용 카툰 조명. 방향과 색은 **지금 깔린 배경 그림에서 뽑은
    // 실측값**을 그대로 쓴다(data/backgrounds.ts) — 배경마다 빛이 오는 쪽이 다른데
    // 캐릭터만 늘 같은 데서 빛을 받으면 붙여 놓은 티가 난다.
    // 주광 반대편에는 그늘색 반사광을 하나 더 세운다. 이게 있어야 어두운 면이 검게
    // 죽지 않고 배경색을 머금어서, 배경과 캐릭터가 같은 공간에 있는 것처럼 보인다.
    const fl = currentFieldLight()
    const skyFill = new THREE.HemisphereLight(fl.skyColor, fl.groundColor, 0.58)
    const keyLight = new THREE.DirectionalLight(fl.keyColor, fl.intensity)
    keyLight.position.set(...fl.key)
    keyLight.castShadow = false
    const bounceLight = new THREE.DirectionalLight(fl.bounceColor, fl.intensity * 0.42)
    bounceLight.position.set(...fl.bounce)
    bounceLight.castShadow = false
    this.scene.add(skyFill, keyLight, bounceLight)
    this.scene.add(this.effects)
    this.shell.append(this.outputCanvas)
    this.shell.dataset.modelInteractive = 'true'
    this.shell.addEventListener('pointerdown', this.onPointerDown)
    this.shell.addEventListener('pointermove', this.onPointerMove)
    this.shell.addEventListener('pointerup', this.onPointerUp)
    this.shell.addEventListener('pointercancel', this.onPointerUp)
    this.shell.addEventListener('click', this.onClickCapture, true)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(shell)
    this.resize()
    addToAnimationFrame(this)
    void this.load()
  }

  private async load() {
    if (!this.visual.model3d) return
    try {
      const gltf = await loadModel(this.visual.model3d)
      if (this.disposed) return

      const model = cloneSkeleton(gltf.scene)
      model.rotation.y = this.visual.modelYaw ?? 0
      this.useBattleMaterials(model)
      const fittedBounds = this.fitModel(model)
      this.scene.add(model)
      this.model = model
      this.brokenSpiderParts.forEach((partId) => this.startSpiderPartDissolve(partId, true))
      if (fittedBounds) this.setupEffects(fittedBounds)
      this.mixer = new THREE.AnimationMixer(model)
      this.actions = {
        idle: this.actionFor(gltf, 'idle'),
        // walk가 여기 빠져 있으면 play('walk')가 조용히 아무것도 하지 않는다 —
        // 매니페스트와 GLB에 클립이 다 있는데도 등장·레일 이동이 idle로 끌려오던 이유다.
        walk: this.actionFor(gltf, 'walk'),
        idle2: this.actionFor(gltf, 'idle2'),
        appear: this.actionFor(gltf, 'appear'),
        attack: this.actionFor(gltf, 'attack'),
        attack2: this.actionFor(gltf, 'attack2'),
        attack3: this.actionFor(gltf, 'attack3'),
        heal: this.actionFor(gltf, 'heal'),
        shield: this.actionFor(gltf, 'shield'),
        victory1: this.actionFor(gltf, 'victory1'),
        victory2: this.actionFor(gltf, 'victory2'),
        defeat: this.actionFor(gltf, 'defeat'),
      }
      this.mixer.addEventListener('finished', this.onAnimationFinished)
      this.play(this.requestedAnimation)
      await this.loadCompanion()
    } catch (error) {
      console.warn(`3D 캐릭터 모델을 불러오지 못해 2D 초상을 사용합니다: ${this.visual.id}`, error)
      this.useFallbackPortrait()
    }
  }

  private async loadCompanion() {
    const companion = this.visual.companion
    if (!companion) return
    try {
      const gltf = await loadModel(companion.model3d)
      if (this.disposed) return

      const model = cloneSkeleton(gltf.scene)
      model.rotation.y = companion.modelYaw ?? 0
      this.useBattleMaterials(model)
      model.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(model)
      const size = bounds.getSize(new THREE.Vector3())
      if (!Number.isFinite(size.y) || size.y <= 0) return
      model.scale.multiplyScalar(COMPANION_FIT_HEIGHT / size.y)
      model.updateMatrixWorld(true)
      const fitted = new THREE.Box3().setFromObject(model)
      const center = fitted.getCenter(new THREE.Vector3())
      model.position.sub(center)

      const group = new THREE.Group()
      const glow = this.makeCompanionGlow()
      glow.position.z = -0.08
      group.add(glow, model)
      group.position.set(-1.08, 1.8, 0.45)
      this.scene.add(group)
      this.companion = group
      this.companionGlow = glow

      const clip = gltf.animations.find((candidate) => candidate.name === companion.idleAnimation)
        ?? gltf.animations.find((candidate) => candidate.name.toLowerCase().includes('fly'))
      if (clip) {
        this.companionMixer = new THREE.AnimationMixer(model)
        const action = this.companionMixer.clipAction(normalizedClip(clip, true, 0.35))
        action.setLoop(THREE.LoopRepeat, Infinity).play()
      }
    } catch (error) {
      console.warn(`도우미 3D 모델을 불러오지 못했습니다: ${companion.name}`, error)
    }
  }

  private makeCompanionGlow(): THREE.Sprite {
    const material = new THREE.SpriteMaterial({
      map: getCompanionGlowTexture(),
      color: 0xffd878,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
    const glow = new THREE.Sprite(material)
    glow.scale.setScalar(1.24)
    glow.renderOrder = -1
    return glow
  }

  private updateCompanion(delta: number) {
    if (!this.companion) return
    this.companionElapsed += delta
    this.companionActionElapsed += delta
    this.companionMixer?.update(delta)

    const t = this.companionElapsed
    const actionTime = this.companionActionElapsed
    const animation = this.requestedAnimation
    let x = -1.08 + Math.sin(t * 1.15) * 0.07
    let y = 1.8 + Math.sin(t * 2.1) * 0.1
    let z = 0.45 + Math.cos(t * 1.6) * 0.05
    let roll = Math.sin(t * 1.7) * 0.08
    let glowColor = 0xffd878
    let glowStrength = 0.16
    let pulseSpeed = 2.2

    if (animation === 'attack') {
      const p = Math.min(1, actionTime / 0.44)
      x += Math.sin(p * Math.PI) * 0.95
      y += Math.sin(p * Math.PI * 2) * 0.23
      roll = -Math.sin(p * Math.PI) * 0.55
      glowColor = 0xff745e
      glowStrength = 0.28
      pulseSpeed = 7
    } else if (animation === 'heal') {
      const p = Math.min(1, actionTime / 0.9)
      x = -0.9 + Math.cos(p * Math.PI * 2) * 0.32
      y = 1.72 + Math.sin(p * Math.PI * 2) * 0.38
      roll = p * Math.PI * 2
      glowColor = 0x7cff9d
      glowStrength = 0.24
      pulseSpeed = 4.6
    } else if (animation === 'shield') {
      const p = Math.min(1, actionTime / 1.1)
      x = -0.72 + Math.cos(p * Math.PI * 2 + Math.PI) * 0.48
      y = 1.6 + Math.sin(p * Math.PI * 2 + Math.PI) * 0.5
      roll = -p * Math.PI * 2
      glowColor = 0x75ccff
      glowStrength = 0.27
      pulseSpeed = 5.2
    } else if (animation === 'victory1' || animation === 'victory2') {
      x = -0.88 + Math.sin(actionTime * 3.6) * 0.4
      y = 2.02 + Math.sin(actionTime * 7.2) * 0.27
      z = 0.5 + Math.cos(actionTime * 3.6) * 0.12
      roll = Math.cos(actionTime * 3.6) * 0.38
      glowColor = 0xffec76
      glowStrength = 0.3
      pulseSpeed = 6
    } else if (animation === 'defeat') {
      x = -1.02 + Math.sin(actionTime * 1.8) * 0.05
      y = 1.24 + Math.sin(actionTime * 2.5) * 0.07
      z = 0.36
      roll = 0.42 + Math.sin(actionTime * 1.4) * 0.08
      glowColor = 0x9ba7d8
      glowStrength = 0.1
      pulseSpeed = 1.4
    }

    this.companion.position.set(x, y, z)
    this.companion.rotation.z = roll
    if (this.companionGlow) {
      const pulse = 0.5 + 0.5 * Math.sin(t * pulseSpeed)
      this.companionGlow.material.color.setHex(glowColor)
      this.companionGlow.material.opacity = glowStrength * (0.76 + pulse * 0.24)
      this.companionGlow.scale.setScalar(1.16 + pulse * 0.18)
    }
  }

  private actionFor(gltf: GLTF, animation: BattleAnimation): THREE.AnimationAction | undefined {
    const configuredName = this.visual.animations?.[animation]
    const clip = gltf.animations.find((candidate) => candidate.name === configuredName)
      ?? gltf.animations.find((candidate) => candidate.name.toLowerCase().includes(animation))
    return clip && this.mixer
      ? this.mixer.clipAction(normalizedClip(
        clip,
        animation === 'idle' || animation === 'idle2',
        (this.visual.animations?.idleLoopBlendMs ?? 0) / 1000,
        (animation === 'idle'
          ? this.visual.animations?.idleEndTrimMs ?? 0
          : this.visual.animations?.endTrimsMs?.[animation as OneShotAnimation] ?? 0) / 1000,
      ))
      : undefined
  }

  private useBattleMaterials(model: THREE.Object3D) {
    const weather = battleWeatherOf(this.shell)
    const atmosphere = BATTLE_ATMOSPHERES[weather]
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const originals = Array.isArray(object.material) ? object.material : [object.material]
      const replacements = originals.map((material) => {
        const source = material as THREE.MeshStandardMaterial
        const baseColor = source.color?.clone() ?? new THREE.Color(0xffffff)
        const toon = new THREE.MeshToonMaterial({
          name: `${material.name}-battle-toon`,
          color: baseColor,
          map: source.map ?? null,
          alphaMap: source.alphaMap ?? null,
          aoMap: source.aoMap ?? null,
          aoMapIntensity: source.aoMapIntensity,
          normalMap: source.normalMap ?? null,
          normalScale: source.normalScale?.clone(),
          bumpMap: source.bumpMap ?? null,
          bumpScale: source.bumpScale,
          emissive: baseColor,
          emissiveMap: source.map ?? null,
          emissiveIntensity: atmosphere.emissiveIntensity,
          gradientMap: BATTLE_TOON_GRADIENT,
          transparent: material.transparent,
          opacity: material.opacity,
          alphaTest: material.alphaTest,
          side: material.side,
          vertexColors: source.vertexColors,
          toneMapped: false,
        })
        toon.userData.partDissolveUniform = { value: 0 }
        this.applyBattleAtmosphere(toon, atmosphere, weather)
        return toon
      })
      object.material = Array.isArray(object.material) ? replacements : replacements[0]
    })
  }

  private applyBattleAtmosphere(
    material: THREE.MeshToonMaterial,
    atmosphere: BattleAtmosphere,
    weather: BattleWeather,
  ) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBattleSkyTint = { value: atmosphere.skyTint }
      shader.uniforms.uBattleGroundTint = { value: atmosphere.groundTint }
      shader.uniforms.uBattleSkyMix = { value: atmosphere.skyMix }
      shader.uniforms.uBattleGroundMix = { value: atmosphere.groundMix }
      shader.uniforms.uBattleExposure = { value: atmosphere.exposure }
      shader.uniforms.uPartDissolve = material.userData.partDissolveUniform

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying float vBattleHeight;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
vec4 battleWorldPosition = modelMatrix * vec4(transformed, 1.0);
vBattleHeight = smoothstep(0.0, ${MODEL_FIT_HEIGHT.toFixed(2)}, battleWorldPosition.y);`)

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uBattleSkyTint;
uniform vec3 uBattleGroundTint;
uniform float uBattleSkyMix;
uniform float uBattleGroundMix;
uniform float uBattleExposure;
uniform float uPartDissolve;
varying float vBattleHeight;`)
        .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
float battleGroundWeight = (1.0 - smoothstep(0.08, 0.58, vBattleHeight)) * uBattleGroundMix;
float battleSkyWeight = smoothstep(0.48, 1.0, vBattleHeight) * uBattleSkyMix;
outgoingLight = mix(outgoingLight, outgoingLight * uBattleGroundTint, battleGroundWeight);
outgoingLight = mix(outgoingLight, outgoingLight * uBattleSkyTint, battleSkyWeight);
outgoingLight *= uBattleExposure;
float partDissolveNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
if (partDissolveNoise < uPartDissolve) discard;
          float partDissolveActive = smoothstep(0.0, 0.025, uPartDissolve);
          float partDissolveEdge = partDissolveActive * (1.0 - smoothstep(0.0, 0.09, partDissolveNoise - uPartDissolve));
outgoingLight += vec3(0.72, 0.42, 0.88) * partDissolveEdge * (1.0 - uPartDissolve);`)
    }
    material.customProgramCacheKey = () => `battle-atmosphere-${weather}`
  }

  private fitModel(model: THREE.Object3D): THREE.Box3 | null {
    model.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return null
    const scale = MODEL_FIT_HEIGHT / size.y
    model.scale.multiplyScalar(scale)
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const center = fitted.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.y += (this.visual.modelGroundOffset ?? 0.1) - fitted.min.y
    model.updateMatrixWorld(true)
    return new THREE.Box3().setFromObject(model)
  }

  private setupEffects(bounds: THREE.Box3) {
    const size = bounds.getSize(new THREE.Vector3())
    const center = bounds.getCenter(new THREE.Vector3())
    const groundY = bounds.min.y + 0.025
    const radius = Math.max(size.x * 0.72, size.y * 0.34)

    const aura = new THREE.Group()
    aura.visible = false
    // 모델 발끝은 공통 발선에 두되, 원근으로 앞쪽 호가 캔버스 아래에서 잘리지 않게 오라만 살짝 든다.
    aura.position.set(center.x, groundY + 0.2, 0)
    aura.renderOrder = 6
    const auraMaxRadius = radius * 1.06
    const auraDefs = [
      { delay: 0, width: 0.105, opacity: 1 },
      { delay: 0.09, width: 0.075, opacity: 0.72 },
    ]
    auraDefs.forEach(({ delay, width, opacity }) => {
      // 카드의 확장 링처럼 넓은 면광이 아니라 얇은 이중 충격파만 지면을 훑는다.
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0x79f29a) },
          uOpacity: { value: 0 },
          uProgress: { value: 0 },
          uMaxRadius: { value: auraMaxRadius },
          uDelay: { value: delay },
          uWidth: { value: width },
          uLayerOpacity: { value: opacity },
        },
        vertexShader: `
          varying float vRadial;
          void main() {
            // 링 평면(로컬 XY)에서 중심으로부터의 거리 — 그룹 회전·스케일과 무관하게 안정적이다.
            vRadial = length(position.xy);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          uniform float uProgress;
          uniform float uMaxRadius;
          uniform float uDelay;
          uniform float uWidth;
          uniform float uLayerOpacity;
          varying float vRadial;
          void main() {
            float r = clamp(vRadial / uMaxRadius, 0.0, 1.45);
            float localProgress = clamp((uProgress - uDelay) / (1.0 - uDelay), 0.0, 1.0);

            // 카드 중앙광처럼 발끝에서 한 프레임 달아오른 뒤 링으로 빠져나간다.
            float flash = pow(1.0 - min(1.0, localProgress * 4.2), 2.4);

            // 카드의 가는 원형 테두리와 같은 속도로 바깥까지 단번에 확장한다.
            float front = mix(0.04, 1.18, smoothstep(0.0, 0.72, localProgress));
            float wave = 1.0 - smoothstep(uWidth * 0.35, uWidth, abs(r - front));
            float core = (1.0 - smoothstep(0.0, 0.28, r)) * flash;

            float hot = clamp(core * 1.2 + wave * 0.82, 0.0, 1.0);
            vec3 color = mix(uColor, vec3(0.86, 1.0, 0.9), hot);
            float energy = core * 1.8 + wave * 1.35;
            float fade = 1.0 - smoothstep(0.58, 1.0, localProgress);
            gl_FragColor = vec4(color * energy, energy * uOpacity * uLayerOpacity * fade);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const ring = new THREE.Mesh(new THREE.CircleGeometry(auraMaxRadius * 1.22, 80), material)
      ring.rotation.x = -Math.PI / 2
      aura.add(ring)
      this.healMaterials.push(material)
    })
    this.effects.add(aura)
    this.healAura = aura

    // 카드 파편보다 잘고 많은 32방향 스트로크. 회복은 지면에 눕혀 넓게 흩뿌린다.
    const healShardColors = [0xd8ffe2, 0x91f5aa, 0x55d97b]
    for (let index = 0; index < 32; index += 1) {
      const angle = (Math.PI * 2 * index) / 32 + (index % 3 - 1) * 0.055
      const material = new THREE.MeshBasicMaterial({
        color: healShardColors[index % healShardColors.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
      const group = new THREE.Group()
      const shard = new THREE.Mesh(new THREE.PlaneGeometry(
        radius * (0.028 + (index % 3) * 0.006),
        radius * (0.16 + (index % 4) * 0.025),
      ), material)
      shard.position.y = radius * 0.1
      group.add(shard)
      group.position.set(center.x, groundY + 0.205, 0)
      group.rotation.set(-Math.PI / 2, 0, angle)
      group.visible = false
      group.renderOrder = 8
      this.effects.add(group)
      this.healShards.push({
        group,
        material,
        distance: radius * (1.08 + (index % 7) * 0.13),
        delay: (index % 5) * 0.008,
      })
    }

    for (let index = 0; index < 7; index += 1) {
      const plus = new THREE.Group()
      const material = new THREE.MeshBasicMaterial({
        color: 0xbaffc9,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
      plus.add(
        new THREE.Mesh(new THREE.PlaneGeometry(0.065, 0.25), material),
        new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.065), material),
      )
      plus.visible = false
      plus.renderOrder = 8
      this.effects.add(plus)
      this.plusParticles.push({
        group: plus,
        phase: index / 7,
        x: center.x + ((index * 47) % 100) / 100 * radius * 1.4 - radius * 0.7,
        y: groundY + 0.2 + ((index * 31) % 100) / 100 * size.y * 0.42,
      })
    }

    const shieldMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x8bdcff) },
        uOpacity: { value: 0 },
        uProgress: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        varying float vLocalY;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDirection = normalize(-mvPosition.xyz);
          // 반지름과 무관하게 -1..1로 정규화한 세로 위치 — 에너지 밴드가 훑고 지날 좌표.
          vLocalY = normalize(position).y;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uProgress;
        varying vec3 vNormal;
        varying vec3 vViewDirection;
        varying float vLocalY;
        void main() {
          // 카드 버스트를 참고: 더 날카로운 림 + 시작 순간 확 터졌다 가라앉는 플래시.
          float ndotv = abs(dot(normalize(vNormal), normalize(vViewDirection)));
          float fresnel = pow(1.0 - ndotv, 3.1);

          // 형성 순간의 버스트 플래시 — 초반에 강하게 부풀었다 빠르게 사그라든다.
          float flash = pow(1.0 - min(1.0, uProgress * 3.4), 2.0);

          // 아래에서 위로 실드를 채워 올리는 에너지 밴드(카드의 확장 링에 대응).
          float sweepPos = mix(-1.35, 1.35, clamp(uProgress * 1.9, 0.0, 1.0));
          float band = smoothstep(0.34, 0.0, abs(vLocalY - sweepPos));

          float rim = 0.12 + fresnel * (1.25 + flash * 2.7) + band * 0.7;

          // 화이트-핫 코어: 림·밴드의 가장 밝은 부분은 흰색으로 달아오른다(카드의 #fff→color).
          float hot = clamp(fresnel * (0.55 + flash * 1.1) + band * 0.85, 0.0, 1.0);
          vec3 color = mix(uColor, vec3(0.55, 0.86, 1.0), hot);

          gl_FragColor = vec4(color * rim, min(1.0, rim) * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const shield = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), shieldMaterial)
    shield.position.copy(center)
    this.shieldBaseY = Math.max(1, size.y / (radius * 2) * 1.06)
    shield.scale.y = this.shieldBaseY
    shield.visible = false
    shield.renderOrder = 7
    this.effects.add(shield)
    this.shieldMesh = shield

    // 프레스넬 껍질 바깥으로 작은 32방향 파편을 멀리 흩뿌려 형성 타격감을 만든다.
    const shieldShardColors = [0x8bdcff, 0x5ab7ec, 0x2f77d0]
    for (let index = 0; index < 32; index += 1) {
      const angle = (Math.PI * 2 * index) / 32 + (index % 3 - 1) * 0.055
      const material = new THREE.MeshBasicMaterial({
        color: shieldShardColors[index % shieldShardColors.length],
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      })
      const group = new THREE.Group()
      group.position.copy(center)
      group.quaternion.copy(this.camera.quaternion)
      group.rotateZ(-angle)
      const shard = new THREE.Mesh(new THREE.PlaneGeometry(
        radius * (0.028 + (index % 3) * 0.006),
        radius * (0.17 + (index % 4) * 0.026),
      ), material)
      shard.position.y = radius * 0.48
      group.add(shard)
      group.visible = false
      group.renderOrder = 9
      this.effects.add(group)
      this.shieldShards.push({
        group,
        material,
        distance: radius * (0.72 + (index % 7) * 0.12),
        delay: (index % 5) * 0.008,
      })
    }
  }

  private startEffect(kind: 'heal' | 'shield') {
    this.effectKind = kind
    this.effectElapsed = 0
    if (this.healAura) this.healAura.visible = kind === 'heal'
    this.plusParticles.forEach(({ group }) => { group.visible = kind === 'heal' })
    this.healShards.forEach(({ group }) => { group.visible = kind === 'heal' })
    if (this.shieldMesh) this.shieldMesh.visible = kind === 'shield'
    this.shieldShards.forEach(({ group }) => { group.visible = kind === 'shield' })
  }

  private stopEffect() {
    this.effectKind = null
    if (this.healAura) this.healAura.visible = false
    this.plusParticles.forEach(({ group }) => { group.visible = false })
    this.healShards.forEach(({ group }) => { group.visible = false })
    if (this.shieldMesh) this.shieldMesh.visible = false
    this.shieldShards.forEach(({ group }) => { group.visible = false })
  }

  private updateEffect(delta: number) {
    if (!this.effectKind) return
    this.effectElapsed += delta
    if (this.effectKind === 'heal') {
      const progress = Math.min(1, this.effectElapsed / 0.9)
      const pulse = 1 + Math.sin(progress * Math.PI * 3) * 0.08
      // 카드 버스트처럼 튕겨 나오는 팝 — 빠르게 부풀어 살짝 오버슈트한 뒤 정착한다.
      const t = Math.min(1, progress * 2.6)
      const overshoot = 1 + 2.6 * Math.pow(t - 1, 3) + 1.6 * Math.pow(t - 1, 2)
      if (this.healAura) {
        this.healAura.scale.setScalar((0.6 + overshoot * 0.55) * pulse)
        this.healAura.rotation.y = progress * Math.PI * 0.8
      }
      // 즉각적인 어택 후 완만한 릴리스 — 터지듯 나타났다 사그라드는 밝기 곡선.
      const envelope = progress < 0.14
        ? progress / 0.14
        : Math.pow(1 - (progress - 0.14) / 0.86, 1.3)
      this.healMaterials.forEach((material) => {
        material.uniforms.uProgress.value = progress
        material.uniforms.uOpacity.value = Math.max(0, envelope)
      })
      this.updateShards(this.healShards, progress, 0.58)
      this.plusParticles.forEach((particle) => {
        const local = (progress + particle.phase) % 1
        particle.group.position.set(particle.x, particle.y + local * 1.15, 0.55)
        particle.group.scale.setScalar(0.65 + Math.sin(local * Math.PI) * 0.55)
        const opacity = Math.sin(local * Math.PI) * (1 - progress * 0.35)
        particle.group.children.forEach((child) => {
          ;(child as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>).material.opacity = opacity
        })
      })
      if (progress >= 1) this.stopEffect()
      return
    }

    const progress = Math.min(1, this.effectElapsed / 1.1)
    if (this.shieldMesh) {
      // 카드 버스트처럼 튕겨 나오는 팝 — 빠르게 부풀어 살짝 오버슈트한 뒤 정착한다.
      const t = Math.min(1, progress * 2.4)
      const overshoot = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)
      const expansion = 0.58 + overshoot * 0.5
      this.shieldMesh.scale.set(expansion, this.shieldBaseY * expansion, expansion)
      // 즉각적인 어택 후 완만한 릴리스 — 터지듯 나타났다 사그라드는 밝기 곡선.
      const envelope = progress < 0.14
        ? progress / 0.14
        : Math.pow(1 - (progress - 0.14) / 0.86, 1.4)
      this.shieldMesh.material.uniforms.uProgress.value = progress
      this.shieldMesh.material.uniforms.uOpacity.value = Math.max(0, envelope) * 0.9
    }
    this.updateShards(this.shieldShards, progress, 0.58)
    if (progress >= 1) this.stopEffect()
  }

  private updateShards(shards: EffectShard[], progress: number, activeUntil: number) {
    shards.forEach((shard) => {
      const delayed = Math.max(0, progress - shard.delay)
      const local = Math.min(1, delayed / activeUntil)
      const travel = 1 - Math.pow(1 - local, 3)
      const mesh = shard.group.children[0] as THREE.Mesh
      const base = shard.distance * (0.38 + travel)
      mesh.position.set(0, base, 0)
      mesh.scale.set(1, Math.max(0.08, 0.42 - local * 0.34), 1)
      shard.material.opacity = delayed <= 0 ? 0 : Math.max(0, 1 - local) * 0.92
    })
  }

  dissolveSpiderParts(partId: string, count: number) {
    const start = SPIDER_PART_ORDER.indexOf(partId as typeof SPIDER_PART_ORDER[number])
    if (start < 0) return
    SPIDER_PART_ORDER.slice(start, start + Math.max(1, count)).forEach((id) => {
      if (this.brokenSpiderParts.has(id)) return
      this.brokenSpiderParts.add(id)
      this.startSpiderPartDissolve(id, false)
    })
  }

  private startSpiderPartDissolve(partId: string, immediate: boolean) {
    if (!this.model || this.spiderPartDissolves.some((entry) => entry.id === partId)) return
    const root = this.model.getObjectByName(SPIDER_PART_NODES[partId])
    if (!root) return
    if (!this.spiderPartOriginals.has(partId)) {
      this.spiderPartOriginals.set(partId, {
        root,
        position: root.position.clone(),
        rotation: root.rotation.clone(),
      })
    }
    const materials: THREE.MeshToonMaterial[] = []
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const list = Array.isArray(object.material) ? object.material : [object.material]
      list.forEach((material) => {
        if (material instanceof THREE.MeshToonMaterial && !materials.includes(material)) materials.push(material)
      })
    })
    if (immediate) {
      materials.forEach((material) => { material.userData.partDissolveUniform.value = 1 })
      root.visible = false
      return
    }
    this.spiderPartDissolves.push({
      id: partId,
      root,
      materials,
      elapsed: 0,
      duration: .92,
      fallDirection: SPIDER_PART_ORDER.indexOf(partId as typeof SPIDER_PART_ORDER[number]) % 2 ? 1 : -1,
    })
  }

  private updateSpiderPartDissolves(delta: number) {
    this.spiderPartDissolves = this.spiderPartDissolves.filter((entry) => {
      entry.elapsed += delta
      const progress = THREE.MathUtils.clamp(entry.elapsed / entry.duration, 0, 1)
      const eased = progress * progress * (3 - 2 * progress)
      entry.materials.forEach((material) => { material.userData.partDissolveUniform.value = eased })
      const original = this.spiderPartOriginals.get(entry.id)
      if (original) {
        entry.root.position.copy(original.position)
        entry.root.position.y -= eased * .18
        entry.root.rotation.copy(original.rotation)
        entry.root.rotation.z += entry.fallDirection * eased * .16
      }
      if (progress < 1) return true
      entry.root.visible = false
      return false
    })
  }

  private restoreSpiderParts() {
    this.spiderPartDissolves = []
    this.brokenSpiderParts.clear()
    this.spiderPartOriginals.forEach(({ root, position, rotation }) => {
      root.visible = true
      root.position.copy(position)
      root.rotation.copy(rotation)
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        const list = Array.isArray(object.material) ? object.material : [object.material]
        list.forEach((material) => {
          if (material instanceof THREE.MeshToonMaterial) material.userData.partDissolveUniform.value = 0
        })
      })
    })
  }

  private onAnimationFinished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== this.current) return
    const finished = (Object.entries(this.actions) as [BattleAnimation, THREE.AnimationAction | undefined][])
      .find(([, action]) => action === event.action)?.[0]
    if (finished && RETURN_TO_IDLE.has(finished)) {
      // 사마귀의 큰낫 준비는 평상 idle로 풀지 않고 전용 대기 자세를 유지한다.
      this.play(finished === 'attack2' && this.actions.idle2 ? 'idle2' : 'idle')
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.model || event.button !== 0) return
    this.returningToDefaultYaw = false
    this.dragPointerId = event.pointerId
    this.dragStartX = event.clientX
    this.dragStartYaw = this.model.rotation.y
    this.dragDistance = 0
    this.shell.dataset.modelDragging = 'true'
    this.shell.setPointerCapture(event.pointerId)
  }

  private onPointerMove = (event: PointerEvent) => {
    if (!this.model || event.pointerId !== this.dragPointerId) return
    const deltaX = event.clientX - this.dragStartX
    this.dragDistance = Math.max(this.dragDistance, Math.abs(deltaX))
    // 수직 입력은 사용하지 않고 화면의 좌우 이동량만 Y축 회전에 반영한다.
    this.model.rotation.y = this.dragStartYaw + deltaX * 0.012
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.dragPointerId) return
    if (this.shell.hasPointerCapture(event.pointerId)) this.shell.releasePointerCapture(event.pointerId)
    this.dragPointerId = null
    delete this.shell.dataset.modelDragging
    this.returningToDefaultYaw = true
    if (this.dragDistance > 4) {
      this.suppressClick = true
      window.setTimeout(() => { this.suppressClick = false }, 0)
    }
  }

  private onClickCapture = (event: MouseEvent) => {
    if (!this.suppressClick) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  /** 지금 요청되어 있는 동작. 진행 중인 연출을 덮지 않고 걷기를 끼워 넣을 때 본다. */
  get animation(): BattleAnimation {
    return this.requestedAnimation
  }

  /**
   * @param stretchMs 이번 한 번만 쓸 재생 시간. 매니페스트의 기본 길이를 덮는다 —
   *   강타 연출은 같은 attack 클립을 느리게 늘려 예비 동작을 읽히게 한다.
   */
  play(animation: BattleAnimation, stretchMs?: number): number {
    if (animation !== this.requestedAnimation) this.companionActionElapsed = 0
    this.requestedAnimation = animation
    this.cameraZoomTarget = this.visual.id === 'player' && animation === 'defeat' ? 0.78 : 1
    this.shell.dataset.modelAnimation = animation
    if (animation !== 'idle') this.shell.dataset.modelLastAction = animation
    const next = this.actions[animation]
    if (!next) return 0
    if (next === this.current && (animation === 'idle' || animation === 'idle2' || animation === 'walk')) return 0

    if (animation === 'heal' || animation === 'shield') this.startEffect(animation)
    else if (animation !== 'idle') this.stopEffect()

    next.reset().enabled = true
    // walk는 idle과 같이 계속 도는 클립이다 — 도착할 때까지 반복해야 걸어오는 것으로 보인다.
    const loops = animation === 'idle' || animation === 'idle2' || animation === 'walk'
    const oneShotMs = stretchMs ?? this.visual.animations?.durationsMs?.[animation as OneShotAnimation]
    if (!loops) {
      const playbackRate = this.visual.animations?.playbackRates?.[animation as OneShotAnimation] ?? 1
      const desiredSeconds = oneShotMs ? oneShotMs / 1000 : next.getClip().duration / playbackRate
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = true
      next.setEffectiveTimeScale(next.getClip().duration / desiredSeconds)
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity)
      next.clampWhenFinished = false
      next.setEffectiveTimeScale(1)
    }
    next.play()
    if (this.current && this.current !== next) this.current.crossFadeTo(next, TRANSITION_SECONDS, false)
    this.current = next
    return animation === 'idle' || animation === 'idle2'
      ? 0
      : (oneShotMs
        ?? next.getClip().duration * 1000 / (this.visual.animations?.playbackRates?.[animation as OneShotAnimation] ?? 1))
  }

  /** 풀에서 재사용할 때 이전 one-shot 자세를 한 프레임도 노출하지 않고 idle로 되돌린다. */
  resetToIdle() {
    this.requestedAnimation = 'idle'
    this.companionActionElapsed = 0
    this.cameraZoom = 1
    this.cameraZoomTarget = 1
    this.camera.zoom = 1
    this.camera.updateProjectionMatrix()
    this.shell.dataset.modelAnimation = 'idle'
    delete this.shell.dataset.modelLastAction
    this.stopEffect()
    this.restoreSpiderParts()
    this.returningToDefaultYaw = false
    if (this.model) this.model.rotation.y = this.visual.modelYaw ?? 0

    const idle = this.actions.idle
    if (!idle) return
    this.mixer?.stopAllAction()
    idle.reset().enabled = true
    idle.setLoop(THREE.LoopRepeat, Infinity)
    idle.clampWhenFinished = false
    idle.setEffectiveTimeScale(1)
    idle.play()
    this.current = idle

    // 풀에 있는 동안 캔버스에는 defeat의 마지막 프레임이 남는다. DOM에 다시
    // 붙이기 전에 idle 첫 자세를 즉시 그려 재스폰 섬광을 막는다.
    this.mixer?.update(0)
    if (!this.renderer.getContext().isContextLost()) this.renderToOutput()
  }

  private isWaitingEnemy() {
    // model-shell은 actor의 직계 자식이다. 매 프레임 closest()로 전장을 거슬러
    // 올라가던 선택자 탐색을 피한다. 일벌처럼 별도 셸인 경우에는 전경으로 취급한다.
    return this.shell.parentElement?.classList.contains('back') ?? false
  }

  private desiredPixelRatio(waitingEnemy = this.isWaitingEnemy()) {
    if (adaptiveRenderReduction) return 0.75
    if (document.documentElement.dataset.graphics === 'low' || waitingEnemy) return 1
    return Math.min(window.devicePixelRatio, FOREGROUND_PIXEL_RATIO_CAP)
  }

  private targetFps() {
    const idle = this.requestedAnimation === 'idle' || this.requestedAnimation === 'idle2'
    const waitingEnemy = this.isWaitingEnemy()
    const boss = this.shell.parentElement?.classList.contains('boss') ?? false
    const lowQuality = document.documentElement.dataset.graphics === 'low'
    return adaptiveRenderReduction
      ? waitingEnemy ? 12 : boss ? idle ? 24 : 30 : idle ? 12 : 24
      : waitingEnemy ? adaptiveFullRate && !lowQuality ? 30 : 24
        : lowQuality || idle && !adaptiveFullRate ? 30 : 60
  }

  wantsRender(now: number) {
    if (this.disposed || !this.active || !this.shell.isConnected) return false
    if (!this.firstFrameRendered || !this.lastRenderedAt) return true
    return now - this.lastRenderedAt >= 1000 / this.targetFps()
  }

  renderPriority(now: number) {
    if (!this.firstFrameRendered) return 100_000
    const idle = this.requestedAnimation === 'idle' || this.requestedAnimation === 'idle2'
    const boss = this.shell.parentElement?.classList.contains('boss') ?? false
    return (idle ? 0 : 10_000)
      + (boss ? 5_000 : 0)
      + (this.isWaitingEnemy() ? 0 : 1_000)
      + Math.max(0, now - this.lastRenderedAt)
  }

  private resize(waitingEnemy = this.isWaitingEnemy()) {
    const width = Math.max(1, this.shell.clientWidth)
    const height = Math.max(1, this.shell.clientHeight)
    const pixelRatio = this.desiredPixelRatio(waitingEnemy)
    this.renderedPixelRatio = pixelRatio
    this.outputCanvas.dataset.pixelRatio = String(pixelRatio)
    const targetWidth = Math.max(1, Math.round(width * pixelRatio))
    const targetHeight = Math.max(1, Math.round(height * pixelRatio))
    const fit = Math.min(1, SHARED_RENDER_SIZE / Math.max(targetWidth, targetHeight))
    this.outputCanvas.width = Math.max(1, Math.round(targetWidth * fit))
    this.outputCanvas.height = Math.max(1, Math.round(targetHeight * fit))
    const viewHeight = MODEL_VIEW_HEIGHT
    const viewWidth = viewHeight * (width / height)
    this.camera.left = -viewWidth / 2
    this.camera.right = viewWidth / 2
    this.camera.bottom = -viewHeight / 2
    this.camera.top = viewHeight / 2
    this.camera.updateProjectionMatrix()
  }

  /** 공용 WebGL 표면의 위쪽 일부에 그린 뒤 배우별 2D 캔버스로 즉시 복사한다. */
  private renderToOutput() {
    const width = this.outputCanvas.width
    const height = this.outputCanvas.height
    if (width < 1 || height < 1) return
    const y = SHARED_RENDER_SIZE - height
    this.renderer.setViewport(0, y, width, height)
    this.renderer.setScissor(0, y, width, height)
    this.renderer.setScissorTest(true)
    this.renderer.clear(true, true, true)
    this.renderer.render(this.scene, this.camera)
    // WebGL의 위쪽 viewport는 DOM 캔버스의 y=0부터 보인다. 필요한 영역만 복사해
    // 각 배우의 CSS transform·filter·opacity 연출은 기존 DOM 구조 그대로 유지한다.
    this.outputContext.clearRect(0, 0, width, height)
    this.outputContext.drawImage(this.renderer.domElement, 0, 0, width, height, 0, 0, width, height)
  }

  render(delta: number, now: number, allowDraw = true) {
    if (this.disposed || !this.active || !this.shell.isConnected) return
    if (this.renderer.getContext().isContextLost()) {
      this.useFallbackPortrait()
      return
    }
    this.pendingRenderDelta = Math.min(0.1, this.pendingRenderDelta + delta)
    if (!allowDraw) return
    const waitingEnemy = this.isWaitingEnemy()
    const desiredPixelRatio = this.desiredPixelRatio(waitingEnemy)
    if (desiredPixelRatio !== this.renderedPixelRatio) this.resize(waitingEnemy)

    // 기본 idle은 30fps, 뒤 레일은 24fps로 시작한다. 실제 프레임 여유가 이어지면
    // 전경 idle은 60fps, 뒤 레일은 30fps로 올리고 부하가 감지되면 자동 복귀한다.
    const targetFps = this.targetFps()
    this.outputCanvas.dataset.renderFps = String(targetFps)
    if (this.firstFrameRendered && this.lastRenderedAt && now - this.lastRenderedAt < 1000 / targetFps) return

    const frameDelta = this.pendingRenderDelta
    this.pendingRenderDelta = 0
    this.lastRenderedAt = now
    const motionDelta = this.frozen ? 0 : frameDelta
    this.mixer?.update(motionDelta)
    this.updateModelYawReturn(frameDelta)
    this.updateCompanion(frameDelta)
    this.updateEffect(frameDelta)
    this.updateSpiderPartDissolves(frameDelta)
    const zoomBlend = 1 - Math.exp(-frameDelta * 8)
    const nextZoom = THREE.MathUtils.lerp(this.cameraZoom, this.cameraZoomTarget, zoomBlend)
    if (Math.abs(nextZoom - this.cameraZoom) > 0.0001) {
      this.cameraZoom = nextZoom
      this.camera.zoom = nextZoom
      this.camera.updateProjectionMatrix()
    }
    this.renderToOutput()
    if (this.model && !this.firstFrameRendered) {
      // 실제 WebGL 컨텍스트에서 텍스처 업로드와 첫 드로우까지 성공한 뒤에만
      // 캔버스를 공개한다. 그 전에는 2D 초상도 함께 숨겨 교체 섬광을 막는다.
      this.firstFrameRendered = true
      this.shell.dataset.modelStatus = 'ready-3d'
    }
  }

  private updateModelYawReturn(delta: number) {
    if (!this.model || !this.returningToDefaultYaw || this.dragPointerId !== null) return
    const target = this.visual.modelYaw ?? 0
    const difference = THREE.MathUtils.euclideanModulo(target - this.model.rotation.y + Math.PI, Math.PI * 2) - Math.PI
    if (Math.abs(difference) <= MODEL_YAW_RETURN_EPSILON) {
      this.model.rotation.y = target
      this.returningToDefaultYaw = false
      return
    }
    const blend = 1 - Math.exp(-delta * MODEL_YAW_RETURN_SPEED)
    this.model.rotation.y += difference * blend
  }

  isReadyForOutput() {
    if (this.shell.dataset.modelStatus === 'fallback-2d') return true
    return this.firstFrameRendered
      && this.outputCanvas.width > 0
      && this.outputCanvas.height > 0
      && !this.renderer.getContext().isContextLost()
  }

  useFallbackPortrait() {
    if (this.disposed) return
    this.shell.dataset.modelStatus = 'fallback-2d'
    this.outputCanvas.hidden = true
    this.setActive(false)
  }

  setActive(active: boolean) {
    if (this.disposed || active === this.active) return
    if (active && this.shell.dataset.modelStatus === 'fallback-2d') return
    this.active = active
    if (active) addToAnimationFrame(this)
    else removeFromAnimationFrame(this)
  }

  /** 타격 프레임 동안 캐릭터 모델의 현재 공격 자세만 고정한다. */
  setFrozen(frozen: boolean) {
    this.frozen = frozen
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    removeFromAnimationFrame(this)
    this.resizeObserver.disconnect()
    this.shell.removeEventListener('pointerdown', this.onPointerDown)
    this.shell.removeEventListener('pointermove', this.onPointerMove)
    this.shell.removeEventListener('pointerup', this.onPointerUp)
    this.shell.removeEventListener('pointercancel', this.onPointerUp)
    this.shell.removeEventListener('click', this.onClickCapture, true)
    this.mixer?.removeEventListener('finished', this.onAnimationFinished)
    this.mixer?.stopAllAction()
    this.companionMixer?.stopAllAction()
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.effects.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.companion?.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.outputCanvas.remove()
  }
}

function modelShellFor(actor: HTMLElement): HTMLElement | null {
  return actor.matches('.model-shell')
    ? actor
    : actor.querySelector<HTMLElement>(':scope > .model-shell')
}

export function mountCharacterModel(actor: HTMLElement, visual: CharacterVisualDef) {
  if (!visual.model3d) return
  const shell = modelShellFor(actor)
  if (!shell) return
  const mounted = mountedModels.get(shell)
  if (mounted) {
    // 풀에서 꺼낸 모델은 defeat 같은 이전 one-shot 자세를 버리고 idle 첫 프레임부터
    // 다시 노출한다. 첫 프레임이 검증된 인스턴스만 재활성화하는 조건은 유지한다.
    if (mounted.isReadyForOutput()) {
      mounted.resetToIdle()
      mounted.setActive(true)
    }
    return
  }
  shell.dataset.modelStatus = 'preparing-3d'
  try {
    const model = new BattleCharacterModel(shell, visual)
    mountedModels.set(shell, model)
  } catch (error) {
    console.warn(`WebGL을 시작하지 못해 2D 초상을 사용합니다: ${visual.id}`, error)
    shell.dataset.modelStatus = 'fallback-2d'
  }
}

/** GLB 다운로드뿐 아니라 GLTF 파싱·텍스처 디코딩이 끝날 때까지 기다린다. */
export function preloadCharacterModelResources(visuals: CharacterVisualDef[]): Promise<void> {
  const urls = [...new Set(visuals.flatMap((visual) => [
    ...(visual.model3d ? [visual.model3d] : []),
    ...(visual.companion ? [visual.companion.model3d] : []),
  ]))]
  return Promise.all(urls.map((url) => loadModel(url).then(() => undefined).catch(() => undefined)))
    .then(() => undefined)
}

/** 오브젝트 풀에서 꺼내기 전에 화면 출력 준비 여부를 검사한다. */
export function isCharacterModelReady(actor: HTMLElement, visual: CharacterVisualDef): boolean {
  if (!visual.model3d) return true
  const shell = modelShellFor(actor)
  if (!shell) return false
  if (shell.dataset.modelStatus === 'fallback-2d') return true
  return mountedModels.get(shell)?.isReadyForOutput() ?? false
}

export function suspendCharacterModel(actor: HTMLElement) {
  const shell = modelShellFor(actor)
  if (shell) mountedModels.get(shell)?.setActive(false)
}

export function playCharacterAnimation(
  actor: HTMLElement | null,
  animation: BattleAnimation,
  stretchMs?: number,
): number {
  if (!actor) return 0
  const shell = modelShellFor(actor)
  if (!shell) return 0
  return mountedModels.get(shell)?.play(animation, stretchMs) ?? 0
}

/** 지금 이 배우가 재생 중인 동작. 모델이 아직 없으면 null. */
export function characterAnimationOf(actor: HTMLElement | null): BattleAnimation | null {
  if (!actor) return null
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (!shell) return null
  return mountedModels.get(shell)?.animation ?? null
}

export function freezeCharacterAnimation(actor: HTMLElement | null, frozen: boolean) {
  if (!actor) return
  const shell = modelShellFor(actor)
  if (shell) mountedModels.get(shell)?.setFrozen(frozen)
}

export function dissolveCharacterParts(actor: HTMLElement | null, partId: string, count = 1) {
  if (!actor) return
  const shell = modelShellFor(actor)
  if (shell) mountedModels.get(shell)?.dissolveSpiderParts(partId, count)
}

export function destroyCharacterModels(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.model-shell').forEach((shell) => {
    const model = mountedModels.get(shell)
    model?.destroy()
    mountedModels.delete(shell)
  })
}
