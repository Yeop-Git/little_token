import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const dist = resolve('dist')
const limits: Record<string, { raw: number; gzip: number }> = {
  '.js': { raw: 700 * 1024, gzip: 190 * 1024 },
  '.css': { raw: 260 * 1024, gzip: 60 * 1024 },
}

const files: string[] = []
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (limits[extname(path)]) files.push(path)
  }
}
walk(dist)

const violations: string[] = []
let largestJs = { name: '', raw: 0, gzip: 0 }
for (const path of files) {
  const data = readFileSync(path)
  const gzip = gzipSync(data).byteLength
  const raw = data.byteLength
  const ext = extname(path)
  const limit = limits[ext]
  const name = relative(dist, path).replaceAll('\\', '/')
  if (ext === '.js' && gzip > largestJs.gzip) largestJs = { name, raw, gzip }
  if (raw > limit.raw) violations.push(`${name}: 원본 ${(raw / 1024).toFixed(1)}KB > ${limit.raw / 1024}KB`)
  if (gzip > limit.gzip) violations.push(`${name}: gzip ${(gzip / 1024).toFixed(1)}KB > ${limit.gzip / 1024}KB`)
}

if (violations.length) {
  console.error(`번들 예산 위반 ${violations.length}건:\n- ${violations.join('\n- ')}`)
  process.exit(1)
}
console.log(
  `번들 예산 통과 — 최대 JS ${largestJs.name} · 원본 ${(largestJs.raw / 1024).toFixed(1)}KB · gzip ${(largestJs.gzip / 1024).toFixed(1)}KB`,
)
