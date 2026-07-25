import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { CharacterVisualDef } from '@data/characters'

type BattleAnimation = 'idle' | 'attack'
const MODEL_VIEW_HEIGHT = 3.6

const modelLoads = new Map<string, Promise<GLTF>>()
const mountedModels = new WeakMap<HTMLElement, BattleCharacterModel>()
const activeModels = new Set<BattleCharacterModel>()
let animationFrame = 0
let previousFrame = 0

function loadModel(url: string): Promise<GLTF> {
  const cached = modelLoads.get(url)
  if (cached) return cached
  const pending = new GLTFLoader().loadAsync(url)
  modelLoads.set(url, pending)
  return pending
}

function runAnimationFrame(now: number) {
  const delta = previousFrame ? Math.min((now - previousFrame) / 1000, 0.1) : 0
  previousFrame = now
  activeModels.forEach((model) => model.render(delta))
  animationFrame = activeModels.size ? requestAnimationFrame(runAnimationFrame) : 0
  if (!animationFrame) previousFrame = 0
}

function addToAnimationFrame(model: BattleCharacterModel) {
  activeModels.add(model)
  if (!animationFrame) animationFrame = requestAnimationFrame(runAnimationFrame)
}

function removeFromAnimationFrame(model: BattleCharacterModel) {
  activeModels.delete(model)
  if (activeModels.size || !animationFrame) return
  cancelAnimationFrame(animationFrame)
  animationFrame = 0
  previousFrame = 0
}

/**
 * 일부 DCC/엔진에서 내보낸 클립은 첫 키가 0초보다 늦어서 반복할 때 잠깐
 * 첫 자세에 멈춘 것처럼 보인다. 시간을 0초 기준으로 옮기고, idle의 마지막
 * 자세를 첫 자세와 맞춰 루프 경계에서도 포즈가 튀지 않게 한다.
 */
function normalizedClip(source: THREE.AnimationClip, seamlessLoop: boolean): THREE.AnimationClip {
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

  if (seamlessLoop) {
    clip.tracks.forEach((track) => {
      const valueSize = track.getValueSize()
      const lastOffset = track.values.length - valueSize
      if (lastOffset <= 0) return
      for (let component = 0; component < valueSize; component += 1) {
        track.values[lastOffset + component] = track.values[component]
      }
    })
  }

  clip.resetDuration()
  return clip
}

/**
 * 배우 하나를 기존 스프라이트 박스 안에 그리는 투명 WebGL 뷰포트.
 * 위치·크기·돌진·피격은 부모 .actor/.model-shell CSS가 계속 담당한다.
 */
class BattleCharacterModel {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, MODEL_VIEW_HEIGHT, 0, 0.1, 20)
  private readonly renderer: THREE.WebGLRenderer
  private readonly resizeObserver: ResizeObserver
  private mixer: THREE.AnimationMixer | null = null
  private actions: Partial<Record<BattleAnimation, THREE.AnimationAction>> = {}
  private current: THREE.AnimationAction | null = null
  private model: THREE.Object3D | null = null
  private disposed = false
  private active = true
  private requestedAnimation: BattleAnimation = 'idle'

  constructor(private readonly shell: HTMLElement, private readonly visual: CharacterVisualDef) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.className = 'battle-model'
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    this.camera.position.set(0, 1.7, 6)
    this.camera.lookAt(0, 1.7, 0)
    this.shell.append(this.renderer.domElement)

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
      this.useUnlitMaterials(model)
      this.fitModel(model)
      this.scene.add(model)
      this.model = model
      this.mixer = new THREE.AnimationMixer(model)
      this.actions = {
        idle: this.actionFor(gltf, 'idle'),
        attack: this.actionFor(gltf, 'attack'),
      }
      this.mixer.addEventListener('finished', this.onAnimationFinished)
      this.shell.dataset.modelStatus = 'ready-3d'
      this.play(this.requestedAnimation)
    } catch (error) {
      console.warn(`3D 캐릭터 모델을 불러오지 못해 2D 초상을 사용합니다: ${this.visual.id}`, error)
      this.shell.dataset.modelStatus = 'fallback-2d'
    }
  }

  private actionFor(gltf: GLTF, animation: BattleAnimation): THREE.AnimationAction | undefined {
    const configuredName = this.visual.animations?.[animation]
    const clip = gltf.animations.find((candidate) => candidate.name === configuredName)
      ?? gltf.animations.find((candidate) => candidate.name.toLowerCase().includes(animation))
    return clip && this.mixer
      ? this.mixer.clipAction(normalizedClip(clip, animation === 'idle'))
      : undefined
  }

  private useUnlitMaterials(model: THREE.Object3D) {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const originals = Array.isArray(object.material) ? object.material : [object.material]
      const replacements = originals.map((material) => {
        const source = material as THREE.MeshStandardMaterial
        return new THREE.MeshBasicMaterial({
          name: `${material.name}-battle-unlit`,
          color: source.color?.clone() ?? new THREE.Color(0xffffff),
          map: source.map ?? null,
          alphaMap: source.alphaMap ?? null,
          transparent: material.transparent,
          opacity: material.opacity,
          alphaTest: material.alphaTest,
          side: material.side,
          vertexColors: source.vertexColors,
          toneMapped: false,
        })
      })
      object.material = Array.isArray(object.material) ? replacements : replacements[0]
    })
  }

  private fitModel(model: THREE.Object3D) {
    model.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(model)
    const size = bounds.getSize(new THREE.Vector3())
    if (!Number.isFinite(size.y) || size.y <= 0) return
    const scale = 3.05 / size.y
    model.scale.multiplyScalar(scale)
    model.updateMatrixWorld(true)
    const fitted = new THREE.Box3().setFromObject(model)
    const center = fitted.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.y += (this.visual.modelGroundOffset ?? 0) - fitted.min.y
  }

  private onAnimationFinished = (event: { action: THREE.AnimationAction }) => {
    if (event.action === this.actions.attack) this.play('idle')
  }

  play(animation: BattleAnimation) {
    this.requestedAnimation = animation
    this.shell.dataset.modelAnimation = animation
    if (animation === 'attack') this.shell.dataset.modelLastAction = animation
    const next = this.actions[animation]
    if (!next || next === this.current) return

    next.reset().enabled = true
    if (animation === 'attack') {
      const desiredSeconds = (this.visual.animations?.attackDurationMs ?? 440) / 1000
      next.setLoop(THREE.LoopOnce, 1)
      next.clampWhenFinished = false
      next.setEffectiveTimeScale(next.getClip().duration / desiredSeconds)
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity)
      next.clampWhenFinished = false
      next.setEffectiveTimeScale(1)
    }
    next.play()
    if (this.current) this.current.crossFadeTo(next, 0.08, false)
    this.current = next
  }

  private resize() {
    const width = Math.max(1, this.shell.clientWidth)
    const height = Math.max(1, this.shell.clientHeight)
    const pixelRatio = document.documentElement.dataset.graphics === 'low'
      ? 1
      : Math.min(window.devicePixelRatio, 1.5)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    const viewHeight = MODEL_VIEW_HEIGHT
    const viewWidth = viewHeight * (width / height)
    this.camera.left = -viewWidth / 2
    this.camera.right = viewWidth / 2
    this.camera.top = viewHeight
    this.camera.bottom = 0
    this.camera.updateProjectionMatrix()
  }

  render(delta: number) {
    if (this.disposed || !this.active || !this.shell.isConnected) return
    this.mixer?.update(delta)
    this.renderer.render(this.scene, this.camera)
  }

  setActive(active: boolean) {
    if (this.disposed || active === this.active) return
    this.active = active
    if (active) addToAnimationFrame(this)
    else removeFromAnimationFrame(this)
  }

  destroy() {
    if (this.disposed) return
    this.disposed = true
    removeFromAnimationFrame(this)
    this.resizeObserver.disconnect()
    this.mixer?.removeEventListener('finished', this.onAnimationFinished)
    this.mixer?.stopAllAction()
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => material.dispose())
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

export function mountCharacterModel(actor: HTMLElement, visual: CharacterVisualDef) {
  if (!visual.model3d) return
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (!shell) return
  const mounted = mountedModels.get(shell)
  if (mounted) {
    mounted.setActive(true)
    return
  }
  try {
    const model = new BattleCharacterModel(shell, visual)
    mountedModels.set(shell, model)
  } catch (error) {
    console.warn(`WebGL을 시작하지 못해 2D 초상을 사용합니다: ${visual.id}`, error)
    shell.dataset.modelStatus = 'fallback-2d'
  }
}

export function suspendCharacterModel(actor: HTMLElement) {
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (shell) mountedModels.get(shell)?.setActive(false)
}

export function playCharacterAnimation(actor: HTMLElement | null, animation: BattleAnimation) {
  if (!actor) return
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (!shell) return
  mountedModels.get(shell)?.play(animation)
}

export function destroyCharacterModels(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.model-shell').forEach((shell) => {
    const model = mountedModels.get(shell)
    model?.destroy()
    mountedModels.delete(shell)
  })
}
