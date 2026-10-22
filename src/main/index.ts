import { app, BrowserWindow, shell, protocol, ipcMain, nativeImage, NativeImage } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc, registerPluginProtocol } from './ipc'
import { pluginRegistry } from './plugin/registry'
import { setupAgent } from './agent/setup'
import { seedBundledSkills } from './agent/skillSeed'
import { applyCdpSwitchEarly, activateCdpInfo } from './uiDev/uiDevService'
import { enrichProcessPath } from './pathEnv'

// Must run before any child process (claude CLI / npm / node scripts) is spawned.
enrichProcessPath()

// Prefer unpacked icon (extraResources) so dock/window icon never hits asar
// and the bundle CFBundleIconFile / process icon stay consistent on quit.
function resolveAppIcon(): string {
  const packed = join(process.resourcesPath, 'app-icon', 'icon.png')
  if (existsSync(packed)) return packed
  return join(app.getAppPath(), 'assets/icons/icon.png')
}

const APP_ICON = resolveAppIcon()

function loadAppImage(): NativeImage | null {
  try {
    const img = nativeImage.createFromBuffer(readFileSync(APP_ICON))
    return img.isEmpty() ? null : img
  } catch {
    return null
  }
}

/** Call as early as possible on ready — running dock icon AND the image used at quit. */
function applyAppIcon(): void {
  const img = loadAppImage()
  if (!img) return
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(img)
    } catch {
      /* icon optional at dev time */
    }
  }
}

// CDP port must be switched before ready. Persist discovery info after ready.
const cdpBootstrap = applyCdpSwitchEarly()

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'devdash-plugin',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

function createWindow(): void {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'DevDash',
    icon: loadAppImage() ?? APP_ICON,
    backgroundColor: '#1c1c1e',
    // macOS keeps native traffic lights; Windows/Linux use custom red/yellow/green
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 14, y: 12 },
    vibrancy: isMac ? 'under-window' : undefined,
    visualEffectState: isMac ? 'active' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [
        `--devdash-ipc=${JSON.stringify([
          ...pluginRegistry.declaredIpcChannels(),
          ...pluginRegistry.boundIpcChannels()
        ])}`
      ]
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowControls(): void {
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:is-maximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
}

app.whenReady().then(async () => {
  // Set icon first so quit/teardown never flashes the framework icon.
  applyAppIcon()
  registerPluginProtocol()
  registerWindowControls()
  registerIpc()
  setupAgent()
  await activateCdpInfo(cdpBootstrap)
  // Ship skills with the installer; overwrite userData/skills every launch.
  await seedBundledSkills()
  // Discover + activate plugin mains before the window so preload can allow their IPC.
  await pluginRegistry.discover()
  await pluginRegistry.loadAllMains()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
