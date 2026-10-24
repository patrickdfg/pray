import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Leaf,
  House,
  Heart,
  Check,
  Plus,
  Users,
  ChartNoAxesCombined,
  LockKeyhole,
  ChevronRight,
  X,
  Send,
  Sparkles,
  Copy,
  Coins,
  Swords,
  Trophy,
  LogOut,
  Flower2,
  BookOpen,
  Menu,
  Settings,
  Search,
  Pencil,
  Palette,
} from "lucide-react";
import {
  type Entry,
  type Profile,
  type Person,
  type Kind,
  demoItems,
  decorations,
  ratings,
  percent,
  stats,
  logEntry,
  finishEntry,
  checkActivityLimit,
  rewardProfile,
} from "./domain";
import {
  connected,
  db,
  sessionUser,
  guestLogin,
  login,
  logout,
  watchAuth,
  command,
  watchDoc,
  watchList,
} from "./cloud";
import "./style.css";
import "./quest.css";
import "./garden.css";
import { RoomScene, RoomStudio, useRoomLayout } from "./room";
import "./room.css";
import { CirclePanel, AccountOptions, useCircle } from "./community";
import { circleCommands, watchCircleEntries } from "./circles";
import "./community.css";
import { pagedEntryFeed, usePagedRows, type EntryFeed } from "./paging";
import { LiveEntry, Participants } from "./live-entry";
import { flagSharedError } from "./quota";
const uid = () => crypto.randomUUID();
const escError = (e: unknown) => {
  flagSharedError(e);
  const messages: Record<string, string> = {
    "auth/popup-closed-by-user": "Google 로그인을 취소했어요.",
    "auth/popup-blocked": "팝업을 허용한 뒤 Google 로그인을 다시 눌러 주세요.",
    "auth/unauthorized-domain":
      "현재 주소의 Google 로그인 연결을 확인하고 있어요.",
    "auth/operation-not-allowed":
      "이 로그인 방법의 서버 설정을 적용 중이에요. 잠시 후 다시 시도해 주세요.",
    "auth/credential-already-in-use":
      "이미 다른 계정에 연결된 로그인입니다. 현재 별명 기록은 유지돼요. 새 이메일을 연결하거나 기존 계정으로 별도 로그인해 주세요.",
    "auth/invalid-credential": "이메일과 계정 비밀번호를 확인해 주세요.",
    "auth/email-already-in-use":
      "이미 가입한 이메일이에요. 새 계정 만들기를 해제하고 로그인해 주세요.",
    "auth/network-request-failed":
      "연결을 확인하고 Google 로그인을 다시 시도해 주세요.",
    "resource-exhausted":
      "무료 서비스 한도에 도달했어요. 잠시 후 다시 이용해 주세요.",
  };
  return (
    messages[(e as { code?: string })?.code || ""] ||
    (e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.")
  );
};
function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
function App() {
  const [profile, setProfile] = useState<Profile>({
    uid: connected ? "guest" : "demo",
    name: connected ? "숲 친구" : "하은",
    xp: connected ? 0 : 120,
    coins: connected ? 0 : 40,
  });
  const [legacyView, setLegacyView] = useState(false);
  const feedRef = useRef<EntryFeed | null>(null);
  const [lastLegacyItem, setLastLegacyItem] = useState("");
  const [feedMeta, setFeedMeta] = useState({ more: false, loading: false });
  const [viewScope, setViewScope] = useState("all-teams");
  const [sharingBlocked, setSharingBlocked] = useState(!navigator.onLine);
  useEffect(() => {
    const block = () => setSharingBlocked(true);
    window.addEventListener("pray:sharing-unavailable", block);
    window.addEventListener("offline", block);
    return () => {
      window.removeEventListener("pray:sharing-unavailable", block);
      window.removeEventListener("offline", block);
    };
  }, []);
  const {
    circle,
    pending: circlePending,
    directory,
  } = useCircle(profile.uid, profile.activeCircle);
  const useCommunity = !!circle && !legacyView;
  const [shareTeam, setShareTeam] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [battle, setBattle] = useState(0);
  const room = useRoomLayout(profile.uid);
  // Each prayer/task owns its own click state; other entries stay interactive.
  const recordLocks = useRef(new Set<string>());
  const [recordingIds, setRecordingIds] = useState<string[]>([]);
  const [lastRecordedId, setLastRecordedId] = useState<string | null>(null);
  const [signed, setSigned] = useState(false),
    [loaded, setLoaded] = useState(!connected);
  const [team, setTeam] = useState(""),
    [teamName, setTeamName] = useState("은혜의 숲"),
    [members, setMembers] = useState<Person[]>([]);
  const [items, setItems] = useState<Entry[]>(() =>
    connected ? [] : read("pray:demo:items", demoItems),
  );
  const [secrets, setSecrets] = useState<Entry[]>([]);
  const [tab, setTab] = useState("home"),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab]);
  const [modal, setModal] = useState<
      "new" | "invite" | "setup" | "team" | null
    >(null),
    [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(""),
    [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    body: "",
    kind: "prayer" as Kind,
    secret: false,
  });
  const [comment, setComment] = useState(""),
    [rating, setRating] = useState(5),
    [teamDraft, setTeamDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({ title: "", body: "" });
  const [inviteToken, setInviteToken] = useState(
    () => new URLSearchParams(location.search).get("invite") || "",
  );
  function notify(s: string) {
    setToast(s);
  }
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(
    () =>
      watchAuth(async (user) => {
        // Account changes must not retain another account's team/scope selection.
        setLegacyView(false);
        setShareTeam("");
        setItems([]);
        setMembers([]);
        setTeam("");
        setSigned(!!user);
        setAnonymous(!!user?.isAnonymous);
        setLoaded(true);
        setSecrets([]);
        setSelected(null);
        if (user) {
          setProfile({
            uid: user.uid,
            name: user.displayName || "숲 친구",
            xp: 0,
            coins: 0,
          });
          try {
            await command("bootstrap");
          } catch (e) {
            notify(escError(e));
          }
        } else {
          setItems([]);
          setTeam("");
          setMembers([]);
          setTeamName("나의 기도숲");
          setProfile({ uid: "guest", name: "숲 친구", xp: 0, coins: 0 });
        }
      }),
    [],
  );
  useEffect(() => {
    if (!signed) return;
    return watchDoc(
      `profiles/${profile.uid}`,
      (p) => {
        if (p) {
          setProfile(p);
          setAnonymous(p.accountKind === "guest");
          setTeam(p.activeTeam || "");
        }
      },
      (e) => notify(escError(e)),
    );
  }, [signed, profile.uid]);
  useEffect(() => {
    if (!signed || !team || useCommunity) return;
    const stops = [
      watchDoc(
        `teams/${team}`,
        (t) => {
          if (t) {
            setTeamName(t.name);
            setLastLegacyItem(t.lastItem || "");
          }
        },
        (e) => notify(escError(e)),
      ),
    ];
    return () => stops.forEach((s) => s());
  }, [signed, team, profile.uid, useCommunity]);
  const legacyMembers = usePagedRows(
    db,
    signed && team && !useCommunity ? `teams/${team}/members` : null,
    undefined,
    (e) => notify(escError(e)),
  );
  useEffect(() => {
    if (!useCommunity) setMembers(legacyMembers.rows);
  }, [useCommunity, legacyMembers.rows]);
  useEffect(() => {
    if (
      !db ||
      !signed ||
      !team ||
      useCommunity ||
      sharingBlocked ||
      filter === "secret" ||
      !["home", "prayer", "task", "archive", "stats"].includes(tab)
    )
      return;
    setItems([]);
    const f = pagedEntryFeed(
      db,
      "legacy-" + team,
      profile.uid,
      "",
      "",
      true,
      (values) =>
        setItems(
          values.map((e) => {
            const o = e.outcomes?.[profile.uid];
            return {
              ...e,
              legacyTeam: team,
              secret: false,
              totalCount: e.count,
              myCount: e.counts?.[profile.uid] || 0,
              ...(o
                ? {
                    rating: o.rating,
                    completedAt: o.completedAt,
                    count: o.count,
                  }
                : {}),
            };
          }),
        ),
      setFeedMeta,
      (e) => notify(escError(e)),
      team,
    );
    feedRef.current = f;
    return () => {
      f.stop();
      if (feedRef.current === f) feedRef.current = null;
    };
  }, [
    signed,
    team,
    useCommunity,
    sharingBlocked,
    tab,
    filter,
    profile.uid,
    lastLegacyItem,
  ]);
  useEffect(() => {
    if (
      !useCommunity ||
      !circle ||
      !db ||
      sharingBlocked ||
      filter === "secret"
    )
      return;
    if (
      circle.schema === 3 &&
      !["home", "prayer", "task", "archive", "stats"].includes(tab)
    )
      return;
    setItems([]);
    setTeamName(
      circle.teams[circle.people[profile.uid]?.team]?.name || circle.name,
    );
    const update = (values: any[]) =>
      setItems(
        values.map((e) => {
          const o = e.outcomes?.[profile.uid];
          return {
            ...e,
            circleId: circle.id,
            secret: false,
            totalCount: e.count,
            personalCompleted: !!o,
            lastLog: e.lastTimes?.[profile.uid],
            myCount: e.counts?.[profile.uid] || 0,
            ...(o
              ? { rating: o.rating, completedAt: o.completedAt, count: o.count }
              : {}),
            ...(e.closed && !o
              ? {
                  rating: e.result,
                  completedAt: e.closedAt,
                  count: e.counts?.[profile.uid] || 0,
                }
              : {}),
          };
        }),
      );
    if (circle.schema === 3) {
      if (!["home", "prayer", "task", "archive", "stats"].includes(tab)) return;
      const f = pagedEntryFeed(
        db,
        circle.id,
        profile.uid,
        circle.people[profile.uid].team,
        viewScope,
        circle.director === profile.uid,
        update,
        setFeedMeta,
        (e) => notify(escError(e)),
      );
      feedRef.current = f;
      return () => {
        f.stop();
        if (feedRef.current === f) feedRef.current = null;
      };
    }
    return watchCircleEntries(
      db,
      circle,
      profile.uid,
      (values) =>
        setItems(
          values.map((e) => {
            const o = e.outcomes?.[profile.uid];
            return {
              ...e,
              circleId: circle.id,
              secret: false,
              totalCount: e.count,
              personalCompleted: !!o,
              lastLog: e.lastTimes?.[profile.uid],
              myCount: e.counts?.[profile.uid] || 0,
              ...(o
                ? {
                    rating: o.rating,
                    completedAt: o.completedAt,
                    count: o.count,
                  }
                : {}),
              ...(e.closed && !o
                ? {
                    rating: e.result,
                    completedAt: e.closedAt,
                    count: e.counts?.[profile.uid] || 0,
                  }
                : {}),
            };
          }),
        ),
      (e) => notify(escError(e)),
    );
  }, [
    useCommunity,
    sharingBlocked,
    circle?.schema,
    circle?.lastEntry,
    viewScope,
    tab,
    filter,
    circle?.id,
    circle?.people[profile.uid]?.team,
    circle?.people[profile.uid]?.role,
    profile.uid,
  ]);
  async function sharedCommand(action: string, payload: Record<string, any>) {
    if (sharingBlocked)
      throw Error(
        "공유 연결이 잠시 중단됐어요. 비밀 기록으로 이 기기에 계속 저장할 수 있어요.",
      );
    if (useCommunity && circle && db)
      return circleCommands(db, profile.uid)(
        action === "createItem" ? "createEntry" : action,
        {
          circle: circle.id,
          schema: circle.schema || 2,
          name: circle.people[profile.uid]?.name || profile.name,
          teamId: shareTeam || circle.people[profile.uid]?.team,
          ...payload,
        },
      );
    return command(action, payload);
  }
  useEffect(() => {
    setSecrets(read(`pray:secrets:${profile.uid}`, []));
    if (!connected)
      setProfile(
        read("pray:demo:profile", {
          uid: "demo",
          name: "하은",
          xp: 120,
          coins: 40,
        }),
      );
  }, [profile.uid]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(escError(e));
    } finally {
      setBusy(false);
    }
  }
  function storeItems(next: Entry[]) {
    save("pray:demo:items", next);
    setItems(next);
  }
  function storeSecrets(next: Entry[]) {
    save(`pray:secrets:${profile.uid}`, next);
    setSecrets(next);
  }
  function reward(xp: number, coins: number) {
    const p = rewardProfile(profile, xp, coins);
    save("pray:demo:profile", p);
    setProfile(p);
  }
  async function purchase(id: string) {
    await run(async () => {
      const decoration = decorations.find((d) => d.id === id);
      if (!decoration || profile.decorations?.includes(id)) return;
      if (connected) await command("purchase", { decoration: id });
      else {
        if (profile.coins < decoration.cost)
          throw Error("코인가 조금 더 필요해요.");
        const next = {
          ...profile,
          coins: profile.coins - decoration.cost,
          decorations: [...(profile.decorations || []), id],
        };
        save("pray:demo:profile", next);
        setProfile(next);
      }
      notify("새 소품을 구매했어요! 내 방에서 배치해 보세요 🐰");
    });
  }
  const commentPage = usePagedRows(
    db,
    useCommunity && circle?.schema === 3 && selected
      ? `circles/${circle.id}/entries/${selected}/comments`
      : null,
    undefined,
    (e) => notify(escError(e)),
    "at",
  );
  useEffect(() => {
    feedRef.current?.pin(selected);
    return () => feedRef.current?.pin(null);
  }, [selected]);
  const all = [...items, ...secrets],
    statisticItems = all.filter((e) => !e.circleId || e.personalCompleted),
    summary = stats(statisticItems),
    active = all.filter((e) => e.rating == null),
    current = all.find((e) => e.id === selected);
  const myMembers =
    useCommunity && circle
      ? Object.entries(circle.people).map(([uid, p]) => ({
          uid,
          name: p.name,
          role: p.role,
          parentUid: circle.teams[p.team]?.leader,
        }))
      : connected
        ? members
        : [
            { uid: "leader", name: "은혜", role: "leader" },
            { uid: "demo", name: "하은", parentUid: "leader", role: "member" },
            {
              uid: "friend",
              name: "지우",
              parentUid: "leader",
              role: "member",
            },
          ];
  const today = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const level = Math.floor(profile.xp / 100) + 1,
    progress = profile.xp % 100;
  const todayCount = all.reduce(
    (n, e) =>
      n +
      (e.lastLog &&
      new Date(e.lastLog).toDateString() === new Date().toDateString()
        ? 1
        : 0),
    0,
  );
  const shown = all
    .filter((e) => (tab === "archive" ? e.rating != null : e.rating == null))
    .filter((e) =>
      tab === "prayer"
        ? e.kind === "prayer"
        : tab === "task"
          ? e.kind === "task"
          : true,
    )
    .filter((e) =>
      filter === "secret"
        ? e.secret
        : filter === "mine"
          ? e.author === profile.uid
          : filter === "team"
            ? !e.secret
            : true,
    )
    .filter((e) => e.title.includes(search))
    .sort((a, b) => b.createdAt - a.createdAt);
  async function add() {
    await run(async () => {
      if (!draft.title.trim()) throw Error("제목을 적어 주세요.");
      const entry: Entry = {
        id: uid(),
        ...draft,
        title: draft.title.trim(),
        body: draft.body.trim(),
        author: profile.uid,
        authorName: profile.name,
        count: 0,
        myCount: 0,
        createdAt: Date.now(),
        comments: [],
      };
      if (draft.secret) storeSecrets([...secrets, entry]);
      else if (connected) {
        if (!signed || (!team && !useCommunity))
          throw Error("Google 로그인 후 팀을 만들거나 초대에 참여해 주세요.");
        await sharedCommand("createItem", { team, ...draft });
      } else storeItems([...items, entry]);
      setModal(null);
      setDraft({ title: "", body: "", kind: "prayer", secret: false });
      notify("새 마음 심기 완료! 🎮");
    });
  }
  async function record(e: Entry) {
    // A click must only affect the exact item selected, never all list buttons.
    // Keep independent locks so another item does not look pressed/disabled.
    if (busy || recordLocks.current.has(e.id)) return;
    recordLocks.current.add(e.id);
    setRecordingIds((ids) => [...ids, e.id]);
    try {
      if (!e.secret && !connected) checkActivityLimit(profile);
      if (e.secret)
        storeSecrets(secrets.map((x) => (x.id === e.id ? logEntry(x) : x)));
      else if (connected)
        await sharedCommand("log", { team, id: e.id, eventId: uid() });
      else {
        storeItems(items.map((x) => (x.id === e.id ? logEntry(x) : x)));
        reward(10, 2);
      }
      setLastRecordedId(e.id);
      if (!e.secret) setBattle((v) => v + 1);
      notify(
        e.secret
          ? `'${e.title}' 기록을 이 기기에 저장했어요 🔒`
          : `'${e.title}' ${e.kind === "prayer" ? "기도" : "실천"} +1 · +10 XP`,
      );
    } catch (error) {
      notify(escError(error));
    } finally {
      recordLocks.current.delete(e.id);
      setRecordingIds((ids) => ids.filter((id) => id !== e.id));
    }
  }
  async function finish(e: Entry) {
    await run(async () => {
      if (!e.secret && !connected) checkActivityLimit(profile);
      if (e.secret)
        storeSecrets(
          secrets.map((x) => (x.id === e.id ? finishEntry(x, rating) : x)),
        );
      else if (connected)
        await sharedCommand("complete", { team, id: e.id, rating });
      else {
        storeItems(
          items.map((x) => (x.id === e.id ? finishEntry(x, rating) : x)),
        );
        reward(20, 5);
      }
      setSelected(null);
      notify("오늘의 여정을 감사 기록에 남겼어요 🌼");
    });
  }
  function beginEdit(e: Entry) {
    setEditDraft({ title: e.title, body: e.body });
    setSelected(e.id);
    setEditing(true);
  }
  async function updateEntry() {
    await run(async () => {
      if (!current || current.author !== profile.uid || current.rating != null)
        throw Error("내가 작성한 진행 중인 항목만 수정할 수 있어요.");
      const title = editDraft.title.trim(),
        body = editDraft.body.trim();
      if (!title || title.length > 100 || body.length > 3000)
        throw Error("제목과 내용의 길이를 확인해 주세요.");
      const update = (entries: Entry[]) =>
        entries.map((e) => (e.id === current.id ? { ...e, title, body } : e));
      if (current.secret) storeSecrets(update(secrets));
      else if (connected) {
        try {
          await sharedCommand("editItem", {
            team,
            id: current.id,
            title,
            body,
          });
        } catch (error) {
          if ((error as { code?: string }).code === "permission-denied")
            throw Error(
              "공유 이야기 수정 권한이 아직 적용되지 않았어요. 관리자가 Firebase 규칙을 배포한 뒤 다시 저장해 주세요. 작성한 내용은 그대로 있어요.",
            );
          throw error;
        }
      } else storeItems(update(items));
      setEditing(false);
      notify("마음을 담은 이야기를 수정했어요.");
    });
  }
  async function addComment() {
    await run(async () => {
      if (!current || !comment.trim()) return;
      const c = {
        id: uid(),
        name: profile.name,
        text: comment.trim(),
        at: Date.now(),
      };
      if (current.secret)
        storeSecrets(
          secrets.map((x) =>
            x.id === current.id ? { ...x, comments: [...x.comments, c] } : x,
          ),
        );
      else if (connected)
        await sharedCommand("comment", { team, id: current.id, text: comment });
      else
        storeItems(
          items.map((x) =>
            x.id === current.id ? { ...x, comments: [...x.comments, c] } : x,
          ),
        );
      setComment("");
      notify("응원 메시지 전송 완료!");
    });
  }
  async function createTeam() {
    await run(async () => {
      if (!teamDraft.trim()) throw Error("팀 이름을 적어 주세요.");
      if (!connected)
        throw Error("실제 팀 생성은 Firebase 연결 후 사용할 수 있어요.");
      const t = await command("createTeam", { name: teamDraft });
      setTeam(t.id);
      setModal(null);
      notify("우리의 숲이 생겼어요!");
    });
  }
  async function join() {
    await run(async () => {
      if (!signed) {
        await login();
        await command("bootstrap");
      }
      await command("join", { token: inviteToken });
      setInviteToken("");
      history.replaceState({}, "", location.pathname);
      notify("초대한 분의 팀원으로 참여했어요 🌳");
    });
  }
  async function makeInvite() {
    if (useCommunity) {
      setTab("team");
      notify(
        "우리 팀의 입장 관리에서 팀 코드와 참여 비밀번호를 설정해 주세요.",
      );
      return;
    }
    if (connected && (!signed || !team)) {
      notify("Google로 로그인하고 팀을 먼저 만들어 주세요.");
      return;
    }
    setInvite("");
    setModal("invite");
    if (!connected) return;
    await run(async () => {
      const r = await command("invite", { team });
      setInvite(`${location.origin}${location.pathname}?invite=${r.token}`);
    });
  }
  const nav = [
    ["home", "오늘의 숲", House],
    ["prayer", "기도 모아보기", Heart],
    ["task", "작은 실천", Check],
    ["team", "우리 팀", Users],
    ["stats", "성장 기록", ChartNoAxesCombined],
    ["room", "내 방 꾸미기", Palette],
    ["archive", "감사 보관함", BookOpen],
  ] as const;
  return (
    <div className="layout">
      {menu && (
        <button
          className="menu-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("home");
          }}
        >
          <span className="brand-icon">
            <span aria-hidden="true">🐰</span>
          </span>
          <span>
            기도숲<small>A LITTLE PRAYER, EVERY DAY</small>
          </span>
        </a>
        <div className="team-switch">
          <span className="team-emoji">🌳</span>
          <div>
            <strong>{teamName}</strong>
            <small>
              {connected ? "함께 가꾸는 우리 팀" : "체험용 예시 팀"}
            </small>
          </div>
          <ChevronRight size={16} />
        </div>
        <p className="nav-label">나의 공간</p>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "nav-item active" : "nav-item"}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setTab(key);
                setFilter("all");
                setMenu(false);
              }}
            >
              <Icon size={20} />
              {label}
              {key === "prayer" && (
                <span>{active.filter((e) => e.kind === "prayer").length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <span>🐰</span>
            <strong>
              작은 기도가 모여
              <br />
              울창한 숲이 돼요
            </strong>
            <p>오늘도 내 속도로, 한 걸음씩.</p>
          </div>
          <button className="settings" onClick={() => setModal("setup")}>
            <Settings size={18} />
            연결 및 개인정보
          </button>
          <div className="user">
            <span className="avatar">🐑</span>
            <div>
              <strong>{profile.name}님</strong>
              <small>
                {signed
                  ? anonymous
                    ? "별명 계정 · 이 기기에 로그인 유지"
                    : "계정 로그인 유지 중"
                  : connected
                    ? "Google로 가입·로그인"
                    : "기기에 저장되는 체험 모드"}
              </small>
            </div>
            {signed ? (
              <button
                aria-label="로그아웃"
                onClick={() =>
                  run(async () => {
                    if (
                      anonymous &&
                      !window.confirm(
                        "별명 계정에서 로그아웃하면 이 기기의 기록에 다시 접근하지 못할 수 있어요. 먼저 Google·이메일 연결을 권장해요. 로그아웃할까요?",
                      )
                    )
                      return;
                    await logout();
                  })
                }
              >
                <LogOut size={17} />
              </button>
            ) : (
              <button
                aria-label="Google 로그인"
                onClick={() =>
                  run(async () => {
                    await login();
                  })
                }
              >
                <ChevronRight size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="mobile-menu"
            aria-label={menu ? "메뉴 접기" : "메뉴 열기"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            기도숲 <ChevronRight size={14} />{" "}
            <b>{nav.find((n) => n[0] === tab)?.[1]}</b>
          </div>
          <div className="header-right">
            {!signed && (
              <button
                className="google-login"
                aria-label="Google로 가입·로그인"
                disabled={busy || !loaded}
                onClick={() => {
                  if (!connected) setModal("setup");
                  else
                    run(async () => {
                      await login();
                    });
                }}
              >
                <span className="google-g" aria-hidden="true">
                  G
                </span>
                <span className="google-label">Google로 가입·로그인</span>
                <span className="google-short">Google로 시작</span>
              </button>
            )}
            <span className="mode">
              {connected
                ? signed
                  ? "함께하는 숲"
                  : "로그인 필요"
                : "체험 모드"}
            </span>
            <button className="coin" onClick={() => setTab("stats")}>
              <Coins size={15} />
              {profile.coins} G
            </button>
            <button
              aria-label="내 계정 및 설정"
              className="header-avatar"
              onClick={() => setModal("setup")}
            >
              🐑
            </button>
          </div>
        </header>
        <div className="content">
          {connected && !signed && (
            <div className="invite-banner">
              <div>
                <strong>혼자 기도하고 실천해도 좋아요</strong>
                <p>
                  별명으로 시작하면 이 휴대폰에서 이어 쓸 수 있어요. 개인 기록은
                  비밀 글로 기기에 보관해요.
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy || !loaded}
                onClick={() =>
                  run(async () => {
                    await guestLogin("숲 친구");
                    setDraft({
                      title: "",
                      body: "",
                      kind: "prayer",
                      secret: true,
                    });
                    setModal("new");
                  })
                }
              >
                혼자 시작하기
              </button>
            </div>
          )}
          {inviteToken && (
            <div className="invite-banner">
              <div>
                <strong>함께 기도할 숲에 초대받았어요 🌳</strong>
                <p>
                  {connected
                    ? "Google 로그인 후 참여하면 초대한 분의 팀원이 되어요."
                    : "Firebase 연결 후 이 초대 링크로 참여할 수 있어요."}
                </p>
              </div>
              <button
                disabled={busy || !connected}
                className="primary"
                onClick={join}
              >
                {signed ? "팀 참여하기" : "Google로 참여"}
              </button>
            </div>
          )}
          {connected && !signed && (
            <div className="invite-banner">
              <div>
                <strong>나의 기도숲을 시작해 보세요</strong>
                <p>팀 코드를 받았다면 Google 없이 별명으로 참여할 수 있어요.</p>
              </div>
              <button
                className="primary"
                disabled={busy || !loaded}
                onClick={() =>
                  run(async () => {
                    await login();
                  })
                }
              >
                Google로 가입·로그인
              </button>
            </div>
          )}
          {connected && signed && !team && !profile.activeCircle && (
            <div className="invite-banner">
              <div>
                <strong>첫 번째 숲을 만들어 주세요</strong>
                <p>또는 팀장에게 받은 초대 링크를 열어 주세요.</p>
              </div>
              <button className="primary" onClick={() => setModal("team")}>
                팀 만들기
              </button>
            </div>
          )}
          {connected &&
            tab !== "team" &&
            (!signed || (!team && !profile.activeCircle) || circlePending) && (
              <CirclePanel
                circle={circle}
                pending={circlePending}
                uid={profile.uid}
                notify={notify}
                run={run}
                busy={busy}
                entries={items}
                directory={directory}
              />
            )}
          {connected && profile.activeCircle && (
            <div className="circle-switch">
              <strong>
                {circle?.name ||
                  (circlePending ? "참여 승인 대기 중" : "기도단 연결 중…")}
              </strong>
              {team && (
                <button
                  className="secondary"
                  onClick={() => {
                    setLegacyView(!legacyView);
                    setItems([]);
                  }}
                >
                  {legacyView ? "기도단 기록 보기" : "기존 팀 기록 보기"}
                </button>
              )}
            </div>
          )}
          {connected && sharingBlocked && (
            <div className="quota-banner" role="status">
              <strong>공유 연결이 잠시 중단됐어요</strong>
              <p>
                무료 한도 또는 네트워크 상태를 확인해 주세요. 비밀 기도·할 일은
                이 기기에 계속 기록할 수 있어요. 공유 저장 완료로 표시하거나
                자동 재전송하지 않습니다.
              </p>
              <button
                className="secondary"
                onClick={() => {
                  setDraft({
                    title: "",
                    body: "",
                    kind: "prayer",
                    secret: true,
                  });
                  setModal("new");
                }}
              >
                이 기기에 비밀 기록하기
              </button>
              <button className="text-button" onClick={() => location.reload()}>
                공유 연결 다시 확인
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {today} <span>· 나를 위한 작은 시간</span>
              </p>
              <h1>
                {tab === "home" ? (
                  <>
                    {profile.name}님, 좋은 하루예요!{" "}
                    <span className="wave">☀️</span>
                  </>
                ) : (
                  nav.find((n) => n[0] === tab)?.[1]
                )}
              </h1>
              <p>
                {tab === "home"
                  ? "작은 기도와 응원으로, 오늘도 포근한 하루를 가꿔요."
                  : tab === "room"
                    ? "기도로 모은 코인으로, 나만의 포근한 방을 꾸며요."
                    : tab === "stats"
                      ? "차곡차곡 쌓인 마음과 소망이의 성장을 만나요."
                      : tab === "team"
                        ? "서로의 기도에 응원을 더하며 함께 자라요."
                        : "작은 기도와 실천, 그 안에 담긴 마음을 만나요."}
              </p>
            </div>
            <button
              className="primary add"
              onClick={() => {
                setDraft({
                  ...draft,
                  kind: tab === "task" ? "task" : "prayer",
                });
                setModal("new");
              }}
            >
              <Plus size={18} />새 마음 기록하기
            </button>
          </div>
          {tab === "home" && (
            <>
              <div className="hero quest-hero">
                <div className="hero-copy">
                  <span className="pill">
                    <Leaf size={14} />
                    마음이 자라는 작은 정원
                  </span>
                  <h2>
                    작은 기도 하나, <br />
                    소망이 자라요.
                  </h2>
                  <p>
                    서두르지 않아도 괜찮아요.
                    <br />
                    소망이와 함께 오늘의 마음을 기록해요.
                  </p>
                  <div className="level">
                    <span>
                      Lv.{level} <b>함께 자라는 소망이</b>
                    </span>
                    <span>{progress} / 100 XP</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: progress + "%" }} />
                  </div>
                  <div className="quest-reward">
                    <Trophy size={14} />
                    기도와 실천을 기록하면 +10 XP
                  </div>
                  <button
                    className="room-entry-button"
                    onClick={() => setTab("room")}
                  >
                    <Palette size={16} />내 방 꾸미기
                    <ChevronRight size={15} />
                  </button>
                </div>
                <div
                  className={"battle-scene " + (battle ? "has-battled" : "")}
                  key={battle}
                  aria-label="토끼와 소망이의 포근한 기도 방"
                >
                  <RoomScene
                    owned={profile.decorations || []}
                    layout={room.layout}
                  />
                  {battle > 0 && (
                    <>
                      <span className="attack-star">✦</span>
                      <span className="damage-pop">+10 XP!</span>
                    </>
                  )}
                  <div className="battle-tip">
                    {battle
                      ? "마음이 한 뼘 자랐어요 ✨"
                      : "오늘의 작은 실천이 소망이를 자라게 해요"}
                  </div>
                </div>
              </div>
              <div className="metrics">
                <Metric
                  icon={<Heart />}
                  label="함께 모은 기도"
                  value={`${all.filter((e) => e.kind === "prayer").reduce((n, e) => n + (e.totalCount ?? e.count), 0)}번`}
                  note="한 번의 기도에도 마음을 담아"
                  color="pink"
                />
                <Metric
                  icon={<Check />}
                  label="오늘의 기록"
                  value={`${todayCount}개`}
                  note="작은 실천도 충분히 소중해요"
                  color="green"
                />
                <Metric
                  icon={<Flower2 />}
                  label="감사의 이야기"
                  value={`${summary.done}개`}
                  note="우리에게 찾아온 작은 변화"
                  color="gold"
                />
              </div>
            </>
          )}
          <div className={tab === "room" ? "body-grid room-body" : "body-grid"}>
            <section className="main-section">
              {tab === "room" && (
                <RoomStudio
                  owned={profile.decorations || []}
                  coins={profile.coins}
                  busy={busy}
                  connected={connected}
                  layout={room.layout}
                  update={room.update}
                  persist={room.persist}
                  purchase={purchase}
                  notify={notify}
                />
              )}
              {["home", "prayer", "task", "archive"].includes(tab) && (
                <>
                  <div className="section-title">
                    <div>
                      <h2>
                        {tab === "archive"
                          ? "감사로 남은 이야기"
                          : tab === "task"
                            ? "오늘의 작은 실천"
                            : tab === "prayer"
                              ? "마음을 모으는 기도"
                              : "오늘, 함께 나눌 마음"}{" "}
                        <span>{shown.length}</span>
                      </h2>
                      <p>제목을 누르면 이야기와 감동을 나눌 수 있어요.</p>
                    </div>
                    <div className="search">
                      <Search size={15} />
                      <input
                        aria-label="제목 검색"
                        placeholder="제목 검색"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="filters">
                    {[
                      ["all", "전체"],
                      ["team", "함께 나눔"],
                      ["mine", "내가 심은 마음"],
                      ["secret", "나만의 비밀"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={filter === key ? "selected" : ""}
                        aria-pressed={filter === key}
                      >
                        {key === "secret" && <LockKeyhole size={13} />} {label}
                      </button>
                    ))}
                  </div>
                  {useCommunity &&
                    circle?.schema === 3 &&
                    filter !== "secret" && (
                      <div className="feed-controls">
                        <p>
                          20개씩 불러옵니다. 횟수·통계·검색은 불러온 항목
                          기준이에요.
                        </p>
                        {circle.director === profile.uid && (
                          <label>
                            보는 범위
                            <select
                              aria-label="보는 범위"
                              value={viewScope}
                              onChange={(e) => setViewScope(e.target.value)}
                            >
                              <option value="all-teams">모든 팀</option>
                              <option value="all">기도단 공통</option>
                              {Object.entries(circle.teams).map(([id, t]) => (
                                <option key={id} value={id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          className="text-button"
                          disabled={feedMeta.loading || sharingBlocked}
                          onClick={() => feedRef.current?.refresh()}
                        >
                          새 글 불러오기
                        </button>
                      </div>
                    )}
                  <div className="entry-list">
                    {shown.length ? (
                      shown.map((e) => (
                        <LiveEntry
                          id={e.id}
                          feed={
                            signed && (!useCommunity || circle?.schema === 3)
                              ? feedRef.current
                              : null
                          }
                          className={
                            lastRecordedId === e.id
                              ? "entry just-recorded"
                              : "entry"
                          }
                          key={e.id}
                        >
                          <span className={`entry-icon ${e.kind}`}>
                            {e.secret ? (
                              <LockKeyhole size={21} />
                            ) : e.kind === "prayer" ? (
                              <Heart size={22} />
                            ) : (
                              <Check size={22} />
                            )}
                          </span>
                          <button
                            className="entry-title"
                            onClick={() => {
                              setEditing(false);
                              setSelected(e.id);
                              setRating(5);
                              setComment("");
                            }}
                          >
                            <span className="entry-meta">
                              {e.secret
                                ? "이 기기에만 저장"
                                : e.source ||
                                  `${e.authorName}님의 ${e.kind === "prayer" ? "기도" : "실천"}`}{" "}
                              {e.rating != null &&
                                `· 체감 ${percent(e.rating)}%`}
                            </span>
                            <strong>{e.title}</strong>
                            <span className="entry-foot">
                              {e.kind === "prayer" ? "함께 기도" : "실천 기록"}{" "}
                              {e.totalCount ?? e.count}번{" "}
                              {e.circleId && (
                                <span className="personal-count">
                                  · 나는 {e.myCount}번
                                </span>
                              )}{" "}
                              <span>·</span> 감동{" "}
                              {e.commentCount ?? e.comments.length}{" "}
                              <ChevronRight size={12} />
                            </span>
                          </button>
                          {e.author === profile.uid && e.rating == null && (
                            <button
                              className="entry-edit"
                              aria-label={`${e.title} 수정`}
                              onClick={() => beginEdit(e)}
                            >
                              <Pencil size={15} />
                              <span>수정</span>
                            </button>
                          )}
                          {e.rating == null ? (
                            <button
                              className={`record ${e.kind}`}
                              aria-label={`${e.title} ${e.kind === "prayer" ? "기도" : "실천"} 기록`}
                              disabled={busy || recordingIds.includes(e.id)}
                              aria-busy={recordingIds.includes(e.id)}
                              onClick={() => record(e)}
                            >
                              {e.kind === "prayer" ? (
                                <Heart size={17} />
                              ) : (
                                <Check size={17} />
                              )}
                              <span>
                                {recordingIds.includes(e.id)
                                  ? "기록 중..."
                                  : e.kind === "prayer"
                                    ? "기도했어요"
                                    : "실천했어요"}
                              </span>
                              <b>+1</b>
                            </button>
                          ) : (
                            <span className="done-chip">
                              <Flower2 size={16} />
                              {e.rating}/5
                            </span>
                          )}
                        </LiveEntry>
                      ))
                    ) : (
                      <div className="empty">
                        <span>🌱</span>
                        <h3>
                          {tab === "archive"
                            ? "아직 감사 기록이 없어요"
                            : "아직 심은 마음이 없어요"}
                        </h3>
                        <p>
                          {tab === "archive"
                            ? "항목을 열고 여정을 마무리하면 여기에 모여요."
                            : "작은 기도 하나로 시작해 볼까요?"}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setModal("new")}
                        >
                          마음 심기
                        </button>
                      </div>
                    )}
                  </div>
                  {signed &&
                    (!useCommunity || circle?.schema === 3) &&
                    filter !== "secret" &&
                    !sharingBlocked &&
                    feedMeta.more && (
                      <button
                        className="secondary full"
                        disabled={feedMeta.loading || sharingBlocked}
                        onClick={() => feedRef.current?.loadMore()}
                      >
                        {feedMeta.loading ? "불러오는 중…" : "기록 더 불러오기"}
                      </button>
                    )}
                  <div className="privacy-note">
                    <LockKeyhole size={14} />
                    <span>
                      비밀 기도와 할 일은 이 브라우저에만 저장돼요. 다른
                      사람에게 보이지 않아요.
                    </span>
                  </div>
                </>
              )}
              {tab === "stats" && (
                <>
                  <div className="stats-grid">
                    <Metric
                      icon={<Sparkles />}
                      label="나의 성장"
                      value={`Lv.${level}`}
                      note={`${profile.xp} XP · ${profile.coins} 코인`}
                      color="green"
                    />
                    <Metric
                      icon={<Heart />}
                      label="5단계 기도 평균"
                      value={
                        stats(statisticItems.filter((e) => e.kind === "prayer"))
                          .average == null
                          ? "아직 없어요"
                          : `${stats(statisticItems.filter((e) => e.kind === "prayer")).average}번`
                      }
                      note="내가 5단계로 마친 기도의 개인 횟수 평균"
                      color="pink"
                    />
                    <Metric
                      icon={<Check />}
                      label="5단계 실천 평균"
                      value={
                        stats(statisticItems.filter((e) => e.kind === "task"))
                          .average == null
                          ? "아직 없어요"
                          : `${stats(statisticItems.filter((e) => e.kind === "task")).average}번`
                      }
                      note="내가 5단계로 마친 할 일의 개인 횟수 평균"
                      color="green"
                    />
                    <Metric
                      icon={<Flower2 />}
                      label="평균 체감 달성도"
                      value={
                        summary.feeling == null
                          ? "아직 없어요"
                          : `${summary.feeling}%`
                      }
                      note={`마무리한 ${summary.done}개 항목 기준`}
                      color="gold"
                    />
                  </div>
                  <div className="panel">
                    <h2>마음이 남긴 변화</h2>
                    <p>완료할 때 남긴 1~5단계의 체감 기록이에요.</p>
                    {ratings.map((label, i) => {
                      const n = statisticItems.filter(
                        (e) => e.rating === i + 1,
                      ).length;
                      return (
                        <div className="rating-row" key={label}>
                          <span>
                            {i + 1} · {label}
                          </span>
                          <div className="bar">
                            <i
                              style={{
                                width: `${summary.done ? (n / summary.done) * 100 : 0}%`,
                              }}
                            />
                          </div>
                          <b>{n}</b>
                        </div>
                      );
                    })}
                    <small>
                      기도 횟수는 개인이 기록한 활동이며, 응답의 원인이나 확률을
                      뜻하지 않아요.
                    </small>
                  </div>
                  <div className="panel">
                    <h2>꾸준함에 주는 선물</h2>
                    <p>
                      함께 나눈 기도·실천 기록마다 10 XP와 2 코인, 마무리하면
                      단계에 관계없이 20 XP와 5 코인을 받아요. 100 XP마다 레벨이
                      올라요. 비밀 기록은 기기 안에만 남기며 계정 보상에
                      포함하지 않아요.
                    </p>
                  </div>
                  <div className="panel">
                    <h2>소망이의 작은 선물 가게</h2>
                    <p>
                      소품 하나를 구매하면 같은 세트의 꾸미기 소품 7종이 함께
                      열려요.
                    </p>
                    <button
                      className="secondary room-shop-link"
                      onClick={() => setTab("room")}
                    >
                      <Palette size={16} />
                      구매한 소품으로 내 방 꾸미기
                    </button>
                    <div className="decoration-shop">
                      {decorations.map((d) => (
                        <button
                          disabled={
                            busy ||
                            profile.decorations?.includes(d.id) ||
                            profile.coins < d.cost
                          }
                          key={d.id}
                          onClick={() => purchase(d.id)}
                        >
                          <span>{d.icon}</span>
                          <strong>{d.name}</strong>
                          <small>
                            {profile.decorations?.includes(d.id)
                              ? "획득 완료"
                              : `${d.cost} 코인`}
                          </small>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {tab === "team" && (
                <CirclePanel
                  circle={circle}
                  pending={circlePending}
                  uid={profile.uid}
                  notify={notify}
                  run={run}
                  busy={busy}
                  entries={items}
                  directory={directory}
                />
              )}
              {tab === "team" && !useCommunity && (
                <div className="panel team-panel">
                  <div className="section-title">
                    <h2>🌳 {teamName}</h2>
                    <button className="secondary" onClick={makeInvite}>
                      <Plus size={16} />
                      팀원 초대
                    </button>
                  </div>
                  <p>
                    초대 링크로 들어오면 초대한 사람 아래에 연결돼요. 함께 나눈
                    항목과 감동은 같은 팀에서 볼 수 있어요.
                  </p>
                  {myMembers.map((m) => (
                    <div className="member" key={m.uid}>
                      <span className="avatar">
                        {m.role === "leader" ? "🌳" : "🐑"}
                      </span>
                      <div>
                        <strong>
                          {m.name}
                          {m.uid === profile.uid ? " (나)" : ""}
                        </strong>
                        <small>
                          {m.role === "leader"
                            ? "팀장"
                            : `${myMembers.find((p) => p.uid === m.parentUid)?.name || "초대한 분"}님의 팀원`}
                        </small>
                      </div>
                      <span className="member-tag">
                        {m.role === "leader" ? "팀장" : "함께 자라는 중"}
                      </span>
                    </div>
                  ))}
                  {legacyMembers.more && (
                    <button
                      className="secondary"
                      disabled={legacyMembers.loading}
                      onClick={legacyMembers.loadMore}
                    >
                      기존 팀원 더 보기
                    </button>
                  )}
                  {!team && (
                    <button
                      className="text-button"
                      onClick={() => setModal("team")}
                    >
                      새 팀 만들기
                    </button>
                  )}
                  {!connected && (
                    <p className="hint">
                      체험용 예시 팀입니다. 실제 초대와 동기화는 Firebase 연결이
                      필요해요.
                    </p>
                  )}
                </div>
              )}
            </section>
            <aside className="right-rail">
              <div className="companion panel">
                <span className="eyebrow">늘 곁에 있는 숲 친구</span>
                <h3>함께 자라는 소망이</h3>
                <div className="pet-picture">
                  <img
                    src={`${import.meta.env.BASE_URL}prayer-friends.webp`}
                    alt="서로의 마음을 응원하는 토끼와 소망이"
                  />
                </div>
                <span className="pet-level">
                  Lv.{level} ·{" "}
                  {level < 5
                    ? "새싹 친구"
                    : level < 10
                      ? "꽃피는 친구"
                      : "든든한 숲 친구"}
                </span>
                <p>
                  “오늘, 함께 나눌 마음도
                  <br />내 마음도 보탤게.”
                </p>
                <div className="pet-progress">
                  <span>다음 성장까지</span>
                  <b>{100 - progress} XP</b>
                </div>
                <div className="bar">
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
              <div className="team-card panel">
                <div className="section-title">
                  <h3>함께 가꾸는 숲</h3>
                  <button aria-label="팀 보기" onClick={() => setTab("team")}>
                    <ChevronRight size={17} />
                  </button>
                </div>
                <div className="avatars">
                  {myMembers.slice(0, 4).map((m, i) => (
                    <span key={m.uid} title={m.name}>
                      {["🌳", "🐑", "🐰", "🐥"][i]}
                    </span>
                  ))}
                  <small>{myMembers.length}명이 함께해요</small>
                </div>
                <p>서로의 기도에 마음을 보태요.</p>
                <button className="secondary" onClick={makeInvite}>
                  <Users size={15} />
                  함께할 친구 초대하기
                </button>
              </div>
              <div className="daily-quote">
                <Sparkles size={18} />
                <p>서로를 위하여 기도하라.</p>
                <small>야고보서 5:16</small>
              </div>
            </aside>
          </div>
          <footer>
            <Leaf size={13} />
            기도숲 · 함께 기도하고, 함께 자라요.
          </footer>
        </div>
      </main>
      <nav className="bottom-nav">
        {nav.slice(0, 5).map(([key, label, Icon]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => {
              setTab(key);
              setFilter("all");
            }}
          >
            <Icon size={20} />
            <small>
              {label
                .replace(" 모아보기", "")
                .replace("작은 실천", "실천")
                .replace("성장 기록", "기록")}
            </small>
          </button>
        ))}
      </nav>
      {(modal || current) && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!busy) {
              setModal(null);
              setSelected(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={current ? current.title : "기도숲 설정"}
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="닫기"
              disabled={busy}
              onClick={() => {
                setModal(null);
                setSelected(null);
              }}
            >
              <X size={20} />
            </button>
            {modal === "new" && (
              <>
                <span className="modal-emoji">🌱</span>
                <h2>새 마음 기록하기</h2>
                <p>지금 마음에 담고 있는 이야기를 적어 주세요.</p>
                <div className="segmented">
                  <button
                    className={draft.kind === "prayer" ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, kind: "prayer" })}
                  >
                    ♡ 기도 제목
                  </button>
                  <button
                    className={draft.kind === "task" ? "selected" : ""}
                    onClick={() => setDraft({ ...draft, kind: "task" })}
                  >
                    ✓ 나의 할 일
                  </button>
                </div>
                <label>
                  제목
                  <input
                    autoFocus
                    maxLength={100}
                    placeholder="어떤 마음을 심어 볼까요?"
                    value={draft.title}
                    onChange={(e) =>
                      setDraft({ ...draft, title: e.target.value })
                    }
                  />
                </label>
                <label>
                  마음에 담긴 이야기
                  <textarea
                    maxLength={3000}
                    rows={4}
                    placeholder="자세한 내용, 함께 나누고 싶은 마음…"
                    value={draft.body}
                    onChange={(e) =>
                      setDraft({ ...draft, body: e.target.value })
                    }
                  />
                </label>
                {useCommunity && !draft.secret && (
                  <label className="share-scope">
                    누구와 나눌까요?
                    <select
                      aria-label="공유 범위"
                      value={
                        shareTeam || circle?.people[profile.uid]?.team || ""
                      }
                      onChange={(e) => setShareTeam(e.target.value)}
                    >
                      {circle?.people[profile.uid]?.role === "director" && (
                        <option value="all">기도단 전체</option>
                      )}
                      {Object.entries(circle?.teams || {})
                        .filter(
                          ([id]) =>
                            circle?.director === profile.uid ||
                            id === circle?.people[profile.uid]?.team,
                        )
                        .map(([id, t]) => (
                          <option key={id} value={id}>
                            {t.name}과 공유
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="secret-toggle">
                  <input
                    type="checkbox"
                    checked={draft.secret}
                    onChange={(e) =>
                      setDraft({ ...draft, secret: e.target.checked })
                    }
                  />
                  <LockKeyhole size={17} />
                  <div>
                    <strong>나만의 비밀로 심기</strong>
                    <small>
                      {draft.secret
                        ? "이 브라우저에만 저장 · 서버 전송 없음"
                        : "기본은 팀 전체 공유 · 팀원 모두 볼 수 있어요"}
                    </small>
                  </div>
                </label>
                {draft.secret && (
                  <p className="hint">
                    브라우저 데이터 삭제·기기 변경 시 사라질 수 있어요. 공용
                    기기에서는 사용을 피해주세요.
                  </p>
                )}
                <button className="primary full" disabled={busy} onClick={add}>
                  {busy ? "등록 중…" : "마음 심기"}
                </button>
              </>
            )}
            {modal === "invite" && (
              <>
                <span className="modal-emoji">💌</span>
                <h2>함께할 마음을 초대해요</h2>
                <p>
                  친구가 링크를 열고 Google로 참여하면
                  <br />
                  나의 팀원으로 연결돼요.
                </p>
                {!connected ? (
                  <div className="hint">
                    지금은 체험 모드예요. 실제 초대 링크는 Firebase 무료
                    프로젝트 연결 후 만들 수 있어요.
                  </div>
                ) : (
                  <>
                    <label>
                      7일 동안 유효한 팀 초대 링크
                      <input
                        readOnly
                        value={invite || "초대 링크를 만드는 중…"}
                      />
                    </label>
                    <button
                      className="primary full"
                      disabled={!invite || busy}
                      onClick={() =>
                        run(async () => {
                          await navigator.clipboard.writeText(invite);
                          notify("초대 링크를 복사했어요!");
                        })
                      }
                    >
                      <Copy size={16} />
                      초대 링크 복사
                    </button>
                  </>
                )}
              </>
            )}
            {modal === "team" && (
              <>
                <span className="modal-emoji">🌳</span>
                <h2>우리의 숲 만들기</h2>
                <p>팀장이 되어 기도와 할 일을 나눠 보세요.</p>
                <label>
                  팀 이름
                  <input
                    autoFocus
                    maxLength={40}
                    value={teamDraft}
                    onChange={(e) => setTeamDraft(e.target.value)}
                    placeholder="예: 소망 청년부"
                  />
                </label>
                <button
                  className="primary full"
                  disabled={busy || !signed}
                  onClick={createTeam}
                >
                  팀 만들기
                </button>
                {!signed && (
                  <p className="hint">
                    Firebase 연결과 Google 로그인이 필요해요.
                  </p>
                )}
              </>
            )}
            {modal === "setup" && (
              <>
                <span className="modal-emoji">🌿</span>
                <h2>나의 숲 안내</h2>
                <div className="google-info">
                  <strong>Google 계정 하나로 시작해요</strong>
                  <p>
                    처음 로그인하면 자동으로 가입되고 프로필이 만들어져요.
                    다음부터는 같은 Google 계정으로 로그인하면 돼요.
                  </p>
                </div>
                <p>
                  {connected
                    ? "Firebase가 연결되어 있어요."
                    : "현재는 체험 모드입니다. Google 로그인과 실제 팀 공유는 아직 연결되지 않았어요."}
                </p>
                <div className="panel">
                  <h3>나만의 비밀</h3>
                  <p>
                    비밀 항목·내용·감동·횟수는 이 기기 브라우저의 로컬
                    저장소에만 저장해요. 계정별로 구분하며 서버로 보내지 않아요.
                    브라우저 데이터가 삭제되면 복구할 수 없어요.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      const blob = new Blob(
                        [JSON.stringify(secrets, null, 2)],
                        { type: "application/json" },
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "기도숲-비밀기록.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    비밀 기록 백업하기
                  </button>
                </div>
                <div className="panel free-plan">
                  <h3>무료로 함께 쓰는 숲</h3>
                  <p>
                    팀·팀원·글·댓글의 고정 개수 제한을 없앴어요. 목록은 조금씩
                    불러오며, 빠른 연속 클릭과 중복 보상은 차단해요.
                  </p>
                  <small>
                    실제 공유는 Firebase Spark 프로젝트 연결 후 사용할 수
                    있어요. 무료 서비스 전체 한도에 도달하면 일부 기능이 일시
                    중단될 수 있어요.
                  </small>
                </div>
                <p className="hint">
                  체험 데이터는 이 브라우저에 저장되며 다른 사람과 공유되지
                  않습니다. 실제 연결 방법은 저장소 README에 있어요.
                </p>
                <AccountOptions notify={notify} run={run} busy={busy} />
                <p className="hint">
                  같은 휴대폰의 같은 브라우저에서 로그아웃하지 않으면 자동으로
                  이어집니다. 시크릿 모드·브라우저 데이터 삭제·다른
                  브라우저에서는 다시 로그인해야 해요.
                </p>
                {!signed && (
                  <button
                    className="primary full"
                    disabled={busy || !connected}
                    onClick={() =>
                      run(async () => {
                        await login();
                      })
                    }
                  >
                    Google로 로그인
                  </button>
                )}
              </>
            )}
            {current && (
              <>
                <span className="modal-emoji">
                  {current.secret
                    ? "🔒"
                    : current.kind === "prayer"
                      ? "🙏"
                      : "🌱"}
                </span>
                <span className="eyebrow">
                  {current.secret
                    ? "나만의 비밀"
                    : `${current.authorName}님의 이야기`}
                </span>
                {editing ? (
                  <div className="edit-form">
                    <h2>이야기 수정하기</h2>
                    <label>
                      제목
                      <input
                        aria-label="제목"
                        autoFocus
                        maxLength={100}
                        value={editDraft.title}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, title: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      마음에 담긴 이야기
                      <textarea
                        aria-label="마음에 담긴 이야기"
                        rows={4}
                        maxLength={3000}
                        value={editDraft.body}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, body: e.target.value })
                        }
                      />
                    </label>
                    <div className="edit-actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                      >
                        취소
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={updateEntry}
                      >
                        {busy ? "저장 중…" : "수정 저장"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <h2>{current.title}</h2>
                )}
                {!editing &&
                  current.author === profile.uid &&
                  current.rating == null && (
                    <button
                      className="edit-link"
                      onClick={() => beginEdit(current)}
                    >
                      <Pencil size={15} /> 이야기 수정
                    </button>
                  )}
                {!editing && (
                  <>
                    <div className="detail-body">
                      {current.body || "아직 자세한 이야기가 없어요."}
                    </div>
                    <div className="detail-count">
                      <Heart size={17} />{" "}
                      {current.kind === "prayer"
                        ? "함께 기도한"
                        : "실천을 남긴"}{" "}
                      횟수{" "}
                      <strong>{current.totalCount ?? current.count}번</strong>
                    </div>
                    {current.circleId && (
                      <div className="community-entry-note">
                        <p>
                          내 기록 {current.myCount}회 · 참여{" "}
                          {current.participantCount ??
                            Object.keys(current.counts || {}).length}
                          명 ·{" "}
                          {current.teamId === "all"
                            ? "기도단 전체 공유"
                            : circle?.teams[current.teamId || ""]?.name}
                        </p>
                        {circle?.schema === 3 ? (
                          <Participants
                            circle={current.circleId}
                            item={current.id}
                            legacy={current.counts || {}}
                            notify={notify}
                          />
                        ) : (
                          <details>
                            <summary>누가 함께했나요?</summary>
                            <ul className="participation-list">
                              {Object.entries(current.counts || {}).map(
                                ([id, n]) => (
                                  <li key={id}>
                                    {circle?.people[id]?.name || "팀원"} · {n}회
                                  </li>
                                ),
                              )}
                            </ul>
                          </details>
                        )}

                        {!current.closed &&
                          (current.author === profile.uid ||
                            circle?.director === profile.uid ||
                            circle?.teams[current.teamId || ""]?.leader ===
                              profile.uid) && (
                            <details>
                              <summary>공통 기도·할 일 전체 마무리</summary>
                              <p>
                                모든 참여자의 공통 항목을 마무리합니다. 개인
                                완료와 별개입니다.
                              </p>
                              <select
                                aria-label="공통 마무리 결과"
                                value={rating}
                                onChange={(e) =>
                                  setRating(Number(e.target.value))
                                }
                              >
                                {ratings.map((r, i) => (
                                  <option key={r} value={i + 1}>
                                    {i + 1}단계 · {r}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="secondary"
                                disabled={busy}
                                onClick={() =>
                                  run(async () => {
                                    await sharedCommand("close", {
                                      id: current.id,
                                      rating,
                                    });
                                    setSelected(null);
                                    notify("공통 기록을 마무리했어요.");
                                  })
                                }
                              >
                                공통 기록 마무리
                              </button>
                            </details>
                          )}
                      </div>
                    )}
                    {current.rating == null ? (
                      <>
                        <button
                          className="primary full"
                          disabled={busy || recordingIds.includes(current.id)}
                          aria-busy={recordingIds.includes(current.id)}
                          onClick={() => record(current)}
                        >
                          {current.kind === "prayer"
                            ? "♡ 기도했어요"
                            : "✓ 실천했어요"}{" "}
                          +1
                        </button>
                        {
                          <details className="finish">
                            <summary>이 여정을 마무리하고 싶어요</summary>
                            <p>
                              지금 느끼는 변화를 골라 주세요. 어떤 단계도
                              소중해요.
                            </p>
                            <div className="rating-buttons">
                              {ratings.map((label, i) => (
                                <button
                                  key={i}
                                  className={rating === i + 1 ? "selected" : ""}
                                  title={label}
                                  onClick={() => setRating(i + 1)}
                                >
                                  {i + 1}
                                  <small>{i * 25}%</small>
                                </button>
                              ))}
                            </div>
                            <p className="rating-label">
                              {ratings[rating - 1]}
                            </p>
                            <button
                              className="secondary full"
                              disabled={busy}
                              onClick={() => finish(current)}
                            >
                              감사 보관함에 남기기
                            </button>
                          </details>
                        }
                      </>
                    ) : (
                      <div className="hint">
                        {current.rating}단계 · 체감 {percent(current.rating)}% ·{" "}
                        {ratings[current.rating - 1]}
                      </div>
                    )}
                    <div className="comments">
                      <h3>
                        마음에 남은 감동{" "}
                        <span>
                          {current.commentCount ?? current.comments.length}
                        </span>
                      </h3>
                      {[...current.comments, ...commentPage.rows]
                        .sort((a, b) => a.at - b.at)
                        .map((c) => (
                          <div className="comment" key={c.id}>
                            <span>🌷</span>
                            <div>
                              <strong>
                                {c.name}
                                <small>
                                  {new Date(c.at).toLocaleDateString("ko-KR")}
                                </small>
                              </strong>
                              <p>{c.text}</p>
                            </div>
                          </div>
                        ))}
                      {commentPage.more && (
                        <button
                          className="secondary"
                          disabled={commentPage.loading}
                          onClick={commentPage.loadMore}
                        >
                          댓글 더 불러오기
                        </button>
                      )}
                      {!current.comments.length && !commentPage.rows.length && (
                        <p className="hint">
                          작은 감동이나 신나는 응원을 남겨 주세요.
                        </p>
                      )}
                      <div className="comment-input">
                        <textarea
                          rows={2}
                          maxLength={1000}
                          placeholder="오늘 마음에 남은 감동은…"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                        />
                        <button
                          aria-label="감동 남기기"
                          disabled={busy || !comment.trim()}
                          onClick={addComment}
                        >
                          <Send size={18} />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <div className="metric">
      <div className={`metric-icon ${color}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
