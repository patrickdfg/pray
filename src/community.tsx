import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
} from "firebase/firestore";
import {
  connected,
  db,
  watchDoc,
  guestLogin,
  sessionUser,
  emailLogin,
  login,
  command,
  resetEmailAccount,
} from "./cloud";
import { circleCommands, newTeamCode, type Circle } from "./circles";
export function useCircle(uid: string, id?: string) {
  const [circle, setCircle] = useState<Circle | null>(null),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    setCircle(null);
    setReady(false);
    setPending(false);
    if (!id || uid === "guest" || !db) return;
    return watchDoc(
      `circles/${id}/requests/${uid}`,
      (r) => {
        setPending(r?.status === "pending");
        setReady(true);
      },
      () => setReady(false),
    );
  }, [uid, id]);
  useEffect(() => {
    if (!id || !ready || pending) return;
    return watchDoc(
      `circles/${id}`,
      (v) => setCircle(v ? { id, ...v } : null),
      () => setCircle(null),
    );
  }, [id, ready, pending]);
  return { circle, pending };
}
export function AccountOptions({
  notify,
  run,
  busy,
}: {
  notify: (s: string) => void;
  run: (f: () => Promise<void>) => Promise<void>;
  busy: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [create, setCreate] = useState(false);
  return (
    <details className="account-options">
      <summary>이메일로 로그인 · 별명 계정 연결</summary>
      <p>
        같은 휴대폰·같은 브라우저에서는 로그인이 유지돼요. 별명 계정에 연결하면
        현재 기록을 그대로 보관해요.
      </p>
      <label>
        이메일
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        계정 비밀번호
        <input
          type="password"
          minLength={8}
          autoComplete={create ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {!sessionUser()?.isAnonymous && (
        <label className="check-line">
          <input
            type="checkbox"
            checked={create}
            onChange={(e) => setCreate(e.target.checked)}
          />
          새 이메일 계정 만들기
        </label>
      )}
      <button
        className="secondary"
        disabled={busy || !connected}
        onClick={() =>
          run(async () => {
            await emailLogin(email, password, create);
            await command("bootstrap");
            setPassword("");
            notify("계정을 연결했어요. 다음 방문에도 로그인이 유지돼요.");
          })
        }
      >
        이메일로 계속하기
      </button>
      <button
        className="text-button"
        disabled={busy || !connected}
        onClick={() =>
          run(async () => {
            await resetEmailAccount(email);
            notify(
              "해당 이메일로 가입한 계정이 있다면 비밀번호 재설정 메일이 전송됩니다.",
            );
          })
        }
      >
        계정 비밀번호 재설정 메일
      </button>
      {sessionUser()?.isAnonymous && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await login();
              await command("bootstrap");
              notify("Google 계정에 기존 기록을 연결했어요.");
            })
          }
        >
          현재 기록을 Google에 연결하기
        </button>
      )}
      <p className="hint">
        이미 사용 중인 Google·이메일 계정에는 자동 합치지 않아요. 연결 오류가
        나도 현재 별명 기록은 유지됩니다.
      </p>
    </details>
  );
}
export function CirclePanel({
  circle,
  pending,
  uid,
  notify,
  run,
  busy,
  entries,
}: {
  circle: Circle | null;
  pending: boolean;
  uid: string;
  notify: (s: string) => void;
  run: (f: () => Promise<void>) => Promise<void>;
  busy: boolean;
  entries: any[];
}) {
  const [name, setName] = useState(""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("teamCode") || "",
    ),
    [password, setPassword] = useState(""),
    [circleName, setCircleName] = useState(""),
    [teamName, setTeamName] = useState(""),
    [chosen, setChosen] = useState(""),
    [gateCode, setGateCode] = useState(""),
    [gatePass, setGatePass] = useState(""),
    [open, setOpen] = useState(true),
    [approval, setApproval] = useState(false),
    [requests, setRequests] = useState<any[]>([]);
  const person = circle?.people[uid],
    director = person?.role === "director",
    manager = director || person?.role === "leader";
  const teams = circle
    ? Object.entries(circle.teams).filter(
        ([id]) => director || id === person?.team,
      )
    : [];
  const selected = chosen || teams[0]?.[0] || "";
  useEffect(() => {
    const t = circle?.teams[selected];
    setGateCode(t?.code || newTeamCode());
    setGatePass("");
    setOpen(t?.open ?? true);
    setApproval(t?.approval ?? false);
  }, [selected, circle?.teams[selected]?.gate]);
  useEffect(() => {
    setRequests([]);
    if (!circle || !manager || !db) return;
    const base = collection(db, `circles/${circle.id}/requests`);
    const q = director
      ? query(base, limit(100))
      : query(base, where("team", "==", person!.team), limit(100));
    return onSnapshot(
      q,
      (s) =>
        setRequests(
          s.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((r) => (r as any).status === "pending"),
        ),
      (e) => notify(e.message),
    );
  }, [circle?.id, manager, director, person?.team]);
  const act = async (action: string, payload: any = {}) => {
    if (!db) throw Error("실제 참여는 서버 연결이 필요해요.");
    return circleCommands(db, uid)(action, { circle: circle?.id, ...payload });
  };
  async function join() {
    await run(async () => {
      if (!sessionUser()) await guestLogin(name);
      else if (sessionUser()?.isAnonymous) await guestLogin(name);
      const user = sessionUser();
      if (!user) throw Error("별명 참여를 시작하지 못했어요.");
      const r = await circleCommands(db!, user.uid)("join", {
        code,
        password,
        name: name || user.displayName || "숲 친구",
      });
      try {
        await circleCommands(db!, user.uid)("admit", { circle: r.id });
        notify("팀에 참여했어요. 기도와 실천을 함께 기록해요!");
      } catch (e) {
        if ((e as any).code === "permission-denied")
          notify("팀장의 참여 승인을 기다리고 있어요.");
        else throw e;
      }
      setPassword("");
    });
  }
  return (
    <div className="community panel" data-testid="community">
      <h2>🌳 기도단과 우리 팀</h2>
      {!circle && !pending && (
        <>
          <p>
            팀원은 Google 없이 코드·참여 비밀번호·별명으로 들어올 수 있어요.
          </p>
          <div className="community-grid">
            <section>
              <h3>팀 코드로 참여하기</h3>
              <label>
                별명
                <input
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
                />
              </label>
              <label>
                팀 코드
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={16}
                  autoCapitalize="characters"
                />
              </label>
              <label>
                참여 비밀번호
                <input
                  type="password"
                  autoComplete="off"
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <button
                className="primary"
                disabled={busy || !connected}
                onClick={join}
              >
                별명으로 팀 참여
              </button>
              <p className="hint">
                입장용 비밀번호는 계정 복구용이 아니에요. 별명 참여 후
                Google·이메일을 연결하면 기기를 바꿔도 이어 쓸 수 있어요.
              </p>
            </section>
            <section>
              <h3>단장으로 시작하기</h3>
              <p>
                단장은 Google 또는 이메일 계정으로 기도단과 여러 팀을 관리해요.
              </p>
              <label>
                기도단 이름
                <input
                  value={circleName}
                  onChange={(e) => setCircleName(e.target.value)}
                  maxLength={40}
                />
              </label>
              <label>
                첫 팀 이름
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  maxLength={40}
                />
              </label>
              <button
                className="secondary"
                disabled={busy || !connected}
                onClick={() =>
                  run(async () => {
                    if (!sessionUser() || sessionUser()?.isAnonymous)
                      throw Error(
                        "먼저 Google 또는 이메일 계정을 연결해 주세요.",
                      );
                    await command("bootstrap");
                    await act("create", { name: circleName, teamName });
                    notify(
                      "기도단을 만들었어요. 팀 참여 비밀번호를 설정해 주세요.",
                    );
                  })
                }
              >
                기도단 만들기
              </button>
            </section>
          </div>
        </>
      )}
      {pending && (
        <div className="hint">
          <h3>참여 승인 대기 중</h3>
          <p>
            승인 전에는 기도제목·팀원·횟수가 공개되지 않아요. 팀장이 승인하면
            자동으로 열립니다.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const id = (await import("firebase/firestore")).getDoc;
                const s = await id(
                  (await import("firebase/firestore")).doc(
                    db!,
                    "profiles",
                    uid,
                  ),
                );
                await circleCommands(db!, uid)("admit", {
                  circle: s.data()?.activeCircle,
                });
                notify("팀 참여를 확인했어요.");
              })
            }
          >
            참여 상태 다시 확인
          </button>
        </div>
      )}
      {circle && (
        <>
          <p>
            <strong>{circle.name}</strong> ·{" "}
            {director ? "단장" : person?.role === "leader" ? "팀장" : "팀원"} ·
            전체 {Object.keys(circle.people).length}명
          </p>
          <p className="hint">
            단장 공통 글 → 모든 팀 · 팀 공통 글 → 해당 팀만 · 비밀 글 → 본인
            기기만. 한 사람의 완료는 다른 사람의 기록을 끝내지 않아요.
          </p>
          <div className="community-grid">
            {teams.map(([id, t]) => {
              const roster = Object.entries(circle.people).filter(
                ([, p]) => p.team === id,
              );
              const relevant = entries.filter(
                (e) => e.teamId === id || e.teamId === "all",
              );
              const total = (kind: string) =>
                relevant
                  .filter((e) => e.kind === kind)
                  .reduce(
                    (n, e) =>
                      n +
                      roster.reduce((k, [u]) => k + (e.counts?.[u] || 0), 0),
                    0,
                  );
              return (
                <section key={id}>
                  <h3>{t.name}</h3>
                  <p>
                    팀장: {circle.people[t.leader]?.name || "단장"} ·{" "}
                    {roster.length}명 · 기도 {total("prayer")}회 · 실천{" "}
                    {total("task")}회
                  </p>
                  {roster.map(([u, p]) => (
                    <div className="circle-member" key={u}>
                      <span>
                        {p.name} {u === uid ? "(나)" : ""} ·{" "}
                        {p.role === "director"
                          ? "단장"
                          : p.role === "leader"
                            ? "팀장"
                            : "팀원"}
                      </span>
                      {director &&
                        u !== circle.director &&
                        p.role !== "leader" && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await act("promote", { team: id, uid: u });
                                notify("팀장으로 지정했어요.");
                              })
                            }
                          >
                            팀장 지정
                          </button>
                        )}
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
          {director && (
            <div className="community-inline">
              <label>
                추가할 팀 이름
                <input
                  value={teamName}
                  maxLength={40}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const r = await act("team", { name: teamName });
                    setChosen(r.team);
                    setTeamName("");
                    notify("새 팀을 만들었어요.");
                  })
                }
              >
                팀 추가
              </button>
            </div>
          )}
          {manager && (
            <details>
              <summary>팀 입장 관리 · 코드와 비밀번호</summary>
              <label>
                관리할 팀
                <select
                  value={selected}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  {teams.map(([id, t]) => (
                    <option key={id} value={id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                팀 코드:{" "}
                <strong>
                  {circle.teams[selected]?.code || "아직 설정하지 않았어요"}
                </strong>
              </p>
              <button
                className="secondary"
                disabled={!circle.teams[selected]?.code}
                onClick={() =>
                  run(async () => {
                    const url = new URL(location.origin + location.pathname);
                    url.searchParams.set(
                      "teamCode",
                      circle.teams[selected].code,
                    );
                    await navigator.clipboard.writeText(url.toString());
                    notify(
                      "팀 코드 링크를 복사했어요. 참여 비밀번호는 따로 알려 주세요.",
                    );
                  })
                }
              >
                팀 코드 링크 복사
              </button>
              <label>
                새 참여 비밀번호
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  value={gatePass}
                  onChange={(e) => setGatePass(e.target.value)}
                  placeholder="10자 이상, 길고 예측하기 어렵게"
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={open}
                  onChange={(e) => setOpen(e.target.checked)}
                />
                신규 참여 허용
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={approval}
                  onChange={(e) => setApproval(e.target.checked)}
                />
                팀장 승인 후 입장
              </label>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await act("gate", {
                      team: selected,
                      code: gateCode,
                      password: gatePass,
                      open,
                      approval,
                    });
                    setGatePass("");
                    notify(
                      "입장 설정을 저장했어요. 기존 팀원의 소속은 유지돼요.",
                    );
                  })
                }
              >
                참여 비밀번호와 입장 설정 저장
              </button>
              <p className="hint">
                비밀번호를 바꿔도 기존 팀원은 그대로예요. 비밀번호 원문은
                저장하지 않습니다. 설정 변경 시 새 비밀번호를 입력해 주세요.
              </p>
            </details>
          )}
          {manager && requests.length > 0 && (
            <section>
              <h3>참여 승인 요청</h3>
              {requests.map((r) => (
                <div className="circle-member" key={r.id}>
                  <span>
                    {r.name} · {circle.teams[r.team]?.name}
                  </span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await act("approve", { uid: r.id });
                        notify("팀 참여를 승인했어요.");
                      })
                    }
                  >
                    승인
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      {!connected && (
        <p className="hint">
          현재는 체험 모드입니다. 실제 팀 코드 참여·단장 관리는 실제 앱에서
          이용해 주세요.
        </p>
      )}
      <AccountOptions notify={notify} run={run} busy={busy} />
    </div>
  );
}
