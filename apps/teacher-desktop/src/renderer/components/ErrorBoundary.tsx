// ============================================================
// SecureAssess Teacher Desktop — React ErrorBoundary
// A thrown render error previously left an empty #root: the packaged window
// showed nothing but the dark background. Now the failure is visible and
// actionable instead of silently blank.
// ============================================================

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
  info: string | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Lands in the DevTools console → captured by the main process
    // `console-message` listener → main.log.
    console.error("[renderer] Unhandled UI error:", error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  private reload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px",
          background: "#0B1120",
          color: "#F9FAFB",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div
          style={{
            maxWidth: "820px",
            width: "100%",
            border: "1px solid #7F1D1D",
            borderRadius: "12px",
            background: "#111827",
            padding: "24px",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "18px", color: "#FCA5A5" }}>
            Proctify hit an unexpected error
          </h1>
          <p style={{ margin: "8px 0 16px", fontSize: "13px", color: "#9CA3AF" }}>
            The console is still usable after a reload. Details were written to
            main.log (Help → Diagnostics → Export).
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: 1.6,
              background: "#0F172A",
              border: "1px solid #1F2937",
              borderRadius: "8px",
              padding: "12px",
              maxHeight: "320px",
              overflow: "auto",
              color: "#FCA5A5",
            }}
          >
            {error.stack || error.message}
            {info ? `\n\nComponent stack:${info}` : ""}
          </pre>
          <button
            onClick={this.reload}
            style={{
              marginTop: "16px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #374151",
              background: "#1F2937",
              color: "#F9FAFB",
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            Reload console
          </button>
        </div>
      </div>
    );
  }
}
