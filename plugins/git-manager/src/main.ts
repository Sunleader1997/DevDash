/** Optional plugin main-process entry. */
export default {
  id: 'git-manager',
  async activate(): Promise<void> {
    // Git services are provided by the host IPC; nothing to register here.
  },
  async deactivate(): Promise<void> {
    /* noop */
  }
}
