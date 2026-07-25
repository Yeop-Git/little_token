import { readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'
import sharp from 'sharp'

const ROOT = resolve(import.meta.dirname, '..')
const ASSET_ROOT = resolve(ROOT, 'src/assets')
const GLB_JSON = 0x4e4f534a
const GLB_BIN = 0x004e4942
const GLB_MAGIC = 0x46546c67
const MAX_MODEL_TEXTURE = 1024
const checkOnly = process.argv.includes('--check')

interface BufferViewDef {
  buffer: number
  byteOffset?: number
  byteLength: number
}

interface ImageDef {
  bufferView?: number
  mimeType?: string
  uri?: string
}

interface GlbJson {
  buffers: { byteLength: number }[]
  bufferViews?: BufferViewDef[]
  images?: ImageDef[]
}

interface ImageProfile {
  width: number
  height: number
  quality: number
}

const failures: string[] = []

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? walk(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

function imageProfile(path: string): ImageProfile {
  const rel = relative(ASSET_ROOT, path).replaceAll('\\', '/')
  if (rel.startsWith('backgrounds/')) {
    return { width: 1920, height: 1080, quality: rel.endsWith('/tt_002.png') ? 90 : 84 }
  }
  if (rel.startsWith('sprites/skills/')) return { width: 512, height: 768, quality: 82 }
  if (rel.startsWith('sprites/token/')) return { width: 900, height: 900, quality: 85 }
  return { width: 720, height: 720, quality: 85 }
}

async function optimizePng(path: string) {
  const rel = relative(ROOT, path)
  if (checkOnly) {
    failures.push(`${rel}: 런타임 PNG는 WebP로 변환해야 합니다.`)
    return
  }

  const profile = imageProfile(path)
  const output = path.slice(0, -extname(path).length) + '.webp'
  const before = (await stat(path)).size
  const encoded = await sharp(path)
    .rotate()
    .resize(profile.width, profile.height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: profile.quality, effort: 6, smartSubsample: true })
    .toBuffer()
  await writeFile(output, encoded)
  try {
    await unlink(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  console.log(`${rel}: ${Math.round(before / 1024)}KB -> ${Math.round(encoded.length / 1024)}KB WebP`)
}

function parseGlb(file: Buffer): { json: GlbJson; binary: Buffer } {
  if (file.length < 20 || file.readUInt32LE(0) !== GLB_MAGIC || file.readUInt32LE(4) !== 2) {
    throw new Error('지원하지 않는 GLB 헤더입니다.')
  }

  let offset = 12
  let json: GlbJson | undefined
  let binary: Buffer | undefined
  while (offset + 8 <= file.length) {
    const length = file.readUInt32LE(offset)
    const type = file.readUInt32LE(offset + 4)
    const data = file.subarray(offset + 8, offset + 8 + length)
    if (type === GLB_JSON) json = JSON.parse(data.toString('utf8').replace(/[\0\s]+$/, '')) as GlbJson
    if (type === GLB_BIN) binary = Buffer.from(data)
    offset += 8 + length
  }
  if (!json || !binary) throw new Error('JSON 또는 BIN 청크가 없는 GLB입니다.')
  return { json, binary }
}

async function resizeModelTexture(data: Buffer, mimeType: string): Promise<Buffer> {
  const pipeline = sharp(data).resize(MAX_MODEL_TEXTURE, MAX_MODEL_TEXTURE, {
    fit: 'inside',
    withoutEnlargement: true,
  })
  if (mimeType === 'image/jpeg') return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer()
  if (mimeType === 'image/webp') return pipeline.webp({ quality: 88, effort: 6 }).toBuffer()
  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

function encodeGlb(json: GlbJson, binary: Buffer): Buffer {
  const jsonRaw = Buffer.from(JSON.stringify(json))
  const jsonPadding = (4 - (jsonRaw.length % 4)) % 4
  const jsonChunk = Buffer.concat([jsonRaw, Buffer.alloc(jsonPadding, 0x20)])
  const binPadding = (4 - (binary.length % 4)) % 4
  const binChunk = Buffer.concat([binary, Buffer.alloc(binPadding)])
  const output = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length)
  output.writeUInt32LE(GLB_MAGIC, 0)
  output.writeUInt32LE(2, 4)
  output.writeUInt32LE(output.length, 8)
  output.writeUInt32LE(jsonChunk.length, 12)
  output.writeUInt32LE(GLB_JSON, 16)
  jsonChunk.copy(output, 20)
  const binHeader = 20 + jsonChunk.length
  output.writeUInt32LE(binChunk.length, binHeader)
  output.writeUInt32LE(GLB_BIN, binHeader + 4)
  binChunk.copy(output, binHeader + 8)
  return output
}

async function optimizeGlb(path: string) {
  const rel = relative(ROOT, path)
  const original = await readFile(path)
  const { json, binary } = parseGlb(original)
  const views = json.bufferViews ?? []
  const replacements = new Map<number, Buffer>()

  for (const image of json.images ?? []) {
    if (image.bufferView == null) {
      if (image.uri && !image.uri.startsWith('data:')) {
        failures.push(`${rel}: 외부 텍스처 ${image.uri}는 GLB에 임베드해 1K 규격으로 관리해야 합니다.`)
      }
      continue
    }
    const view = views[image.bufferView]
    if (!view || view.buffer !== 0) continue
    const start = view.byteOffset ?? 0
    const source = binary.subarray(start, start + view.byteLength)
    const metadata = await sharp(source).metadata()
    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    if (width <= MAX_MODEL_TEXTURE && height <= MAX_MODEL_TEXTURE) continue
    if (checkOnly) {
      failures.push(`${rel}: 임베디드 텍스처 ${width}×${height}는 1K(${MAX_MODEL_TEXTURE}px)를 초과합니다.`)
      continue
    }
    replacements.set(image.bufferView, await resizeModelTexture(source, image.mimeType ?? 'image/png'))
    console.log(`${rel}: GLB 텍스처 ${width}×${height} -> 1K`)
  }

  if (checkOnly || replacements.size === 0) return

  const chunks: Buffer[] = []
  let outputOffset = 0
  const orderedViews = views
    .map((view, index) => ({ view, index, oldOffset: view.byteOffset ?? 0 }))
    .filter(({ view }) => view.buffer === 0)
    .sort((a, b) => a.oldOffset - b.oldOffset)
  for (const { view, index, oldOffset } of orderedViews) {
    const padding = (4 - (outputOffset % 4)) % 4
    if (padding) {
      chunks.push(Buffer.alloc(padding))
      outputOffset += padding
    }
    const data = replacements.get(index) ?? binary.subarray(oldOffset, oldOffset + view.byteLength)
    view.byteOffset = outputOffset
    view.byteLength = data.length
    chunks.push(data)
    outputOffset += data.length
  }
  const packedBinary = Buffer.concat(chunks)
  json.buffers[0].byteLength = packedBinary.length
  const output = encodeGlb(json, packedBinary)
  await writeFile(path, output)
  console.log(`${rel}: ${Math.round(original.length / 1024)}KB -> ${Math.round(output.length / 1024)}KB GLB`)
}

async function main() {
  const files = await walk(ASSET_ROOT)
  for (const path of files.filter((file) => extname(file).toLowerCase() === '.png')) await optimizePng(path)
  for (const path of files.filter((file) => extname(file).toLowerCase() === '.glb')) await optimizeGlb(path)

  if (failures.length) {
    failures.forEach((failure) => console.error(failure))
    process.exitCode = 1
    return
  }
  console.log(checkOnly ? '에셋 규격 검사 통과' : '에셋 최적화 완료')
}

await main()
