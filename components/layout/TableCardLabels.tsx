"use client";

import { useEffect } from "react";

/**
 * On phones, tables marked `table-cards` are rendered as stacked cards (see
 * globals.css). This copies each table's column headers onto the body/footer
 * cells as `data-label` so the CSS can show "Column: value" per cell — no need
 * to hand-annotate every <TableCell>. Re-runs as rows load (MutationObserver).
 */
export function TableCardLabels() {
  useEffect(() => {
    const label = () => {
      document.querySelectorAll("table.table-cards").forEach((table) => {
        const heads = Array.from(table.querySelectorAll("thead th")).map(
          (th) => (th as HTMLElement).innerText.trim()
        );
        if (heads.length === 0) return;
        table.querySelectorAll("tbody tr, tfoot tr").forEach((tr) => {
          const cells = tr.querySelectorAll<HTMLTableCellElement>("td");
          // A single full-width cell is an empty-state / "no rows" message.
          if (cells.length <= 1) {
            tr.classList.add("table-cards-plain");
            return;
          }
          tr.classList.remove("table-cards-plain");
          cells.forEach((td, i) => {
            if (heads[i] && td.getAttribute("data-label") !== heads[i]) {
              td.setAttribute("data-label", heads[i]);
            }
          });
        });
      });
    };

    label();
    const obs = new MutationObserver(() => label());
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  return null;
}
