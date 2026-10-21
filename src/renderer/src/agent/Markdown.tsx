/** Minimal safe Markdown → React. No raw HTML injection. */
import type { JSX } from 'react'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inline(md: string): string {
  let s = escapeHtml(md)
  // code spans first
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  s = s.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  )
  return s
}

function blockToHtml(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let i = 0
  let list: 'ul' | 'ol' | null = null
  const closeList = (): void => {
    if (list) {
      out.push(list === 'ul' ? '</ul>' : '</ol>')
      list = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // fenced code
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      closeList()
      const lang = fence[1] || ''
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // skip closing fence
      out.push(
        `<pre class="md-pre"${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}><code>${escapeHtml(buf.join('\n'))}</code></pre>`
      )
      continue
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeList()
      const level = h[1].length
      out.push(`<h${level} class="md-h${level}">${inline(h[2])}</h${level}>`)
      i++
      continue
    }

    // hr
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList()
      out.push('<hr class="md-hr" />')
      i++
      continue
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      closeList()
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote class="md-quote">${inline(buf.join(' '))}</blockquote>`)
      continue
    }

    // unordered list
    const ul = line.match(/^[-*+]\s+(.*)$/)
    if (ul) {
      if (list !== 'ul') {
        closeList()
        out.push('<ul class="md-ul">')
        list = 'ul'
      }
      out.push(`<li>${inline(ul[1])}</li>`)
      i++
      continue
    }

    // ordered list
    const ol = line.match(/^\d+[.)]\s+(.*)$/)
    if (ol) {
      if (list !== 'ol') {
        closeList()
        out.push('<ol class="md-ol">')
        list = 'ol'
      }
      out.push(`<li>${inline(ol[1])}</li>`)
      i++
      continue
    }

    // blank
    if (!line.trim()) {
      closeList()
      i++
      continue
    }

    // paragraph
    closeList()
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|[-*+]\s|\d+[.)]\s|>)/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    out.push(`<p class="md-p">${inline(buf.join('\n'))}</p>`)
  }
  closeList()
  return out.join('\n')
}

export function Markdown({ text }: { text: string }): JSX.Element {
  if (!text) return <span />
  // split code fences so we don't mangle them in inline pass — blockToHtml handles fences
  const html = blockToHtml(text)
  return <div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />
}
