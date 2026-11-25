import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
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
    </BrowserRouter>
  </React.StrictMode>
);
