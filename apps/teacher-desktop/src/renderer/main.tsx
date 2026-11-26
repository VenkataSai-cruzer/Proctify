import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useAuthStore } from "./store/authStore";

import "./styles/globals.css";

// HashRouter (not BrowserRouter): packaged builds load the renderer from
// file:///.../index.html, where history-API paths (e.g. /login) do not resolve
// to a file and React renders nothing — a blank dark window.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

/**
 * The main process owns the embedded API server and may bind a different port
 * than the persisted default. Adopt its URL before the first render so the UI
 * never starts pointed at a dead port.
 */
async function syncServerUrl(): Promise<void> {
  try {
    const info = await window.electronAPI?.getServerInfo?.();
    // The main process owns the machine's role and the embedded server port,
    // so it wins over a stale value persisted in localStorage.
    const mode = info?.labMode ?? useAuthStore.getState().labMode;
    if (!info?.url) return;
    if (mode === "LAB_CLIENT") return;
    useAuthStore.getState().setServerUrl(info.url);
    if (info.labMode) useAuthStore.getState().setLabMode(info.labMode);
  } catch {
    /* fall back to the persisted URL */
  }
}

function render(): void {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <HashRouter>
            <App />
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#1F2937",
                  color: "#F9FAFB",
                  border: "1px solid #374151",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                },
              }}
            />
          </HashRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void syncServerUrl().finally(render);
