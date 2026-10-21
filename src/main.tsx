import React, { useEffect, useState } from "react";
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
  login,
  logout,
  watchAuth,
  command,
  watchDoc,
  watchList,
} from "./cloud";
import "./style.css";
import "./quest.css";
const uid = () => crypto.randomUUID();
const escError = (e: unknown) =>
  e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.";
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
  const [battle, setBattle] = useState(0);
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
        setSigned(!!user);
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
          setTeam(p.activeTeam || "");
        }
      },
      (e) => notify(escError(e)),
    );
  }, [signed, profile.uid]);
  useEffect(() => {
    if (!signed || !team) return;
    const stops = [
      watchDoc(
        `teams/${team}`,
        (t) => t && setTeamName(t.name),
        (e) => notify(escError(e)),
      ),
      watchList(
        `teams/${team}/items`,
        (v) =>
          setItems(
            v.map((e) => {
              const outcome = e.outcomes?.[profile.uid];
              return {
                ...e,
                ...(outcome
                  ? {
                      rating: outcome.rating,
                      completedAt: outcome.completedAt,
                      count: outcome.count,
                    }
                  : {}),
              };
            }),
          ),
        (e) => notify(escError(e)),
      ),
      watchList(`teams/${team}/members`, setMembers, (e) =>
        notify(escError(e)),
      ),
    ];
    return () => stops.forEach((s) => s());
  }, [signed, team, profile.uid]);
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
      notify("새 아이템 획득! 컬렉션이 늘었어요!");
    });
  }
  const all = [...items, ...secrets],
    summary = stats(all),
    active = all.filter((e) => e.rating == null),
    current = all.find((e) => e.id === selected);
  const myMembers = connected
    ? members
    : [
        { uid: "leader", name: "은혜", role: "leader" },
        { uid: "demo", name: "하은", parentUid: "leader", role: "member" },
        { uid: "friend", name: "지우", parentUid: "leader", role: "member" },
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
      if (!draft.secret && !connected && items.length >= 100)
        throw Error("팀당 공유 퀘스트는 100개까지 보관해요.");
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
        if (!signed || !team)
          throw Error("Google 로그인 후 팀을 만들거나 초대에 참여해 주세요.");
        await command("createItem", { team, ...draft });
      } else storeItems([...items, entry]);
      setModal(null);
      setDraft({ title: "", body: "", kind: "prayer", secret: false });
      notify("새 퀘스트 등록 완료! 🎮");
    });
  }
  async function record(e: Entry) {
    await run(async () => {
      if (!e.secret && !connected) checkActivityLimit(profile);
      if (e.secret)
        storeSecrets(secrets.map((x) => (x.id === e.id ? logEntry(x) : x)));
      else if (connected)
        await command("log", { team, id: e.id, eventId: uid() });
      else {
        storeItems(items.map((x) => (x.id === e.id ? logEntry(x) : x)));
        reward(10, 2);
      }
      if (!e.secret) setBattle((v) => v + 1);
      notify(
        e.secret
          ? "비밀 기록을 이 기기에 저장했어요 🔒"
          : "퀘스트 기록! +10 XP · +2 G ⚡",
      );
    });
  }
  async function finish(e: Entry) {
    await run(async () => {
      if (!e.secret && !connected) checkActivityLimit(profile);
      if (e.secret)
        storeSecrets(
          secrets.map((x) => (x.id === e.id ? finishEntry(x, rating) : x)),
        );
      else if (connected) await command("complete", { team, id: e.id, rating });
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
  async function addComment() {
    await run(async () => {
      if (!current || !comment.trim()) return;
      if (!current.secret && current.comments.length >= 100)
        throw Error("한 퀘스트에 댓글 100개까지 남길 수 있어요.");
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
        await command("comment", { team, id: current.id, text: comment });
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
    ["archive", "감사 보관함", BookOpen],
  ] as const;
  return (
    <div className="layout">
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
            <Swords size={24} />
          </span>
          <span>
            기도숲<small>PRAY QUEST · LEVEL UP</small>
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
        <p className="nav-label">나의 모험</p>
        <nav>
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? "nav-item active" : "nav-item"}
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
            <span>🌱</span>
            <strong>
              기도 한 번에
              <br />
              경험치가 쑥쑥!
            </strong>
            <p>한 번의 실천도 경험치로!</p>
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
                  ? "Google 계정으로 함께해요"
                  : "기기에 저장되는 체험 모드"}
              </small>
            </div>
            {signed ? (
              <button
                aria-label="로그아웃"
                onClick={() =>
                  run(async () => {
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
            aria-label="메뉴 열기"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            나의 모험 <ChevronRight size={14} />{" "}
            <b>{nav.find((n) => n[0] === tab)?.[1]}</b>
          </div>
          <div className="header-right">
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
            <button className="header-avatar" onClick={() => setModal("setup")}>
              🐑
            </button>
          </div>
        </header>
        <div className="content">
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
                <p>Google로 로그인하고 팀을 만들거나 초대 링크로 참여해요.</p>
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
                Google로 시작
              </button>
            </div>
          )}
          {connected && signed && !team && (
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
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {today} <span>· 오늘도 경험치 획득!</span>
              </p>
              <h1>
                {tab === "home" ? (
                  <>
                    {profile.name} 대원, 퀘스트 출발!{" "}
                    <span className="wave">⚔️</span>
                  </>
                ) : (
                  nav.find((n) => n[0] === tab)?.[1]
                )}
              </h1>
              <p>
                {tab === "home"
                  ? "기도하고, 할 일 깨고, 내 캐릭터를 키워 보세요!"
                  : tab === "stats"
                    ? "레벨은 얼마나 올랐을까? 내 기록과 수집품을 확인해요."
                    : tab === "team"
                      ? "파티원을 초대하고, 함께 퀘스트를 클리어해요!"
                      : "진행 중인 퀘스트와 기록을 확인해요."}
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
              <Plus size={18} />새 퀘스트 만들기
            </button>
          </div>
          {tab === "home" && (
            <>
              <div className="hero quest-hero">
                <div className="hero-copy">
                  <span className="pill">
                    <Swords size={14} />
                    DAILY PRAY QUEST
                  </span>
                  <h2>
                    기도하고, 실천하고.
                    <br />
                    소망이와 레벨 업!
                  </h2>
                  <p>
                    기도 한 번에 +10 XP!
                    <br />
                    오늘의 미루기 슬라임을 물리쳐요.
                  </p>
                  <div className="level">
                    <span>
                      Lv.{level} <b>소망의 모험가</b>
                    </span>
                    <span>{progress} / 100 XP</span>
                  </div>
                  <div className="bar">
                    <i style={{ width: progress + "%" }} />
                  </div>
                  <div className="quest-reward">
                    <Trophy size={14} />
                    성실한 한 걸음이 나의 경험치!
                  </div>
                </div>
                <div
                  className={"battle-scene " + (battle ? "has-battled" : "")}
                  key={battle}
                  aria-label="소망이와 슬라임의 퀘스트 장면"
                >
                  <div className="stage-tag">
                    ⚑ STAGE {String(level).padStart(2, "0")}{" "}
                    <span>꾸준함의 초원</span>
                  </div>
                  <div className="cloud c1" />
                  <div className="cloud c2" />
                  <div className="hill h1" />
                  <div className="hill h2" />
                  <div className="game-tree t1">♠</div>
                  <div className="game-tree t2">♠</div>
                  <div className="game-ground" />
                  <div className="fighter hero-fighter">
                    <div className="fighter-label">
                      <b>소망이</b>
                      <span>Lv.{level}</span>
                    </div>
                    <div className="hp-bar">
                      <i />
                    </div>
                    <img
                      src={`${import.meta.env.BASE_URL}sheep-hero.webp`}
                      alt="별 지팡이와 하트 방패를 든 아기 양 모험가 소망이"
                    />
                  </div>
                  <div className="fighter enemy-fighter">
                    <div className="fighter-label">
                      <b>미루기 슬라임</b>
                    </div>
                    <div className="hp-bar enemy-hp">
                      <i style={{ width: Math.max(0, 100 - progress) + "%" }} />
                    </div>
                    <img
                      src={`${import.meta.env.BASE_URL}slime.webp`}
                      alt="통통한 파란색 미루기 슬라임"
                    />
                  </div>
                  {battle > 0 && (
                    <>
                      <span className="attack-star">✦</span>
                      <span className="damage-pop">+10 XP!</span>
                    </>
                  )}
                  <div className="battle-tip">
                    {battle
                      ? "NICE! 경험치를 획득했어요 ✨"
                      : "아래 퀘스트를 누르면 모험이 시작돼요!"}
                  </div>
                </div>
                <div className="garden-decorations">
                  {decorations
                    .filter((d) => profile.decorations?.includes(d.id))
                    .map((d) => (
                      <span key={d.id} title={d.name}>
                        {d.icon}
                      </span>
                    ))}
                </div>
              </div>
              <div className="metrics">
                <Metric
                  icon={<Heart />}
                  label="함께 모은 기도"
                  value={`${all.filter((e) => e.kind === "prayer").reduce((n, e) => n + e.count, 0)}번`}
                  note="한 번의 기도에도 마음을 담아"
                  color="pink"
                />
                <Metric
                  icon={<Check />}
                  label="오늘의 퀘스트 기록"
                  value={`${todayCount}개`}
                  note="작은 실천도 충분히 소중해요"
                  color="green"
                />
                <Metric
                  icon={<Flower2 />}
                  label="감사로 남긴 이야기"
                  value={`${summary.done}개`}
                  note="우리에게 찾아온 작은 변화"
                  color="gold"
                />
              </div>
            </>
          )}
          <div className="body-grid">
            <section className="main-section">
              {["home", "prayer", "task", "archive"].includes(tab) && (
                <>
                  <div className="section-title">
                    <div>
                      <h2>
                        {tab === "archive"
                          ? "클리어한 퀘스트"
                          : tab === "task"
                            ? "오늘의 작은 실천"
                            : tab === "prayer"
                              ? "마음을 모으는 기도"
                              : "오늘의 퀘스트"}{" "}
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
                      ["mine", "내 퀘스트"],
                      ["secret", "나만의 비밀"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={filter === key ? "selected" : ""}
                      >
                        {key === "secret" && <LockKeyhole size={13} />} {label}
                      </button>
                    ))}
                  </div>
                  <div className="entry-list">
                    {shown.length ? (
                      shown.map((e) => (
                        <article className="entry" key={e.id}>
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
                              {e.count}번 <span>·</span> 감동{" "}
                              {e.comments.length} <ChevronRight size={12} />
                            </span>
                          </button>
                          {e.rating == null ? (
                            <button
                              className={`record ${e.kind}`}
                              aria-label={`${e.title} ${e.kind === "prayer" ? "기도" : "실천"} 기록`}
                              disabled={busy}
                              onClick={() => record(e)}
                            >
                              {e.kind === "prayer" ? (
                                <Heart size={17} />
                              ) : (
                                <Check size={17} />
                              )}
                              <span>
                                {e.kind === "prayer"
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
                        </article>
                      ))
                    ) : (
                      <div className="empty">
                        <span>🌱</span>
                        <h3>
                          {tab === "archive"
                            ? "아직 감사 기록이 없어요"
                            : "아직 등록된 퀘스트가 없어요"}
                        </h3>
                        <p>
                          {tab === "archive"
                            ? "항목을 열고 여정을 마무리하면 여기에 모여요."
                            : "첫 번째 퀘스트를 등록해 볼까요?"}
                        </p>
                        <button
                          className="secondary"
                          onClick={() => setModal("new")}
                        >
                          퀘스트 등록
                        </button>
                      </div>
                    )}
                  </div>
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
                        stats(all.filter((e) => e.kind === "prayer")).average ==
                        null
                          ? "아직 없어요"
                          : `${stats(all.filter((e) => e.kind === "prayer")).average}번`
                      }
                      note="5단계로 마친 기도의 누적 기도 횟수 평균"
                      color="pink"
                    />
                    <Metric
                      icon={<Check />}
                      label="5단계 실천 평균"
                      value={
                        stats(all.filter((e) => e.kind === "task")).average ==
                        null
                          ? "아직 없어요"
                          : `${stats(all.filter((e) => e.kind === "task")).average}번`
                      }
                      note="5단계로 마친 할 일의 누적 실천 횟수 평균"
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
                      const n = all.filter((e) => e.rating === i + 1).length;
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
                    <h2>소망이의 모험 보상 상점</h2>
                    <p>차곡차곡 모은 코인으로 새 아이템을 모아 보세요!</p>
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
                <span className="eyebrow">MY CHARACTER</span>
                <h3>나의 캐릭터 · 소망이</h3>
                <div className="pet-picture">
                  <img
                    src={`${import.meta.env.BASE_URL}sheep-hero.webp`}
                    alt="하트 방패를 든 모험가 소망이"
                  />
                </div>
                <span className="pet-level">
                  Lv.{level} ·{" "}
                  {level < 5
                    ? "초보 모험가"
                    : level < 10
                      ? "숙련 모험가"
                      : "소망의 기사"}
                </span>
                <p>
                  “오늘의 퀘스트도
                  <br />
                  함께 클리어하자!”
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
                  <h3>우리 파티</h3>
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
                <p>함께하면 더 신나는 모험!</p>
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
                <h2>새 퀘스트 만들기</h2>
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
                    placeholder="어떤 퀘스트에 도전할까요?"
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
                  {busy ? "등록 중…" : "퀘스트 등록"}
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
                  <h3>무료 플레이 한도</h3>
                  <p>
                    팀원 최대 100명 · 공유 퀘스트 100개 · 항목당 댓글 100개 ·
                    계정별 하루 보상 기록 200회(한국 자정 초기화).
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
                    : `${current.authorName}님의 퀘스트`}
                </span>
                <h2>{current.title}</h2>
                <div className="detail-body">
                  {current.body || "아직 자세한 이야기가 없어요."}
                </div>
                <div className="detail-count">
                  <Heart size={17} />{" "}
                  {current.kind === "prayer" ? "함께 기도한" : "실천을 남긴"}{" "}
                  횟수 <strong>{current.count}번</strong>
                </div>
                {current.rating == null ? (
                  <>
                    <button
                      className="primary full"
                      disabled={busy}
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
                          지금 느끼는 변화를 골라 주세요. 어떤 단계도 소중해요.
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
                        <p className="rating-label">{ratings[rating - 1]}</p>
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
                    마음에 남은 감동 <span>{current.comments.length}</span>
                  </h3>
                  {current.comments.map((c) => (
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
                  {!current.comments.length && (
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
