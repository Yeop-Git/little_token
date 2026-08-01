import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { CharacterVisualDef } from '@data/characters'
import { currentFieldLight } from '@data/backgrounds'
import { GraphicsSettings } from '@/ui/GameSettings'
import { STRICT_RESOURCE_LOADING } from '@/config/edition'
import { reportResourceFailure } from '@/ui/ResourceFailures'

export type BattleAnimation = 'idle' | 'idle2' | 'walk' | 'appear' | 'attack' | 'attack2' | 'attack3' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat'
/** 한 번만 재생하고 끝나는 동작. idle 계열과 walk는 계속 도는 클립이라 여기 안 든다. */
type OneShotAnimation = Exclude<BattleAnimation, 'idle' | 'idle2' | 'walk'>
const MODEL_VIEW_HEIGHT = 3.6
// 360px 셸에서 약 278px로 보이게 해 전방 적 스프라이트의 불투명 픽셀 높이와 맞춘다.
const MODEL_FIT_HEIGHT = 2.78
const TRANSITION_SECONDS = 0.18
const LOOP_BLEND_SAMPLE_RATE = 30
const MODEL_YAW_RETURN_SPEED = 9
const MODEL_YAW_RETURN_EPSILON = 0.001
const BOSS_EXPOSURE_BOOST = 1.14
const BOSS_EMISSIVE_BOOST = 0.12
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
  shadowFloor: number
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
    groundMix: 0.18,
    skyLightIntensity: 0.56,
    keyLightIntensity: 1.5,
    keyLightPosition: [-3.5, 6, 5],
    emissiveIntensity: 0.44,
    exposure: 1.02,
    shadowFloor: 0.5,
  },
  rain: {
    skyTint: new THREE.Color(0xaec8d0),
    groundTint: new THREE.Color(0x405665),
    skyLight: new THREE.Color(0xb8d0d7),
    keyLight: new THREE.Color(0xd7e4df),
    skyMix: 0.12,
    groundMix: 0.22,
    skyLightIntensity: 0.4,
    keyLightIntensity: 1.02,
    keyLightPosition: [-1.5, 7, 4],
    emissiveIntensity: 0.38,
    exposure: 0.96,
    shadowFloor: 0.48,
  },
  night: {
    skyTint: new THREE.Color(0x8998c4),
    groundTint: new THREE.Color(0x252c4d),
    skyLight: new THREE.Color(0x7188bd),
    keyLight: new THREE.Color(0xffc879),
    skyMix: 0.17,
    groundMix: 0.26,
    skyLightIntensity: 0.24,
    keyLightIntensity: 0.82,
    keyLightPosition: [-4, 3.2, 5.5],
    emissiveIntensity: 0.32,
    exposure: 0.9,
    shadowFloor: 0.44,
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
const SHARED_RENDER_SIZE = 2048
let sharedRenderer: THREE.WebGLRenderer | null = null
const mountedModels = new WeakMap<HTMLElement, BattleCharacterModel>()
const activeModels = new Set<BattleCharacterModel>()
let animationFrame = 0
let previousFrame = 0

function loadModel(url: string): Promise<GLTF> {
  const cached = modelLoads.get(url)
  if (cached) return cached
  const pending = modelLoader.loadAsync(url).catch((error) => {
    // 한 번의 전송/파싱 실패를 세션 전체의 영구 실패로 만들지 않는다.
    modelLoads.delete(url)
    reportResourceFailure('model load', url, error)
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
    // Native MSAA cannot be changed after this shared context is created.
    // Adjustable supersampling is applied per actor output canvas instead.
    antialias: false,
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

/**
 * 배우 렌더에 한 프레임에서 쓸 수 있는 시간(ms).
 *
 * 배우 하나를 그리는 값은 `renderer.render` 한 번이 아니라 그 뒤의
 * `drawImage(webglCanvas → 2D)` 복사다. 이 복사는 GPU 파이프라인을 세우므로
 * 배우 수만큼 선형으로 붙는다. 대량 처치처럼 다섯 배우가 한꺼번에 갱신을 원하는
 * 프레임에서는 이 합이 프레임 예산을 통째로 먹는다.
 */
const MODEL_FRAME_BUDGET_MS = 9
/** 직전 프레임에 배우 렌더가 실제로 쓴 시간. 예산을 넘겼을 때만 다음 프레임을 줄인다. */
let lastModelCostMs = 0

function runAnimationFrame(now: number) {
  const frameMs = previousFrame ? now - previousFrame : 0
  const delta = Math.min(frameMs / 1000, 0.1)
  previousFrame = now
  if (!document.hidden) {
    const models = [...activeModels]
    const wanted = models
      .filter((model) => model.wantsRender(now))
      .sort((a, b) => b.renderPriority(now) - a.renderPriority(now))
    // 평소에는 원하는 배우를 다 그린다. **직전 프레임이 예산을 넘겼을 때만** 상위
    // 몇으로 줄인다 — 이미 프레임을 흘리고 있는 순간에만 켜지는 안전 밸브다.
    // 밀린 배우는 renderPriority에 `now - lastRenderedAt`이 들어 있어 다음 프레임에
    // 맨 앞으로 온다. 그래서 특정 배우만 계속 굶는 일은 없다.
    const cap = lastModelCostMs > MODEL_FRAME_BUDGET_MS && wanted.length > 1
      ? Math.max(1, Math.floor(wanted.length * (MODEL_FRAME_BUDGET_MS / lastModelCostMs)))
      : wanted.length
    const allowed = new Set(wanted.slice(0, cap))
    const startedAt = performance.now()
    models.forEach((model) => model.render(delta, now, allowed.has(model)))
    lastModelCostMs = performance.now() - startedAt
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
  delete document.documentElement.dataset.modelPerformance
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
  startTrimSeconds = 0,
  endTrimSeconds = 0,
): THREE.AnimationClip {
  const cacheKey = `${seamlessLoop ? 1 : 0}:${loopBlendSeconds}:${startTrimSeconds}:${endTrimSeconds}`
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

  if (startTrimSeconds > 0) {
    const trimmedStartTime = Math.min(startTrimSeconds, clip.duration)
    clip.tracks.forEach((track) => {
      const valueSize = track.getValueSize()
      const interpolatingTrack = track as typeof track & {
        createInterpolant: (result: Float32Array) => { evaluate: (time: number) => ArrayLike<number> }
      }
      const startValue = Array.from(
        interpolatingTrack.createInterpolant(new Float32Array(valueSize)).evaluate(trimmedStartTime),
      )
      let firstKeptKey = 0
      while (firstKeptKey < track.times.length && track.times[firstKeptKey] < trimmedStartTime) firstKeptKey += 1

      const times = [0, ...Array.from(track.times.slice(firstKeptKey), (time) => time - trimmedStartTime)]
      const values = [...startValue, ...Array.from(track.values.slice(firstKeptKey * valueSize))]
      if ((times[1] ?? -1) < 0.00001) {
        times.splice(1, 1)
        values.splice(valueSize, valueSize)
      }
      track.times = new Float32Array(times)
      track.values = new Float32Array(values)
    })
    clip.resetDuration()
  }

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
  private compositedScale = 1
  private readonly onWindowResize = () => this.resize()
  private readonly brokenSpiderParts = new Set<string>()
  private readonly spiderPartOriginals = new Map<string, { root: THREE.Object3D; position: THREE.Vector3; rotation: THREE.Euler }>()
  private spiderPartDissolves: SpiderPartDissolve[] = []
  private eliteElapsed = 0
  private readonly eliteTimeUniforms: Array<{ value: number }> = []

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
    window.addEventListener('resize', this.onWindowResize)

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
      // 회복·방어 이펙트는 해당 동작이 있는 배우만 만든다. 적과 보스마다 보이지 않는
      // 파편 71개와 방어 구체를 미리 만들던 비용을 없애되 실제 연출은 그대로 보존한다.
      if (fittedBounds && (this.visual.animations?.heal || this.visual.animations?.shield)) {
        this.setupEffects(fittedBounds)
      }
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
    } catch (error) {
      console.warn(`3D 캐릭터 모델을 불러오지 못해 2D 초상을 사용합니다: ${this.visual.id}`, error)
      this.useFallbackPortrait()
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
          ? this.visual.animations?.idleStartTrimMs ?? 0
          : 0) / 1000,
        (animation === 'idle'
          ? this.visual.animations?.idleEndTrimMs ?? 0
          : this.visual.animations?.endTrimsMs?.[animation as OneShotAnimation] ?? 0) / 1000,
      ))
      : undefined
  }

  private useBattleMaterials(model: THREE.Object3D) {
    const weather = battleWeatherOf(this.shell)
    const atmosphere = BATTLE_ATMOSPHERES[weather]
    const boss = this.visual.id === 'mantis' || this.visual.id === 'queenBee' || this.visual.id === 'elderSpider'
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      // Imported actors never receive runtime shadow maps. Their softer baked AO
      // remains part of the illustration-style surface treatment below.
      object.receiveShadow = false
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
          emissiveIntensity: atmosphere.emissiveIntensity + (boss ? BOSS_EMISSIVE_BOOST : 0),
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
    const rarity = this.shell.dataset.enemyRarity
    const eliteTier = rarity === 'rare' ? 1 : rarity === 'epic' ? 2 : rarity === 'legendary' ? 3 : 0
    const phaseSource = `${material.name}:${material.uuid}`
    let elitePhaseHash = 0
    for (let index = 0; index < phaseSource.length; index += 1) {
      elitePhaseHash = (elitePhaseHash * 31 + phaseSource.charCodeAt(index)) >>> 0
    }
    const elitePhase = (elitePhaseHash % 1009) / 1009
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBattleSkyTint = { value: atmosphere.skyTint }
      shader.uniforms.uBattleGroundTint = { value: atmosphere.groundTint }
      shader.uniforms.uBattleSkyMix = { value: atmosphere.skyMix }
      shader.uniforms.uBattleGroundMix = { value: atmosphere.groundMix }
      const boss = this.visual.id === 'mantis' || this.visual.id === 'queenBee' || this.visual.id === 'elderSpider'
      shader.uniforms.uBattleExposure = { value: atmosphere.exposure * (boss ? BOSS_EXPOSURE_BOOST : 1) }
      shader.uniforms.uBattleShadowFloor = { value: atmosphere.shadowFloor }
      shader.uniforms.uPartDissolve = material.userData.partDissolveUniform
      shader.uniforms.uEliteTier = { value: eliteTier }
      shader.uniforms.uElitePhase = { value: elitePhase }
      const eliteTime = { value: this.eliteElapsed }
      shader.uniforms.uEliteTime = eliteTime
      this.eliteTimeUniforms.push(eliteTime)

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
varying float vBattleHeight;
varying float vBattleSide;
varying vec3 vEliteNormalView;
varying vec3 vEliteViewDir;
varying vec3 vEliteWorldPosition;`)
        .replace('#include <project_vertex>', `#include <project_vertex>
vec4 battleWorldPosition = modelMatrix * vec4(transformed, 1.0);
vBattleHeight = smoothstep(0.0, ${MODEL_FIT_HEIGHT.toFixed(2)}, battleWorldPosition.y);
vBattleSide = smoothstep(-${(MODEL_FIT_HEIGHT * 0.55).toFixed(2)}, ${(MODEL_FIT_HEIGHT * 0.55).toFixed(2)}, battleWorldPosition.x);
vEliteWorldPosition = battleWorldPosition.xyz;
#if defined ( USE_SKINNING ) || defined ( USE_ENVMAP )
  vEliteNormalView = normalize(transformedNormal);
#else
  vEliteNormalView = normalize(normalMatrix * normal);
#endif
vEliteViewDir = normalize(-mvPosition.xyz);`)

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uBattleSkyTint;
uniform vec3 uBattleGroundTint;
uniform float uBattleSkyMix;
uniform float uBattleGroundMix;
uniform float uBattleExposure;
uniform float uBattleShadowFloor;
uniform float uPartDissolve;
uniform float uEliteTier;
uniform float uEliteTime;
uniform float uElitePhase;
varying float vBattleHeight;
varying float vBattleSide;
varying vec3 vEliteNormalView;
varying vec3 vEliteViewDir;
varying vec3 vEliteWorldPosition;

vec3 eliteSpectrum(float h) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return k * k * (3.0 - 2.0 * k);
}`)
        // The stepped directional term exposes individual low-poly faces. Keep
        // ambient/AO darkness and emissive texture color, but omit only that term.
        .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', `vec3 outgoingLight = reflectedLight.indirectDiffuse + totalEmissiveRadiance;
float battleGroundWeight = (1.0 - smoothstep(0.08, 0.58, vBattleHeight)) * uBattleGroundMix;
float battleSkyWeight = smoothstep(0.48, 1.0, vBattleHeight) * uBattleSkyMix;
outgoingLight = mix(outgoingLight, outgoingLight * uBattleGroundTint, battleGroundWeight);
outgoingLight = mix(outgoingLight, outgoingLight * uBattleSkyTint, battleSkyWeight);
// Three broad tonal zones follow the whole silhouette instead of mesh normals.
// Wide smoothstep overlaps blur both boundaries, keeping low-poly faces hidden.
float battleRampPosition = clamp((1.0 - vBattleSide) * 0.7 + vBattleHeight * 0.3, 0.0, 1.0);
float battleShadowToMid = smoothstep(0.12, 0.5, battleRampPosition);
float battleMidToLight = smoothstep(0.5, 0.9, battleRampPosition);
float battleSoftLight = mix(0.94, 1.0, battleShadowToMid);
battleSoftLight = mix(battleSoftLight, 1.05, battleMidToLight);
outgoingLight *= uBattleExposure * battleSoftLight;
vec3 battleTintedAlbedo = diffuseColor.rgb;
battleTintedAlbedo = mix(battleTintedAlbedo, battleTintedAlbedo * uBattleGroundTint, battleGroundWeight * 0.3);
battleTintedAlbedo = mix(battleTintedAlbedo, battleTintedAlbedo * uBattleSkyTint, battleSkyWeight * 0.3);
outgoingLight = max(outgoingLight, battleTintedAlbedo * uBattleShadowFloor);

// Enemy rarity is a separate fantasy material language layered over the model.
// Keep the source illustration readable: Rare is blue ink lacquer, Epic is violet
// storybook foil, and Legendary is an icy prism crystal (the external Mystic tier).
if (uEliteTier > 0.5) {
  vec3 eliteNormal = normalize(vEliteNormalView);
  vec3 eliteView = normalize(vEliteViewDir);
  float facing = clamp(dot(eliteNormal, eliteView), 0.0, 1.0);
  float eliteRim = pow(1.0 - facing, 2.2);

  // World position is calculated after skinning, so grain, facets and stars stay
  // painted onto moving limbs instead of sliding over the output canvas.
  vec3 rarityCell = floor(vEliteWorldPosition * 7.0 + eliteNormal * 1.7);
  float raritySeed = fract(sin(dot(rarityCell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);

  // Each promotion owns one material language. Not stacking lower-tier coats is
  // what preserves faces, costume colors and the readability of the silhouette.
  if (uEliteTier < 1.5) {
    // Rare -> sapphire ink lacquer. Two interference waves form a restrained
    // caustic ribbon, like light passing through a thick blue ink wash.
    vec3 sapphireInk = vec3(0.035, 0.13, 0.52);
    float rareWaveA = sin(vEliteWorldPosition.y * 10.5 + vEliteWorldPosition.x * 4.2 - uEliteTime * 1.10);
    float rareWaveB = sin(vEliteWorldPosition.y * 7.3 - vEliteWorldPosition.z * 5.1 + uEliteTime * 0.82);
    float rareCaustic = pow(clamp(0.52 + (rareWaveA + rareWaveB) * 0.20, 0.0, 1.0), 9.0);
    float rarePin = pow(max(0.0, sin(uEliteTime * 2.1 + raritySeed * 31.0)), 16.0)
      * smoothstep(0.90, 0.985, raritySeed);
    outgoingLight = mix(outgoingLight, outgoingLight * 0.70 + sapphireInk * 0.42, 0.31);
    outgoingLight += vec3(0.22, 0.63, 1.0) * eliteRim * 0.48;
    outgoingLight += vec3(0.62, 0.88, 1.0) * rareCaustic * (0.08 + facing * 0.12);
    outgoingLight += vec3(0.86, 0.96, 1.0) * rarePin * 0.30;
  } else if (uEliteTier < 2.5) {
    // Epic -> violet storybook foil. Low-frequency surface cells read as cut
    // paper facets; a slow aurora travels across them without erasing the art.
    vec3 epicCell = floor(vEliteWorldPosition * 5.2 + eliteNormal * 2.1);
    float epicFacet = fract(sin(dot(epicCell, vec3(23.17, 61.73, 11.91))) * 31415.9265);
    float epicFacetSeam = clamp(fwidth(epicFacet) * 2.25, 0.0, 1.0);
    float auroraPhase = vEliteWorldPosition.y * 0.72 + vEliteWorldPosition.x * 0.34
      + epicFacet * 0.31 - uEliteTime * 0.050;
    vec3 violetFoil = mix(
      vec3(0.27, 0.08, 0.61),
      vec3(0.91, 0.42, 1.0),
      0.5 + 0.5 * sin(auroraPhase * 6.28318)
    );
    float epicPulse = 0.5 + 0.5 * sin(uEliteTime * 1.05 + epicFacet * 17.0);
    float epicGlint = pow(epicPulse, 9.0) * (0.20 + 0.80 * facing);
    // Epic cards are defined by starlight. The grid now comes from the skinned
    // surface position, making each four-point star travel with the character.
    vec2 starGrid = vEliteWorldPosition.xy * 8.8 + eliteNormal.xy * 1.4;
    vec2 starCell = floor(starGrid);
    vec2 starLocal = abs(fract(starGrid) - 0.5);
    float starSeed = fract(sin(dot(starCell, vec2(41.73, 93.17))) * 24634.6345);
    float starRadius = length(starLocal);
    float starCore = 1.0 - smoothstep(0.035, 0.16, starRadius);
    float starCross = 1.0 - smoothstep(0.022, 0.082, min(starLocal.x, starLocal.y));
    float starReach = 1.0 - smoothstep(0.12, 0.46, max(starLocal.x, starLocal.y));
    float starShape = max(starCore, starCross * starReach);
    float starHalo = 1.0 - smoothstep(0.08, 0.38, starRadius);
    float starTwinkle = pow(
      0.5 + 0.5 * sin(uEliteTime * (2.15 + starSeed * 1.55) + starSeed * 37.0),
      6.0
    );
    float starAmount = step(0.58, starSeed)
      * (starShape + starHalo * 0.24)
      * (0.14 + starTwinkle * 0.86);
    float starDust = smoothstep(0.88, 0.99, raritySeed)
      * pow(max(0.0, sin(uEliteTime * 3.4 + raritySeed * 43.0)), 10.0);
    outgoingLight = mix(outgoingLight, outgoingLight * 0.66 + violetFoil * 0.50, 0.41);
    outgoingLight *= 1.0 - epicFacetSeam * 0.14;
    outgoingLight += vec3(0.66, 0.28, 1.0) * eliteRim * 0.48;
    outgoingLight += vec3(0.95, 0.70, 1.0) * epicGlint * 0.22;
    outgoingLight += mix(vec3(0.76, 0.82, 1.0), vec3(1.0, 0.82, 0.98), starSeed)
      * starAmount * 1.18;
    outgoingLight += vec3(0.88, 0.72, 1.0) * starDust * 0.42;
  } else {
    // Legendary -> reference Mystic: frosted crystal planes with restrained
    // prismatic refraction. Fracture veins give the surface a crafted storybook
    // crystal structure while keeping the face and costume readable.
    vec3 crystalCell = floor(vEliteWorldPosition * 6.8 + eliteNormal * 2.4);
    float crystalFacet = fract(sin(dot(crystalCell, vec3(19.19, 73.31, 41.17))) * 27182.8183);
    float crystalSeam = clamp(fwidth(crystalFacet) * 2.35, 0.0, 1.0);
    float fractureA = 1.0 - smoothstep(0.018, 0.065, abs(fract(
      dot(vEliteWorldPosition, vec3(0.73, 1.0, 0.37)) * 3.1 + crystalFacet
    ) - 0.5));
    float fractureB = 1.0 - smoothstep(0.016, 0.055, abs(fract(
      dot(vEliteWorldPosition, vec3(-0.46, 0.58, 1.0)) * 3.8 - crystalFacet * 0.7
    ) - 0.5));
    float fractureVein = max(fractureA, fractureB * 0.72) * (0.35 + 0.65 * eliteRim);
    float shellHue = fract(uElitePhase + uEliteTime * (0.032 + uElitePhase * 0.026));
    float refractionPhase = shellHue + crystalFacet * 0.68 + raritySeed * 0.16
      + vEliteWorldPosition.y * 0.15 - vEliteWorldPosition.x * 0.06;
    vec3 prism = eliteSpectrum(fract(refractionPhase));
    float facetPulse = 0.5 + 0.5 * sin(
      uEliteTime * (1.18 + raritySeed * 1.24)
      + crystalFacet * 29.0
      + uElitePhase * 19.0
    );
    float facetBrilliance = 0.42 + pow(facetPulse, 3.0) * 0.58;
    vec3 frost = mix(vec3(0.38, 0.65, 0.96), vec3(0.88, 0.96, 1.0), facing);
    float crystalEdge = pow(1.0 - facing, 1.35);
    float travelingGlint = pow(
      max(0.0, sin(uEliteTime * 1.42 + crystalFacet * 31.0 + vEliteWorldPosition.y * 8.0)),
      20.0
    );
    float starGate = smoothstep(0.82, 0.97, raritySeed);
    float starGlint = travelingGlint * starGate;
    outgoingLight = mix(outgoingLight, outgoingLight * 0.78 + frost * 0.28, 0.34);
    outgoingLight = mix(
      outgoingLight,
      outgoingLight * (0.70 + prism * (0.54 + facetBrilliance * 0.24)),
      0.30 + facetBrilliance * 0.13
    );
    outgoingLight *= 1.0 - crystalSeam * 0.16;
    outgoingLight += vec3(0.22, 0.46, 0.76) * fractureVein * 0.34;
    outgoingLight += prism * crystalEdge * (0.42 + facetBrilliance * 0.24);
    outgoingLight += prism * pow(facetPulse, 5.0) * (0.10 + facing * 0.16);
    outgoingLight += vec3(0.80, 0.94, 1.0) * crystalEdge * crystalEdge * 0.24;
    outgoingLight += vec3(1.0) * starGlint * 0.52;
  }
}
float partDissolveNoise = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
if (partDissolveNoise < uPartDissolve) discard;
          float partDissolveActive = smoothstep(0.0, 0.025, uPartDissolve);
          float partDissolveEdge = partDissolveActive * (1.0 - smoothstep(0.0, 0.09, partDissolveNoise - uPartDissolve));
outgoingLight += vec3(0.72, 0.42, 0.88) * partDissolveEdge * (1.0 - uPartDissolve);`)
    }
    material.customProgramCacheKey = () => `battle-atmosphere-rarity-v4-${weather}`
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

  /**
   * 바깥에서 정하는 몸통 방향. 매니페스트의 기본 방향에 더해 쓰므로, 0을 넣으면
   * 매니페스트가 정한 자세 그대로다. 드래그 중에는 사용자의 손이 이긴다.
   */
  setYaw(yaw: number) {
    if (!this.model || this.dragPointerId !== null) return
    this.returningToDefaultYaw = false
    this.model.rotation.y = (this.visual.modelYaw ?? 0) + yaw
  }

  /** 풀에서 재사용할 때 이전 one-shot 자세를 한 프레임도 노출하지 않고 idle로 되돌린다. */
  resetToIdle() {
    this.requestedAnimation = 'idle'
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
    const profile = GraphicsSettings.profile()
    const baseRatio = profile.resolutionScale
    const waitingScale = waitingEnemy && profile.waitingFps < profile.activeFps ? 0.9 : 1
    const antialiasing = GraphicsSettings.antiAliasingScale()
    return Math.min(2.5, baseRatio * waitingScale * antialiasing) * this.compositedScale
  }

  private targetFps() {
    const waitingEnemy = this.isWaitingEnemy()
    const profile = GraphicsSettings.profile()
    return waitingEnemy ? profile.waitingFps : profile.activeFps
  }

  /**
   * 얼어 있어도 계속 움직이는 것들 — 이게 하나라도 있으면 정지 중에도 다시 그려야 한다.
   * 정예 셰이더의 시간 유니폼과 회복·방어 이펙트, 거미 부위 용해, 카메라 줌 보간,
   * 드래그 회전 복귀가 여기 해당한다.
   */
  private hasLiveMotionWhileFrozen() {
    return this.eliteTimeUniforms.length > 0
      || this.effectKind !== null
      || this.spiderPartDissolves.length > 0
      || this.returningToDefaultYaw
      || this.dragPointerId !== null
      || Math.abs(this.cameraZoom - this.cameraZoomTarget) > 0.0001
  }

  wantsRender(now: number) {
    if (this.disposed || !this.active || !this.shell.isConnected) return false
    if (!this.firstFrameRendered || !this.lastRenderedAt) return true
    // 히트스탑·강공격 예고로 얼어 있는 동안은 mixer가 0으로 돌아 **같은 그림**이 나온다.
    // 그런데도 매 프레임 `renderToOutput`(WebGL → 2D 복사)을 돌리고 있었다. 화면이
    // 멈춘 구간에서 가장 비싼 일을 계속하던 셈이라, 정지가 풀리며 이펙트가 터지는
    // 바로 그 순간에 쓸 여유를 미리 깎아 먹었다.
    // 캔버스에 남은 마지막 프레임이 그대로 보이므로 **화면은 한 픽셀도 달라지지 않는다.**
    if (this.frozen && !this.hasLiveMotionWhileFrozen()) return false
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
    const rect = this.shell.getBoundingClientRect()
    const scaleX = rect.width > 0 ? rect.width / width : 1
    const scaleY = rect.height > 0 ? rect.height / height : 1
    this.compositedScale = Math.max(0.25, scaleX, scaleY)
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
    // 얼어 있는 동안 못 그린 프레임의 델타가 쌓이면, 정지가 풀리는 순간 mixer가 그
    // 합을 한꺼번에 먹어 동작이 최대 0.1초를 건너뛴다. 정지 중에는 한 프레임치만
    // 들고 있는다 — 풀리는 프레임의 진행량이 예전과 똑같아진다.
    if (this.frozen) this.pendingRenderDelta = Math.min(this.pendingRenderDelta, delta)
    if (!allowDraw) return
    const waitingEnemy = this.isWaitingEnemy()
    const desiredPixelRatio = this.desiredPixelRatio(waitingEnemy)
    if (desiredPixelRatio !== this.renderedPixelRatio) this.resize(waitingEnemy)

    // 고급 모드는 idle과 공격을 모두 60fps로 유지한다. 절전 모드만 사용자의 명시적
    // 선택에 따라 24~30fps를 쓰며, 느린 한 구간이 전투 전체 품질을 고정 강등하지 않는다.
    const targetFps = this.targetFps()
    this.outputCanvas.dataset.renderFps = String(targetFps)
    if (this.firstFrameRendered && this.lastRenderedAt && now - this.lastRenderedAt < 1000 / targetFps) return

    const frameDelta = this.pendingRenderDelta
    this.pendingRenderDelta = 0
    this.lastRenderedAt = now
    const motionDelta = this.frozen ? 0 : frameDelta
    this.mixer?.update(motionDelta)
    this.updateModelYawReturn(frameDelta)
    this.updateEffect(frameDelta)
    this.updateSpiderPartDissolves(frameDelta)
    this.eliteElapsed += frameDelta
    this.eliteTimeUniforms.forEach((uniform) => { uniform.value = this.eliteElapsed })
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
    window.removeEventListener('resize', this.onWindowResize)
    this.shell.removeEventListener('pointerdown', this.onPointerDown)
    this.shell.removeEventListener('pointermove', this.onPointerMove)
    this.shell.removeEventListener('pointerup', this.onPointerUp)
    this.shell.removeEventListener('pointercancel', this.onPointerUp)
    this.shell.removeEventListener('click', this.onClickCapture, true)
    this.mixer?.removeEventListener('finished', this.onAnimationFinished)
    this.mixer?.stopAllAction()
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
  const urls = [...new Set(visuals.flatMap((visual) => (visual.model3d ? [visual.model3d] : [])))]
  const pending = urls.map((url) => loadModel(url).then(() => undefined))
  return Promise.all(STRICT_RESOURCE_LOADING ? pending : pending.map((load) => load.catch(() => undefined)))
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

/**
 * 몸통이 바라보는 방향을 바깥에서 정한다(라디안, 매니페스트 modelYaw 기준의 상대값).
 * 자유 비행하는 토큰이 진행 방향이나 들여다보는 대상 쪽으로 도는 데 쓴다. 드래그로
 * 돌리는 중이면 사용자의 손이 우선이라 무시한다.
 */
export function setCharacterModelYaw(actor: HTMLElement | null, yaw: number) {
  if (!actor) return
  const shell = modelShellFor(actor)
  if (shell) mountedModels.get(shell)?.setYaw(yaw)
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
