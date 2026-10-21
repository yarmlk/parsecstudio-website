import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./site/site.css";
import "./app.css";
import { App } from "./App";

/* Kharkiv Tone: Latin and figures only (its Cyrillic is not used; Cyrillic falls through to Geist). */
try {
  const url = new URL("fonts/kharkiv-tone.woff2", document.baseURI).href;
  const face = new FontFace("Kharkiv Tone", `url(${url}) format("woff2")`, {
    weight: "400", display: "swap",
    unicodeRange: "U+0021-007E, U+00A0-00FF, U+2010-2027, U+2032-2033, U+2190-2193, U+2212",
  });
  face.load().then((f) => document.fonts.add(f)).catch(() => {});
} catch { /* FontFace unsupported */ }

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
