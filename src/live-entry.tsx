import React, { useCallback, useState } from "react";
import { type EntryFeed, usePagedRows } from "./paging";
import { db } from "./cloud";
export function LiveEntry({
  id,
  feed,
  className,
  children,
}: {
  id: string;
  feed: EntryFeed | null;
  className: string;
  children: React.ReactNode;
}) {
  const bind = useCallback(
    (node: HTMLElement | null) => feed?.observe(node, id),
    [feed, id],
  );
  return (
    <article ref={bind} className={className}>
      {children}
    </article>
  );
}
export function Participants({
  circle,
  item,
  legacy,
  notify,
}: {
  circle: string;
  item: string;
  legacy: Record<string, number>;
  notify: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const page = usePagedRows(
    db,
    open ? `circles/${circle}/entries/${item}/actors` : null,
    undefined,
    (e) => notify(e.message),
  );
  const ids = new Set(page.rows.map((r) => r.id));
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>누가 함께했나요?</summary>
      <ul className="participation-list">
        {page.rows.map((r) => (
          <li key={r.id}>
            {r.name} · {r.count}회
          </li>
        ))}
        {Object.entries(legacy)
          .filter(([id]) => !ids.has(id))
          .map(([id, n]) => (
            <li key={id}>기존 참여 기록 · {n}회</li>
          ))}
      </ul>
      {page.more && (
        <button
          className="secondary"
          disabled={page.loading}
          onClick={page.loadMore}
        >
          참여 기록 더 보기
        </button>
      )}
    </details>
  );
}
