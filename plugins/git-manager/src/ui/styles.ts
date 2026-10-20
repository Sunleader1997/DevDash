export const pluginCss = `
.gm-root {
  display: grid;
  grid-template-columns: 260px auto 1fr;
  height: 100%;
  min-height: 0;
  color: var(--fg, #1d1d1f);
  font-family: var(--font-sans, system-ui, sans-serif);
}
.gm-side {
  border-right: 1px solid var(--separator, rgba(0,0,0,0.08));
  background: color-mix(in srgb, var(--bg-sidebar, #f6f6f8) 88%, transparent);
  backdrop-filter: var(--blur, blur(20px) saturate(180%));
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.gm-side-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--separator);
  padding: 6px 8px 10px;
}
.gm-side-footer-btn {
  color: var(--fg-secondary);
  font-size: 12px;
  gap: 6px;
  padding: 6px 8px;
}
.gm-side-footer-btn:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.gm-side-footer-btn svg {
  flex-shrink: 0;
}
.gm-side-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 8px;
}
.gm-side-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.gm-tree {
  overflow: auto;
  padding: 4px 8px 16px;
  flex: 1;
}
.gm-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  text-align: left;
}
.gm-row:hover { background: var(--bg-hover, rgba(0,0,0,0.05)); }
.gm-row.active {
  background: var(--accent-soft, rgba(0,113,227,0.12));
  color: var(--accent, #0071e3);
}
.gm-row .muted { color: var(--fg-secondary, #6e6e73); font-size: 11px; }
.gm-tree-gutter {
  width: 18px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gm-tree-chevron {
  color: var(--fg-secondary);
  transition: transform 120ms ease;
}
.gm-dir-row svg {
  color: var(--accent);
  flex-shrink: 0;
}
.gm-file-row > svg {
  color: var(--fg-secondary);
  flex-shrink: 0;
}
.gm-badge {
  margin-left: auto;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.gm-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.gm-titlebar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--separator);
  background: color-mix(in srgb, var(--bg-elevated, rgba(255,255,255,0.72)) 88%, transparent);
  backdrop-filter: var(--blur);
  min-height: 42px;
}
.gm-title {
  font-weight: 600;
  letter-spacing: -0.02em;
  font-size: 13px;
}
.gm-spacer { flex: 1; }
.gm-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--bg-hover);
  border: 1px solid var(--separator);
  font-size: 12px;
}
.gm-btn.icon {
  padding: 5px 8px;
}
.gm-btn.icon.bare {
  background: transparent;
  border-color: transparent;
  padding: 4px;
}
.gm-btn.icon.bare:hover {
  background: var(--bg-hover);
}
.gm-btn.icon.primary {
  padding: 5px 9px;
}
.gm-btn.primary {
  background: var(--accent);
  border-color: transparent;
  color: white;
  font-weight: 560;
}
.gm-btn.ghost { border-color: transparent; background: transparent; }
.gm-btn.ghost:hover { background: var(--bg-hover); }
.gm-seg {
  display: inline-flex;
  padding: 2px;
  border-radius: 9px;
  background: var(--bg-hover);
  gap: 2px;
}
.gm-seg button {
  padding: 5px 12px;
  border-radius: 7px;
  color: var(--fg-secondary);
}
.gm-seg button.active {
  background: var(--bg-elevated);
  color: var(--fg);
  box-shadow: var(--shadow-sm);
}
.gm-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px 5px minmax(0, 1fr);
  min-width: 0;
}
.gm-body.full-history {
  grid-template-columns: 280px 1fr;
}
.gm-panel {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--separator);
  display: flex;
  flex-direction: column;
}
.gm-panel:last-child { border-right: none; }
.gm-panel-header {
  padding: 8px 12px;
  font-size: 11px;
  color: var(--fg-secondary);
  border-bottom: 1px solid var(--separator);
}
.gm-panel-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.gm-repo-branch {
  margin-left: auto;
  color: var(--fg-tertiary);
  font-size: 11px;
  font-weight: 400;
  padding-left: 8px;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gm-commit-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.gm-commit-all {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--separator);
  font-size: 12px;
  cursor: pointer;
}
.gm-commit-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.gm-commit-row:hover {
  background: var(--bg-hover);
}
.gm-commit-dir {
  color: var(--fg-tertiary);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}
.gm-commit-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--separator);
  background: var(--bg-elevated);
}
.gm-commit-form textarea {
  width: 100%;
  min-height: 96px;
  resize: vertical;
  border-radius: 8px;
  border: 1px solid var(--separator);
  background: var(--bg);
  padding: 8px 10px;
  outline: none;
  font-family: var(--font-sans);
  line-height: 1.45;
}
.gm-commit-form textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.gm-commit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.gm-push-list {
  max-height: 180px;
  overflow: auto;
  border: 1px solid var(--separator);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gm-push-item {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 6px;
}
.gm-push-item:hover {
  background: var(--bg-hover);
}
.gm-push-item code {
  color: var(--accent);
  font-family: var(--font-mono, monospace);
}
.gm-push-item .muted {
  margin-left: auto;
  color: var(--fg-secondary);
  font-size: 11px;
}

.gm-row-add {
  margin-left: auto;
  padding: 2px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--accent);
  border: none;
  opacity: 0;
  flex-shrink: 0;
}
.gm-row-add:hover {
  background: var(--accent-soft);
}
.gm-file-row:hover .gm-row-add {
  opacity: 1;
}
.gm-row-add:hover {
  background: var(--accent);
  color: white;
}
.gm-scroll {
  overflow: auto;
  flex: 1;
}
.gm-file-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  width: 100%;
  padding: 5px 12px 5px 4px;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  flex-wrap: nowrap;
  text-align: left;
}
.gm-file-tree {
  width: 100%;
  overflow: hidden;
  text-align: left;
}
.gm-file-tree .gm-file-row {
  padding-left: 4px;
  min-width: 0;
}
.gm-file-row:hover { background: var(--bg-hover); }
.gm-file-row.active {
  background: var(--accent-soft);
  font-weight: 560;
}
.gm-dir-name {
  font-weight: 560;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  text-align: left;
}
.gm-file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
  text-align: left;
  color: var(--fg);
}
/* Status colors on filename (palette):
   未 add / 未跟踪 / 删除 → 红
   add 后又变更 → 蓝
   新建已 add → 绿
   忽略 → 棕 */
.gm-file-name.st-not-added,
.gm-file-name.st-untracked,
.gm-file-name.st-deleted {
  color: var(--danger, #ff453a);
  font-weight: 560;
}
.gm-file-name.st-added-dirty {
  color: var(--accent, #0a84ff);
  font-weight: 560;
}
.gm-file-name.st-added {
  color: var(--success, #30d158);
  font-weight: 560;
}
.gm-file-name.st-ignored,
.gm-dir-name.st-ignored {
  color: var(--st-ignored, #a2845e);
  font-weight: 560;
}
.gm-file-row.gm-dir-row.st-ignored svg,
.gm-file-row:has(.gm-dir-name.st-ignored) svg {
  color: var(--st-ignored, #a2845e) !important;
}
.gm-file-name.st-conflict {
  color: var(--conflict, #bf5af2);
  font-weight: 560;
}
.gm-file-name.st-renamed {
  color: var(--accent, #0071e3);
  font-weight: 560;
}
.gm-file-row.active .gm-file-name.st-not-added,
.gm-file-row.active .gm-file-name.st-untracked,
.gm-file-row.active .gm-file-name.st-deleted {
  color: var(--danger, #ff453a);
}
.gm-file-row.active .gm-file-name.st-added-dirty {
  color: var(--accent, #0a84ff);
}
.gm-file-row.active .gm-file-name.st-added {
  color: var(--success, #30d158);
}
.gm-file-row.active .gm-file-name.st-ignored {
  color: var(--st-ignored, #a2845e);
}
.gm-file-row.active .gm-file-name.st-conflict {
  color: var(--conflict, #bf5af2);
}
.gm-file-row.active .gm-file-name.st-renamed {
  color: var(--accent, #0071e3);
}
.gm-file-st-label {
  margin-left: auto;
  color: var(--fg-secondary);
  font-size: 10px;
  flex-shrink: 0;
  white-space: nowrap;
}
.gm-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Dot fills only — never apply to filename text */
.gm-dot.st-not-added,
.gm-dot.st-untracked,
.gm-dot.st-deleted { background: var(--danger, #ff453a); }
.gm-dot.st-added-dirty { background: var(--accent, #0a84ff); }
.gm-dot.st-added { background: var(--success, #30d158); }
.gm-dot.st-ignored { background: var(--st-ignored, #a2845e); }
.gm-dot.st-conflict { background: var(--conflict, #bf5af2); }
.gm-dot.st-renamed { background: var(--accent, #0071e3); }

.gm-diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100%;
  min-height: 0;
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.gm-diff-pane {
  overflow: auto;
  min-width: 0;
}
.gm-diff-pane + .gm-diff-pane {
  border-left: 1px solid var(--separator);
}
.gm-diff-header {
  padding: 6px 12px;
  border-bottom: 1px solid var(--separator);
  background: var(--bg-elevated);
  color: var(--fg-secondary);
  font-family: var(--font-sans);
  font-size: 11px;
  position: sticky;
  top: 0;
}
.gm-line {
  display: grid;
  grid-template-columns: 44px 16px 1fr;
  min-height: 18px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-all;
}
.gm-line .ln {
  text-align: right;
  padding-right: 8px;
  color: var(--fg-tertiary);
  user-select: none;
}
.gm-line .sign {
  text-align: center;
  color: var(--fg-tertiary);
}
.gm-line.add {
  background: color-mix(in srgb, var(--added, #34c759) 16%, transparent);
}
.gm-line.del {
  background: color-mix(in srgb, var(--deleted, #ff3b30) 14%, transparent);
}
.gm-line.meta {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--fg-secondary);
}
.gm-empty {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--fg-secondary);
  padding: 24px;
  text-align: center;
}
.gm-commit {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--separator);
}
.gm-commit:hover { background: var(--bg-hover); }
.gm-commit.active { background: var(--accent-soft); }
.gm-commit .subject {
  font-weight: 560;
  font-size: 12.5px;
  letter-spacing: -0.01em;
}
.gm-commit .meta {
  color: var(--fg-secondary);
  font-size: 11px;
  margin-top: 2px;
}
.gm-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  min-width: 220px;
  max-height: 280px;
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--separator);
  border-radius: 12px;
  box-shadow: var(--shadow-md);
  z-index: 50;
  padding: 6px;
}
.gm-dropdown button {
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
}
.gm-dropdown button:hover { background: var(--bg-hover); }
.gm-dropdown button.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.gm-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.28);
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}
.gm-modal {
  width: min(520px, 100%);
  background: var(--bg-elevated);
  border: 1px solid var(--separator);
  border-radius: 16px;
  box-shadow: var(--shadow-md);
  overflow: hidden;
}
.gm-modal-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--separator);
  font-weight: 600;
}
.gm-modal-body {
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: min(70vh, 560px);
  overflow: auto;
}
.gm-modal-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--separator);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.gm-field label {
  display: block;
  font-size: 11px;
  color: var(--fg-secondary);
  margin-bottom: 4px;
}
.gm-field input,
.gm-field textarea,
.gm-field select {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--separator);
  background: var(--bg);
  padding: 8px 10px;
  outline: none;
}
.gm-field input:focus,
.gm-field textarea:focus,
.gm-field select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.gm-field textarea {
  min-height: 88px;
  resize: vertical;
}
.gm-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gm-chip {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--bg-hover);
  border: 1px solid var(--separator);
  font-size: 11px;
}
.gm-chip.on {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  color: var(--accent);
}
.gm-rel {
  position: relative;
}
.gm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gm-path {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--fg-secondary);
  padding: 4px 12px;
  border-bottom: 1px solid var(--separator);
}
.gm-splitter {
  width: 5px;
  cursor: col-resize;
  background: transparent;
  position: relative;
  z-index: 3;
}
.gm-splitter::after {
  content: '';
  position: absolute;
  inset: 0 2px;
  background: transparent;
}
.gm-splitter:hover::after,
.gm-splitter:active::after {
  background: var(--accent);
  opacity: 0.35;
}
.gm-splitter.vertical {
  width: 100%;
  height: 5px;
  cursor: row-resize;
}
.gm-splitter.vertical::after {
  inset: 2px 0;
}
.gm-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--separator);
  background: var(--bg-hover);
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.gm-toggle input {
  accent-color: var(--accent);
}
.gm-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--separator);
  background: var(--bg-elevated);
  height: 38px;
  min-height: 38px;
  max-height: 38px;
  overflow: visible;
  flex-wrap: nowrap;
  white-space: nowrap;
  min-width: 0;
  width: 100%;
}
.gm-tabs-list {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  height: 100%;
}
.gm-tabs-chrome {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  position: relative;
  z-index: 5;
}
.gm-tabs-menu {
  top: calc(100% + 8px);
  z-index: 30;
}
.gm-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: 8px;
}
.gm-menu-icon {
  display: inline-flex;
  width: 16px;
  justify-content: center;
  color: var(--fg-secondary);
  flex-shrink: 0;
}
.gm-menu-danger .gm-menu-icon {
  color: var(--danger, #ff453a);
}
.gm-menu-danger {
  color: var(--danger, #ff453a) !important;
}
.gm-menu-danger:hover {
  background: color-mix(in srgb, var(--danger) 12%, transparent) !important;
}

.gm-context-menu {
  position: fixed;
  z-index: 200;
}
.gm-settings-page {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 28px 32px;
  display: flex;
  justify-content: center;
}
.gm-settings-card {
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gm-settings-card h2 {
  margin: 0;
  font-size: 16px;
  letter-spacing: -0.02em;
}
.gm-settings-desc {
  margin: 0;
  color: var(--fg-secondary);
  font-size: 12px;
}
.gm-settings-page .gm-field input {
  max-width: 280px;
}

.gm-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 150;
}
.gm-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px 5px 12px;
  border-radius: 8px;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  color: var(--fg-secondary);
  flex: 0 0 auto;
  min-width: 120px;
  max-width: 220px;
  overflow: hidden;
}
.gm-tab-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}
.gm-tab:hover {
  background: var(--bg-hover);
}
.gm-tab.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.gm-tab-close {
  opacity: 0.55;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.gm-tab-close:hover {
  opacity: 1;
  color: var(--danger);
}
.gm-tab-empty {
  color: var(--fg-secondary);
  font-size: 11px;
  padding: 0 8px;
  flex-shrink: 0;
}
.gm-mode-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--fg-secondary);
  padding: 0 8px;
}
.gm-tab-overflow-list {
  display: none;
}
.gm-unified {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
}
.gm-unified .gm-line {
  grid-template-columns: 48px 16px 1fr;
  min-height: 18px;
  line-height: 18px;
  white-space: pre-wrap;
  word-break: break-all;
}

.gm-file-content .gm-line {
  grid-template-columns: 48px 12px 1fr;
}
@media (prefers-reduced-motion: reduce) {
  .gm-root * { transition: none !important; animation: none !important; }
}
`

export function ensurePluginStyle(): void {
  if (document.getElementById('devdash-git-manager-css')) return
  const el = document.createElement('style')
  el.id = 'devdash-git-manager-css'
  el.textContent = pluginCss
  document.head.appendChild(el)
}
