import { app, BrowserWindow, shell, protocol, ipcMain, nativeImage } from 'electron'
import { join } from 'node:path'
import { registerIpc, registerPluginProtocol } from './ipc'
import { pluginRegistry } from './plugin/registry'
import { setupAgent } from './agent/setup'

const ICONS_DIR = join(app.getAppPath(), 'assets/icons')
const APP_ICON = join(ICONS_DIR, 'icon.png')

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
    icon: APP_ICON,
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
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(APP_ICON))
    } catch {
      /* icon optional at dev time */
    }
  }
  registerPluginProtocol()
  registerWindowControls()
  registerIpc()
  setupAgent()
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
