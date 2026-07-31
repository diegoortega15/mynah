import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Catches render-time errors so a single broken screen doesn't blank the whole app.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="center">
          <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
            <h1>Ops, algo quebrou 😕</h1>
            <p className="muted">Um erro inesperado aconteceu nesta tela.</p>
            <p className="error small">{String(this.state.error?.message || this.state.error)}</p>
            <button className="primary" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
