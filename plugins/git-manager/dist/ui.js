const host$2 = globalThis.DevDashHost;
const React$1 = host$2.React;
const Fragment = React$1.Fragment;
function jsx(type, props, key) {
  const p = props ?? {};
  const finalProps = key !== void 0 ? { ...p, key } : p;
  return React$1.createElement(type, finalProps);
}
function jsxs(type, props, key) {
  return jsx(type, props, key);
}
const host$1 = globalThis.DevDashHost;
const React = host$1.React;
const useState = React.useState;
const useEffect = React.useEffect;
const useMemo = React.useMemo;
const useRef = React.useRef;
const useCallback = React.useCallback;
React.Fragment;
React.createElement;
React.StrictMode;
React.Children;
React.cloneElement;
React.isValidElement;
const host = globalThis.DevDashHost;
function invoke(channel, ...args) {
  return host.ipc.invoke(channel, ...args);
}
const api = {
  pickDirectory: () => invoke("fs:pick-directory"),
  findRepos: (root, maxDepth) => invoke("git:find-repos", root, maxDepth),
  repoInfo: (repoPath) => invoke("git:repo-info", repoPath),
  status: (repoPath) => invoke("git:status", repoPath),
  listFiles: (repoPath) => invoke("git:list-files", repoPath),
  addPaths: (repoPath, paths) => invoke("git:add", repoPath, paths),
  commit: (repoPath, message, paths) => invoke("git:commit", repoPath, message, paths),
  push: (repoPath, remote, ref) => invoke("git:push", repoPath, remote, ref),
  pull: (repoPath, remote, branch) => invoke("git:pull", repoPath, remote, branch),
  unpushed: (repoPath) => invoke("git:unpushed", repoPath),
  branches: (repoPath) => invoke("git:branches", repoPath),
  checkout: (repoPath, branch) => invoke("git:checkout", repoPath, branch),
  log: (repoPath, limit, skip) => invoke("git:log", repoPath, limit, skip),
  diffFiles: (repoPath, range) => invoke("git:diff-files", repoPath, range),
  workingDiffFiles: (repoPath) => invoke("git:working-diff-files", repoPath),
  diffFilePatch: (repoPath, filePath, range) => invoke("git:diff-file-patch", repoPath, filePath, range),
  commitFiles: (repoPath, commitHash) => invoke("git:commit-files", repoPath, commitHash),
  fileAtRef: (repoPath, ref, filePath) => invoke("git:file-at-ref", repoPath, ref, filePath),
  gitlabSettings: () => invoke("gitlab:settings:get"),
  saveGitlabSettings: (s) => invoke("gitlab:settings:save", s),
  gitlabMembers: (s) => invoke("gitlab:members", s),
  createMr: (s, payload) => invoke("gitlab:create-mr", s, payload),
  getMrCache: (repoPath) => invoke("mr-config:get", repoPath),
  saveMrCache: (repoPath, cache) => invoke("mr-config:save", repoPath, cache),
  storeRead: (projectPath) => invoke("store:read", projectPath),
  storePatch: (projectPath, partial) => invoke("store:patch", projectPath, partial),
  readFile: (filePath, opts) => invoke("fs:read-text-file", filePath, opts),
  probeFile: (filePath) => invoke("fs:probe-file", filePath),
  settingsGet: () => invoke("settings:get"),
  settingsSave: (partial) => invoke("settings:save", partial),
  settingsAddExt: (ext) => invoke("settings:add-whitelist-ext", ext),
  tasks: (id, label, fn) => {
    const host2 = globalThis.DevDashHost;
    return host2.tasks.run(id, label, fn);
  }
};
const pluginCss = `
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
  padding: 2px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-soft);
  color: var(--accent);
  border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  opacity: 0;
  flex-shrink: 0;
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
`;
function ensurePluginStyle() {
  if (document.getElementById("devdash-git-manager-css")) return;
  const el = document.createElement("style");
  el.id = "devdash-git-manager-css";
  el.textContent = pluginCss;
  document.head.appendChild(el);
}
function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}
function statusClass(s) {
  return `st-${s}`;
}
function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 6e4);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return d.toLocaleDateString();
}
function newBranchName(repoPath) {
  const base = repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "repo";
  const slug = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const now = /* @__PURE__ */ new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `feature/${slug}-${y}${m}${d}`;
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function IconPlus() {
  return /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: /* @__PURE__ */ jsx("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" }) });
}
function IconMr() {
  return /* @__PURE__ */ jsxs("svg", { width: "15", height: "15", viewBox: "0 0 16 16", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx("circle", { cx: "4.5", cy: "3.5", r: "1.5", fill: "currentColor" }),
    /* @__PURE__ */ jsx("circle", { cx: "4.5", cy: "12.5", r: "1.5", fill: "currentColor" }),
    /* @__PURE__ */ jsx("circle", { cx: "11.5", cy: "3.5", r: "1.5", fill: "currentColor" }),
    /* @__PURE__ */ jsx("path", { d: "M4.5 5v6M11.5 5v1.5a3 3 0 0 1-3 3H6", stroke: "currentColor", strokeWidth: "1.4", fill: "none", strokeLinecap: "round" }),
    /* @__PURE__ */ jsx("path", { d: "M7.2 8.2L5.5 9.9l1.7 1.7", stroke: "currentColor", strokeWidth: "1.4", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" })
  ] });
}
function IconBranch() {
  return /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx("circle", { cx: "5", cy: "4", r: "1.6", fill: "currentColor" }),
    /* @__PURE__ */ jsx("circle", { cx: "5", cy: "12", r: "1.6", fill: "currentColor" }),
    /* @__PURE__ */ jsx("circle", { cx: "11", cy: "4", r: "1.6", fill: "currentColor" }),
    /* @__PURE__ */ jsx("path", { d: "M5 5.6v4.8M11 5.6v1.2a3 3 0 0 1-3 3H6.5", stroke: "currentColor", strokeWidth: "1.3", fill: "none" })
  ] });
}
function IconCompare() {
  return /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx("rect", { x: "2", y: "3", width: "5", height: "10", rx: "1", stroke: "currentColor", strokeWidth: "1.2", fill: "none" }),
    /* @__PURE__ */ jsx("rect", { x: "9", y: "3", width: "5", height: "10", rx: "1", stroke: "currentColor", strokeWidth: "1.2", fill: "none" })
  ] });
}
function IconChevron({ open }) {
  return /* @__PURE__ */ jsx(
    "svg",
    {
      className: "gm-tree-chevron",
      width: "12",
      height: "12",
      viewBox: "0 0 12 12",
      "aria-hidden": true,
      style: { transform: open ? "rotate(90deg)" : "none" },
      children: /* @__PURE__ */ jsx("path", { d: "M4 2l4 4-4 4", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" })
    }
  );
}
function IconFolder({ open }) {
  return /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: open ? /* @__PURE__ */ jsx(
    "path",
    {
      d: "M2 4.5h4l1.2 1.2H14v6.3H2V4.5z",
      fill: "currentColor",
      opacity: "0.25",
      stroke: "currentColor",
      strokeWidth: "1.1"
    }
  ) : /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M2 4h4.2l1.2 1.2H14v7.3H2V4z", fill: "currentColor", opacity: "0.2", stroke: "currentColor", strokeWidth: "1.1" }),
    /* @__PURE__ */ jsx("path", { d: "M2 6h12", stroke: "currentColor", strokeWidth: "1", opacity: "0.5" })
  ] }) });
}
function IconFile() {
  return /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx(
      "path",
      {
        d: "M4 2h5.5L12 4.5V14H4V2z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.2"
      }
    ),
    /* @__PURE__ */ jsx("path", { d: "M9 2v3h3", fill: "none", stroke: "currentColor", strokeWidth: "1.2" })
  ] });
}
const DEFAULT_SIZES = {
  sideWidth: 260,
  leftWidth: 280,
  historyHeight: 180
};
function loadProjects() {
  try {
    const raw = localStorage.getItem("devdash.git-manager.projects");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveProjects(list) {
  localStorage.setItem("devdash.git-manager.projects", JSON.stringify(list));
}
function Splitter({
  vertical,
  onDelta
}) {
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const onPointerDown = (e) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId ?? 1);
    } catch {
    }
  };
  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };
    onDelta(dx, dy);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: vertical ? "gm-splitter vertical" : "gm-splitter",
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp
    }
  );
}
function GitManagerApp() {
  ensurePluginStyle();
  const [projects, setProjects] = useState(() => loadProjects());
  const [expanded, setExpanded] = useState({});
  const [reposByProject, setReposByProject] = useState({});
  const [activeRepo, setActiveRepo] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [toast, setToast] = useState(null);
  const [sideWidth, setSideWidth] = useState(DEFAULT_SIZES.sideWidth);
  const [projMenu, setProjMenu] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const showToast = useCallback((text, error) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => {
    saveProjects(projects);
  }, [projects]);
  const addProject = async () => {
    const dir = await api.pickDirectory();
    if (!dir) return;
    if (projects.some((p) => p.path === dir)) {
      showToast("该项目已添加");
      return;
    }
    const rec = {
      id: `${dir}`,
      name: dir.replace(/\\/g, "/").split("/").filter(Boolean).pop() || dir,
      path: dir
    };
    void api.tasks("project-init", `初始化 ${rec.name}`, async () => {
      await api.storeRead(rec.path);
      return true;
    }).catch(() => void 0);
    setProjects((prev) => [...prev, rec]);
    setExpanded((prev) => ({ ...prev, [rec.id]: true }));
    void scanProject(rec);
  };
  const scanProject = async (project) => {
    try {
      const repos = await api.tasks(
        `scan-${project.id}`,
        `扫描 ${project.name}`,
        () => api.findRepos(project.path, 3)
      );
      setReposByProject((prev) => ({ ...prev, [project.id]: repos }));
    } catch (e) {
      showToast(e.message, true);
    }
  };
  const removeProject = (id) => {
    const project = projects.find((p) => p.id === id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setReposByProject((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (project && activeRepo && activeRepo.path.startsWith(project.path)) {
      setActiveRepo(null);
      setActiveProject(null);
    }
  };
  const pinProject = (id) => {
    setProjects((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target) return prev;
      const rest = prev.filter((p) => p.id !== id);
      return [{ ...target, pinned: true }, ...rest];
    });
    setProjMenu(null);
  };
  const startRename = (id) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    setRenamingId(id);
    setRenameDraft(p.name);
    setProjMenu(null);
  };
  const commitRename = () => {
    if (!renamingId) return;
    const name = renameDraft.trim();
    if (name) {
      setProjects((prev) => prev.map((p) => p.id === renamingId ? { ...p, name } : p));
    }
    setRenamingId(null);
  };
  const openRepo = async (project, repoPath) => {
    try {
      const info = await api.repoInfo(repoPath);
      setActiveRepo(info);
      setActiveProject(project);
    } catch (e) {
      showToast(e.message, true);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "gm-root", style: { gridTemplateColumns: `${sideWidth}px 5px 1fr` }, children: [
    /* @__PURE__ */ jsxs("aside", { className: "gm-side", children: [
      /* @__PURE__ */ jsxs("div", { className: "gm-side-header", children: [
        /* @__PURE__ */ jsx("div", { className: "gm-side-title", children: "项目" }),
        /* @__PURE__ */ jsx("button", { className: "gm-btn icon", title: "添加项目", "aria-label": "添加项目", onClick: () => void addProject(), children: /* @__PURE__ */ jsx(IconPlus, {}) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-tree", children: [
        [...projects].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).map((p) => {
          const open = expanded[p.id];
          const repos = reposByProject[p.id];
          return /* @__PURE__ */ jsxs("div", { style: { marginBottom: 6 }, children: [
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "gm-row",
                style: { cursor: "default" },
                onContextMenu: (e) => {
                  var _a, _b;
                  (_a = e.preventDefault) == null ? void 0 : _a.call(e);
                  (_b = e.stopPropagation) == null ? void 0 : _b.call(e);
                  setProjMenu({
                    id: p.id,
                    x: e.clientX ?? 0,
                    y: e.clientY ?? 0
                  });
                },
                children: /* @__PURE__ */ jsxs(
                  "button",
                  {
                    className: "gm-row",
                    style: { width: "auto", flex: 1, padding: 0, background: "transparent" },
                    onClick: () => {
                      if (renamingId === p.id) return;
                      setExpanded((prev) => ({ ...prev, [p.id]: !open }));
                      if (!repos) void scanProject(p);
                    },
                    children: [
                      /* @__PURE__ */ jsx("span", { className: "gm-chevron", children: open ? "▾" : "▸" }),
                      renamingId === p.id ? /* @__PURE__ */ jsx(
                        "input",
                        {
                          autoFocus: true,
                          value: renameDraft,
                          onChange: (e) => setRenameDraft(e.target.value),
                          onBlur: commitRename,
                          onKeyDown: (e) => {
                            const key = e.key;
                            if (key === "Enter") commitRename();
                            if (key === "Escape") setRenamingId(null);
                          },
                          onClick: (e) => {
                            var _a;
                            return (_a = e.stopPropagation) == null ? void 0 : _a.call(e);
                          },
                          style: {
                            width: "100%",
                            padding: "2px 6px",
                            borderRadius: 6,
                            border: "1px solid var(--accent)",
                            background: "var(--bg)"
                          }
                        }
                      ) : /* @__PURE__ */ jsxs(Fragment, { children: [
                        /* @__PURE__ */ jsx("span", { style: { fontWeight: 560 }, children: p.name }),
                        p.pinned && /* @__PURE__ */ jsx("span", { title: "已置顶", style: { opacity: 0.7 }, children: "📌" }),
                        /* @__PURE__ */ jsx("span", { className: "muted", title: p.path, children: p.path.length > 28 ? `…${p.path.slice(-28)}` : p.path })
                      ] })
                    ]
                  }
                )
              }
            ),
            open && /* @__PURE__ */ jsxs("div", { style: { paddingLeft: 14 }, children: [
              !repos && /* @__PURE__ */ jsx("div", { style: { padding: "6px 8px", color: "var(--fg-secondary)" }, children: "扫描中…" }),
              (repos == null ? void 0 : repos.length) === 0 && /* @__PURE__ */ jsx("div", { style: { padding: "6px 8px", color: "var(--fg-secondary)" }, children: "未发现 Git 仓库" }),
              repos == null ? void 0 : repos.map((r) => /* @__PURE__ */ jsxs(
                "button",
                {
                  className: cx("gm-row", (activeRepo == null ? void 0 : activeRepo.path) === r && "active"),
                  onClick: () => void openRepo(p, r),
                  title: r,
                  children: [
                    /* @__PURE__ */ jsx("span", { className: "gm-chevron", children: "·" }),
                    /* @__PURE__ */ jsx("span", { children: r.replace(/\\/g, "/").split("/").pop() })
                  ]
                },
                r
              ))
            ] })
          ] }, p.id);
        }),
        projects.length === 0 && /* @__PURE__ */ jsx("div", { style: { padding: 12, color: "var(--fg-secondary)" }, children: "选择目录以扫描 Git 仓库；配置写入 .devDash/。右键项目可重命名/置顶/移除。" })
      ] })
    ] }),
    /* @__PURE__ */ jsx(
      Splitter,
      {
        onDelta: (dx) => setSideWidth((w) => Math.min(420, Math.max(180, w + dx)))
      }
    ),
    /* @__PURE__ */ jsx("section", { className: "gm-main", children: activeRepo ? /* @__PURE__ */ jsx(
      RepoWorkspace,
      {
        repo: activeRepo,
        project: activeProject,
        onChanged: (info) => setActiveRepo(info),
        onToast: showToast
      }
    ) : /* @__PURE__ */ jsx("div", { className: "gm-empty", children: /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: 600, marginBottom: 8 }, children: "Git 管理" }),
      /* @__PURE__ */ jsx("div", { children: "添加项目并选择仓库后，可查看分支、变更、历史与 MR。" })
    ] }) }) }),
    projMenu && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "gm-menu-backdrop",
          onClick: () => setProjMenu(null),
          onContextMenu: (e) => {
            var _a;
            (_a = e.preventDefault) == null ? void 0 : _a.call(e);
            setProjMenu(null);
          }
        }
      ),
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "gm-dropdown gm-context-menu",
          style: { left: projMenu.x, top: projMenu.y, minWidth: 140 },
          children: [
            /* @__PURE__ */ jsx("button", { onClick: () => startRename(projMenu.id), children: "重命名" }),
            /* @__PURE__ */ jsx("button", { onClick: () => pinProject(projMenu.id), children: "置顶" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: () => {
                  removeProject(projMenu.id);
                  setProjMenu(null);
                },
                children: "移除"
              }
            )
          ]
        }
      )
    ] }),
    toast && /* @__PURE__ */ jsx("div", { className: `toast${toast.error ? " error" : ""}`, children: toast.text })
  ] });
}
function RepoWorkspace({
  repo,
  project,
  onChanged,
  onToast
}) {
  const [view, setView] = useState("files");
  const [branches, setBranches] = useState([]);
  const [branchOpen, setBranchOpen] = useState(false);
  const [status, setStatus] = useState([]);
  const [files, setFiles] = useState([]);
  const [treeExpanded, setTreeExpanded] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [opened, setOpened] = useState(null);
  const [commitMode, setCommitMode] = useState(false);
  const [commitChecked, setCommitChecked] = useState(/* @__PURE__ */ new Set());
  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [commits, setCommits] = useState([]);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [commitFiles, setCommitFiles] = useState([]);
  const [commitTreeExpanded, setCommitTreeExpanded] = useState({});
  const [mrOpen, setMrOpen] = useState(false);
  const [sizes, setSizes] = useState(DEFAULT_SIZES);
  const [hydrated, setHydrated] = useState(false);
  const statusByPath = useMemo(() => {
    const map = /* @__PURE__ */ new Map();
    for (const s of status) map.set(s.path, s.status);
    const isIgnored = (p) => map.get(p) === "ignored";
    const dirToFiles = /* @__PURE__ */ new Map();
    for (const f of files) {
      const parts = f.split("/");
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join("/");
        const list = dirToFiles.get(dir);
        if (list) list.push(f);
        else dirToFiles.set(dir, [f]);
      }
    }
    for (const [dir, list] of dirToFiles) {
      if (isIgnored(dir)) {
        for (const f of list) map.set(f, "ignored");
        continue;
      }
      if (list.length > 0 && list.every((f) => isIgnored(f))) {
        map.set(dir, "ignored");
      }
    }
    for (const f of files) {
      const parts = f.split("/");
      for (let i = 0; i < parts.length - 1; i++) {
        const prefix = parts.slice(0, i + 1).join("/");
        if (map.get(prefix) === "ignored") {
          map.set(f, "ignored");
          break;
        }
      }
    }
    return map;
  }, [status, files]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(project == null ? void 0 : project.path)) {
        setHydrated(true);
        return;
      }
      try {
        const state = await api.storeRead(project.path);
        const key = `repo:${repo.path}`;
        const saved = state[key] ?? {};
        if (cancelled) return;
        if (saved.view) setView(saved.view);
        if (saved.treeExpanded) setTreeExpanded(saved.treeExpanded);
        if (saved.sizes) setSizes({ ...DEFAULT_SIZES, ...saved.sizes });
        if (saved.selectedFile) {
          setSelectedFile(saved.selectedFile);
          void openFile(saved.selectedFile, true);
        }
        if (saved.selectedCommit) setSelectedCommit({ hash: saved.selectedCommit, shortHash: saved.selectedCommit.slice(0, 7), subject: "", authorName: "", authorEmail: "", date: "" });
      } catch {
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project == null ? void 0 : project.path, repo.path]);
  const persistRef = useRef(0);
  useEffect(() => {
    if (!hydrated || !(project == null ? void 0 : project.path)) return;
    window.clearTimeout(persistRef.current);
    persistRef.current = window.setTimeout(() => {
      const payload = {
        view,
        treeExpanded,
        sizes,
        selectedFile,
        selectedCommit: selectedCommit == null ? void 0 : selectedCommit.hash
      };
      void api.storePatch(project.path, { [`repo:${repo.path}`]: payload }).catch(() => void 0);
    }, 300);
    return () => window.clearTimeout(persistRef.current);
  }, [hydrated, project == null ? void 0 : project.path, repo.path, view, treeExpanded, sizes, selectedFile, selectedCommit]);
  const refreshBranches = async () => {
    try {
      setBranches(await api.branches(repo.path));
    } catch (e) {
      onToast(e.message, true);
    }
  };
  const refreshStatus = async () => {
    try {
      const list = await api.tasks(`status-${repo.path}`, "刷新状态", () => api.status(repo.path));
      setStatus(list);
      setFiles(await api.listFiles(repo.path));
      onChanged(await api.repoInfo(repo.path));
    } catch (e) {
      onToast(e.message, true);
    }
  };
  const refreshLog = async () => {
    try {
      setCommits(await api.log(repo.path, 50, 0));
    } catch (e) {
      onToast(e.message, true);
    }
  };
  useEffect(() => {
    void refreshBranches();
    void refreshStatus();
    void refreshLog();
  }, [repo.path]);
  const loadPatch = async (filePath, force = false) => {
    repo.path.replace(/\\/g, "/") + "/" + filePath;
    try {
      return await api.diffFilePatch(repo.path, filePath);
    } catch (e) {
      throw e;
    }
  };
  const openFromCommit = (file) => {
    setSelectedFile(file.path);
    setOpened({
      path: file.path,
      label: file.path.split("/").pop() ?? file.path,
      status: mapDiffStatus(file),
      patch: file.patch || ""
    });
    if (!file.patch) {
      void api.diffFilePatch(
        repo.path,
        file.path,
        selectedCommit ? `${selectedCommit.hash}^..${selectedCommit.hash}` : void 0
      ).then((patch) => {
        setOpened(
          (prev) => prev && prev.path === file.path ? { ...prev, patch } : prev
        );
      }).catch((e) => onToast(e.message, true));
    }
  };
  const openFile = async (filePath, silent = false) => {
    setSelectedFile(filePath);
    try {
      const openedFile = await api.tasks(`open-${filePath}`, `打开 ${filePath.split("/").pop()}`, async () => {
        const abs = repo.path.replace(/\\/g, "/") + "/" + filePath;
        const st = statusByPath.get(filePath);
        const probe = await api.probeFile(abs);
        if (!probe.exists) {
          return {
            path: filePath,
            label: filePath.split("/").pop() ?? filePath,
            status: st,
            patch: "",
            block: { kind: "error", message: "文件不存在或不可读" }
          };
        }
        if (probe.binary) {
          return {
            path: filePath,
            label: filePath.split("/").pop() ?? filePath,
            status: st,
            patch: "",
            block: {
              kind: "binary",
              size: probe.size,
              message: "检测到二进制内容",
              ext: probe.ext
            }
          };
        }
        if (!probe.whitelisted) {
          return {
            path: filePath,
            label: filePath.split("/").pop() ?? filePath,
            status: st,
            patch: "",
            block: {
              kind: "whitelist",
              size: probe.size,
              ext: probe.ext,
              message: "不在文本打开白名单中"
            }
          };
        }
        if (probe.tooLarge) {
          return {
            path: filePath,
            label: filePath.split("/").pop() ?? filePath,
            status: st,
            patch: "",
            block: {
              kind: "size",
              size: probe.size,
              message: `超过 ${probe.maxFileSizeMb} MB 限制`,
              ext: probe.ext
            }
          };
        }
        const patch = await loadPatch(filePath);
        return {
          path: filePath,
          label: filePath.split("/").pop() ?? filePath,
          status: st,
          patch
        };
      });
      setOpened(openedFile);
    } catch (e) {
      if (!silent) onToast(e.message, true);
      setOpened({
        path: filePath,
        label: filePath.split("/").pop() ?? filePath,
        patch: "",
        block: { kind: "error", message: e.message }
      });
    }
  };
  const forceOpen = async (addToWhitelist) => {
    if (!opened) return;
    const filePath = opened.path;
    if (addToWhitelist) {
      const ext = filePath.includes(".") ? filePath.split(".").pop() || "" : "";
      if (ext) await api.settingsAddExt(ext);
    }
    await api.tasks(`force-${filePath}`, `强制打开 ${opened.label}`, () => openFile(filePath));
  };
  const openCommit = async (commit) => {
    setSelectedCommit(commit);
    try {
      const files2 = await api.tasks(
        `commit-${commit.hash}`,
        `加载提交变更 ${commit.shortHash}`,
        () => api.commitFiles(repo.path, commit.hash)
      );
      setCommitFiles(files2);
    } catch (e) {
      setCommitFiles([]);
      onToast(e.message, true);
    }
  };
  const switchBranch = async (name) => {
    try {
      await api.tasks(`checkout-${name}`, `切换分支 ${name}`, () => api.checkout(repo.path, name));
      setBranchOpen(false);
      await refreshBranches();
      await refreshStatus();
      onToast(`已切换到 ${name}`);
    } catch (e) {
      onToast(e.message, true);
    }
  };
  const commitableFiles = useMemo(() => {
    return files.filter((f) => {
      const st = statusByPath.get(f);
      return st && st !== "clean" && st !== "ignored";
    });
  }, [files, statusByPath]);
  const allChecked = commitableFiles.length > 0 && commitableFiles.every((f) => commitChecked.has(f));
  const toggleCommit = (path) => {
    setCommitChecked((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const toggleAllCommit = () => {
    setCommitChecked(allChecked ? /* @__PURE__ */ new Set() : new Set(commitableFiles));
  };
  const runCommit = async (opts) => {
    const paths = commitableFiles.filter((f) => commitChecked.has(f));
    if (!commitMsg.trim()) {
      onToast("请输入 commit message", true);
      return false;
    }
    if (paths.length === 0) {
      onToast("请勾选要提交的文件", true);
      return false;
    }
    setCommitting(true);
    try {
      await api.tasks("commit", "提交变更", () => api.commit(repo.path, commitMsg.trim(), paths));
      onToast("提交成功");
      setCommitMsg("");
      setCommitChecked(/* @__PURE__ */ new Set());
      setCommitMode(false);
      await refreshStatus();
      await refreshLog();
      if (opts == null ? void 0 : opts.thenPush) setPushOpen(true);
      return true;
    } catch (e) {
      onToast(e.message, true);
      return false;
    } finally {
      setCommitting(false);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("header", { className: "gm-titlebar", children: [
      /* @__PURE__ */ jsx("div", { className: "gm-title", children: repo.name }),
      /* @__PURE__ */ jsxs("div", { className: "gm-rel", children: [
        /* @__PURE__ */ jsxs("button", { className: "gm-btn icon", title: repo.branch || "detached", onClick: () => setBranchOpen((v) => !v), children: [
          /* @__PURE__ */ jsx(IconBranch, {}),
          /* @__PURE__ */ jsx("span", { children: repo.branch || "HEAD" }),
          /* @__PURE__ */ jsx("span", { style: { opacity: 0.5, fontSize: 10 }, children: "▾" })
        ] }),
        branchOpen && /* @__PURE__ */ jsx("div", { className: "gm-dropdown", children: branches.map((b) => /* @__PURE__ */ jsxs(
          "button",
          {
            className: cx(b.name === repo.branch && "active"),
            onClick: () => void switchBranch(b.name),
            children: [
              b.current ? "✓ " : "",
              b.name
            ]
          },
          b.name
        )) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-seg", children: [
        /* @__PURE__ */ jsx("button", { className: cx(view === "files" && "active"), onClick: () => setView("files"), children: "文件" }),
        /* @__PURE__ */ jsx("button", { className: cx(view === "history" && "active"), onClick: () => setView("history"), children: "历史" }),
        /* @__PURE__ */ jsx("button", { className: cx(view === "settings" && "active"), onClick: () => setView("settings"), children: "设置" })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "gm-spacer" }),
      /* @__PURE__ */ jsx(
        "button",
        {
          className: "gm-btn icon primary",
          title: "一键 MR",
          "aria-label": "一键 MR",
          onClick: () => setMrOpen(true),
          children: /* @__PURE__ */ jsx(IconMr, {})
        }
      )
    ] }),
    view === "settings" ? /* @__PURE__ */ jsx(ToolSettingsPage, { onToast }) : /* @__PURE__ */ jsxs(
      "div",
      {
        className: "gm-body",
        style: { gridTemplateColumns: `${sizes.leftWidth}px 5px minmax(0, 1fr)` },
        children: [
          /* @__PURE__ */ jsx("div", { className: "gm-panel", children: view === "files" ? /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsxs("div", { className: "gm-panel-header gm-panel-header-row", children: [
              /* @__PURE__ */ jsx("span", { children: "文件目录" }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4 }, children: [
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "gm-btn icon",
                    title: "拉取 Pull",
                    "aria-label": "Pull",
                    onClick: () => {
                      void api.tasks("pull", "git pull", () => api.pull(repo.path)).then(() => {
                        onToast("拉取成功");
                        return Promise.all([refreshStatus(), refreshBranches(), refreshLog()]);
                      }).catch((e) => onToast(e.message, true));
                    },
                    children: /* @__PURE__ */ jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: [
                      /* @__PURE__ */ jsx("path", { d: "M8 3v9M4.5 8.5L8 12l3.5-3.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
                      /* @__PURE__ */ jsx("path", { d: "M3 3h10", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
                    ] })
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "gm-btn icon",
                    title: "推送 Push",
                    "aria-label": "Push",
                    onClick: () => setPushOpen(true),
                    children: /* @__PURE__ */ jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: [
                      /* @__PURE__ */ jsx("path", { d: "M8 12V3M4.5 6.5L8 3l3.5 3.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
                      /* @__PURE__ */ jsx("path", { d: "M3 13h10", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
                    ] })
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: cx("gm-btn icon", commitMode && "primary"),
                    title: "提交模式",
                    "aria-label": "Commit",
                    onClick: () => {
                      setCommitMode((v) => !v);
                      if (!commitMode) {
                        setCommitChecked(
                          new Set(
                            files.filter((f) => {
                              const st = statusByPath.get(f);
                              return st && st !== "clean" && st !== "ignored";
                            })
                          )
                        );
                      } else {
                        setCommitChecked(/* @__PURE__ */ new Set());
                      }
                    },
                    children: /* @__PURE__ */ jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: [
                      /* @__PURE__ */ jsx("circle", { cx: "8", cy: "8", r: "2.2", fill: "currentColor" }),
                      /* @__PURE__ */ jsx("path", { d: "M8 2v3.2M8 10.8V14", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round" })
                    ] })
                  }
                ),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "gm-btn icon",
                    title: "刷新 Git 状态",
                    "aria-label": "刷新",
                    onClick: () => {
                      void refreshStatus();
                      void refreshBranches();
                      void refreshLog();
                    },
                    children: /* @__PURE__ */ jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: [
                      /* @__PURE__ */ jsx(
                        "path",
                        {
                          d: "M13 8a5 5 0 1 1-1.5-3.5",
                          fill: "none",
                          stroke: "currentColor",
                          strokeWidth: "1.5",
                          strokeLinecap: "round"
                        }
                      ),
                      /* @__PURE__ */ jsx("path", { d: "M13 2v3h-3", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })
                    ] })
                  }
                )
              ] })
            ] }),
            commitMode ? /* @__PURE__ */ jsxs("div", { className: "gm-commit-panel", children: [
              /* @__PURE__ */ jsxs("label", { className: "gm-commit-all", children: [
                /* @__PURE__ */ jsx("input", { type: "checkbox", checked: allChecked, onChange: toggleAllCommit }),
                /* @__PURE__ */ jsx("span", { children: "全选" }),
                /* @__PURE__ */ jsxs("span", { className: "muted", children: [
                  commitChecked.size,
                  "/",
                  commitableFiles.length
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "gm-scroll", children: [
                commitableFiles.length === 0 && /* @__PURE__ */ jsx("div", { className: "gm-empty", children: "无变更文件" }),
                commitableFiles.map((f) => {
                  const st = statusByPath.get(f);
                  const name = f.split("/").pop() ?? f;
                  const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
                  return /* @__PURE__ */ jsxs("label", { className: "gm-commit-row", title: f, children: [
                    /* @__PURE__ */ jsx(
                      "input",
                      {
                        type: "checkbox",
                        checked: commitChecked.has(f),
                        onChange: () => toggleCommit(f)
                      }
                    ),
                    /* @__PURE__ */ jsx("span", { className: cx("gm-file-name", st ? statusClass(st) : ""), children: name }),
                    dir && /* @__PURE__ */ jsx("span", { className: "gm-commit-dir", children: dir })
                  ] }, f);
                })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "gm-commit-form", children: [
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    placeholder: "commit message",
                    value: commitMsg,
                    onChange: (e) => setCommitMsg(e.target.value),
                    rows: 5
                  }
                ),
                /* @__PURE__ */ jsxs("div", { className: "gm-commit-actions", children: [
                  /* @__PURE__ */ jsxs(
                    "button",
                    {
                      className: "gm-btn primary",
                      disabled: committing || !commitMsg.trim() || commitChecked.size === 0,
                      onClick: () => void runCommit(),
                      children: [
                        /* @__PURE__ */ jsx("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: /* @__PURE__ */ jsx("path", { d: "M3 8.5l3.5 3.5L13 4", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) }),
                        /* @__PURE__ */ jsx("span", { children: "commit" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "gm-btn",
                      disabled: committing || !commitMsg.trim() || commitChecked.size === 0,
                      onClick: () => void runCommit({ thenPush: true }),
                      title: "commit 后打开 push",
                      children: /* @__PURE__ */ jsx("span", { children: "commit and push" })
                    }
                  )
                ] })
              ] })
            ] }) : /* @__PURE__ */ jsx("div", { className: "gm-scroll", children: /* @__PURE__ */ jsx(
              FileTree,
              {
                files,
                statusByPath,
                selected: selectedFile,
                expanded: treeExpanded,
                onToggleDir: (dir) => setTreeExpanded((prev) => ({ ...prev, [dir]: !(prev[dir] ?? false) })),
                onSelect: (p) => void openFile(p),
                onAdd: (p) => {
                  void api.addPaths(repo.path, [p]).then(() => {
                    onToast(`已 add ${p}`);
                    return refreshStatus();
                  }).catch((e) => onToast(e.message, true));
                }
              }
            ) })
          ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("div", { className: "gm-panel-header", children: "提交历史" }),
            /* @__PURE__ */ jsxs("div", { className: "gm-scroll", style: { maxHeight: sizes.historyHeight }, children: [
              commits.map((c) => /* @__PURE__ */ jsxs(
                "button",
                {
                  className: cx("gm-commit", (selectedCommit == null ? void 0 : selectedCommit.hash) === c.hash && "active"),
                  onClick: () => void openCommit(c),
                  title: "单击选中并加载变更文件",
                  children: [
                    /* @__PURE__ */ jsx("div", { className: "subject", children: c.subject }),
                    /* @__PURE__ */ jsxs("div", { className: "meta", children: [
                      c.shortHash,
                      " · ",
                      c.authorName,
                      " · ",
                      formatTime(c.date)
                    ] })
                  ]
                },
                c.hash
              )),
              commits.length === 0 && /* @__PURE__ */ jsx("div", { className: "gm-empty", children: "暂无提交" })
            ] }),
            /* @__PURE__ */ jsx(Splitter, { vertical: true, onDelta: (_dx, dy) => setSizes((s) => ({
              ...s,
              historyHeight: Math.min(480, Math.max(120, s.historyHeight + dy))
            })) }),
            /* @__PURE__ */ jsxs("div", { className: "gm-panel-header", children: [
              "变更文件",
              selectedCommit ? ` · ${selectedCommit.shortHash}` : ""
            ] }),
            /* @__PURE__ */ jsx("div", { className: "gm-scroll", children: /* @__PURE__ */ jsx(
              FileTree,
              {
                files: commitFiles.map((f) => f.path),
                statusByPath: new Map(commitFiles.map((f) => [f.path, mapDiffStatus(f)])),
                selected: selectedFile,
                expanded: commitTreeExpanded,
                onToggleDir: (dir) => setCommitTreeExpanded((prev) => ({ ...prev, [dir]: !(prev[dir] ?? false) })),
                onSelect: (p) => {
                  const f = commitFiles.find((c) => c.path === p);
                  if (f) openFromCommit(f);
                },
                showStatusLabel: true,
                defaultOpen: true
              }
            ) })
          ] }) }),
          /* @__PURE__ */ jsx(
            Splitter,
            {
              onDelta: (dx) => setSizes((s) => ({ ...s, leftWidth: Math.min(480, Math.max(180, s.leftWidth + dx)) }))
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "gm-panel", children: [
            /* @__PURE__ */ jsx("div", { className: "gm-panel-header", children: opened ? `变更比对 · ${opened.path}` : "文件变更" }),
            /* @__PURE__ */ jsx("div", { className: "gm-scroll", style: { height: "100%" }, children: (opened == null ? void 0 : opened.block) ? /* @__PURE__ */ jsx(FileBlocked, { tab: opened, onForce: (add) => void forceOpen(add) }) : opened ? /* @__PURE__ */ jsx(UnifiedDiff, { patch: opened.patch || "" }) : /* @__PURE__ */ jsx("div", { className: "gm-empty", children: view === "files" ? "点击左侧文件查看变更比对" : "单击提交加载变更文件，再点击文件查看" }) })
          ] })
        ]
      }
    ),
    mrOpen && /* @__PURE__ */ jsx(MrPanel, { repo, branches, onClose: () => setMrOpen(false), onToast }),
    pushOpen && /* @__PURE__ */ jsx(
      PushPanel,
      {
        repo,
        defaultBranch: repo.branch || "master",
        onClose: () => setPushOpen(false),
        onToast,
        onPushed: () => {
          void refreshStatus();
          void refreshLog();
        }
      }
    )
  ] });
}
function PushPanel({
  repo,
  defaultBranch,
  onClose,
  onToast,
  onPushed
}) {
  const [branch, setBranch] = useState(defaultBranch);
  const [remote, setRemote] = useState("origin");
  const [commits, setCommits] = useState([]);
  const [pushing, setPushing] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        setCommits(await api.unpushed(repo.path));
      } catch {
        setCommits([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [repo.path]);
  const doPush = async () => {
    if (!branch.trim()) {
      onToast("请填写目标分支", true);
      return;
    }
    setPushing(true);
    try {
      await api.tasks(
        "push",
        `push → ${branch}`,
        () => api.push(repo.path, remote.trim() || "origin", `HEAD:refs/heads/${branch.trim()}`)
      );
      onToast("推送成功");
      onPushed == null ? void 0 : onPushed();
      onClose();
    } catch (e) {
      onToast(e.message, true);
    } finally {
      setPushing(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "gm-modal-backdrop", onClick: onClose, children: /* @__PURE__ */ jsxs("div", { className: "gm-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-header", children: [
      "Push · ",
      repo.name
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "待推送 commit" }),
        /* @__PURE__ */ jsxs("div", { className: "gm-push-list", children: [
          loading && /* @__PURE__ */ jsx("div", { className: "muted", children: "加载中…" }),
          !loading && commits.length === 0 && /* @__PURE__ */ jsx("div", { className: "muted", children: "没有待推送的提交（或无远程跟踪）" }),
          commits.map((c) => /* @__PURE__ */ jsxs("div", { className: "gm-push-item", children: [
            /* @__PURE__ */ jsx("code", { children: c.shortHash }),
            /* @__PURE__ */ jsx("span", { children: c.subject }),
            /* @__PURE__ */ jsx("span", { className: "muted", children: c.authorName })
          ] }, c.hash))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "Remote" }),
        /* @__PURE__ */ jsx("input", { value: remote, onChange: (e) => setRemote(e.target.value), placeholder: "origin" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "目标分支" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: branch,
            onChange: (e) => setBranch(e.target.value),
            placeholder: "默认当前分支"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-footer", children: [
      /* @__PURE__ */ jsx("button", { className: "gm-btn", onClick: onClose, children: "取消" }),
      /* @__PURE__ */ jsxs("button", { className: "gm-btn primary", disabled: pushing, onClick: () => void doPush(), children: [
        /* @__PURE__ */ jsxs("svg", { width: "13", height: "13", viewBox: "0 0 16 16", "aria-hidden": true, children: [
          /* @__PURE__ */ jsx("path", { d: "M8 12V3M4.5 6.5L8 3l3.5 3.5", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }),
          /* @__PURE__ */ jsx("path", { d: "M3 13h10", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
        ] }),
        /* @__PURE__ */ jsx("span", { children: pushing ? "推送中…" : "Push" })
      ] })
    ] })
  ] }) });
}
function FileBlocked({
  tab,
  onForce
}) {
  const [addWl, setAddWl] = useState(true);
  const block = tab.block;
  const canForce = block.kind === "whitelist" || block.kind === "size" || block.kind === "binary";
  return /* @__PURE__ */ jsx("div", { className: "gm-empty", style: { display: "grid", placeItems: "center", height: "100%" }, children: /* @__PURE__ */ jsxs("div", { style: { maxWidth: 420, textAlign: "center" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { fontWeight: 600, marginBottom: 8 }, children: [
      block.kind === "whitelist" && "无法直接打开",
      block.kind === "size" && "文件过大",
      block.kind === "binary" && "二进制文件",
      block.kind === "error" && "打开失败"
    ] }),
    /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-secondary)", marginBottom: 12, wordBreak: "break-all" }, children: tab.path }),
    typeof block.size === "number" && /* @__PURE__ */ jsxs("div", { style: { marginBottom: 8, fontFamily: "var(--font-mono, monospace)" }, children: [
      "文件大小：",
      formatBytes(block.size),
      block.kind === "size" ? `（${block.message}）` : ""
    ] }),
    block.kind === "whitelist" && /* @__PURE__ */ jsxs("div", { style: { color: "var(--fg-secondary)", marginBottom: 12 }, children: [
      block.message,
      block.ext ? `（.${block.ext}）` : ""
    ] }),
    block.kind === "error" && /* @__PURE__ */ jsx("div", { style: { color: "var(--danger)", marginBottom: 12 }, children: block.message }),
    canForce && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs(
        "label",
        {
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 14,
            fontSize: 12,
            cursor: "pointer"
          },
          children: [
            /* @__PURE__ */ jsx("input", { type: "checkbox", checked: addWl, onChange: (e) => setAddWl(e.target.checked) }),
            "并加入白名单"
          ]
        }
      ),
      /* @__PURE__ */ jsxs("button", { className: "gm-btn primary", title: "以文本强制打开", onClick: () => onForce(addWl), children: [
        /* @__PURE__ */ jsx(IconCompare, {}),
        /* @__PURE__ */ jsx("span", { children: "强制打开" })
      ] })
    ] })
  ] }) });
}
function ToolSettingsPage({
  onToast
}) {
  const [whitelist, setWhitelist] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [maxMb, setMaxMb] = useState(10);
  const [draftExt, setDraftExt] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const s = await api.settingsGet();
        setWhitelist(s.textWhitelist);
        setDefaults(s.defaultWhitelist);
        setMaxMb(s.maxFileSizeMb);
      } catch (e) {
        onToast(e.message, true);
      }
    })();
  }, []);
  const save = async () => {
    try {
      await api.settingsSave({
        textWhitelist: whitelist,
        maxFileSizeMb: Math.max(1, Math.min(200, maxMb))
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2e3);
      onToast("设置已保存");
    } catch (e) {
      onToast(e.message, true);
    }
  };
  const addExt = () => {
    const e = draftExt.trim().replace(/^\./, "").toLowerCase();
    if (!e || whitelist.includes(e)) return;
    setWhitelist((prev) => [...prev, e]);
    setDraftExt("");
  };
  return /* @__PURE__ */ jsx("div", { className: "gm-settings-page", children: /* @__PURE__ */ jsxs("div", { className: "gm-settings-card", children: [
    /* @__PURE__ */ jsx("h2", { children: "Git 工具设置" }),
    /* @__PURE__ */ jsx("p", { className: "gm-settings-desc", children: "配置文本直接打开策略；超限或非白名单文件可强制以文本打开。" }),
    /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
      /* @__PURE__ */ jsx("label", { children: "文本直接打开白名单（扩展名 / 文件名）" }),
      /* @__PURE__ */ jsx("div", { className: "gm-chips", style: { marginBottom: 8 }, children: whitelist.map((e) => /* @__PURE__ */ jsxs(
        "button",
        {
          type: "button",
          className: "gm-chip on",
          title: "点击移除",
          onClick: () => setWhitelist((prev) => prev.filter((x) => x !== e)),
          children: [
            e,
            " ×"
          ]
        },
        e
      )) }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            value: draftExt,
            placeholder: "添加扩展名，如 jsonc",
            onChange: (e) => setDraftExt(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") addExt();
            }
          }
        ),
        /* @__PURE__ */ jsx("button", { className: "gm-btn", onClick: addExt, children: "添加" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
      /* @__PURE__ */ jsx("label", { children: "预置样式" }),
      /* @__PURE__ */ jsxs("div", { className: "gm-chips", children: [
        /* @__PURE__ */ jsx("button", { type: "button", className: "gm-chip", onClick: () => setWhitelist([...defaults]), children: "重置为预置" }),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: "gm-chip",
            onClick: () => setWhitelist((prev) => [.../* @__PURE__ */ new Set([...prev, ...defaults])]),
            children: "合并预置"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
      /* @__PURE__ */ jsx("label", { children: "最大直接打开文件大小（MB）" }),
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "number",
          min: 1,
          max: 200,
          value: maxMb,
          onChange: (e) => setMaxMb(Number(e.target.value) || 10)
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { color: "var(--fg-secondary)", fontSize: 11, marginTop: 4 }, children: "超过此大小会提示确认，可强制以文本打开。默认 10 MB。" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 }, children: [
      /* @__PURE__ */ jsxs("button", { className: "gm-btn primary", title: "保存设置", onClick: () => void save(), children: [
        /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", "aria-hidden": true, children: [
          /* @__PURE__ */ jsx(
            "path",
            {
              d: "M3 3h8l2 2v8H3V3z",
              fill: "none",
              stroke: "currentColor",
              strokeWidth: "1.3"
            }
          ),
          /* @__PURE__ */ jsx("path", { d: "M5 3v4h6V3M5 13v-4h6v4", fill: "none", stroke: "currentColor", strokeWidth: "1.3" })
        ] }),
        /* @__PURE__ */ jsx("span", { children: "保存" })
      ] }),
      saved && /* @__PURE__ */ jsx("span", { style: { color: "var(--success)", fontSize: 12 }, children: "OK" })
    ] })
  ] }) });
}
function mapDiffStatus(f) {
  if (f.patch.includes("new file")) return "added";
  if (f.patch.includes("deleted file")) return "deleted";
  if (f.additions > 0 && f.deletions === 0 && !f.patch.includes("new file")) return "added-dirty";
  return "added-dirty";
}
function foldDirChain(d) {
  let cur = d;
  while (cur.dirs.length === 1 && cur.files.length === 0) {
    const child = cur.dirs[0];
    cur = {
      name: `${cur.name}/${child.name}`,
      path: child.path,
      dirs: child.dirs,
      files: child.files
    };
  }
  return {
    ...cur,
    dirs: cur.dirs.map(foldDirChain)
  };
}
function buildTree(filePaths) {
  const root = { name: "", path: "", dirs: [], files: [] };
  for (const file of filePaths) {
    const parts = file.split("/");
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i];
      const rel = parts.slice(0, i + 1).join("/");
      let next = node.dirs.find((d) => d.name === name);
      if (!next) {
        next = { name, path: rel, dirs: [], files: [] };
        node.dirs.push(next);
      }
      node = next;
    }
    node.files.push(file);
  }
  const sortNode = (n) => {
    n.dirs.sort((a, b) => a.name.localeCompare(b.name));
    n.files.sort((a, b) => a.localeCompare(b));
    n.dirs.forEach(sortNode);
  };
  sortNode(root);
  return {
    ...root,
    dirs: root.dirs.map(foldDirChain)
  };
}
function FileTree({
  files,
  statusByPath,
  selected,
  expanded,
  onToggleDir,
  onSelect,
  showStatusLabel,
  defaultOpen,
  onAdd
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const canAdd = (st) => st === "untracked" || st === "not-added" || st === "deleted";
  const renderDir = (dir, depth, isRoot = false) => {
    const open = isRoot ? true : expanded[dir.path] ?? defaultOpen ?? false;
    const pad = 4 + depth * 14;
    return /* @__PURE__ */ jsxs("div", { children: [
      dir.name ? (() => {
        const dirSt = statusByPath.get(dir.path);
        return /* @__PURE__ */ jsxs(
          "button",
          {
            className: cx(
              "gm-file-row gm-dir-row",
              dirSt === "ignored" && "st-ignored"
            ),
            style: { paddingLeft: pad },
            onClick: () => onToggleDir(dir.path),
            title: dir.path,
            children: [
              /* @__PURE__ */ jsx("span", { className: "gm-tree-gutter", children: /* @__PURE__ */ jsx(IconChevron, { open }) }),
              /* @__PURE__ */ jsx(IconFolder, { open }),
              /* @__PURE__ */ jsx(
                "span",
                {
                  className: cx(
                    "gm-dir-name",
                    dirSt ? statusClass(dirSt) : ""
                  ),
                  children: dir.name
                }
              ),
              onAdd && canAdd(dirSt) && /* @__PURE__ */ jsx(
                "button",
                {
                  className: "gm-row-add",
                  title: "git add",
                  onClick: (e) => {
                    var _a;
                    (_a = e.stopPropagation) == null ? void 0 : _a.call(e);
                    onAdd(dir.path);
                  },
                  children: /* @__PURE__ */ jsx(IconPlus, {})
                }
              )
            ]
          }
        );
      })() : null,
      open && /* @__PURE__ */ jsxs(Fragment, { children: [
        dir.dirs.map((d) => renderDir(d, dir.name ? depth + 1 : 0, false)),
        dir.files.map((f) => {
          const base = f.split("/").pop() ?? f;
          const st = statusByPath.get(f);
          return /* @__PURE__ */ jsxs(
            "button",
            {
              className: cx("gm-file-row", selected === f && "active"),
              style: { paddingLeft: pad + (dir.name ? 14 : 0) },
              onClick: () => onSelect(f),
              title: f,
              children: [
                /* @__PURE__ */ jsx("span", { className: "gm-tree-gutter", "aria-hidden": true, children: " " }),
                /* @__PURE__ */ jsx(IconFile, {}),
                /* @__PURE__ */ jsx("span", { className: cx("gm-file-name", st ? statusClass(st) : ""), children: base }),
                onAdd && canAdd(st) && /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "gm-row-add",
                    title: "git add",
                    onClick: (e) => {
                      var _a;
                      (_a = e.stopPropagation) == null ? void 0 : _a.call(e);
                      onAdd(f);
                    },
                    children: /* @__PURE__ */ jsx(IconPlus, {})
                  }
                ),
                showStatusLabel && st && st !== "clean" && /* @__PURE__ */ jsx("span", { className: "gm-file-st-label", children: statusLabel(st) })
              ]
            },
            f
          );
        })
      ] })
    ] }, dir.path || "__root__");
  };
  if (files.length === 0) return /* @__PURE__ */ jsx("div", { className: "gm-empty", children: "暂无文件" });
  return /* @__PURE__ */ jsx("div", { className: "gm-file-tree", children: renderDir(tree, 0, true) });
}
function statusLabel(s) {
  switch (s) {
    case "not-added":
    case "untracked":
      return "未add";
    case "added-dirty":
      return "已add·变更";
    case "added":
      return "已add";
    case "deleted":
      return "删除";
    case "ignored":
      return "忽略";
    case "renamed":
      return "R";
    case "conflict":
      return "C";
    default:
      return "";
  }
}
function UnifiedDiff({ patch }) {
  const rows = useMemo(() => splitPatchRows(patch), [patch]);
  return /* @__PURE__ */ jsxs("div", { className: "gm-unified", children: [
    rows.length === 0 && /* @__PURE__ */ jsx("div", { className: "gm-empty", children: "无变更内容" }),
    rows.map((row, i) => /* @__PURE__ */ jsxs("div", { className: cx("gm-line", row.kind), children: [
      /* @__PURE__ */ jsx("span", { className: "ln", children: row.ln ?? "" }),
      /* @__PURE__ */ jsx("span", { className: "sign", children: row.sign }),
      /* @__PURE__ */ jsx("span", { children: row.text })
    ] }, i))
  ] });
}
function splitPatchRows(patch) {
  const rows = [];
  if (!patch) return rows;
  const lines = patch.split("\n");
  let lnL = 0;
  let lnR = 0;
  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ")) {
      continue;
    }
    if (line.startsWith("@@")) {
      const m = /@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      lnL = Number((m == null ? void 0 : m[1]) ?? 1);
      lnR = Number((m == null ? void 0 : m[2]) ?? 1);
      rows.push({ kind: "meta", sign: "", text: line, ln: null });
      continue;
    }
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      rows.push({ kind: "meta", sign: "", text: line.slice(4), ln: null });
      continue;
    }
    if (line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("rename ")) {
      rows.push({ kind: "meta", sign: "", text: line, ln: null });
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", sign: "+", text: line.slice(1), ln: lnR++ });
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ kind: "del", sign: "−", text: line.slice(1), ln: lnL++ });
      continue;
    }
    if (line.startsWith("\\")) {
      rows.push({ kind: "meta", sign: "", text: line, ln: null });
      continue;
    }
    const text = line.startsWith(" ") ? line.slice(1) : line;
    rows.push({ kind: "", sign: "", text, ln: lnR++ });
  }
  return rows;
}
function MrPanel({
  repo,
  branches,
  onClose,
  onToast
}) {
  const [title, setTitle] = useState("");
  const [newBranch, setNewBranch] = useState(() => newBranchName(repo.path));
  const [description, setDescription] = useState("");
  const [toBranch, setToBranch] = useState(repo.branch || "main");
  const [settings, setSettings] = useState({ baseUrl: "", token: "", projectPath: "" });
  const [members, setMembers] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [reviewers, setReviewers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    void (async () => {
      var _a, _b;
      const s = await api.gitlabSettings();
      setSettings(s);
      const cache = await api.getMrCache(repo.path);
      if (cache) {
        setTitle(cache.title ?? "");
        setNewBranch(cache.newBranch ?? newBranchName(repo.path));
        setDescription(cache.description ?? "");
        setToBranch(cache.toBranch ?? repo.branch ?? "main");
        setAssignees(cache.assignees ?? []);
        setReviewers(cache.reviewers ?? []);
      } else {
        setTitle(`feature/${repo.name}`);
      }
      try {
        if (s.baseUrl && s.token && s.projectPath) {
          const list = await api.gitlabMembers(s);
          setMembers(list);
          if ((_a = cache == null ? void 0 : cache.assigneeNames) == null ? void 0 : _a.length) {
            setAssignees(
              (prev) => prev.length ? prev : list.filter((m) => cache.assigneeNames.includes(m.username)).map((m) => m.id)
            );
          }
          if ((_b = cache == null ? void 0 : cache.reviewerNames) == null ? void 0 : _b.length) {
            setReviewers(
              (prev) => prev.length ? prev : list.filter((m) => cache.reviewerNames.includes(m.username)).map((m) => m.id)
            );
          }
        }
      } catch {
        setMembers([]);
      }
    })();
  }, [repo.path]);
  const persistCache = async () => {
    await api.saveMrCache(repo.path, {
      title,
      newBranch,
      description,
      toBranch,
      assignees,
      reviewers,
      assigneeNames: members.filter((m) => assignees.includes(m.id)).map((m) => m.username),
      reviewerNames: members.filter((m) => reviewers.includes(m.id)).map((m) => m.username)
    });
  };
  const submit = async () => {
    if (!title.trim()) {
      onToast("请填写 MR 标题", true);
      return;
    }
    setSubmitting(true);
    try {
      await persistCache();
      const s = settings;
      if (!s.baseUrl || !s.token || !s.projectPath) {
        setShowSettings(true);
        onToast("请先配置 GitLab 连接信息", true);
        return;
      }
      const created = await api.tasks(
        "create-mr",
        "创建 MR",
        () => api.createMr(s, {
          source_branch: newBranch,
          target_branch: toBranch,
          title,
          description,
          assignee_ids: assignees,
          reviewer_ids: reviewers
        })
      );
      onToast(`MR 已创建 #${created.iid}`);
      onClose();
    } catch (e) {
      onToast(e.message, true);
    } finally {
      setSubmitting(false);
    }
  };
  return /* @__PURE__ */ jsx("div", { className: "gm-modal-backdrop", onClick: onClose, children: /* @__PURE__ */ jsxs("div", { className: "gm-modal", onClick: (e) => e.stopPropagation(), children: [
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-header", children: [
      "一键 MR · ",
      repo.name
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-body", children: [
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "标题" }),
        /* @__PURE__ */ jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), placeholder: "MR 标题" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "新分支（根据仓库目录生成）" }),
        /* @__PURE__ */ jsx("input", { value: newBranch, onChange: (e) => setNewBranch(e.target.value) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "目标分支" }),
        /* @__PURE__ */ jsx("select", { value: toBranch, onChange: (e) => setToBranch(e.target.value), children: [.../* @__PURE__ */ new Set([repo.branch, ...branches.map((b) => b.name), "main", "master", "develop"])].filter(Boolean).map((name) => /* @__PURE__ */ jsx("option", { value: name, children: name }, name)) })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "描述" }),
        /* @__PURE__ */ jsx(
          "textarea",
          {
            value: description,
            onChange: (e) => setDescription(e.target.value),
            placeholder: "变更说明、测试方式…"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "Assignee" }),
        /* @__PURE__ */ jsxs("div", { className: "gm-chips", children: [
          members.length === 0 && /* @__PURE__ */ jsx("span", { style: { color: "var(--fg-secondary)" }, children: "配置 GitLab 后可选择成员" }),
          members.map((m) => /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              className: cx("gm-chip", assignees.includes(m.id) && "on"),
              onClick: () => setAssignees(
                (prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
              ),
              children: m.name || m.username
            },
            m.id
          ))
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "gm-field", children: [
        /* @__PURE__ */ jsx("label", { children: "Reviewer" }),
        /* @__PURE__ */ jsx("div", { className: "gm-chips", children: members.map((m) => /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            className: cx("gm-chip", reviewers.includes(m.id) && "on"),
            onClick: () => setReviewers(
              (prev) => prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id]
            ),
            children: m.name || m.username
          },
          m.id
        )) })
      ] }),
      showSettings && /* @__PURE__ */ jsxs("div", { className: "gm-field", style: { borderTop: "1px solid var(--separator)", paddingTop: 12 }, children: [
        /* @__PURE__ */ jsx("label", { children: "GitLab 配置" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "baseUrl  https://gitlab.com",
            value: settings.baseUrl,
            onChange: (e) => setSettings((s) => ({ ...s, baseUrl: e.target.value })),
            style: { marginBottom: 8 }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "token",
            value: settings.token,
            onChange: (e) => setSettings((s) => ({ ...s, token: e.target.value })),
            style: { marginBottom: 8 }
          }
        ),
        /* @__PURE__ */ jsx(
          "input",
          {
            placeholder: "projectPath  group/repo",
            value: settings.projectPath,
            onChange: (e) => setSettings((s) => ({ ...s, projectPath: e.target.value }))
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            className: "gm-btn",
            style: { marginTop: 8 },
            onClick: async () => {
              await api.saveGitlabSettings(settings);
              try {
                setMembers(await api.gitlabMembers(settings));
                onToast("GitLab 配置已保存");
              } catch (e) {
                onToast(e.message, true);
              }
            },
            children: "保存并拉取成员"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "gm-modal-footer", children: [
      /* @__PURE__ */ jsx("button", { className: "gm-btn ghost", onClick: () => setShowSettings(true), children: "设置" }),
      /* @__PURE__ */ jsx("button", { className: "gm-btn", onClick: onClose, children: "取消" }),
      /* @__PURE__ */ jsx("button", { className: "gm-btn primary", disabled: submitting, onClick: () => void submit(), children: submitting ? "提交中…" : "创建 MR" })
    ] })
  ] }) });
}
const plugin = {
  id: "git-manager",
  title: "Git 管理",
  icon: "git-branch",
  App: GitManagerApp
};
export {
  GitManagerApp as App,
  plugin as default
};
//# sourceMappingURL=ui.js.map
