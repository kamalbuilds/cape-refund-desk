import type { ReactNode } from "react";

/** Action hierarchy. Never two buttons of equal weight in one group. */
export const BTN_PRIMARY = "inline-flex items-center justify-center gap-2 cursor-pointer bg-zinc-900 text-white hover:bg-zinc-800 font-medium rounded-lg px-4 py-2.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-zinc-900";
export const BTN_SECONDARY = "inline-flex items-center justify-center gap-2 cursor-pointer bg-white border border-zinc-300 text-zinc-900 hover:bg-zinc-50 font-medium rounded-lg px-4 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white";
export const BTN_TERTIARY = "cursor-pointer text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg px-3 py-2 flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed";

/** Data identifier or dollar figure in a table or inline context. */
const ID = "font-mono tabular-nums text-[13px] leading-5 font-normal text-zinc-700 bg-zinc-100 rounded-md px-1.5 py-0.5";
export function Id({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `${ID} ${className}` : ID}>{children}</span>;
}
