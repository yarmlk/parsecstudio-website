import type { ComponentType } from "react";

export type Lang = "en" | "uk";
/** Bilingual text. A plain string is the same in both languages (names, numbers, code). */
export type L = string | { en: string; uk: string };

export interface PageDef {
  /** Hash token, unique across the book: letters, digits and "-" only (e.g. "logo-clearspace"). */
  id: string;
  /** Short page title for the chrome, contents and search. */
  title: L;
  /**
   * "page"   — standard page: chrome on top/bottom, content in between (default).
   * "opener" — chapter opener: full-bleed image under transparent chrome.
   * "full"   — full-bleed custom page (cover, back cover).
   */
  kind?: "page" | "opener" | "full";
  /** Extra words for search. */
  keywords?: L;
  /**
   * Optional light plate behind a standard page (FINAL look: glass over light).
   * Rendered full-bleed under the page, outside the scroll, so glass cards have light behind them.
   * `dim` 0–1 darkens it (default .35); `pos` is CSS object-position.
   */
  bg?: { src: string; pos?: string; dim?: number };
  Component: ComponentType;
}

export interface ChapterDef {
  /** Folder-style id, e.g. "logo". */
  id: string;
  /** Two-digit chapter number, e.g. "03". Empty for the opening and the back. */
  num: string;
  title: L;
  /** One sentence for the opener and contents. */
  summary: L;
  /** 4K light plate for the opener (path under public/, usually img/open/*.jpg). */
  plate: string;
  /**
   * Opener composition. The title sits in the dark part of the plate, never on the light.
   * "tl" title top-left, pages in a glass card bottom-right · "tr" mirrored ·
   * "center" title centred above the light, pages as a glass row below it ·
   * "bl" title in the lower-left dark under the light ·
   * "split" title above a horizontal line, pages below it on the right.
   */
  look?: "tl" | "tr" | "bl" | "center" | "split";
  /** CSS object-position for the plate (default "50% 50%"). Also the origin for `zoom`. */
  pos?: string;
  /** Scale the plate down (e.g. .74) so the light becomes an object in the black, edges feathered. Alternates scale between openers. */
  zoom?: number;
  pages: PageDef[];
}

export interface FlatPage extends PageDef {
  index: number;
  chapter: ChapterDef;
  /** e.g. "3.2" — empty for openers and unnumbered chapters. */
  section: string;
}
