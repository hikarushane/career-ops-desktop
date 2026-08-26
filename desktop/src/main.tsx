import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Self-hosted per DESIGN.md §3.2 ("Load weights 400, 500, 600, and 700") —
// bundled via @fontsource so the app renders correctly fully offline, same
// as every other career-ops data path.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./theme.css";
import "./app.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
