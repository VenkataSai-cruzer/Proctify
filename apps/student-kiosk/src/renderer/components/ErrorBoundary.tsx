// ============================================================
// SecureAssess Student Kiosk — React ErrorBoundary
// A thrown render error used to leave an empty #root (blank screen). The
// kiosk now shows the failure instead, and the message reaches main.log via
// the main process `console-message` listener.
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
    console.error("[kiosk] Unhandled UI error:", error, info.componentStack);
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
          background: "#F8FAFC",
          color: "#0F172A",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: "760px",
            width: "100%",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            background: "#FFFFFF",
            padding: "24px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "18px", color: "#B91C1C" }}>
            Exam client error — contact the invigilator
          </h1>
          <p style={{ margin: "8px 0 16px", fontSize: "14px", color: "#475569" }}>
            Your session is not lost. Show this message to the exam supervisor,
            who can export the diagnostic log from the teacher console.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "12px",
              lineHeight: 1.6,
              background: "#F1F5F9",
              border: "1px solid #E2E8F0",
              borderRadius: "8px",
              padding: "12px",
              maxHeight: "300px",
              overflow: "auto",
              color: "#7F1D1D",
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
              border: "1px solid #CBD5E1",
              background: "#F8FAFC",
              color: "#0F172A",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}
