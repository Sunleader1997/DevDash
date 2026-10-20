import GitManagerApp from './App'

const plugin = {
  id: 'git-manager',
  title: 'Git 管理',
  icon: 'git-branch',
  App: GitManagerApp
}

export default plugin
export { GitManagerApp as App }
