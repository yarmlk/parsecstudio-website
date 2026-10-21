import type { CSSProperties, ReactNode } from "react";
import type { L } from "../lib/types";

/**
 * The AI spectrum (page 4.3): our light, Ember, split into five colours, warm to cool.
 * The only multi-hue thing in the brand, and only where we talk about AI production.
 * Static, with fine grain; the line draws once with the light when it appears. Forms:
 *   "line"   the cut, split: dividers, the underline of an AI heading, the top edge of an AI card
 *   "pill"   the badge that holds "AI": lists, tabs, case cards
 *   "field"  fills its box: one AI card or tile, never the whole frame
 * Tokens: --ai-1 … --ai-5, --ai-line, --ai-field, --ai-ink (styles/tokens.css).
 */
export function AiFlux({ form = "line", children, className, style }: { form?: "pill" | "line" | "field"; children?: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span className={`ai-flux ai-flux--${form}${className ? ` ${className}` : ""}`} style={style} aria-hidden={children ? undefined : true}>
      <span className="ai-flux__paint" />
      <span className="ai-flux__grain" />
      {children !== undefined && <span className="ai-flux__label">{children}</span>}
    </span>
  );
}

/* ── The same values as plain CSS, for copying out of the book (decks, sites, Figma, AE) ── */
export interface AiStop { token: string; name: string; hex: string; note: L }
export const AI_STOPS: AiStop[] = [
  { token: "--ai-1", name: "Ember", hex: "#F6C88C", note: { en: "Our light, where it splits", uk: "Наше світло, звідки розклад" } },
  { token: "--ai-2", name: "Rose", hex: "#F0A98E", note: { en: "Warm", uk: "Тепле" } },
  { token: "--ai-3", name: "Violet", hex: "#C9A0DC", note: { en: "The middle", uk: "Середина" } },
  { token: "--ai-4", name: "Blue", hex: "#93B1D6", note: { en: "Cool", uk: "Холодне" } },
  { token: "--ai-5", name: "Mint", hex: "#9FD6CC", note: { en: "The far end", uk: "Дальній край" } },
];
const [a1, a2, a3, a4, a5] = AI_STOPS.map((s) => s.hex.toLowerCase());

export const AI_LINE_CSS =
  `/* AI line: 2px, the cut split */\nheight: 2px;\nborder-radius: 2px;\nbackground: linear-gradient(90deg, transparent, ${a1} 12%, ${a2} 30%, ${a3} 50%, ${a4} 70%, ${a5} 88%, transparent);\nbox-shadow: 0 0 14px 1px rgba(201, 160, 220, .3);`;

const FIELD_BG =
  `radial-gradient(34% 120% at 8% 55%, ${a1} 0%, transparent 70%),\n    radial-gradient(30% 130% at 30% 35%, ${a2} 0%, transparent 70%),\n    radial-gradient(30% 130% at 52% 65%, ${a3} 0%, transparent 70%),\n    radial-gradient(30% 130% at 74% 40%, ${a4} 0%, transparent 70%),\n    radial-gradient(28% 120% at 95% 60%, ${a5} 0%, transparent 70%),\n    linear-gradient(90deg, rgba(246, 200, 140, .55), rgba(240, 169, 142, .55) 25%, rgba(201, 160, 220, .55) 50%, rgba(147, 177, 214, .55) 75%, rgba(159, 214, 204, .55)),\n    #1b1b20`;

export const AI_FIELD_CSS =
  `/* AI field: one card or tile. Soften with blur(7px) on the layer; fine grain on top (overlay, 55%) */\nbackground:\n    ${FIELD_BG};`;

export const AI_BADGE_CSS =
  `/* AI badge */\nheight: 22px;\npadding: 0 10px;\nborder-radius: 999px;\nfont: 500 10px/1 "Geist Mono", monospace;\nletter-spacing: .16em;\ntext-transform: uppercase;\ncolor: #0b0b0d;\nbackground:\n    ${FIELD_BG};`;
