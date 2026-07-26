type FoilKind = 'epic' | 'legendary'

interface FoilSurface {
  host: HTMLElement
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  kind: FoilKind
  pointerX: number
  pointerY: number
  hovering: boolean
  hoverPulse: number
}

const VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_uv;

  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

// 두 등급은 같은 광택을 색만 바꿔 쓰지 않는다. 영웅은 다층 무지개 별빛,
// 전설은 서로 다른 법선을 가진 프리즘 셸과 셸 사이의 분광을 그린다.
const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_kind;
  uniform float u_aspect;
  uniform float u_hover;
  uniform vec2 u_pointer;

  const float TAU = 6.28318530718;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    vec2 curve = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
  }

  vec3 spectrum(float phase) {
    vec3 wave = 0.5 + 0.5 * cos(TAU * (phase + vec3(0.00, 0.67, 0.33)));
    return pow(wave, vec3(1.18));
  }

  vec3 voronoi(vec2 p) {
    vec2 base = floor(p);
    vec2 local = fract(p);
    float nearest = 8.0;
    float second = 8.0;
    float cellId = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 seed = vec2(hash21(base + offset), hash21(base + offset + 17.17));
        vec2 delta = offset + 0.18 + seed * 0.64 - local;
        float distanceToSeed = dot(delta, delta);
        if (distanceToSeed < nearest) {
          second = nearest;
          nearest = distanceToSeed;
          cellId = hash21(base + offset + 31.73);
        } else if (distanceToSeed < second) {
          second = distanceToSeed;
        }
      }
    }
    return vec3(nearest, second, cellId);
  }

  vec3 stainedGlassColor(float seed) {
    float colorIndex = floor(fract(seed) * 8.0);
    if (colorIndex < 1.0) return vec3(0.10, 0.86, 0.78); // 청록
    if (colorIndex < 2.0) return vec3(0.18, 0.62, 1.00); // 파랑
    if (colorIndex < 3.0) return vec3(0.48, 0.32, 0.98); // 보라
    if (colorIndex < 4.0) return vec3(0.94, 0.25, 0.72); // 자홍
    if (colorIndex < 5.0) return vec3(1.00, 0.38, 0.30); // 산호
    if (colorIndex < 6.0) return vec3(1.00, 0.78, 0.18); // 금색
    if (colorIndex < 7.0) return vec3(0.48, 0.92, 0.24); // 연두
    return vec3(0.18, 0.82, 0.96); // 하늘
  }

  vec4 epicFoil(vec2 p) {
    // 희귀의 사선 은빛과 겹치지 않도록 방향성 띠를 쓰지 않는다. 저주파
    // 오로라는 바탕색만 살리고, 영웅의 주인공은 독립적으로 점멸하는 별빛이다.
    float paper = valueNoise(p * 3.4 + vec2(u_time * 0.014, -u_time * 0.011));
    float auroraPhase = paper * 0.72 + length(p + u_pointer * 0.05) * 0.38 + u_time * 0.018;
    vec3 aurora = spectrum(auroraPhase);

    vec2 fineGrid = (p + 0.72) * vec2(18.0, 24.0);
    vec2 fineCell = floor(fineGrid);
    vec2 fineSeed2 = vec2(hash21(fineCell + 4.7), hash21(fineCell + 19.3));
    float fineSeed = hash21(fineCell + 37.1);
    vec2 finePoint = fract(fineGrid) - (0.18 + fineSeed2 * 0.64);
    float fineRadius = length(finePoint);
    float fineRays = smoothstep(0.084, 0.0, min(abs(finePoint.x), abs(finePoint.y)))
      * smoothstep(0.52, 0.04, fineRadius);
    float fineCore = smoothstep(0.21, 0.0, fineRadius);
    float fineWave = max(0.0, sin(u_time * (1.05 + fineSeed * 0.72) + fineSeed * 47.0));
    float finePulse = mix(pow(fineWave, 10.0), pow(fineWave, 2.2), u_hover * 0.72);
    float fineStar = (fineCore + fineRays * 0.78) * step(0.70, fineSeed) * finePulse;

    vec2 heroGrid = (p + 0.68) * vec2(8.0, 11.0);
    vec2 heroCell = floor(heroGrid);
    vec2 heroSeed2 = vec2(hash21(heroCell + 73.2), hash21(heroCell + 11.9));
    float heroSeed = hash21(heroCell + 91.4);
    vec2 heroPoint = fract(heroGrid) - (0.20 + heroSeed2 * 0.60);
    float heroRadius = length(heroPoint);
    float heroRays = smoothstep(0.064, 0.0, min(abs(heroPoint.x), abs(heroPoint.y)))
      * smoothstep(0.58, 0.06, heroRadius);
    float heroCore = smoothstep(0.184, 0.0, heroRadius);
    float heroWave = max(0.0, sin(u_time * (0.72 + heroSeed * 0.44) + heroSeed * 53.0));
    float heroPulse = mix(pow(heroWave, 16.0), pow(heroWave, 2.8), u_hover * 0.76);
    float heroStar = (heroCore * 1.25 + heroRays) * step(0.56, heroSeed) * heroPulse;

    vec3 fineColor = spectrum(fineSeed + u_time * 0.022);
    vec3 heroColor = mix(spectrum(heroSeed + u_time * 0.018), vec3(1.0), 0.28);
    vec2 pointerP = vec2(u_pointer.x * 0.5 * u_aspect, -u_pointer.y * 0.5);
    float hoverRadius = (1.0 - u_hover) * 0.78;
    float hoverRing = exp(-pow((length(p - pointerP) - hoverRadius) * 17.0, 2.0)) * u_hover;
    vec3 color = aurora * (0.12 + paper * 0.10);
    color += fineColor * fineStar * (0.72 + u_hover * 0.24);
    color += heroColor * heroStar * (1.05 + u_hover * 0.34);
    color += vec3(0.82, 0.93, 1.0) * (fineStar + heroStar) * 0.20;
    color += spectrum(auroraPhase + hoverRadius) * hoverRing * 0.72;
    float alpha = 0.15 + paper * 0.08 + fineStar * 0.56 + heroStar * 0.72 + hoverRing * 0.34;
    return vec4(color, alpha);
  }

  vec4 legendaryFoil(vec2 p) {
    float turn = u_pointer.x * 0.13 + sin(u_time * 0.19) * 0.035;
    mat2 rotation = mat2(cos(turn), -sin(turn), sin(turn), cos(turn));
    vec2 prismP = rotation * p;
    // 단일 보로노이 레이어만 사용한다. 색·반사·호버 점등은 모두 이 각진
    // 셸 ID를 공유해 별도의 소용돌이 파단 무늬가 겹쳐 보이지 않게 한다.
    vec3 cells = voronoi(prismP * vec2(3.15, 4.25) + vec2(0.31, -0.18));
    float shellGap = cells.y - cells.x;
    float shellEdge = 1.0 - smoothstep(0.012, 0.078, shellGap);
    float edge = shellEdge;
    float shellId = cells.z;
    float facetAngle = shellId * TAU + u_time * 0.11;
    vec2 facetNormal = vec2(cos(facetAngle), sin(facetAngle));
    vec2 light = normalize(vec2(0.72 + u_pointer.x * 0.46, -0.52 - u_pointer.y * 0.28));
    float facetLight = 0.5 + 0.5 * dot(facetNormal, light);
    facetLight = 0.18 + 0.82 * facetLight * facetLight;

    // 조각마다 반짝임 주기와 위상이 달라 한꺼번에 밝아지는 플라스틱 막처럼
    // 보이지 않게 한다. sin 기반이라 루프 접합이나 왕복 끝점의 끊김은 없다.
    float shellPulse = sin(u_time * (0.72 + shellId * 0.42) + shellId * 41.0);
    float shellSparkle = pow(max(0.0, shellPulse), 12.0);
    facetLight += shellSparkle * (0.66 + u_hover * 0.34);

    // 셀 하나에는 팔레트 색 하나만 들어간다. 셀 내부 좌표를 hue에 섞지 않아
    // 무지개 등고선이 생기지 않고 스테인드글라스 조각처럼 읽힌다.
    vec3 facetColor = stainedGlassColor(shellId);
    vec3 edgeColor = mix(facetColor, vec3(0.92, 0.98, 1.0), 0.62);

    float beamAxis = dot(prismP, normalize(vec2(0.9, 0.42)));
    float beamCenter = sin(u_time * 0.27) * 0.78;
    float beam = exp(-pow((beamAxis - beamCenter) * 5.6, 2.0));
    vec3 beamColor = mix(facetColor, vec3(1.0, 0.97, 0.86), 0.58);

    // 호버 진입 펄스가 1→0으로 내려갈 때 셀마다 서로 다른 임계점을 지난다.
    // 공간 파동 없이 각 조각이 한 번씩 다른 순서와 보색으로 번쩍인다.
    float cellFlashPoint = 0.24 + shellId * 0.68;
    float cellFlash = exp(-pow((u_hover - cellFlashPoint) * 11.0, 2.0))
      * smoothstep(0.18, 0.28, u_hover);
    vec3 flashColor = stainedGlassColor(fract(shellId + 0.37));

    vec3 color = facetColor * facetLight * 0.42;
    color += edgeColor * edge * (0.44 + facetLight * 0.38);
    color += beamColor * beam * (0.38 + u_hover * 0.22);
    color += vec3(0.78, 0.96, 1.0) * shellEdge * shellEdge * 0.22;
    color += vec3(1.0, 0.98, 0.88) * shellSparkle * 0.52;
    color += mix(flashColor, vec3(1.0), 0.34) * cellFlash * (0.72 + edge * 0.28);
    float alpha = 0.30 + facetLight * 0.19 + edge * 0.27 + beam * 0.22 + shellSparkle * 0.18 + cellFlash * 0.30;
    return vec4(color, alpha);
  }

  void main() {
    vec2 p = v_uv - 0.5;
    p.x *= u_aspect;
    vec4 foil = u_kind < 0.5 ? epicFoil(p) : legendaryFoil(p);
    float roundedFade = smoothstep(0.72, 0.38, length(p * vec2(0.72, 0.50)));
    foil.a *= mix(0.84, 1.0, roundedFade);
    gl_FragColor = vec4(foil.rgb * foil.a, foil.a);
  }
`

class FoilShaderRenderer {
  private readonly source = document.createElement('canvas')
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly uniforms: {
    time: WebGLUniformLocation | null
    kind: WebGLUniformLocation | null
    aspect: WebGLUniformLocation | null
    hover: WebGLUniformLocation | null
    pointer: WebGLUniformLocation | null
  }
  private readonly surfaces = new Map<HTMLElement, FoilSurface>()
  private readonly observer: MutationObserver
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  private pointerClientX = -10000
  private pointerClientY = -10000
  private scanQueued = true
  private lastFrame = 0

  constructor() {
    this.source.width = 384
    this.source.height = 512
    const gl = this.source.getContext('webgl', {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('WebGL을 사용할 수 없습니다.')
    this.gl = gl
    this.program = this.makeProgram()
    this.uniforms = {
      time: gl.getUniformLocation(this.program, 'u_time'),
      kind: gl.getUniformLocation(this.program, 'u_kind'),
      aspect: gl.getUniformLocation(this.program, 'u_aspect'),
      hover: gl.getUniformLocation(this.program, 'u_hover'),
      pointer: gl.getUniformLocation(this.program, 'u_pointer'),
    }
    this.prepareGeometry()

    this.observer = new MutationObserver(() => { this.scanQueued = true })
    // 카드의 등급 클래스는 DOM에 붙기 전에 완성된다. 문서 전체의 class 변경까지
    // 감시하면 전투 애니메이션 클래스가 바뀔 때마다 전체 포일 노드를 다시 훑게 된다.
    this.observer.observe(document.documentElement, { childList: true, subtree: true })
    document.addEventListener('pointermove', this.onPointerMove, { passive: true })
    document.documentElement.classList.add('foil-shader-ready')
    requestAnimationFrame(this.frame)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    this.pointerClientX = event.clientX
    this.pointerClientY = event.clientY
  }

  private readonly frame = (now: number) => {
    requestAnimationFrame(this.frame)
    if (document.hidden) return
    const reduced = this.reducedMotion.matches
    // 고급 모드의 호일은 대기 중에도 60fps로 갱신한다. 영웅의 별빛과 전설의
    // 프리즘 조각은 정지 상태에서도 계속 흐르는 것이 등급 판별의 핵심이다.
    const interval = reduced ? 500 : 1000 / 60
    if (now - this.lastFrame < interval) return
    this.lastFrame = now
    if (this.scanQueued) this.scan()

    const lowQuality = document.documentElement.dataset.graphics === 'low'
    const time = reduced ? 2.75 : now / 1000
    for (const [host, surface] of this.surfaces) {
      if (!host.isConnected) {
        // 캔버스도 함께 걷어 낸다. 손패 카드는 DOM 노드를 풀에 넣었다가 그대로 다시
        // 붙이므로, 여기서 캔버스를 남겨 두면 다시 붙을 때 scan이 두 번째 캔버스를
        // 덧붙인다. .card-foil이 overflow:hidden이라 먼저 붙은 **멈춘** 캔버스가
        // 자리를 차지하고 새로 그리는 캔버스는 그 아래로 밀려 잘린다 — 포일이
        // 얼어붙은 것처럼 보이던 원인이다.
        surface.canvas.remove()
        this.surfaces.delete(host)
        continue
      }
      surface.canvas.hidden = lowQuality
      if (lowQuality) continue
      const card = host.closest<HTMLElement>('.word-card, .reward-pick, .deck-hover-card')
      const rect = host.getBoundingClientRect()
      if (!card || rect.width < 2 || rect.height < 2) continue

      // 사용 고스트는 포인터를 떠나 중앙으로 이동하므로 실제 :hover가 풀린다.
      // 이동·폭발 중에는 강제 호버로 취급해 등급별 반짝임을 끝까지 이어 간다.
      const forcedHover = card.classList.contains('commit-ghost')
      const hovering = forcedHover || card.matches(':hover')
      if (hovering && !surface.hovering) surface.hoverPulse = 1
      surface.hovering = hovering
      // 전설 셀 점등은 영웅 파동보다 2배 길게 보여 각 조각의 색 변화를 읽게 한다.
      // 기존 지수 감쇠율의 제곱근을 쓰면 같은 변화량에 필요한 프레임 수가 2배가 된다.
      const hoverDecay = surface.kind === 'legendary'
        ? (reduced ? 0.5 : Math.sqrt(0.91))
        : (reduced ? 0.25 : 0.91)
      surface.hoverPulse *= hoverDecay
      const autoX = Math.sin(time * 0.43 + rect.left * 0.002) * 0.34
      const autoY = Math.cos(time * 0.37 + rect.top * 0.002) * 0.28
      const targetX = forcedHover ? 0 : hovering ? Math.max(-1, Math.min(1, ((this.pointerClientX - rect.left) / rect.width - 0.5) * 2)) : autoX
      const targetY = forcedHover ? 0 : hovering ? Math.max(-1, Math.min(1, ((this.pointerClientY - rect.top) / rect.height - 0.5) * 2)) : autoY
      surface.pointerX += (targetX - surface.pointerX) * (reduced ? 1 : 0.09)
      surface.pointerY += (targetY - surface.pointerY) * (reduced ? 1 : 0.09)
      this.draw(surface, time, rect.width / rect.height, Math.max(hovering ? 0.16 : 0, surface.hoverPulse))
    }
  }

  private scan() {
    this.scanQueued = false
    const selector = [
      '.word-card.rarity-epic .card-foil',
      '.deck-hover-card.rarity-epic .card-foil',
      '.reward-pick.rarity-epic .rp-foil',
      '.word-card.rarity-legendary .card-foil',
      '.deck-hover-card.rarity-legendary .card-foil',
      '.reward-pick.rarity-legendary .rp-foil',
    ].join(',')
    document.querySelectorAll<HTMLElement>(selector).forEach((host) => {
      const kind: FoilKind = host.closest('.rarity-legendary') ? 'legendary' : 'epic'
      const existing = this.surfaces.get(host)
      if (existing) {
        existing.kind = kind
        return
      }
      // 이미 붙어 있던 캔버스가 있으면 그걸 되쓴다. 한 host에 캔버스가 둘이 되면
      // overflow:hidden 안에서 뒤엣것이 잘려 나가 그림이 멈춘 것처럼 보인다.
      host.querySelectorAll('.foil-shader-canvas').forEach((stale) => stale.remove())
      const canvas = document.createElement('canvas')
      canvas.className = 'foil-shader-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      const context = canvas.getContext('2d', { alpha: true })
      if (!context) return
      host.append(canvas)
      this.surfaces.set(host, { host, canvas, context, kind, pointerX: 0, pointerY: 0, hovering: false, hoverPulse: 0 })
    })
  }

  private draw(surface: FoilSurface, time: number, aspect: number, hover: number) {
    const { gl, program } = this
    gl.viewport(0, 0, this.source.width, this.source.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform1f(this.uniforms.time, time)
    gl.uniform1f(this.uniforms.kind, surface.kind === 'epic' ? 0 : 1)
    gl.uniform1f(this.uniforms.aspect, aspect)
    gl.uniform1f(this.uniforms.hover, hover)
    gl.uniform2f(this.uniforms.pointer, surface.pointerX, surface.pointerY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    const cssWidth = Math.max(1, Math.round(surface.host.clientWidth))
    const cssHeight = Math.max(1, Math.round(surface.host.clientHeight))
    const scale = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(cssWidth * scale)
    const height = Math.round(cssHeight * scale)
    if (surface.canvas.width !== width || surface.canvas.height !== height) {
      surface.canvas.width = width
      surface.canvas.height = height
    }
    surface.context.clearRect(0, 0, width, height)
    surface.context.drawImage(this.source, 0, 0, width, height)
  }

  private makeProgram(): WebGLProgram {
    const vertex = this.compile(this.gl.VERTEX_SHADER, VERTEX_SHADER)
    const fragment = this.compile(this.gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = this.gl.createProgram()
    if (!program) throw new Error('포일 셰이더 프로그램을 만들 수 없습니다.')
    this.gl.attachShader(program, vertex)
    this.gl.attachShader(program, fragment)
    this.gl.linkProgram(program)
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(program) ?? '포일 셰이더 링크 실패')
    }
    return program
  }

  private compile(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)
    if (!shader) throw new Error('포일 셰이더를 만들 수 없습니다.')
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(shader) ?? '포일 셰이더 컴파일 실패')
    }
    return shader
  }

  private prepareGeometry() {
    const buffer = this.gl.createBuffer()
    if (!buffer) throw new Error('포일 셰이더 버퍼를 만들 수 없습니다.')
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), this.gl.STATIC_DRAW)
    const position = this.gl.getAttribLocation(this.program, 'a_position')
    this.gl.enableVertexAttribArray(position)
    this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0)
  }
}

/** WebGL이 막힌 환경에서는 기존 CSS 포일을 그대로 폴백으로 남긴다. */
export function installFoilShaders(): void {
  try {
    new FoilShaderRenderer()
  } catch (error) {
    console.warn('[foil] WebGL 포일을 시작하지 못해 CSS 포일을 사용합니다.', error)
  }
}
