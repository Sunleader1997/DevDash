import { useEffect, useState } from 'react'
import type { AgentSettings, ConnectivityResult, ModelPreset } from './types'
import { getSettings, listModels, saveSettings, testModel } from './agentApi'

const DEFAULT_CTX_IN = 1_000_000
const DEFAULT_CTX_OUT = 64_000

function emptyPreset(): ModelPreset {
  return {
    id: '',
    label: '',
    provider: 'custom',
    protocol: 'anthropic-messages',
    model: '',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    authMode: 'api-key',
    contextInputTokens: DEFAULT_CTX_IN,
    contextOutputTokens: DEFAULT_CTX_OUT
  }
}

export function SettingsModal({
  open,
  onClose,
  onSaved
}: {
  open: boolean
  onClose: () => void
  onSaved?: (s: AgentSettings) => void
}): JSX.Element | null {
  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [listingId, setListingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, ConnectivityResult>>({})

  useEffect(() => {
    if (!open) return
    setError(null)
    getSettings()
      .then(setSettings)
      .catch((e: Error) => setError(e.message))
  }, [open])

  if (!open || !settings) return null

  const updatePreset = (id: string, patch: Partial<ModelPreset>): void => {
    setSettings((s) =>
      s
        ? {
            ...s,
            presets: s.presets.map((p) => (p.id === id ? { ...p, ...patch } : p))
          }
        : s
    )
  }

  const addPreset = (): void => {
    setSettings((s) => {
      if (!s) return s
      const p = {
        ...emptyPreset(),
        id: crypto.randomUUID(),
        label: `模型 ${s.presets.length + 1}`
      }
      return { ...s, presets: [...s.presets, p], activePresetId: p.id }
    })
  }

  const removePreset = (id: string): void => {
    setSettings((s) => {
      if (!s) return s
      const presets = s.presets.filter((p) => p.id !== id)
      if (presets.length === 0) return s
      return {
        presets,
        activePresetId: s.activePresetId === id ? presets[0].id : s.activePresetId
      }
    })
  }

  const runTest = async (p: ModelPreset): Promise<void> => {
    const key = p.id || p.label || 'draft'
    setTestingId(key)
    try {
      const r = await testModel(p, p.id || undefined)
      setTestResults((prev) => ({ ...prev, [key]: r }))
      if (p.id) {
        setSettings((s) =>
          s
            ? {
                ...s,
                presets: s.presets.map((x) =>
                  x.id === p.id
                    ? { ...x, lastTest: { ok: r.ok, message: r.message, at: Date.now() } }
                    : x
                )
              }
            : s
        )
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          ok: false,
          message: e instanceof Error ? e.message : String(e)
        }
      }))
    } finally {
      setTestingId(null)
    }
  }

  const pullModels = async (p: ModelPreset): Promise<void> => {
    const key = p.id || p.label || 'draft'
    setListingId(key)
    try {
      const r = await listModels(p)
      setTestResults((prev) => ({ ...prev, [key]: r }))
      if (r.ok && r.models && r.models.length > 0) {
        // If current model is empty or not in list, select first
        const has = r.models.some((m) => m.id === p.model)
        if (!has) {
          updatePreset(p.id, { model: r.models[0].id })
        }
        // stash list on the result card
      }
    } catch (e) {
      setTestResults((prev) => ({
        ...prev,
        [key]: {
          ok: false,
          message: e instanceof Error ? e.message : String(e)
        }
      }))
    } finally {
      setListingId(null)
    }
  }

  const save = async (): Promise<void> => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const next = await saveSettings(settings)
      setSettings(next)
      onSaved?.(next)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">模型配置</div>
          <button className="btn-icon" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {settings.presets.map((p) => {
            const key = p.id || p.label || 'draft'
            const tr = testResults[key] ?? (p.lastTest
              ? { ok: p.lastTest.ok, message: p.lastTest.message }
              : null)
            return (
              <div key={p.id} className="preset-card">
                <div className="preset-row">
                  <label className="field">
                    <span>名称</span>
                    <input
                      value={p.label}
                      onChange={(e) => updatePreset(p.id, { label: e.target.value })}
                      placeholder="例如 Claude Sonnet"
                    />
                  </label>
                  <label className="field">
                    <span>接口协议</span>
                    <select
                      value={p.protocol}
                      onChange={(e) =>
                        updatePreset(p.id, {
                          protocol: e.target.value as ModelPreset['protocol']
                        })
                      }
                    >
                      <option value="anthropic-messages">Anthropic Messages</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>提供方</span>
                    <select
                      value={p.provider}
                      onChange={(e) =>
                        updatePreset(p.id, {
                          provider: e.target.value as ModelPreset['provider']
                        })
                      }
                    >
                      <option value="anthropic">Anthropic 官方</option>
                      <option value="custom">自定义端点</option>
                    </select>
                  </label>
                </div>

                <div className="preset-row">
                  <label className="field field-grow">
                    <span>接口地址</span>
                    <input
                      value={p.baseUrl ?? ''}
                      onChange={(e) => updatePreset(p.id, { baseUrl: e.target.value })}
                      placeholder="https://api.anthropic.com"
                    />
                  </label>
                  <label className="field field-grow">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={p.apiKey ?? ''}
                      onChange={(e) => updatePreset(p.id, { apiKey: e.target.value })}
                      placeholder={p.provider === 'anthropic' && p.authMode === 'subscription' ? '订阅登录可留空' : 'sk-...'}
                    />
                  </label>
                </div>

                {p.provider === 'anthropic' && (
                  <div className="preset-row">
                    <label className="field">
                      <span>鉴权方式</span>
                      <select
                        value={p.authMode ?? 'subscription'}
                        onChange={(e) =>
                          updatePreset(p.id, {
                            authMode: e.target.value as ModelPreset['authMode']
                          })
                        }
                      >
                        <option value="subscription">Claude 订阅登录</option>
                        <option value="api-key">API Key</option>
                      </select>
                    </label>
                  </div>
                )}

                <div className="preset-row">
                  <label className="field">
                    <span>模型 ID</span>
                    <div className="inline-input">
                      <input
                        list={`models-${p.id}`}
                        value={p.model}
                        onChange={(e) => updatePreset(p.id, { model: e.target.value })}
                        placeholder="claude-sonnet-4-5"
                      />
                      <datalist id={`models-${p.id}`}>
                        {(testResults[key]?.models ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </datalist>
                    </div>
                  </label>
                  <label className="field">
                    <span>输入上下文（tokens）</span>
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={p.contextInputTokens ?? DEFAULT_CTX_IN}
                      onChange={(e) =>
                        updatePreset(p.id, {
                          contextInputTokens: Number(e.target.value) || DEFAULT_CTX_IN
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>输出上限（tokens）</span>
                    <input
                      type="number"
                      min={256}
                      step={1024}
                      value={p.contextOutputTokens ?? DEFAULT_CTX_OUT}
                      onChange={(e) =>
                        updatePreset(p.id, {
                          contextOutputTokens: Number(e.target.value) || DEFAULT_CTX_OUT
                        })
                      }
                    />
                  </label>
                </div>

                <div className="preset-actions">
                  <div className="preset-actions-left">
                    <label className="radio-inline">
                      <input
                        type="radio"
                        name="active-preset"
                        checked={settings.activePresetId === p.id}
                        onChange={() =>
                          setSettings((s) => (s ? { ...s, activePresetId: p.id } : s))
                        }
                      />
                      默认
                    </label>
                    <button
                      className="btn-secondary"
                      disabled={testingId === key}
                      onClick={() => void runTest(p)}
                    >
                      {testingId === key ? '测试中…' : '测试连通'}
                    </button>
                    <button
                      className="btn-secondary"
                      disabled={listingId === key}
                      onClick={() => void pullModels(p)}
                    >
                      {listingId === key ? '拉取中…' : '拉取模型列表'}
                    </button>
                    {settings.presets.length > 1 && (
                      <button className="btn-danger-ghost" onClick={() => removePreset(p.id)}>
                        删除
                      </button>
                    )}
                  </div>
                </div>

                {tr && (
                  <div className={`test-result${tr.ok ? ' ok' : ' err'}`}>
                    {tr.ok ? '✓' : '✕'} {tr.message}
                    {tr.models && tr.models.length > 0 && (
                      <div className="model-chips">
                        {tr.models.slice(0, 12).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`model-chip${p.model === m.id ? ' active' : ''}`}
                            onClick={() => updatePreset(p.id, { model: m.id })}
                            title={m.label}
                          >
                            {m.id}
                          </button>
                        ))}
                        {tr.models.length > 12 && (
                          <span className="model-more">+{tr.models.length - 12}</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <button className="btn-secondary" onClick={addPreset}>
            ＋ 添加模型
          </button>
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
