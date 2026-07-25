import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import type { CharacterVisualDef } from '@data/characters'

export type BattleAnimation = 'idle' | 'attack' | 'heal' | 'shield' | 'victory1' | 'victory2' | 'defeat'
type OneShotAnimation = Exclude<BattleAnimation, 'idle'>
const MODEL_VIEW_HEIGHT = 3.6
// 360px 셸에서 약 278px로 보이게 해 전방 적 스프라이트의 불투명 픽셀 높이와 맞춘다.
const MODEL_FIT_HEIGHT = 2.78
const TRANSITION_SECONDS = 0.18
const RETURN_TO_IDLE = new Set<BattleAnimation>(['attack', 'heal', 'shield'])

type BattleWeather = 'sunny' | 'rain' | 'night'

interface BattleAtmosphere {
  skyTint: THREE.Color
  groundTint: THREE.Color
  skyMix: number
  groundMix: number
  exposure: number
}

/**
 * 전장의 배경색을 캐릭터 텍스처에 아주 얕게 섞는다. 광원 반응형 재질로
 * 바꾸지 않아 언릿 카툰 인상은 유지하고, 발밑은 배경의 청록 그림자에 더
 * 잠기며 머리 쪽은 하늘색을 조금 받게 한다.
 */
const BATTLE_ATMOSPHERES: Record<BattleWeather, BattleAtmosphere> = {
  sunny: {
    skyTint: new THREE.Color(0xfff0c2),
    groundTint: new THREE.Color(0x53665f),
    skyMix: 0.07,
    groundMix: 0.28,
    exposure: 0.94,
  },
  rain: {
    skyTint: new THREE.Color(0xaec8d0),
    groundTint: new THREE.Color(0x405665),
    skyMix: 0.12,
    groundMix: 0.36,
    exposure: 0.88,
  },
  night: {
    skyTint: new THREE.Color(0x8998c4),
    groundTint: new THREE.Color(0x252c4d),
    skyMix: 0.17,
    groundMix: 0.46,
    exposure: 0.8,
  },
}

interface PlusParticle {
  group: THREE.Group
  phase: number
  x: number
  y: number
}

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
 * 구간을 첫 자세로 점진 보간해 루프 경계에서도 포즈가 튀지 않게 한다.
 */
function normalizedClip(
  source: THREE.AnimationClip,
  seamlessLoop: boolean,
  loopBlendSeconds = 0,
): THREE.AnimationClip {
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

  if (seamlessLoop) {
    clip.tracks.forEach((track) => {
      const valueSize = track.getValueSize()
      const lastOffset = track.values.length - valueSize
      if (lastOffset <= 0) return

      const endTime = track.times[track.times.length - 1] ?? clip.duration
      const blendDuration = Math.min(Math.max(0, loopBlendSeconds), endTime)
      if (blendDuration <= 0) {
        for (let component = 0; component < valueSize; component += 1) {
          track.values[lastOffset + component] = track.values[component]
        }
        return
      }

      const blendStart = endTime - blendDuration
      const firstValue = Array.from(track.values.slice(0, valueSize))
      for (let keyIndex = 0; keyIndex < track.times.length; keyIndex += 1) {
        const time = track.times[keyIndex]
        if (time < blendStart) continue
        const progress = THREE.MathUtils.clamp((time - blendStart) / blendDuration, 0, 1)
        const eased = progress * progress * (3 - 2 * progress)
        const offset = keyIndex * valueSize
        if (track instanceof THREE.QuaternionKeyframeTrack && valueSize === 4) {
          new THREE.Quaternion()
            .fromArray(track.values, offset)
            .slerp(new THREE.Quaternion().fromArray(firstValue), eased)
            .toArray(track.values, offset)
          continue
        }
        for (let component = 0; component < valueSize; component += 1) {
          track.values[offset + component] = THREE.MathUtils.lerp(
            track.values[offset + component],
            firstValue[component],
            eased,
          )
        }
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
  private readonly camera = new THREE.OrthographicCamera(
    -1,
    1,
    MODEL_VIEW_HEIGHT / 2,
    -MODEL_VIEW_HEIGHT / 2,
    0.1,
    20,
  )
  private readonly renderer: THREE.WebGLRenderer
  private readonly resizeObserver: ResizeObserver
  private mixer: THREE.AnimationMixer | null = null
  private actions: Partial<Record<BattleAnimation, THREE.AnimationAction>> = {}
  private current: THREE.AnimationAction | null = null
  private model: THREE.Object3D | null = null
  private readonly effects = new THREE.Group()
  private healAura: THREE.Group | null = null
  private healMaterials: THREE.ShaderMaterial[] = []
  private plusParticles: PlusParticle[] = []
  private shieldMesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null
  private shieldBaseY = 1
  private effectKind: 'heal' | 'shield' | null = null
  private effectElapsed = 0
  private dragPointerId: number | null = null
  private dragStartX = 0
  private dragStartYaw = 0
  private dragDistance = 0
  private suppressClick = false
  private disposed = false
  private active = true
  private firstFrameRendered = false
  private requestedAnimation: BattleAnimation = 'idle'

  constructor(private readonly shell: HTMLElement, private readonly visual: CharacterVisualDef) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.domElement.className = 'battle-model'
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    // 캐릭터 중심을 바라보는 약한 하향 시점으로, 지면과 평행한 발밑 오라도 함께 읽히게 한다.
    this.camera.position.set(0, 3, 7)
    this.camera.lookAt(0, 1.45, 0)
    this.scene.add(this.effects)
    this.shell.append(this.renderer.domElement)
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
      this.useUnlitMaterials(model)
      const fittedBounds = this.fitModel(model)
      this.scene.add(model)
      this.model = model
      if (fittedBounds) this.setupEffects(fittedBounds)
      this.mixer = new THREE.AnimationMixer(model)
      this.actions = {
        idle: this.actionFor(gltf, 'idle'),
        attack: this.actionFor(gltf, 'attack'),
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
      this.shell.dataset.modelStatus = 'fallback-2d'
    }
  }

  private actionFor(gltf: GLTF, animation: BattleAnimation): THREE.AnimationAction | undefined {
    const configuredName = this.visual.animations?.[animation]
    const clip = gltf.animations.find((candidate) => candidate.name === configuredName)
      ?? gltf.animations.find((candidate) => candidate.name.toLowerCase().includes(animation))
    return clip && this.mixer
      ? this.mixer.clipAction(normalizedClip(
        clip,
        animation === 'idle',
        (this.visual.animations?.idleLoopBlendMs ?? 0) / 1000,
      ))
      : undefined
  }

  private useUnlitMaterials(model: THREE.Object3D) {
    const weather = this.shell.closest<HTMLElement>('.battle')?.dataset.weather as BattleWeather | undefined
    const atmosphere = BATTLE_ATMOSPHERES[weather ?? 'sunny'] ?? BATTLE_ATMOSPHERES.sunny
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const originals = Array.isArray(object.material) ? object.material : [object.material]
      const replacements = originals.map((material) => {
        const source = material as THREE.MeshStandardMaterial
        const unlit = new THREE.MeshBasicMaterial({
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
        this.applyBattleAtmosphere(unlit, atmosphere, weather ?? 'sunny')
        return unlit
      })
      object.material = Array.isArray(object.material) ? replacements : replacements[0]
    })
  }

  private applyBattleAtmosphere(
    material: THREE.MeshBasicMaterial,
    atmosphere: BattleAtmosphere,
    weather: BattleWeather,
  ) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uBattleSkyTint = { value: atmosphere.skyTint }
      shader.uniforms.uBattleGroundTint = { value: atmosphere.groundTint }
      shader.uniforms.uBattleSkyMix = { value: atmosphere.skyMix }
      shader.uniforms.uBattleGroundMix = { value: atmosphere.groundMix }
      shader.uniforms.uBattleExposure = { value: atmosphere.exposure }

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
varying float vBattleHeight;`)
        .replace('vec3 outgoingLight = reflectedLight.indirectDiffuse;', `vec3 outgoingLight = reflectedLight.indirectDiffuse;
float battleGroundWeight = (1.0 - smoothstep(0.08, 0.58, vBattleHeight)) * uBattleGroundMix;
float battleSkyWeight = smoothstep(0.48, 1.0, vBattleHeight) * uBattleSkyMix;
outgoingLight = mix(outgoingLight, outgoingLight * uBattleGroundTint, battleGroundWeight);
outgoingLight = mix(outgoingLight, outgoingLight * uBattleSkyTint, battleSkyWeight);
outgoingLight *= uBattleExposure;`)
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
      { inner: radius * 0.52, outer: radius * 0.92 },
      { inner: radius * 0.82, outer: radius * 1.06 },
    ]
    auraDefs.forEach(({ inner, outer }) => {
      // 실드와 동일한 카드-버스트 결: 화이트-핫 코어 + 발밑에서 퍼지는 충격파 링.
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(0x79f29a) },
          uOpacity: { value: 0 },
          uProgress: { value: 0 },
          uMaxRadius: { value: auraMaxRadius },
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
          varying float vRadial;
          void main() {
            float r = clamp(vRadial / uMaxRadius, 0.0, 1.3);

            // 형성 순간의 버스트 플래시 — 초반에 확 밝았다 빠르게 사그라든다(카드 flash).
            float flash = pow(1.0 - min(1.0, uProgress * 3.4), 2.0);

            // 발밑에서 바깥으로 퍼지는 충격파 링(카드의 확장 링에 대응).
            float front = mix(0.05, 1.3, clamp(uProgress * 1.9, 0.0, 1.0));
            float wave = smoothstep(0.3, 0.0, abs(r - front));

            // 안쪽일수록 흰색으로 달아오르는 화이트-핫 코어(카드의 #fff→color).
            float hot = clamp((1.0 - r) * (0.45 + flash * 1.05) + wave * 0.9, 0.0, 1.0);
            vec3 color = mix(uColor, vec3(1.0), hot);

            float glow = 0.5 + flash * 1.7 + wave * 1.2;
            gl_FragColor = vec4(color * glow, min(1.0, glow) * uOpacity);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 64), material)
      ring.rotation.x = -Math.PI / 2
      aura.add(ring)
      this.healMaterials.push(material)
    })
    this.effects.add(aura)
    this.healAura = aura

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
          vec3 color = mix(uColor, vec3(1.0), hot);

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
  }

  private startEffect(kind: 'heal' | 'shield') {
    this.effectKind = kind
    this.effectElapsed = 0
    if (this.healAura) this.healAura.visible = kind === 'heal'
    this.plusParticles.forEach(({ group }) => { group.visible = kind === 'heal' })
    if (this.shieldMesh) this.shieldMesh.visible = kind === 'shield'
  }

  private stopEffect() {
    this.effectKind = null
    if (this.healAura) this.healAura.visible = false
    this.plusParticles.forEach(({ group }) => { group.visible = false })
    if (this.shieldMesh) this.shieldMesh.visible = false
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
      this.healMaterials.forEach((material, index) => {
        material.uniforms.uProgress.value = progress
        material.uniforms.uOpacity.value = Math.max(0, envelope) * (index ? 0.72 : 0.44)
      })
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
    if (progress >= 1) this.stopEffect()
  }

  private onAnimationFinished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== this.current) return
    const finished = (Object.entries(this.actions) as [BattleAnimation, THREE.AnimationAction | undefined][])
      .find(([, action]) => action === event.action)?.[0]
    if (finished && RETURN_TO_IDLE.has(finished)) this.play('idle')
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.model || event.button !== 0) return
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

  play(animation: BattleAnimation): number {
    this.requestedAnimation = animation
    this.shell.dataset.modelAnimation = animation
    if (animation !== 'idle') this.shell.dataset.modelLastAction = animation
    const next = this.actions[animation]
    if (!next) return 0
    if (next === this.current && animation === 'idle') return 0

    if (animation === 'heal' || animation === 'shield') this.startEffect(animation)
    else if (animation !== 'idle') this.stopEffect()

    next.reset().enabled = true
    if (animation !== 'idle') {
      const desiredMs = this.visual.animations?.durationsMs?.[animation as OneShotAnimation]
      const playbackRate = this.visual.animations?.playbackRates?.[animation as OneShotAnimation] ?? 1
      const desiredSeconds = desiredMs ? desiredMs / 1000 : next.getClip().duration / playbackRate
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
    return animation === 'idle'
      ? 0
      : (this.visual.animations?.durationsMs?.[animation as OneShotAnimation]
        ?? next.getClip().duration * 1000 / (this.visual.animations?.playbackRates?.[animation as OneShotAnimation] ?? 1))
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
    this.camera.bottom = -viewHeight / 2
    this.camera.top = viewHeight / 2
    this.camera.updateProjectionMatrix()
  }

  render(delta: number) {
    if (this.disposed || !this.active || !this.shell.isConnected) return
    this.mixer?.update(delta)
    this.updateEffect(delta)
    this.renderer.render(this.scene, this.camera)
    if (this.model && !this.firstFrameRendered) {
      // 실제 WebGL 컨텍스트에서 텍스처 업로드와 첫 드로우까지 성공한 뒤에만
      // 캔버스를 공개한다. 그 전에는 2D 초상도 함께 숨겨 교체 섬광을 막는다.
      this.firstFrameRendered = true
      this.shell.dataset.modelStatus = 'ready-3d'
    }
  }

  isReadyForOutput() {
    if (this.shell.dataset.modelStatus === 'fallback-2d') return true
    return this.firstFrameRendered
      && this.renderer.domElement.width > 0
      && this.renderer.domElement.height > 0
      && !this.renderer.getContext().isContextLost()
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
    // 풀에서 꺼낸 모델은 첫 프레임이 검증된 인스턴스만 다시 활성화한다.
    if (mounted.isReadyForOutput()) mounted.setActive(true)
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
  const urls = [...new Set(visuals.flatMap((visual) => visual.model3d ? [visual.model3d] : []))]
  return Promise.all(urls.map((url) => loadModel(url).then(() => undefined).catch(() => undefined)))
    .then(() => undefined)
}

/** 오브젝트 풀에서 꺼내기 전에 화면 출력 준비 여부를 검사한다. */
export function isCharacterModelReady(actor: HTMLElement, visual: CharacterVisualDef): boolean {
  if (!visual.model3d) return true
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (!shell) return false
  return mountedModels.get(shell)?.isReadyForOutput() ?? false
}

export function suspendCharacterModel(actor: HTMLElement) {
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (shell) mountedModels.get(shell)?.setActive(false)
}

export function playCharacterAnimation(actor: HTMLElement | null, animation: BattleAnimation): number {
  if (!actor) return 0
  const shell = actor.querySelector<HTMLElement>('.model-shell')
  if (!shell) return 0
  return mountedModels.get(shell)?.play(animation) ?? 0
}

export function destroyCharacterModels(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.model-shell').forEach((shell) => {
    const model = mountedModels.get(shell)
    model?.destroy()
    mountedModels.delete(shell)
  })
}
