import { existsSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import ts from 'typescript'
import { ENEMIES } from '../src/data/enemies.js'

const GLB_MAGIC = 0x46546c67
const GLB_JSON = 0x4e4f534a
const root = resolve(import.meta.dirname, '..')
const characterSourcePath = resolve(root, 'src/data/characters.ts')
const source = ts.createSourceFile(
  characterSourcePath,
  readFileSync(characterSourcePath, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)
const failures: string[] = []

const parseSource = (path: string) => ts.createSourceFile(
  path,
  readFileSync(path, 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
)

const unwrapObject = (expression: ts.Expression | undefined): ts.ObjectLiteralExpression | null => {
  if (!expression) return null
  if (ts.isObjectLiteralExpression(expression)) return expression
  if (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression) || ts.isParenthesizedExpression(expression)) {
    return unwrapObject(expression.expression)
  }
  return null
}

const findObjectDeclaration = (tree: ts.SourceFile, name: string) => {
  let found: ts.ObjectLiteralExpression | null = null
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = unwrapObject(node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

const propertyName = (node: ts.PropertyName) => {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text
  return null
}

const property = (object: ts.ObjectLiteralExpression, name: string) => object.properties.find(
  (candidate): candidate is ts.PropertyAssignment => ts.isPropertyAssignment(candidate) && propertyName(candidate.name) === name,
)

const objectValue = (entry: ts.ObjectLiteralExpression, name: string, label: string) => {
  const value = property(entry, name)?.initializer
  if (!value || !ts.isObjectLiteralExpression(value)) {
    failures.push(`${label}.${name}: 객체 선언이 필요합니다.`)
    return null
  }
  return value
}

const stringValue = (entry: ts.ObjectLiteralExpression, name: string) => {
  const value = property(entry, name)?.initializer
  return value && ts.isStringLiteral(value) ? value.text : null
}

const memberKey = (entry: ts.ObjectLiteralExpression, name: string, owner: string) => {
  const value = property(entry, name)?.initializer
  if (!value || !ts.isPropertyAccessExpression(value) || !ts.isIdentifier(value.expression) || value.expression.text !== owner) return null
  return value.name.text
}

const manifest = findObjectDeclaration(source, 'CHARACTER_VISUALS')
if (!manifest) throw new Error('CHARACTER_VISUALS 객체를 찾을 수 없습니다.')

const assetSource = parseSource(resolve(root, 'src/assets/index.ts'))
const lateAssetSource = parseSource(resolve(root, 'src/assets/late.ts'))
const modelManifest = findObjectDeclaration(assetSource, 'MODELS')
const spriteManifest = findObjectDeclaration(assetSource, 'SPRITES')
const lateAssets = findObjectDeclaration(lateAssetSource, 'LATE_ASSETS')
if (!modelManifest || !spriteManifest || !lateAssets) throw new Error('MODELS, SPRITES 또는 LATE_ASSETS 선언을 찾을 수 없습니다.')

const declaredKeys = (object: ts.ObjectLiteralExpression) => new Set(object.properties.flatMap((candidate) => {
  if (!ts.isPropertyAssignment(candidate)) return []
  const name = propertyName(candidate.name)
  return name ? [name] : []
}))
const lateModels = objectValue(lateAssets, 'models', 'LATE_ASSETS')
const lateSprites = objectValue(lateAssets, 'sprites', 'LATE_ASSETS')
const modelManifestKeys = declaredKeys(modelManifest)
const spriteManifestKeys = declaredKeys(spriteManifest)
for (const key of lateModels ? declaredKeys(lateModels) : []) modelManifestKeys.add(key)
for (const key of lateSprites ? declaredKeys(lateSprites) : []) spriteManifestKeys.add(key)

interface GlbJson {
  animations?: Array<{ name?: string }>
}

const animationNames = (path: string) => {
  const file = readFileSync(path)
  if (file.length < 20 || file.readUInt32LE(0) !== GLB_MAGIC || file.readUInt32LE(4) !== 2) {
    failures.push(`${basename(path)}: GLB 2.0 파일이 아닙니다.`)
    return new Set<string>()
  }
  let offset = 12
  while (offset + 8 <= file.length) {
    const length = file.readUInt32LE(offset)
    const type = file.readUInt32LE(offset + 4)
    if (offset + 8 + length > file.length) break
    if (type === GLB_JSON) {
      const json = JSON.parse(file.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/[\0\s]+$/, '')) as GlbJson
      return new Set((json.animations ?? []).map((animation) => animation.name).filter((name): name is string => Boolean(name)))
    }
    offset += 8 + length
  }
  failures.push(`${basename(path)}: JSON 청크가 없습니다.`)
  return new Set<string>()
}

const tokenPortraitFiles: Record<string, string> = {
  neutral: 'token_001.webp',
  alert: 'token_002.webp',
  angry: 'token_003.webp',
  relieved: 'token_004.webp',
  party: 'token_005.webp',
  gloom: 'token_006.webp',
}

const portraitPath = (entry: ts.ObjectLiteralExpression) => {
  const sprite = memberKey(entry, 'portrait2d', 'SPRITES')
  if (sprite) return { key: sprite, path: resolve(root, `src/assets/sprites/${sprite}.webp`) }
  const tokenFace = memberKey(entry, 'portrait2d', 'TOKEN_FACES')
  if (tokenFace && tokenPortraitFiles[tokenFace]) {
    return { key: `token/${tokenFace}`, path: resolve(root, `src/assets/sprites/token/${tokenPortraitFiles[tokenFace]}`) }
  }
  return null
}

const clipFields = [
  'idle', 'appear', 'idle2', 'attack', 'walk', 'attack2', 'attack3', 'heal', 'shield',
  'victory1', 'victory2', 'defeat',
] as const
const requiredEnemyClips = ['idle', 'attack', 'defeat'] as const
const visualIds = new Set<string>()
const spriteToVisual = new Map<string, string>()
const modelOwners = new Map<string, string>()
const portraitOwners = new Map<string, string>()
let modelCount = 0
let clipCount = 0

for (const candidate of manifest.properties) {
  if (!ts.isPropertyAssignment(candidate) || !ts.isObjectLiteralExpression(candidate.initializer)) continue
  const visualId = propertyName(candidate.name)
  if (!visualId) continue
  const entry = candidate.initializer
  visualIds.add(visualId)

  if (stringValue(entry, 'id') !== visualId) failures.push(`${visualId}: 객체 키와 id가 다릅니다.`)

  const portrait = portraitPath(entry)
  if (!portrait) failures.push(`${visualId}: SPRITES 또는 TOKEN_FACES의 2D 초상을 선언해야 합니다.`)
  else {
    if (!existsSync(portrait.path)) failures.push(`${visualId}: 2D 초상 파일 없음 (${portrait.path})`)
    const previousPortraitOwner = portraitOwners.get(portrait.key)
    if (previousPortraitOwner) failures.push(`${visualId}: 2D 초상 '${portrait.key}'를 ${previousPortraitOwner}와 중복 사용합니다.`)
    portraitOwners.set(portrait.key, visualId)
    if (!portrait.key.startsWith('token/') && !spriteManifestKeys.has(portrait.key)) {
      failures.push(`${visualId}: SPRITES에 '${portrait.key}'가 등록되지 않았습니다.`)
    }
    if (portrait.key.startsWith('enemy_') || portrait.key.startsWith('boss_')) spriteToVisual.set(portrait.key, visualId)
  }

  const modelKey = memberKey(entry, 'model3d', 'MODELS')
  const modelValue = property(entry, 'model3d')?.initializer
  if (!modelKey) {
    if (!modelValue || modelValue.kind !== ts.SyntaxKind.NullKeyword) failures.push(`${visualId}: model3d는 MODELS 키 또는 null이어야 합니다.`)
    if (property(entry, 'animations')?.initializer.kind !== ts.SyntaxKind.NullKeyword) failures.push(`${visualId}: 3D 모델이 없으면 animations도 null이어야 합니다.`)
    continue
  }

  const previousOwner = modelOwners.get(modelKey)
  if (previousOwner) failures.push(`${visualId}: ${modelKey} 모델을 ${previousOwner}와 중복 사용합니다.`)
  modelOwners.set(modelKey, visualId)
  modelCount++
  if (!modelManifestKeys.has(modelKey)) failures.push(`${visualId}: MODELS에 '${modelKey}'가 등록되지 않았습니다.`)

  const modelPath = resolve(root, `src/assets/models/${modelKey}.glb`)
  if (!existsSync(modelPath)) {
    failures.push(`${visualId}: 3D 모델 파일 없음 (${modelPath})`)
    continue
  }
  const clips = animationNames(modelPath)
  const animations = objectValue(entry, 'animations', visualId)
  if (!animations) continue

  const required = visualId === 'player' ? ['idle', 'attack', 'defeat'] : visualId === 'token' ? ['idle', 'attack'] : requiredEnemyClips
  for (const field of required) {
    if (!stringValue(animations, field)) failures.push(`${visualId}.${field}: 필수 애니메이션 선언이 없습니다.`)
  }
  for (const field of clipFields) {
    const clip = stringValue(animations, field)
    if (!clip) continue
    clipCount++
    if (!clips.has(clip)) failures.push(`${visualId}.${field}: ${basename(modelPath)}에 '${clip}' 클립이 없습니다.`)
  }

  if (visualId !== 'player' && visualId !== 'token') {
    if (!property(animations, 'idleLoopBlendMs')) failures.push(`${visualId}: 적 idleLoopBlendMs가 없습니다.`)
    const yaw = property(entry, 'modelYaw')?.initializer
    if (!yaw || !ts.isIdentifier(yaw) || !yaw.text.endsWith('_MODEL_YAW')) failures.push(`${visualId}: 공용 적 방향 상수를 사용해야 합니다.`)
  }

  const companion = property(entry, 'companion')?.initializer
  if (companion && ts.isObjectLiteralExpression(companion)) {
    const companionModelKey = memberKey(companion, 'model3d', 'MODELS')
    const companionClip = stringValue(companion, 'idleAnimation')
    if (!companionModelKey || !companionClip) failures.push(`${visualId}.companion: 모델과 idleAnimation이 필요합니다.`)
    else {
      const companionPath = resolve(root, `src/assets/models/${companionModelKey}.glb`)
      if (!existsSync(companionPath)) failures.push(`${visualId}.companion: 모델 파일 없음 (${companionPath})`)
      else if (!animationNames(companionPath).has(companionClip)) failures.push(`${visualId}.companion: '${companionClip}' 클립이 없습니다.`)
    }
  }
}

for (const enemy of Object.values(ENEMIES)) {
  if (!spriteToVisual.has(enemy.sprite)) failures.push(`${enemy.id}: sprite '${enemy.sprite}'에 대응하는 캐릭터 비주얼이 없습니다.`)
  const summonSprite = enemy.summonPattern?.sprite
  if (summonSprite && !spriteToVisual.has(summonSprite)) failures.push(`${enemy.id}: 소환 sprite '${summonSprite}'에 대응하는 캐릭터 비주얼이 없습니다.`)
}

if (failures.length) {
  console.error(`캐릭터 에셋 계약 위반 ${failures.length}건:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}

console.log(`캐릭터 에셋 계약 통과 — 비주얼 ${visualIds.size}개 · 3D 모델 ${modelCount}개 · 애니메이션 연결 ${clipCount}개 · 2D 초상 전부 대응`)
