/**
 * 클립의 마디 찾기 — GLB 애니메이션에서 손이 가장 높이 올라간 순간(정점)과
 * 가장 빠르게 내려꽂는 순간(타격)을 실측해 비율로 뽑는다.
 *
 * 강타 연출은 attack 클립을 늘려 정점에서 멈춰 세운다. 그 정점을 눈대중으로
 * 잡으면 모델을 갈아 끼울 때마다 다시 눈대중해야 하므로, 손 본의 월드 궤적에서
 * 직접 잰다. 결과를 data/characters.ts의 attackBeats에 적는다.
 *
 *   npm run clip:beats                     모든 모델의 attack 클립
 *   npm run clip:beats -- player attack    한 모델만
 *
 * 두 번째 인자는 클립 이름(기본 attack), 세 번째는 본 이름(기본 RightHand)이다.
 */

import fs from 'node:fs'
import path from 'node:path'

const MODEL_DIR = path.join('src', 'assets', 'models')

type Vec = number[]
interface Track { times: number[]; values: Vec[] }

const COMPONENT: Record<number, [new (b: ArrayBufferLike, o: number, l: number) => { [i: number]: number }, number]> = {
  5120: [Int8Array, 1],
  5121: [Uint8Array, 1],
  5122: [Int16Array, 2],
  5123: [Uint16Array, 2],
  5125: [Uint32Array, 4],
  5126: [Float32Array, 4],
}
const COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function openGlb(file: string) {
  const buf = fs.readFileSync(file)
  const jsonLength = buf.readUInt32LE(12)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gltf: any = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'))
  const bin = buf.subarray(20 + jsonLength + 8)

  const readAccessor = (index: number): Vec[] => {
    const accessor = gltf.accessors[index]
    const view = gltf.bufferViews[accessor.bufferView]
    const [Type, size] = COMPONENT[accessor.componentType]
    const width = COUNT[accessor.type]
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const stride = view.byteStride ?? size * width
    const rows: Vec[] = []
    for (let e = 0; e < accessor.count; e += 1) {
      const row: number[] = []
      for (let c = 0; c < width; c += 1) {
        const offset = base + e * stride + c * size
        row.push(new Type(bin.buffer, bin.byteOffset + offset, 1)[0])
      }
      rows.push(row)
    }
    return rows
  }
  return { gltf, readAccessor }
}

function sample(track: Track, t: number): Vec {
  const { times, values } = track
  if (t <= times[0]) return values[0]
  if (t >= times[times.length - 1]) return values[values.length - 1]
  let i = 0
  while (i < times.length - 1 && times[i + 1] < t) i += 1
  const f = (t - times[i]) / (times[i + 1] - times[i])
  return values[i].map((v, k) => v + (values[i + 1][k] - v) * f)
}

/** TRS를 열 우선 4×4 행렬로. 회전은 쿼터니언. */
function compose(T: Vec, R: Vec, S: Vec): number[] {
  const [x, y, z, w] = R
  const x2 = x + x, y2 = y + y, z2 = z + z
  const xx = x * x2, xy = x * y2, xz = x * z2
  const yy = y * y2, yz = y * z2, zz = z * z2
  const wx = w * x2, wy = w * y2, wz = w * z2
  const [sx, sy, sz] = S
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    T[0], T[1], T[2], 1,
  ]
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array<number>(16).fill(0)
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0
      for (let k = 0; k < 4; k += 1) s += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = s
    }
  }
  return out
}

function beatsOf(file: string, clipName: string, boneName: string) {
  const { gltf, readAccessor } = openGlb(file)
  const anim = gltf.animations?.find((a: { name: string }) => a.name.includes(`|${clipName}|`))
  if (!anim) return `${clipName} 클립이 없다`

  const tracks = new Map<number, Record<string, Track>>()
  let start = Infinity
  let end = -Infinity
  for (const channel of anim.channels) {
    const sampler = anim.samplers[channel.sampler]
    const times = readAccessor(sampler.input).map((row) => row[0])
    const values = readAccessor(sampler.output)
    start = Math.min(start, times[0])
    end = Math.max(end, times[times.length - 1])
    const node = channel.target.node
    if (!tracks.has(node)) tracks.set(node, {})
    tracks.get(node)![channel.target.path] = { times, values }
  }

  const parentOf = new Map<number, number>()
  gltf.nodes.forEach((node: { children?: number[] }, i: number) =>
    (node.children ?? []).forEach((child) => parentOf.set(child, i)))
  const bone = gltf.nodes.findIndex((node: { name?: string }) => node.name === boneName)
  if (bone < 0) return `${boneName} 본이 없다`

  const local = (nodeIndex: number, t: number) => {
    const node = gltf.nodes[nodeIndex]
    const track = tracks.get(nodeIndex) ?? {}
    return compose(
      track.translation ? sample(track.translation, t) : (node.translation ?? [0, 0, 0]),
      track.rotation ? sample(track.rotation, t) : (node.rotation ?? [0, 0, 0, 1]),
      track.scale ? sample(track.scale, t) : (node.scale ?? [1, 1, 1]),
    )
  }
  const worldY = (t: number) => {
    let m = local(bone, t)
    let parent = parentOf.get(bone)
    while (parent !== undefined) {
      m = multiply(local(parent, t), m)
      parent = parentOf.get(parent)
    }
    return m[13]
  }

  // normalizedClip이 클립 앞의 빈 구간을 잘라내므로 여기서도 시작점을 0으로 본다.
  const step = 1 / 60
  const rows: { at: number; y: number; vy: number }[] = []
  let previous = worldY(start)
  for (let t = start; t <= end + 1e-6; t += step) {
    const y = worldY(t)
    rows.push({ at: (t - start) / (end - start), y, vy: (y - previous) / step })
    previous = y
  }

  const raise = rows.reduce((a, b) => (b.y > a.y ? b : a))
  // 타격은 반드시 정점 **뒤**에 온다. 전체에서 최댓값을 찾으면 클립에 따라
  // 정점보다 앞선 순간이 잡혀서, 들어올리기도 전에 때리는 값이 나온다.
  const afterRaise = rows.filter((row) => row.at > raise.at)
  const impact = (afterRaise.length ? afterRaise : rows).reduce((a, b) => (b.vy < a.vy ? b : a))
  const durationMs = Math.round((end - start) * 1000)
  return `길이 ${durationMs}ms · 정점 ${raise.at.toFixed(2)}(${Math.round(raise.at * durationMs)}ms)`
    + ` · 타격 ${impact.at.toFixed(2)}(${Math.round(impact.at * durationMs)}ms)`
    + `  →  attackBeats: { raise: ${raise.at.toFixed(2)}, impact: ${impact.at.toFixed(2)} }`
}

const [only, clip = 'attack', bone = 'RightHand'] = process.argv.slice(2)
const files = fs.readdirSync(MODEL_DIR)
  .filter((name) => name.endsWith('.glb'))
  .filter((name) => !only || name.includes(only))

if (files.length === 0) {
  console.error(`${MODEL_DIR}에서 ${only ?? '*'}.glb를 찾지 못했다`)
  process.exit(1)
}
for (const name of files) {
  console.log(`${name.padEnd(22)} ${beatsOf(path.join(MODEL_DIR, name), clip, bone)}`)
}
