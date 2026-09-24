import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted (DESIGN.md §11.9 asks for Geist). Fontsource ships woff2 from npm, so there
// is no Google Fonts request and no layout shift from a third-party stylesheet.
import "@fontsource/geist-sans/400.css";
import "@fontsource/geist-sans/500.css";
import "@fontsource/geist-sans/600.css";
import "@fontsource/geist-sans/700.css";
import "@fontsource/geist-mono/500.css";
import "@fontsource/geist-mono/600.css";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
