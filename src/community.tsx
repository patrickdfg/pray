import React, { useEffect, useLayoutEffect, useState } from "react";
import {
  doc,
  getDoc,
  updateDoc,
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
import { usePagedRows } from "./paging";
export function useCircle(uid: string, id?: string) {
  const [root, setRoot] = useState<any>(null),
    [own, setOwn] = useState<any>(null),
    [ownTeam, setOwnTeam] = useState<any>(null),
    [extraTeams, setExtraTeams] = useState<Record<string, any>>({}),
    [pending, setPending] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    setRoot(null);
    setOwn(null);
    setExtraTeams({});
    setOwnTeam(null);
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
    if (!id || !ready) return;
    return watchDoc(`circles/${id}`, setRoot, () => setRoot(null));
  }, [id, ready, pending]);
  useEffect(() => {
    if (!id || root?.schema !== 3) return;
    return watchDoc(`circles/${id}/members/${uid}`, setOwn, () => setOwn(null));
  }, [id, root?.schema, uid]);
  useEffect(() => {
    if (!id || root?.schema !== 3 || !own?.team) return;
    return watchDoc(
      `circles/${id}/teamDocs/${own.team}`,
      (t) => setOwnTeam(t ? { id: own.team, ...t } : null),
      () => setOwnTeam(null),
    );
  }, [id, root?.schema, own?.team]);
  const teams = usePagedRows(
    db,
    root?.schema === 3 && own && id ? `circles/${id}/teamDocs` : null,
  );
  const managed = usePagedRows(
    db,
    root?.schema === 3 && own && id ? `circles/${id}/teamDocs` : null,
    { field: "leader", value: uid },
  );
  const people = usePagedRows(
    db,
    root?.schema === 3 && own && id ? `circles/${id}/members` : null,
  );
  useEffect(() => {
    const refresh = (e: Event) => {
      if ((e as CustomEvent).detail?.circle === id) {
        teams.refresh();
        managed.refresh();
        people.refresh();
        const team = (e as CustomEvent).detail?.team;
        if (team && db && id)
          void getDoc(doc(db, `circles/${id}/teamDocs/${team}`)).then((s) => {
            if (s.exists()) setExtraTeams((v) => ({ ...v, [team]: s.data() }));
          });
      }
    };
    window.addEventListener("pray:directory", refresh);
    return () => window.removeEventListener("pray:directory", refresh);
  }, [id]);
  const circle: Circle | null = root
    ? root.schema === 3
      ? own
        ? {
            ...root,
            id,
            teams: {
              ...Object.fromEntries(teams.rows.map((t) => [t.id, t])),
              ...Object.fromEntries(managed.rows.map((t) => [t.id, t])),
              ...extraTeams,
              ...(ownTeam ? { [ownTeam.id]: ownTeam } : {}),
            },
            people: {
              ...Object.fromEntries(people.rows.map((p) => [p.id, p])),
              [uid]: own,
            },
          }
        : null
      : { ...root, id }
    : null;
  return {
    circle,
    pending,
    directory: {
      teamMore: teams.more || managed.more,
      memberMore: people.more,
      loading: teams.loading || people.loading || managed.loading,
      moreTeams: async () => {
        await Promise.all([
          teams.more ? teams.loadMore() : Promise.resolve(),
          managed.more ? managed.loadMore() : Promise.resolve(),
        ]);
      },
      moreMembers: people.loadMore,
      refresh() {
        teams.refresh();
        people.refresh();
      },
    },
  };
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
  directory,
  activeCircle,
  circleIds,
}: {
  circle: Circle | null;
  pending: boolean;
  uid: string;
  activeCircle: string;
  circleIds: string[];
  notify: (s: string) => void;
  run: (f: () => Promise<void>) => Promise<void>;
  busy: boolean;
  entries: any[];
  directory?: {
    teamMore: boolean;
    memberMore: boolean;
    loading: boolean;
    moreTeams: () => Promise<void>;
    moreMembers: () => Promise<void>;
    refresh: () => void;
  };
}) {
  const [name, setName] = useState(""),
    [code, setCode] = useState(
      new URLSearchParams(location.search).get("teamCode") || "",
    ),
    [password, setPassword] = useState(""),
    [teamName, setTeamName] = useState(""),
    [chosen, setChosen] = useState(""),
    [gateCode, setGateCode] = useState(""),
    [gatePass, setGatePass] = useState(""),
    [open, setOpen] = useState(true),
    [approval, setApproval] = useState(false),
    [circleNames, setCircleNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!db) return;
    let alive = true;
    void Promise.all(
      circleIds.map(async (id) => {
        try {
          const result = await getDoc(doc(db!, "circles", id));
          return [id, result.data()?.name || "참여 승인 대기 중"] as const;
        } catch {
          return [id, "참여 승인 대기 중"] as const;
        }
      }),
    ).then((values) => {
      if (alive) setCircleNames(Object.fromEntries(values));
    });
    return () => {
      alive = false;
    };
  }, [circleIds.join("|")]);
  const person = circle?.people[uid];
  const director = person?.role === "director";
  const joinedTeams = person?.teams ?? (person?.team ? [person.team] : []);
  const allTeams = circle
    ? Object.entries(circle.teams).filter(
        ([id, t]) => director || joinedTeams.includes(id) || t.leader === uid,
      )
    : [];
  const teams = allTeams.filter(([, t]) => !t.archived);
  const managedTeams = teams.filter(([, t]) => director || t.leader === uid);
  const archivedTeams = allTeams.filter(
    ([, t]) => t.archived && (director || t.leader === uid),
  );
  const selected = managedTeams.some(([id]) => id === chosen)
    ? chosen
    : managedTeams[0]?.[0] || "";
  const manager = !!selected;
  useLayoutEffect(() => {
    const t = circle?.teams[selected];
    setGateCode(t?.code || newTeamCode());
    setGatePass("");
    setOpen(t?.open ?? true);
    setApproval(t?.approval ?? false);
  }, [selected, circle?.teams[selected]?.gate]);
  const requestPage = usePagedRows(
    db,
    circle && manager ? `circles/${circle.id}/requests` : null,
    director
      ? { field: "status", value: "pending" }
      : [
          { field: "status", value: "pending" },
          { field: "team", value: selected },
        ],
    (e) => notify(e.message),
  );
  const requests = requestPage.rows.filter((r) => r.status === "pending");
  const act = async (action: string, payload: any = {}) => {
    if (!db) throw Error("실제 참여는 서버 연결이 필요해요.");
    const result = await circleCommands(db, uid)(action, {
      circle: circle?.id,
      schema: circle?.schema || 2,
      ...payload,
    });
    if (action === "approve") requestPage.refresh();
    return result;
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
        await circleCommands(db!, user.uid)("admit", {
          circle: r.id,
          schema: r.schema,
        });
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
      {circleIds.length > 0 && (
        <div className="community-inline">
          <label>
            현재 기도단 선택
            <select
              aria-label="현재 기도단"
              value={activeCircle}
              onChange={(e) =>
                run(async () => {
                  await updateDoc(doc(db!, "profiles", uid), {
                    activeCircle: e.target.value,
                  });
                  notify("선택한 기도단으로 이동했어요.");
                })
              }
            >
              {circleIds.map((id) => (
                <option key={id} value={id}>
                  {id === activeCircle && circle ? circle.name : circleNames[id] || "기도단 불러오는 중"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!circle && !pending && (
        <>
          <p>팀 코드를 먼저 적고, 이름과 참여 비밀번호를 입력해 주세요.</p>
          <div className="community-grid">
            <section>
              <h3>팀 코드로 참여하기</h3>
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
                이름
                <input
                  maxLength={40}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="nickname"
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
              <h3>팀장으로 시작하기</h3>
              <p>
                내 팀을 먼저 만들면 자동으로 단장이 돼요. 팀원도 자기 팀을
                만들어 친구를 데려올 수 있어요.
              </p>
              <label>
                팀 이름
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
                    await act("create", {
                      name: teamName,
                      teamName,
                    });
                    notify(
                      "팀을 만들었어요. 첫 팀장인 내가 자동으로 단장이 됐어요.",
                    );
                  })
                }
              >
                내 팀 만들기
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
            {director ? "단장 (첫 팀장)" : manager ? "팀장" : "팀원"} ·
            {circle.schema === 3 ? "불러온 팀원" : "전체"}{" "}
            {Object.keys(circle.people).length}명
          </p>
          <details className="community-extra">
            <summary>다른 기도단·팀에 추가 가입</summary>
            <p className="hint">
              현재 기도단을 떠나지 않고 다른 기도단이나 팀에도 가입할 수 있어요.
              가입하면 상단의 기도단 선택 메뉴로 오갈 수 있어요.
            </p>
            <label>
              새 팀 코드
              <input
                value={code}
                maxLength={16}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </label>
            <label>
              참여할 이름
              <input
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                placeholder={person?.name || "이름"}
              />
            </label>
            <label>
              참여 비밀번호
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy} onClick={join}>
              팀에 추가 가입
            </button>
          </details>
          <details className="community-extra">
            <summary>새 기도단 만들기</summary>
            <p className="hint">
              기존 기도단은 그대로 유지되고, 새 기도단의 단장이 됩니다.
            </p>
            <label>
              새 기도단 및 첫 팀 이름
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
                  if (!sessionUser() || sessionUser()?.isAnonymous)
                    throw Error("새 기도단은 Google 또는 이메일 계정으로 만들어 주세요.");
                  await command("bootstrap");
                  await act("create", { name: teamName, teamName });
                  setTeamName("");
                  notify("새 기도단을 만들었어요. 기존 기도단도 계속 이용할 수 있어요.");
                })
              }
            >
              새 기도단 생성
            </button>
          </details>
          {circle.schema !== 3 && director && (
            <div className="hint">
              <p>
                기존 자료를 보존하고 인원·글 개수 제한 없는 새 저장 구조로
                전환할 수 있어요.
              </p>
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await act("migrate");
                    notify("자료를 보존하고 새 저장 구조로 전환했어요.");
                  })
                }
              >
                새 저장 구조로 전환
              </button>
            </div>
          )}
          <p className="hint">
            횟수와 인원은 불러온 기록·팀원 기준이에요. 더 보기로 계속 불러올 수
            있어요. 단장 공통 글 → 모든 팀 · 팀 공통 글 → 해당 팀만 · 비밀 글 →
            본인 기기만. 한 사람의 완료는 다른 사람의 기록을 끝내지 않아요.
          </p>
          <div className="community-grid">
            {teams.map(([id, t]) => {
              const roster = Object.entries(circle.people).filter(
                ([, p]) => (p.teams ?? [p.team]).includes(id),
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
                      (circle.schema === 3
                        ? (e.totalCount ?? e.count ?? 0)
                        : roster.reduce(
                            (k, [u]) => k + (e.counts?.[u] || 0),
                            0,
                          )),
                    0,
                  );
              return (
                <section key={id}>
                  <h3>{t.name}</h3>
                  {t.parentTeam && (
                    <small>
                      함께 시작한 팀:{" "}
                      {circle.teams[t.parentTeam]?.name || "상위 팀"}
                    </small>
                  )}
                  {t.code && (
                    <p>
                      우리 팀 코드: <strong>{t.code}</strong>
                      <br />
                      <small>
                        친구에게 이 코드와 참여 비밀번호를 알려주면 같은 팀에
                        참여할 수 있어요.
                      </small>
                    </p>
                  )}
                  <p>
                    팀장: {circle.people[t.leader]?.name || "팀장"} ·{" "}
                    {roster.length}명 ·{" "}
                    {circle.schema === 3 ? "공유 글 기도" : "기도"}{" "}
                    {total("prayer")}회 · 실천 {total("task")}회
                  </p>
                  {roster.map(([u, p]) => (
                    <div className="circle-member" key={u}>
                      <span>
                        {p.name} {u === uid ? "(나)" : ""} ·{" "}
                        {p.role === "director"
                          ? "단장"
                          : t.leader === u
                            ? "팀장"
                            : "팀원"}
                      </span>
                      {(director || t.leader === uid) &&
                        circle.schema === 3 &&
                        u !== t.leader &&
                        u !== circle.director && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`${p.name}님을 '${t.name}' 팀에서 해지할까요? 기존 기도 기록은 보존됩니다.`))
                                return;
                              void run(async () => {
                                await act("removeMember", { team: id, uid: u });
                                notify("해당 팀에서 팀원 소속을 해지했어요.");
                              });
                            }}
                          >
                            팀에서 해지
                          </button>
                        )}
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
          {directory && (
            <div className="community-inline">
              {directory.teamMore && (
                <button
                  className="secondary"
                  disabled={directory.loading}
                  onClick={directory.moreTeams}
                >
                  팀 더 보기
                </button>
              )}
              {directory.memberMore && (
                <button
                  className="secondary"
                  disabled={directory.loading}
                  onClick={directory.moreMembers}
                >
                  팀원 더 보기
                </button>
              )}
              <button className="text-button" onClick={directory.refresh}>
                목록 새로고침
              </button>
            </div>
          )}
          {(director || circle.schema === 3) && (
            <div className="community-inline">
              <label>
                새로 만들 내 팀 이름
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
                내 팀 추가
              </button>
            </div>
          )}
          {manager && circle.teams[selected] && (
            <details className="team-gate">
              <summary>팀 입장 관리 · 코드와 비밀번호</summary>
              <label>
                관리할 팀
                <select
                  aria-label="관리할 팀"
                  value={selected}
                  onChange={(e) => setChosen(e.target.value)}
                >
                  {managedTeams.map(([id, t]) => (
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
              {circle.schema === 3 && circle.teams[selected]?.parentTeam && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    const teamName = circle.teams[selected].name;
                    if (!window.confirm(`'${teamName}' 팀을 목록에서 삭제할까요? 팀원을 먼저 해지해야 하며 기존 기록은 보관됩니다.`))
                      return;
                    void run(async () => {
                      await act("archiveTeam", { team: selected });
                      setChosen("");
                      notify("팀을 보관했어요. 기존 기도 기록은 삭제되지 않았어요.");
                    });
                  }}
                >
                  팀 삭제 · 기존 기록 보관
                </button>
              )}
            </details>
          )}
          {archivedTeams.length > 0 && (
            <details className="community-extra">
              <summary>보관된 팀 ({archivedTeams.length})</summary>
              <p className="hint">삭제한 팀의 기도 기록은 보존됩니다. 필요하면 복원할 수 있어요.</p>
              {archivedTeams.map(([id, t]) => (
                <div className="circle-member" key={id}>
                  <span>{t.name}</span>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await act("restoreTeam", { team: id });
                        notify("팀을 복원했어요. 필요하면 입장 설정을 다시 열어 주세요.");
                      })
                    }
                  >
                    팀 복원
                  </button>
                </div>
              ))}
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
      {manager && requestPage.more && (
        <button
          className="secondary"
          disabled={requestPage.loading}
          onClick={requestPage.loadMore}
        >
          참여 요청 더 보기
        </button>
      )}
      <AccountOptions notify={notify} run={run} busy={busy} />
    </div>
  );
}
