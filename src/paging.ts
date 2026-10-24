import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  startAfter,
  orderBy,
  onSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { normalize } from "./spark";
import { flagSharedError } from "./quota";
export const PAGE_SIZE = 20;
export function usePagedRows(
  db: Firestore | null,
  path: string | null,
  filter?: { field: string; value: any } | { field: string; value: any }[],
  fail: (e: Error) => void = () => {},
  orderField?: string,
) {
  const [rows, setRows] = useState<any[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const cursor = useRef<QueryDocumentSnapshot | null>(null),
    cache = useRef(new Map<string, any>()),
    active = useRef(0),
    hasPaged = useRef(false),
    inFlight = useRef(false),
    failRef = useRef(fail);
  failRef.current = fail;
  const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
  const identity = path + "|" + JSON.stringify(filter || null);
  const emit = (snap: any, advance = true) => {
    for (const d of snap.docs)
      cache.current.set(d.id, { id: d.id, ...normalize(d.data()) });
    setRows([...cache.current.values()]);
    if (advance) {
      cursor.current = snap.docs.at(-1) || cursor.current;
      setMore(snap.size === PAGE_SIZE);
    }
    setLoading(false);
  };
  useEffect(() => {
    const epoch = ++active.current;
    setRows([]);
    cache.current.clear();
    cursor.current = null;
    hasPaged.current = false;
    inFlight.current = false;
    setMore(false);
    if (!db || !path) return;
    setLoading(true);
    const constraints: QueryConstraint[] = [
      ...filters.map((f) => where(f.field, "==", f.value)),
      ...(orderField ? [orderBy(orderField, "desc")] : []),
      limit(PAGE_SIZE),
    ];
    return onSnapshot(
      query(collection(db, path), ...constraints),
      (s) => {
        if (epoch === active.current) {
          for (const change of s.docChanges())
            if (change.type === "removed") cache.current.delete(change.doc.id);
          emit(s, !hasPaged.current);
        }
      },
      (e) => {
        if (epoch === active.current) {
          setLoading(false);
          flagSharedError(e);
          failRef.current(e);
        }
      },
    );
  }, [db, identity, revision]);
  const loadMore = async () => {
    if (!db || !path || loading || inFlight.current || !more || !cursor.current)
      return;
    inFlight.current = true;
    hasPaged.current = true;
    const epoch = active.current;
    setLoading(true);
    try {
      const s = await getDocs(
        query(
          collection(db, path),
          ...filters.map((f) => where(f.field, "==", f.value)),
          ...(orderField ? [orderBy(orderField, "desc")] : []),
          startAfter(cursor.current),
          limit(PAGE_SIZE),
        ),
      );
      if (epoch === active.current) emit(s);
    } catch (e) {
      if (epoch === active.current) {
        setLoading(false);
        flagSharedError(e);
        failRef.current(e as Error);
      }
    } finally {
      if (epoch === active.current) inFlight.current = false;
    }
  };
  return {
    rows,
    more,
    loading,
    loadMore,
    refresh: () => setRevision((v) => v + 1),
  };
}
export type EntryFeed = {
  stop: () => void;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  observe: (node: HTMLElement | null, id: string) => void;
  pin: (id: string | null) => void;
};
export function pagedEntryFeed(
  db: Firestore,
  circle: string,
  uid: string,
  team: string,
  scope: string,
  director: boolean,
  fn: (entries: any[]) => void,
  meta: (v: { more: boolean; loading: boolean }) => void,
  fail: (e: Error) => void,
  legacyTeam?: string,
): EntryFeed {
  const entriesPath = legacyTeam
    ? `teams/${legacyTeam}/items`
    : `circles/${circle}/entries`;
  let alive = true,
    busy = false,
    more = true,
    cursor: QueryDocumentSnapshot | null = null,
    pinned: string | null = null;
  const values = new Map<string, any>(),
    actors = new Map<string, any>(),
    stops = new Map<string, (() => void)[]>(),
    nodes = new Map<string, HTMLElement>(),
    visible = new Set<string>();
  const emit = () => {
    if (!alive) return;
    fn(
      [...values.values()].map((e) => {
        const a = actors.get(e.id);
        return {
          ...e,
          comments: e.comments || [],
          outcomes: {
            ...(e.outcomes || {}),
            ...(a?.rating != null
              ? {
                  [uid]: {
                    rating: a.rating,
                    count: a.count,
                    completedAt: a.completedAt,
                  },
                }
              : {}),
          },
          counts: { ...(e.counts || {}), ...(a ? { [uid]: a.count } : {}) },
          lastTimes: {
            ...(e.lastTimes || {}),
            ...(a?.lastLog ? { [uid]: a.lastLog } : {}),
          },
        };
      }),
    );
  };
  const stopOne = (id: string) => {
    stops.get(id)?.forEach((s) => s());
    stops.delete(id);
  };
  const watch = (id: string) => {
    if (!alive || document.hidden || stops.has(id) || !values.has(id)) return;
    stops.set(id, [
      onSnapshot(
        doc(db, `${entriesPath}/${id}`),
        (s) => {
          if (s.exists()) {
            values.set(id, { id, ...normalize(s.data()) });
            emit();
          }
        },
        error,
      ),
      onSnapshot(
        doc(db, `${entriesPath}/${id}/actors/${uid}`),
        (s) => {
          if (s.exists()) actors.set(id, normalize(s.data()));
          emit();
        },
        error,
      ),
    ]);
  };
  function error(e: Error) {
    flagSharedError(e);
    if (!alive) return;
    for (const id of stops.keys()) stopOne(id);
    fail(e);
  }
  const observer = new IntersectionObserver(
    (changes) => {
      for (const c of changes) {
        const id = (c.target as HTMLElement).dataset.feedId!;
        if (c.isIntersecting) {
          visible.add(id);
          watch(id);
        } else {
          visible.delete(id);
          if (id !== pinned) stopOne(id);
        }
      }
    },
    { rootMargin: "0px" },
  );
  const load = async (reset = false) => {
    if (!alive || busy || (!reset && !more)) return;
    busy = true;
    meta({ more, loading: true });
    try {
      const filters: QueryConstraint[] = [];
      if (legacyTeam) {
        /* Legacy team is already scoped by its collection path. */
      } else if (director) {
        if (scope !== "all-teams")
          filters.push(
            where(
              "teamId",
              "in",
              scope === "all" ? ["all"] : ["all", scope || team],
            ),
          );
      } else filters.push(where("teamId", "in", ["all", team]));
      filters.push(orderBy("createdAt", "desc"));
      if (!reset && cursor) filters.push(startAfter(cursor));
      filters.push(limit(PAGE_SIZE));
      const s = await getDocs(query(collection(db, entriesPath), ...filters));
      const own = await Promise.all(
        s.docs.map((d) => getDoc(doc(d.ref, "actors", uid))),
      );
      if (!alive) return;
      if (reset) {
        for (const id of stops.keys()) stopOne(id);
        values.clear();
        actors.clear();
      }
      s.docs.forEach((d, i) => {
        values.set(d.id, { id: d.id, ...normalize(d.data()) });
        if (own[i].exists()) actors.set(d.id, normalize(own[i].data()));
      });
      cursor = s.docs.at(-1) || null;
      more = s.size === PAGE_SIZE;
      emit();
      for (const id of visible) watch(id);
      if (pinned) watch(pinned);
    } catch (e) {
      if (alive) error(e as Error);
    } finally {
      busy = false;
      if (alive) meta({ more, loading: false });
    }
  };
  const visibility = () => {
    if (document.hidden) {
      for (const id of stops.keys()) stopOne(id);
    } else {
      for (const id of visible) watch(id);
      if (pinned) watch(pinned);
    }
  };
  document.addEventListener("visibilitychange", visibility);
  const created = (ev: Event) => {
    if ((ev as CustomEvent).detail?.circle === circle) void load(true);
  };
  window.addEventListener("pray:new-entry", created);
  const feed: EntryFeed = {
    stop() {
      alive = false;
      observer.disconnect();
      for (const id of stops.keys()) stopOne(id);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pray:new-entry", created);
    },
    loadMore: () => load(),
    refresh: () => load(true),
    observe(node, id) {
      const old = nodes.get(id);
      if (old === node) return;
      if (old) observer.unobserve(old);
      if (node) {
        nodes.set(id, node);
        node.dataset.feedId = id;
        observer.observe(node);
      } else {
        nodes.delete(id);
        visible.delete(id);
        if (id !== pinned) stopOne(id);
      }
    },
    pin(id) {
      if (pinned && pinned !== id && !visible.has(pinned)) stopOne(pinned);
      pinned = id;
      if (id) watch(id);
    },
  };
  void load();
  return feed;
}
