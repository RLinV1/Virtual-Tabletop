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
import { loadAccount, whenThisDeviceSignsOut } from "./account/accountStore";
import { dropGuestChoice, forgetAccountSeats } from "./net/identity";
import "./styles.css";

// Who is signed in, asked once (ADR 0017 C3). Seats this device holds through the account go
// when it signs out, so a shared computer keeps no way back into anyone's rooms (M4).
void loadAccount();
whenThisDeviceSignsOut(() => forgetAccountSeats());
dropGuestChoice();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
