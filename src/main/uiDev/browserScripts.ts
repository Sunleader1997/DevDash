/**
 * Browser-side scripts injected via webContents.executeJavaScript.
 * Caller data is always embedded as ONE JSON blob at __DATA__ via JSON.stringify —
 * never multi-pass string substitution (avoids placeholder collisions / injection).
 */

const HELPERS = `
function accName(el) {
  const aria = el.getAttribute && el.getAttribute('aria-label')
  if (aria) return aria.trim()
  const labelledby = el.getAttribute && el.getAttribute('aria-labelledby')
  if (labelledby) {
    const parts = labelledby.split(/\\s+/).map((id) => {
      const n = document.getElementById(id)
      return n ? (n.innerText || '').trim() : ''
    }).filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  if (el.id) {
    const lab = document.querySelector('label[for="' + el.id.replace(/"/g, '\\\\"') + '"]')
    if (lab) return (lab.innerText || '').trim()
  }
  const t = el.getAttribute && el.getAttribute('title')
  if (t) return t.trim()
  return (el.innerText || el.value || '').trim()
}
function labelMatch(el, need, exact) {
  if (need == null) return false
  if (textMatch(need, accName(el), exact)) return true
  const labelledby = el.getAttribute && el.getAttribute('aria-labelledby')
  if (labelledby) {
    for (const id of labelledby.split(/\\s+/)) {
      const n = document.getElementById(id)
      if (n && textMatch(need, (n.innerText || '').trim(), exact)) return true
    }
  }
  return false
}
function textMatch(need, hay, exact) {
  if (need == null) return true
  const n = String(need)
  const h = (hay || '').trim()
  return exact === false ? h.includes(n) : h === n
}
function isVisible(el) {
  if (!el || !el.isConnected) return false
  const st = window.getComputedStyle(el)
  if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}
function actionability(el) {
  if (!el || !el.isConnected) return { ok: false, reason: 'detached' }
  const st = window.getComputedStyle(el)
  if (st.display === 'none' || st.visibility === 'hidden') return { ok: false, reason: 'not-visible' }
  const r = el.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return { ok: false, reason: 'zero-size' }
  if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') {
    return { ok: false, reason: 'disabled' }
  }
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const hit = document.elementFromPoint(cx, cy)
  if (!hit) return { ok: false, reason: 'no-hit', rect: { x: r.left, y: r.top, w: r.width, h: r.height } }
  // Spec: center must hit the target itself or a descendant (not an ancestor cover).
  const ok = el === hit || el.contains(hit)
  return {
    ok,
    reason: ok ? 'ok' : 'obscured',
    hit: hit.tagName ? hit.tagName.toLowerCase() : '',
    rect: { x: r.left, y: r.top, w: r.width, h: r.height }
  }
}
function implicitRole(el) {
  const tag = el.tagName ? el.tagName.toLowerCase() : ''
  const type = (el.getAttribute && (el.getAttribute('type') || '')).toLowerCase()
  if (el.getAttribute && el.getAttribute('role')) return el.getAttribute('role')
  if (tag === 'button') return 'button'
  if (tag === 'a' && el.hasAttribute('href')) return 'link'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'img') return 'img'
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'heading'
  if (tag === 'li') return 'listitem'
  if (tag === 'ul' || tag === 'ol') return 'list'
  if (tag === 'input') {
    if (type === 'checkbox') return 'checkbox'
    if (type === 'radio') return 'radio'
    if (type === 'button' || type === 'submit' || type === 'reset') return 'button'
    if (type === 'search') return 'searchbox'
    return 'textbox'
  }
  return ''
}
function findEls(L) {
  const q = (sel) => Array.from(document.querySelectorAll(sel))
  let els = []
  if (L && L.testid) {
    const id = String(L.testid)
    els = q('[data-testid]').filter((el) => el.getAttribute('data-testid') === id)
      .concat(q('[data-test-id]').filter((el) => el.getAttribute('data-test-id') === id))
    els = Array.from(new Set(els))
  } else if (L && L.role) {
    const role = String(L.role)
    els = q('body *').filter((el) => implicitRole(el) === role)
    if (L.name != null) {
      const exact = L.exact !== false
      els = els.filter((el) => textMatch(L.name, accName(el), exact))
    }
  } else if (L && L.label != null) {
    const exact = L.exact !== false
    els = q('input,textarea,select,button,[role=button],[role=textbox],[role=checkbox],[role=radio],[role=combobox],[role=link]')
      .filter((el) => labelMatch(el, L.label, exact))
  } else if (L && L.text != null) {
    const exact = L.exact !== false
    const all = q('body *').filter((el) => textMatch(L.text, (el.innerText || '').trim(), exact))
    els = all.filter((el) => !all.some((other) => other !== el && el.contains(other)))
    els = els.filter((el) => isVisible(el) || el === document.body)
  } else if (L && L.css) {
    els = q(String(L.css))
  } else {
    throw new Error('locator needs one of: testid, role, label, text, css')
  }
  return els
}
function summarize(el) {
  const r = el.getBoundingClientRect()
  return {
    tag: el.tagName ? el.tagName.toLowerCase() : '',
    testid: (el.getAttribute && (el.getAttribute('data-testid') || el.getAttribute('data-test-id'))) || '',
    role: implicitRole(el) || '',
    text: (el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 200),
    value: typeof el.value === 'string' ? el.value.slice(0, 200) : '',
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    visible: isVisible(el),
    rect: { x: r.left, y: r.top, w: r.width, h: r.height }
  }
}
function pick(L) {
  const els = findEls(L)
  if (els.length === 0) return { ok: false, reason: 'not-found', count: 0, candidates: [] }
  let idx = L && typeof L.index === 'number' ? L.index : 0
  if (idx < 0) idx = els.length + idx
  if (L && typeof L.index !== 'number' && els.length > 1) {
    return {
      ok: false,
      reason: 'multiple',
      count: els.length,
      candidates: els.slice(0, 10).map((el, i) => ({ i, ...summarize(el) }))
    }
  }
  if (idx < 0 || idx >= els.length) {
    return {
      ok: false,
      reason: 'index-out-of-range',
      count: els.length,
      candidates: els.slice(0, 10).map((el, i) => ({ i, ...summarize(el) }))
    }
  }
  return { ok: true, el: els[idx], summary: summarize(els[idx]), count: els.length }
}
`

export const SCRIPT_RESOLVE = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  return { ok: true, count: r.count, summary: r.summary }
})()`

export const SCRIPT_QUERY = SCRIPT_RESOLVE

export const SCRIPT_GET_TEXT = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  return { ok: true, text: (r.el.innerText || '').trim().replace(/\\s+/g, ' ').slice(0, 2000) }
})()`

export const SCRIPT_GET_VALUE = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const el = r.el
  let value = ''
  if (typeof el.value === 'string') value = el.value
  else if (el.isContentEditable) value = (el.innerText || '').trim()
  return { ok: true, value: value.slice(0, 2000) }
})()`

export const SCRIPT_GET_ATTR = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
  const name = D.ATTR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  return { ok: true, value: r.el.getAttribute(name) }
})()`

export const SCRIPT_ACTIONABILITY = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  return { ok: true, action: actionability(r.el), summary: r.summary }
})()`

export const SCRIPT_SCROLL_INTO_VIEW = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  r.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
  return { ok: true, summary: r.summary }
})()`

export const SCRIPT_FILL = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
  const value = D.VALUE
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const el = r.el
  if (el.disabled === true) return { ok: false, reason: 'disabled' }
  try { el.focus() } catch {}
  const proto =
    el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype :
    el.tagName === 'SELECT' ? HTMLSelectElement.prototype :
    HTMLInputElement.prototype
  const desc = Object.getOwnPropertyDescriptor(proto, 'value')
  if (desc && desc.set) desc.set.call(el, value)
  else el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true, value: String(el.value).slice(0, 200) }
})()`

export const SCRIPT_FOCUS = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  try { r.el.focus() } catch {}
  return { ok: true, summary: r.summary, active: document.activeElement === r.el }
})()`

export const SCRIPT_SELECT_OPTION = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
  const value = D.VALUE
  const label = D.LABEL
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const el = r.el
  if (el.tagName !== 'SELECT') return { ok: false, reason: 'not-a-select' }
  if (value != null) el.value = String(value)
  else if (label != null) {
    const opt = Array.from(el.options).find((o) => (o.textContent || '').trim() === String(label))
    if (!opt) return { ok: false, reason: 'option-not-found', options: Array.from(el.options).map((o) => ({ value: o.value, label: (o.textContent || '').trim() })).slice(0, 20) }
    el.value = opt.value
  } else return { ok: false, reason: 'need-value-or-label' }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true, value: el.value }
})()`

export const SCRIPT_CHECK = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
  const want = D.WANT
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const el = r.el
  const role = implicitRole(el)
  if (role === 'radio' && want) {
    el.click()
    return { ok: true, checked: !!el.checked }
  }
  if (role === 'checkbox') {
    const is = el.checked === true || el.getAttribute('aria-checked') === 'true'
    if (is !== want) {
      if (typeof el.click === 'function') el.click()
      else {
        el.checked = want
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
    return { ok: true, checked: el.checked === true || el.getAttribute('aria-checked') === 'true' }
  }
  return { ok: false, reason: 'not-checkable', tag: r.summary.tag, role: r.summary.role }
})()`

export const SCRIPT_SCROLL_BY = `(() => {
  const D = __DATA__
  const x = D.X
  const y = D.Y
  const absX = D.ABS_X
  const absY = D.ABS_Y
  if (D.TARGET === 'element') {
    // handled in Node via scrollIntoView + optional deltas on window; element native scroll:
  }
  if (absX != null || absY != null) {
    window.scrollTo(absX != null ? absX : window.scrollX, absY != null ? absY : window.scrollY)
  } else if (x !== 0 || y !== 0) {
    window.scrollBy(x, y)
  }
  return { ok: true, scrollX: window.scrollX, scrollY: window.scrollY }
})()`

export const SCRIPT_ELEMENT_SCROLL = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const el = r.el
  const absX = D.ABS_X
  const absY = D.ABS_Y
  const x = D.X || 0
  const y = D.Y || 0
  if (absX != null || absY != null) {
    el.scrollTo(absX != null ? absX : el.scrollLeft, absY != null ? absY : el.scrollTop)
  } else if (x !== 0 || y !== 0) {
    el.scrollBy(x, y)
  }
  return { ok: true, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
})()`

export const SCRIPT_WAIT_STATE = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
  const state = D.STATE
  const textNeed = D.TEXT
${HELPERS}
  const els = findEls(L)
  if (state === 'attached') {
    return { ok: els.length > 0, count: els.length }
  }
  if (state === 'hidden') {
    const anyVisible = els.some((el) => isVisible(el))
    return { ok: els.length === 0 || !anyVisible, count: els.length }
  }
  if (els.length === 0) return { ok: false, count: 0, reason: 'not-found' }
  let idx = L && typeof L.index === 'number' ? L.index : 0
  if (idx < 0) idx = els.length + idx
  const el = els[Math.min(Math.max(idx, 0), els.length - 1)]
  if (state === 'visible') return { ok: isVisible(el), count: els.length }
  if (state === 'enabled') return { ok: isVisible(el) && !(el.disabled === true || el.getAttribute('aria-disabled') === 'true'), count: els.length }
  if (state === 'disabled') return { ok: el.disabled === true || el.getAttribute('aria-disabled') === 'true', count: els.length }
  if (state === 'text') {
    const hay = (el.innerText || '').trim().replace(/\\s+/g, ' ')
    return { ok: textMatch(textNeed, hay, L && L.exact !== false), count: els.length, text: hay.slice(0, 200) }
  }
  if (state === 'value') {
    const hay = typeof el.value === 'string' ? el.value : ''
    return { ok: textMatch(textNeed, hay, L && L.exact !== false), count: els.length, value: hay.slice(0, 200) }
  }
  return { ok: false, reason: 'unknown-state' }
})()`

export const SCRIPT_CENTER = `(() => {
  const D = __DATA__
  const L = D.LOCATOR
${HELPERS}
  const r = pick(L)
  if (!r.ok) return r
  const rect = r.summary.rect
  return {
    ok: true,
    x: rect.x + rect.w / 2,
    y: rect.y + rect.h / 2,
    rect,
    action: actionability(r.el)
  }
})()`

/** Embed caller data as a single JSON blob at __DATA__. */
export function withData(script: string, data: Record<string, unknown>): string {
  return script.split('__DATA__').join(JSON.stringify(data ?? {}))
}
