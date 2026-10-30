import type { ReactNode } from "react";

/** Action hierarchy. Never two buttons of equal weight in one group. */
export const BTN_PRIMARY = "inline-flex items-center justify-center gap-2 cursor-pointer bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] font-medium rounded-full px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--accent)]";
export const BTN_SECONDARY = "inline-flex items-center justify-center gap-2 cursor-pointer bg-[var(--glass)] border border-[var(--glass-line)] text-[var(--text)] hover:bg-[rgba(175,178,206,.24)] font-medium rounded-full px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[var(--glass)]";
export const BTN_TERTIARY = "cursor-pointer text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--wash-1)] rounded-full px-3 py-2 flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed";

/** Data identifier or dollar figure in a table or inline context. */
const ID = "font-mono tabular-nums text-[13px] leading-5 font-normal text-[var(--soft)] bg-[var(--wash-2)] rounded-md px-1.5 py-0.5";
export function Id({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `${ID} ${className}` : ID}>{children}</span>;
}
