import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Prefer re-importing the plugin module over re-rendering the same broken tree. */
  onRetry?: () => void
}
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[DevDash] render error', error, info.componentStack)
  }

  private handleRetry = (): void => {
    // Prefer re-import: parent unmounts this boundary and loads a fresh module.
    if (this.props.onRetry) {
      this.props.onRetry()
      return
    }
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="empty-state" style={{ padding: 24 }}>
          <div style={{ maxWidth: 520 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>界面渲染出错</div>
            <div style={{ color: 'var(--danger)', marginBottom: 12, wordBreak: 'break-all' }}>
              {this.state.error.message}
            </div>
            <button className="gm-btn" onClick={this.handleRetry}>
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
