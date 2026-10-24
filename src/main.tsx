import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import "./site/site.css";
import "./app.css";
import { App } from "./App";

/* the fonts are declared in index.html (served from public/fonts) */

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
