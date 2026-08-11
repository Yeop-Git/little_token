import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const distArg = process.argv.find((argument) => argument.startsWith('--dist='))?.slice('--dist='.length) ?? 'dist'
const dist = resolve(root, distArg)

if (!existsSync(dist) || !statSync(dist).isDirectory()) {
  throw new Error(`${relative(root, dist)} 폴더가 없습니다. 먼저 npm run build를 실행하세요.`)
}

const rootIndex = resolve(dist, 'index.html')
if (!existsSync(rootIndex)) {
  throw new Error(`${relative(root, dist)} 최상위에 index.html이 없습니다.`)
}

const files: string[] = []
const walk = (directory: string) => {
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry)
    if (statSync(path).isDirectory()) walk(path)
    else files.push(path)
  }
}
walk(dist)

const forbiddenCompressed = files.filter((path) => ['.br', '.gz'].includes(extname(path).toLowerCase()))
if (forbiddenCompressed.length > 0) {
  throw new Error(`서버 측 해제가 필요한 사전 압축 파일이 있습니다: ${forbiddenCompressed.map((path) => relative(dist, path)).join(', ')}`)
}

const nestedIndexes = files.filter((path) => path !== rootIndex && path.toLowerCase().endsWith('index.html'))
if (nestedIndexes.length > 0) {
  throw new Error(`중첩된 빌드 폴더로 오인할 수 있는 index.html이 있습니다: ${nestedIndexes.map((path) => relative(dist, path)).join(', ')}`)
}

const html = readFileSync(rootIndex, 'utf8')
if (!/<script\b[^>]*\bsrc=["'][^"']+["']/i.test(html)) {
  throw new Error('index.html에서 실행 스크립트를 찾지 못했습니다.')
}

console.log(`웹 납품 구조 검사 통과 — ${relative(root, dist)}/index.html · 사전 Brotli/Gzip 없음 · 파일 ${files.length}개`)
