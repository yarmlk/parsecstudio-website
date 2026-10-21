import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { L, Lang } from "./types";

const KEY = "parsec-bb.lang";

function readLang(): Lang {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "en" || v === "uk") return v;
  } catch { /* storage blocked */ }
  return "en";
}

interface Ctx { lang: Lang; setLang: (l: Lang) => void; tx: (t: L | undefined) => string }
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, tx: (t) => (typeof t === "string" ? t : t?.en ?? "") });

export function txOf(t: L | undefined, lang: Lang): string {
  if (t == null) return "";
  return typeof t === "string" ? t : t[lang] ?? t.en;
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { window.localStorage.setItem(KEY, l); } catch { /* storage blocked */ }
  }, []);
  useEffect(() => { document.documentElement.lang = lang === "uk" ? "uk" : "en"; }, [lang]);
  const value = useMemo<Ctx>(() => ({ lang, setLang, tx: (t) => txOf(t, lang) }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

/** `const { tx, lang } = useLang(); tx({ en: "Logo", uk: "Лого" })` */
export const useLang = () => useContext(LangCtx);

/** Inline bilingual text: `<T en="Clear space" uk="Вільне поле" />` */
export function T({ en, uk }: { en: string; uk: string }) {
  const { lang } = useLang();
  return <>{lang === "uk" ? uk : en}</>;
}
