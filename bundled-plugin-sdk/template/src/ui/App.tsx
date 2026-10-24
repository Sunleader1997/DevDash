import React, { useState } from 'react'
import { api } from './api'

const styles = `
.dp-wrap { padding: 20px; color: inherit; font: 13px/1.5 -apple-system, 'PingFang SC', sans-serif; }
.dp-title { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
.dp-desc { opacity: 0.7; margin: 0 0 16px; }
.dp-btn {
  border: 1px solid rgba(0,0,0,0.15); background: rgba(255,255,255,0.6);
  border-radius: 8px; padding: 8px 14px; cursor: var(--cursor-pointer); font: inherit;
}
.dp-btn:hover { background: rgba(255,255,255,0.9); }
.dp-out { margin-top: 12px; opacity: 0.8; white-space: pre-wrap; }
`

function ensureStyle() {
  if (document.getElementById('dp-plugin-__PLUGIN_ID__')) return
  const el = document.createElement('style')
  el.id = 'dp-plugin-__PLUGIN_ID__'
  el.textContent = styles
  document.head.appendChild(el)
}

export default function App() {
  ensureStyle()
  const [msg, setMsg] = useState('就绪')

  return (
    <div className="dp-wrap">
      <h1 className="dp-title">__PLUGIN_TITLE__</h1>
      <p className="dp-desc">用户插件模板。在 src/ui/App.tsx 继续开发，用 build.mjs 构建后 refresh_plugins。</p>
      <button type="button" className="dp-btn" onClick={() => setMsg('Hello from __PLUGIN_ID__')}>
        点我
      </button>
      <button
        type="button"
        className="dp-btn"
        style={{ marginLeft: 8 }}
        onClick={() => {
          void api.pickDirectory().then((dir) => setMsg(dir ? `目录: ${dir}` : '未选择'))
        }}
      >
        选目录
      </button>
      <div className="dp-out">{msg}</div>
    </div>
  )
}
