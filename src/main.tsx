import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fallback">
          <div className="callout danger" style={{ maxWidth: 520 }}>
            <strong>TerraPulse hit an unexpected error.</strong>
            <p style={{ marginTop: 6 }}>{this.state.error.message}</p>
            <p style={{ marginTop: 6 }}>
              <button className="btn sm" onClick={() => location.reload()}>
                Reload
              </button>
            </p>
          </div>
        </div>
      );
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  // StrictMode is not used: its dev-only double mount creates and destroys two WebGL maps back to back.
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
