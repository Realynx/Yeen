import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Yeen route crashed.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="browse-page error-boundary-page">
          <section className="error-boundary-panel">
            <p className="eyebrow">Yeen Streaming</p>
            <h1>Something went wrong.</h1>
            <p className="subline">
              This screen failed to render. Refresh the app or return home.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="accent-button"
                onClick={() => window.location.reload()}
              >
                Refresh
              </button>
              <a className="ghost-button" href="/">
                Go Home
              </a>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
