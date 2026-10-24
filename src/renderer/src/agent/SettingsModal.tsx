import { useEffect, useMemo, useState } from 'react'
import type {
  AgentSettings,
  ConnectivityResult,
  ModelEntry,
  ProviderConfig
} from './types'
import { getSettings, listModels, saveSettings, testModel } from './agentApi'

const DEFAULT_CTX_IN = 1_000_000
const DEFAULT_CTX_OUT = 131_072

type SettingsSection = { kind: 'provider'; id: string } | { kind: 'uiDev' }

function emptyModel(fallbackLabel?: string): ModelEntry {
  return {
    id: crypto.randomUUID(),
    model: '',
    label: fallbackLabel ?? '',
    contextInputTokens: DEFAULT_CTX_IN,
    contextOutputTokens: DEFAULT_CTX_OUT
  }
}

function emptyProvider(): ProviderConfig {
  return {
    id: crypto.randomUUID(),
    label: '',
    provider: 'custom',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    apiKey: '',
    authMode: 'api-key',
    models: []
  }
}

/** Flatten every model under every provider for the default-model picker. */
function allModels(settings: AgentSettings): Array<ModelEntry & { providerLabel: string }> {
  return (settings.providers ?? []).flatMap((p) =>
    (p.models ?? []).map((m) => ({ ...m, providerLabel: p.label }))
  )
}

export function SettingsModal({
  open,
  focus = 'models',
  onClose,
  onSaved
}: {
  open: boolean
  /** Which pane to show when the dialog opens. */
  focus?: 'models' | 'uiDev'
  onClose: () => void
  onSaved?: (s: AgentSettings) => void
}): JSX.Element | null {
  const [settings, setSettings] = useState<AgentSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [listing, setListing] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<ConnectivityResult | null>(null)
  const [pulled, setPulled] = useState<Array<{ id: string; label: string; disabled?: boolean }> | null>(
    null
  )
  const [section, setSection] = useState<SettingsSection>({ kind: 'uiDev' })

  useEffect(() => {
    if (!open) return
    setError(null)
    setTestResult(null)
    setPulled(null)
    getSettings()
      .then((s) => {
        setSettings(s)
        if (focus === 'uiDev') {
          setSection({ kind: 'uiDev' })
        } else {
          const first = s.providers[0]
          setSection(first ? { kind: 'provider', id: first.id } : { kind: 'uiDev' })
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [open, focus])

  const activeProvider =
    settings && section.kind === 'provider'
      ? settings.providers.find((p) => p.id === section.id)
      : undefined

  // Drop stale results when the user switches provider / pane.
  useEffect(() => {
    setTestResult(null)
    setPulled(null)
  }, [section.kind, section.kind === 'provider' ? section.id : 'uiDev'])

  const modelCount = useMemo(
    () => (settings ? allModels(settings).length : 0),
    [settings]
  )

  if (!open || !settings) return null

  const updateProvider = (id: string, patch: Partial<ProviderConfig>): void => {
    setSettings((s) =>
      s
        ? {
            ...s,
            providers: s.providers.map((p) => (p.id === id ? { ...p, ...patch } : p))
          }
        : s
    )
  }

  const updateModel = (
    providerId: string,
    modelId: string,
    patch: Partial<ModelEntry>
  ): void => {
    setSettings((s) =>
      s
        ? {
            ...s,
            providers: s.providers.map((p) =>
              p.id === providerId
                ? {
                    ...p,
                    models: p.models.map((m) => (m.id === modelId ? { ...m, ...patch } : m))
                  }
                : p
            )
          }
        : s
    )
  }

  const addProvider = (): void => {
    if (!settings) return
    const p = emptyProvider()
    p.label = `供应商 ${settings.providers.length + 1}`
    setSettings({ ...settings, providers: [...settings.providers, p] })
    setSection({ kind: 'provider', id: p.id })
  }

  const removeProvider = (id: string): void => {
    if (!settings) return
    const providers = settings.providers.filter((p) => p.id !== id)
    if (providers.length === 0) return
    const remaining = providers.flatMap((p) => p.models)
    let activeModelId = settings.activeModelId
    if (!remaining.some((m) => m.id === activeModelId)) {
      activeModelId = remaining[0]?.id ?? activeModelId
    }
    setSettings({ ...settings, providers, activeModelId })
    if (section.kind === 'provider' && section.id === id) {
      setSection({ kind: 'provider', id: providers[0].id })
    }
  }

  const addModel = (providerId: string, partial?: Partial<ModelEntry>): void => {
    if (!settings) return
    const provider = settings.providers.find((p) => p.id === providerId)
    if (!provider) return
    const entry = {
      ...emptyModel(),
      ...partial
    }
    if (!entry.label) entry.label = entry.model || '新模型'
    if (!entry.model) entry.model = 'claude-sonnet-4-5'
    setSettings((s) => {
      if (!s) return s
      const providers = s.providers.map((p) =>
        p.id === providerId ? { ...p, models: [...p.models, entry] } : p
      )
      const activeModelId =
        s.providers.flatMap((p) => p.models).length === 0 ? entry.id : s.activeModelId
      return { ...s, providers, activeModelId }
    })
  }

  const removeModel = (providerId: string, modelId: string): void => {
    if (!settings) return
    const providers = settings.providers.map((p) =>
      p.id === providerId ? { ...p, models: p.models.filter((m) => m.id !== modelId) } : p
    )
    const remaining = providers.flatMap((p) => p.models)
    let activeModelId = settings.activeModelId
    if (!remaining.some((m) => m.id === activeModelId)) {
      activeModelId = remaining[0]?.id ?? activeModelId
    }
    setSettings({ ...settings, providers, activeModelId })
  }

  const runTest = async (p: ProviderConfig): Promise<void> => {
    setTesting(p.id)
    setTestResult(null)
    try {
      const r = await testModel(
        {
          provider: p.provider,
          baseUrl: p.baseUrl,
          apiKey: p.apiKey,
          authMode: p.authMode,
          model: p.models[0]?.model
        },
        p.id
      )
      setTestResult(r)
      updateProvider(p.id, {
        lastTest: { ok: r.ok, message: r.message, at: Date.now() }
      })
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setTesting(null)
    }
  }

  const pullModels = async (p: ProviderConfig): Promise<void> => {
    setListing(p.id)
    setTestResult(null)
    setPulled(null)
    try {
      const r = await listModels({
        provider: p.provider,
        baseUrl: p.baseUrl,
        apiKey: p.apiKey,
        authMode: p.authMode
      })
      setTestResult(r)
      if (r.ok && r.models && r.models.length > 0) {
        const existing = new Set(p.models.map((m) => m.model))
        setPulled(r.models.map((m) => ({ ...m, disabled: existing.has(m.id) })))
      }
    } catch (e) {
      setTestResult({
        ok: false,
        message: e instanceof Error ? e.message : String(e)
      })
    } finally {
      setListing(null)
    }
  }

  const addPulledModel = (p: ProviderConfig, remote: { id: string; label: string }): void => {
    if (p.models.some((m) => m.model === remote.id)) return
    addModel(p.id, {
      model: remote.id,
      label: remote.label || remote.id,
      contextInputTokens: DEFAULT_CTX_IN,
      contextOutputTokens: DEFAULT_CTX_OUT
    })
    setPulled((prev) =>
      prev ? prev.map((x) => (x.id === remote.id ? { ...x, disabled: true } : x)) : prev
    )
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

  const renderProviderForm = (p: ProviderConfig): JSX.Element => {
    const tr = testResult ?? (p.lastTest ? { ok: p.lastTest.ok, message: p.lastTest.message } : null)
    return (
      <div key={p.id} className="settings-pane-slide">
        {/* ── 上：供应商连接 ── */}
        <section className="preset-card">
          <div className="settings-pane-title">
            <span>供应商</span>
            <span className="settings-badge">{p.provider === 'anthropic' ? 'Anthropic' : '自定义'}</span>
          </div>

          <div className="preset-row">
            <label className="field">
              <span>名称</span>
              <input
                value={p.label}
                onChange={(e) => updateProvider(p.id, { label: e.target.value })}
                placeholder="例如 MiniMax / Kimi"
              />
            </label>
            <label className="field">
              <span>接口协议</span>
              <select
                value={p.protocol}
                onChange={(e) =>
                  updateProvider(p.id, {
                    protocol: e.target.value as ProviderConfig['protocol']
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
                  updateProvider(p.id, {
                    provider: e.target.value as ProviderConfig['provider']
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
                onChange={(e) => updateProvider(p.id, { baseUrl: e.target.value })}
                placeholder="https://api.anthropic.com"
              />
            </label>
            <label className="field field-grow">
              <span>API Key</span>
              <input
                type="password"
                value={p.apiKey ?? ''}
                onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                placeholder={
                  p.provider === 'anthropic' && p.authMode === 'subscription'
                    ? '订阅登录可留空'
                    : 'sk-...'
                }
              />
            </label>
            {p.provider === 'anthropic' && (
              <label className="field">
                <span>鉴权方式</span>
                <select
                  value={p.authMode ?? 'subscription'}
                  onChange={(e) =>
                    updateProvider(p.id, {
                      authMode: e.target.value as ProviderConfig['authMode']
                    })
                  }
                >
                  <option value="subscription">Claude 订阅登录</option>
                  <option value="api-key">API Key</option>
                </select>
              </label>
            )}
          </div>

          <div className="preset-actions">
            <div className="preset-actions-left">
              <button
                className="btn-secondary"
                disabled={testing === p.id}
                onClick={() => void runTest(p)}
              >
                {testing === p.id ? '测试中…' : '测试连通'}
              </button>
              {settings.providers.length > 1 && (
                <button className="btn-danger-ghost" onClick={() => removeProvider(p.id)}>
                  删除供应商
                </button>
              )}
            </div>
          </div>

          {tr && (
            <div className={`test-result${tr.ok ? ' ok' : ' err'}`}>
              {tr.ok ? '✓' : '✕'} {tr.message}
            </div>
          )}
        </section>

        {/* ── 下：模型列表 ── */}
        <section className="preset-card">
          <div className="settings-pane-title">
            <span>模型列表</span>
            <span className="settings-badge">{p.models.length} 个</span>
          </div>

          <div className="model-toolbar">
            <button
              className="btn-secondary"
              disabled={listing === p.id}
              onClick={() => void pullModels(p)}
            >
              {listing === p.id ? '拉取中…' : '拉取模型列表'}
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                addModel(p.id, {
                  model: '',
                  label: `模型 ${p.models.length + 1}`,
                  contextInputTokens: DEFAULT_CTX_IN,
                  contextOutputTokens: DEFAULT_CTX_OUT
                })
              }
            >
              ＋ 手动添加
            </button>
          </div>

          {pulled && pulled.length > 0 && (
            <div className="pulled-panel">
              <div className="pulled-title">从接口发现的模型 · 点击添加</div>
              <div className="model-chips">
                {pulled.map((m) => {
                  const already = p.models.some((x) => x.model === m.id) || m.disabled
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`model-chip${already ? ' active' : ''}`}
                      disabled={already}
                      onClick={() => addPulledModel(p, m)}
                      title={m.label}
                    >
                      {already ? '✓ ' : '＋ '}
                      {m.id}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {p.models.length === 0 ? (
            <div className="form-error" style={{ opacity: 0.7 }}>
              尚未添加模型。拉取列表后点击添加，或手动添加一个。
            </div>
          ) : (
            <div className="model-table">
              <div className="model-table-head">
                <span className="col-default">默认</span>
                <span className="col-model">模型 ID</span>
                <span className="col-label">显示名</span>
                <span className="col-ctx">输入上下文</span>
                <span className="col-out">输出上限</span>
                <span className="col-act" />
              </div>
              {p.models.map((m) => (
                <div key={m.id} className="model-table-row">
                  <span className="col-default">
                    <label className="radio-inline" title="设为默认模型">
                      <input
                        type="radio"
                        name="active-model"
                        checked={settings.activeModelId === m.id}
                        onChange={() =>
                          setSettings((s) => (s ? { ...s, activeModelId: m.id } : s))
                        }
                      />
                    </label>
                  </span>
                  <span className="col-model">
                    <input
                      value={m.model}
                      onChange={(e) => updateModel(p.id, m.id, { model: e.target.value })}
                      placeholder="claude-sonnet-4-5"
                      spellCheck={false}
                    />
                  </span>
                  <span className="col-label">
                    <input
                      value={m.label}
                      onChange={(e) => updateModel(p.id, m.id, { label: e.target.value })}
                      placeholder="显示名"
                    />
                  </span>
                  <span className="col-ctx">
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={m.contextInputTokens ?? DEFAULT_CTX_IN}
                      onChange={(e) =>
                        updateModel(p.id, m.id, {
                          contextInputTokens: Number(e.target.value) || DEFAULT_CTX_IN
                        })
                      }
                      title="输入上下文（tokens）"
                    />
                  </span>
                  <span className="col-out">
                    <input
                      type="number"
                      min={256}
                      step={1024}
                      value={m.contextOutputTokens ?? DEFAULT_CTX_OUT}
                      onChange={(e) =>
                        updateModel(p.id, m.id, {
                          contextOutputTokens: Number(e.target.value) || DEFAULT_CTX_OUT
                        })
                      }
                      title="输出上限（tokens）"
                    />
                  </span>
                  <span className="col-act">
                    <button
                      className="btn-icon"
                      title="删除模型"
                      onClick={() => removeModel(p.id, m.id)}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {p.models.length > 0 && (
            <div className="model-table-foot">
              共 {p.models.length} 个模型 · 当前默认：
              <strong>
                {allModels(settings).find((m) => m.id === settings.activeModelId)?.label ||
                  allModels(settings).find((m) => m.id === settings.activeModelId)?.model ||
                  '—'}
              </strong>
              （全局 {modelCount} 个）
            </div>
          )}
        </section>
      </div>
    )
  }

  const renderUiDev = (): JSX.Element => (
    <div className="preset-card">
      <div className="settings-pane-title">
        <span>开发调试</span>
      </div>
      <label className="radio-inline" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={settings.uiDev?.enableCdp === true}
          onChange={(e) =>
            setSettings((s) =>
              s
                ? {
                    ...s,
                    uiDev: {
                      enableCdp: e.target.checked,
                      cdpPort: s.uiDev?.cdpPort ?? 9222
                    }
                  }
                : s
            )
          }
        />
        启用 CDP 远程调试（remote-debugging-port）
      </label>
      <label className="field" style={{ maxWidth: 220, marginTop: 8 }}>
        <span>端口</span>
        <input
          type="number"
          min={1024}
          max={65535}
          value={settings.uiDev?.cdpPort ?? 9222}
          disabled={settings.uiDev?.enableCdp !== true}
          onChange={(e) =>
            setSettings((s) =>
              s
                ? {
                    ...s,
                    uiDev: {
                      ...s.uiDev,
                      enableCdp: s.uiDev?.enableCdp === true,
                      cdpPort: Number(e.target.value) || 9222
                    }
                  }
                : s
            )
          }
        />
      </label>
      <div className="form-error" style={{ marginTop: 8, opacity: 0.75 }}>
        修改后需重启 DevDash 生效。开启后仅监听本机，等于允许本机工具完全控制该应用，请只在开发验收时打开。
      </div>
    </div>
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide modal-settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">设置 · 模型</div>
          <button className="btn-icon" onClick={onClose} title="关闭">
            ✕
          </button>
        </div>
        <div className="modal-settings-body">
          <nav className="settings-nav">
            <div className="settings-nav-section">供应商</div>
            {settings.providers.map((p, i) => {
              const active = section.kind === 'provider' && section.id === p.id
              const hasDefault = p.models.some((m) => m.id === settings.activeModelId)
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`settings-nav-item${active ? ' active' : ''}`}
                  onClick={() => setSection({ kind: 'provider', id: p.id })}
                >
                  <span className="settings-nav-label">{p.label || `供应商 ${i + 1}`}</span>
                  <span className="settings-nav-meta">
                    {hasDefault && <span className="settings-nav-dot">★</span>}
                    {p.models.length}
                  </span>
                </button>
              )
            })}
            <button type="button" className="settings-nav-item settings-nav-add" onClick={addProvider}>
              ＋ 添加供应商
            </button>
            <div className="settings-nav-section">其他</div>
            <button
              type="button"
              className={`settings-nav-item${section.kind === 'uiDev' ? ' active' : ''}`}
              onClick={() => setSection({ kind: 'uiDev' })}
            >
              <span className="settings-nav-label">开发调试</span>
            </button>
          </nav>
          <div className="settings-pane">
            <div key={section.kind === 'provider' ? section.id : 'uiDev'}>
              {section.kind === 'uiDev'
                ? renderUiDev()
                : activeProvider
                  ? renderProviderForm(activeProvider)
                  : settings.providers[0]
                    ? renderProviderForm(settings.providers[0])
                    : renderUiDev()}
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>
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
