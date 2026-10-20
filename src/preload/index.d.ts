import type { DevDashPreload } from './index'

declare global {
  interface Window {
    devdash: DevDashPreload
  }
}

export {}
