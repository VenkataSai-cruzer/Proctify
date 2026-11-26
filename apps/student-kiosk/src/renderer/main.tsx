import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/globals.css";

// HashRouter (not BrowserRouter): packaged builds load from
// file:///.../index.html, where history-API paths do not resolve to files and
// React renders nothing — a blank window.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#1E293B",
              color: "#F1F5F9",
              border: "1px solid #334155",
              fontSize: "14px",
            },
          }}
        />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
