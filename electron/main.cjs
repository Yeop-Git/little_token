'use strict'

const { app, BrowserWindow, net, protocol } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

// A standard secure origin keeps Vite's root-relative URLs and browser fetch working offline.
protocol.registerSchemesAsPrivileged([{
  scheme: 'little-token',
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}])

const GAME_URL = 'little-token://game/'
const WEB_ROOT = path.join(__dirname, 'web')
let mainWindow

function resolveAsset(requestUrl) {
  const url = new URL(requestUrl)
  if (url.hostname !== 'game') return null
  let pathname
  try { pathname = decodeURIComponent(url.pathname) } catch { return null }
  if (pathname.includes('\\') || pathname.includes('\0')) return null
  const target = path.resolve(WEB_ROOT, `.${pathname === '/' ? '/index.html' : pathname}`)
  const relative = path.relative(WEB_ROOT, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return target
}

app.whenReady().then(async () => {
  protocol.handle('little-token', (request) => {
    const target = resolveAsset(request.url)
    return target ? net.fetch(pathToFileURL(target).toString()) : new Response('Not found', { status: 404 })
  })

  mainWindow = new BrowserWindow({
    title: 'Little Token - G-STAR',
    icon: path.join(__dirname, 'icon.ico'),
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#141019',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(GAME_URL)) event.preventDefault()
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  await mainWindow.loadURL(GAME_URL)
}).catch((error) => {
  console.error(error)
  app.exit(1)
})

app.on('window-all-closed', () => app.quit())
