import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  getDoc,
  query,
  where,
  limit,
  onSnapshot,
  type Firestore,
  type DocumentData,
} from "firebase/firestore";
import { normalize } from "./spark";
export type CirclePerson = {
  name: string;
  team: string;
  role: "member" | "leader" | "director";
};
export type CircleTeam = {
  parentTeam?: string;
  name: string;
  leader: string;
  code: string;
  gate: string;
  open: boolean;
  approval: boolean;
};
export type Circle = {
  id: string;
  schema?: number;
  lastEntry?: string;
  name: string;
  director: string;
  people: Record<string, CirclePerson>;
  teams: Record<string, CircleTeam>;
  entryCount: number;
};
const clean = (v: unknown, max = 100) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    throw Error("입력 내용을 확인해 주세요.");
  return v.trim();
};
export async function joinProof(code: string, password: string) {
  const c = code.trim().toUpperCase();
  if (
    !/^[A-Z0-9]{8,16}$/.test(c) ||
    password.length < 10 ||
    password.length > 100
  )
    throw Error("팀 코드와 10자 이상 참여 비밀번호를 확인해 주세요.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode("pray-circle-v1:" + c),
      iterations: 210000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export const newTeamCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) =>
    x.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
export function watchCircleEntries(
  db: Firestore,
  circle: Circle,
  uid: string,
  fn: (v: any[]) => void,
  fail: (e: Error) => void,
) {
  const person = circle.people[uid];
  if (!person) {
    fn([]);
    return () => {};
  }
  const q =
    person.role === "director"
      ? query(collection(db, `circles/${circle.id}/entries`), limit(100))
      : query(
          collection(db, `circles/${circle.id}/entries`),
          where("teamId", "in", ["all", person.team]),
          limit(100),
        );
  return onSnapshot(
    q,
    (s) => fn(s.docs.map((d) => ({ id: d.id, ...normalize(d.data()) }))),
    fail,
  );
}
export function legacyCircleCommands(db: Firestore, uid: string) {
  const profileRef = doc(db, "profiles", uid);
  const execute = async (
    action: string,
    data: Record<string, any>,
  ): Promise<any> => {
    if (action === "create") {
      const name = clean(data.name, 40),
        teamName = clean(data.teamName, 40),
        ref = doc(collection(db, "circles")),
        team = crypto.randomUUID();
      await runTransaction(db, async (tx) => {
        const p = await tx.get(profileRef);
        if (!p.exists() || p.data().activeCircle)
          throw Error("이미 기도단에 소속되어 있어요.");
        tx.set(ref, {
          name,
          director: uid,
          createdAt: serverTimestamp(),
          people: { [uid]: { name: p.data().name, team, role: "director" } },
          teams: {
            [team]: {
              name: teamName,
              leader: uid,
              code: "",
              gate: "",
              open: false,
              approval: false,
            },
          },
          entryCount: 0,
          lastEntry: "",
          lastJoined: uid,
          lastTeam: team,
        });
        tx.update(profileRef, { activeCircle: ref.id });
      });
      return { id: ref.id };
    }
    if (action === "join") {
      const proof = await joinProof(data.code, data.password),
        gateRef = doc(db, "circleGates", proof);
      // No searchable password hashes or public roster: a wrong proof cannot enumerate teams.
      const gate = await getDoc(gateRef);
      if (!gate.exists())
        throw Error("팀 코드 또는 참여 비밀번호가 맞지 않아요.");
      const g = gate.data(),
        ref = doc(db, "circles", g.circle),
        requestRef = doc(ref, "requests", uid);
      await runTransaction(db, async (tx) => {
        const p = await tx.get(profileRef),
          existing = await tx.get(requestRef);
        if (!p.exists()) throw Error("별명으로 먼저 시작해 주세요.");
        if (existing.exists()) return;
        if (p.data().activeCircle && p.data().activeCircle !== g.circle)
          throw Error("이미 다른 기도단에 참여 중이에요.");
        // Gate access grants only admission. The roster is never read before admission.
        tx.set(requestRef, {
          uid,
          name: clean(data.name, 40),
          team: g.team,
          proof,
          createdAt: serverTimestamp(),
          status: "pending",
        });
        tx.update(profileRef, { activeCircle: g.circle });
      });
      return { id: g.circle };
    }
    const id = clean(data.circle),
      ref = doc(db, "circles", id);
    if (action === "approve" || action === "admit") {
      const member = action === "admit" ? uid : clean(data.uid),
        rr = doc(ref, "requests", member);
      return runTransaction(db, async (tx) => {
        const r = await tx.get(rr);
        if (!r.exists()) throw Error("참여 요청을 확인해 주세요.");
        const rdata = r.data();
        if (rdata.status === "accepted") return;
        tx.update(ref, {
          lastJoined: member,
          [`people.${member}`]: {
            name: rdata.name,
            team: rdata.team,
            role: "member",
          },
        });
        tx.update(rr, { status: "accepted" });
      });
    }
    if (action === "team" || action === "gate" || action === "promote") {
      const team = data.team || crypto.randomUUID();
      const proof =
        action === "gate" ? await joinProof(data.code, data.password) : "";
      return runTransaction(db, async (tx) => {
        const c = await tx.get(ref);
        if (!c.exists()) throw Error("기도단을 찾지 못했어요.");
        const v = c.data(),
          teams = { ...v.teams },
          people = { ...v.people };
        if (action === "team") {
          teams[team] = {
            name: clean(data.name, 40),
            leader: v.director,
            code: "",
            gate: "",
            open: false,
            approval: false,
          };
        }
        if (action === "gate") {
          if (!teams[team]) throw Error("팀을 선택해 주세요.");
          const old = teams[team].gate;
          if (old && old !== proof) tx.delete(doc(db, "circleGates", old));
          tx.set(doc(db, "circleGates", proof), {
            circle: id,
            team,
            code: data.code.trim().toUpperCase(),
          });
          teams[team] = {
            ...teams[team],
            gate: proof,
            code: data.code.trim().toUpperCase(),
            open: !!data.open,
            approval: !!data.approval,
          };
        }
        if (action === "promote") {
          const target = clean(data.uid);
          if (
            !people[target] ||
            people[target].team !== team ||
            target === v.director
          )
            throw Error("해당 팀의 정식 계정 팀원을 선택해 주세요.");
          const old = teams[team].leader;
          if (old !== v.director && people[old])
            people[old] = { ...people[old], role: "member" };
          people[target] = { ...people[target], role: "leader" };
          teams[team] = { ...teams[team], leader: target };
        }
        tx.update(ref, { teams, people, lastTeam: team });
        return { team };
      });
    }
    if (action === "createEntry") {
      const item = doc(collection(ref, "entries"));
      return runTransaction(db, async (tx) => {
        const c = await tx.get(ref),
          p = await tx.get(profileRef);
        if (!c.exists() || !p.exists()) throw Error("기도단에 참여해 주세요.");
        const v = c.data(),
          person = v.people[uid];
        if (!person) throw Error("참여 승인 후 등록할 수 있어요.");
        tx.set(item, {
          title: clean(data.title),
          body: typeof data.body === "string" ? data.body.trim() : "",
          kind: data.kind,
          author: uid,
          authorName: person.name,
          teamId: data.teamId || person.team,
          createdAt: serverTimestamp(),
          count: 0,
          counts: {},
          lastTimes: {},
          comments: [],
          outcomes: {},
          source:
            person.role === "director"
              ? "단장이 나눴어요"
              : person.role === "leader"
                ? "팀장이 나눴어요"
                : "팀원이 나눴어요",
          closed: false,
        });
        tx.update(ref, { entryCount: v.entryCount + 1, lastEntry: item.id });
        return { id: item.id };
      });
    }
    const itemRef = doc(ref, "entries", clean(data.id));
    return runTransaction(db, async (tx) => {
      const s = await tx.get(itemRef);
      if (!s.exists()) throw Error("항목을 찾지 못했어요.");
      const v = s.data();
      if (action === "editItem") {
        tx.update(itemRef, {
          title: clean(data.title),
          body: typeof data.body === "string" ? data.body.trim() : "",
        });
        return;
      }
      if (action === "close") {
        tx.update(itemRef, {
          closed: true,
          result: data.rating,
          closedAt: serverTimestamp(),
        });
        return;
      }
      if (action === "comment") {
        tx.update(itemRef, {
          comments: [
            ...v.comments,
            {
              id: crypto.randomUUID(),
              uid,
              name: clean(data.name, 40),
              text: clean(data.text, 1000),
              at: TimestampNow(),
            },
          ],
        });
        return;
      }
      if (action !== "log" && action !== "complete")
        throw Error("지원하지 않는 요청이에요.");
      const p = await tx.get(profileRef);
      if (!p.exists()) throw Error("프로필이 없어요.");
      const pv = p.data(),
        eventRef = doc(itemRef, "events", data.eventId || crypto.randomUUID()),
        event = await tx.get(eventRef);
      if (event.exists()) return;
      if (v.closed || v.outcomes[uid]) throw Error("이미 마무리한 기록이에요.");
      const day = Math.floor((Date.now() + 32400000) / 86400000),
        n = pv.dailyDay === day ? pv.dailyCount + 1 : 1;
      tx.set(eventRef, { uid, kind: action, at: serverTimestamp() });
      if (action === "log")
        tx.update(itemRef, {
          count: v.count + 1,
          counts: { ...v.counts, [uid]: (v.counts[uid] || 0) + 1 },
          lastTimes: { ...v.lastTimes, [uid]: serverTimestamp() },
          eventId: eventRef.id,
          lastActor: uid,
        });
      else
        tx.update(itemRef, {
          outcomes: {
            ...v.outcomes,
            [uid]: {
              rating: data.rating,
              count: v.counts[uid] || 0,
              completedAt: serverTimestamp(),
            },
          },
          eventId: eventRef.id,
          lastActor: uid,
        });
      tx.update(profileRef, {
        xp: pv.xp + (action === "log" ? 10 : 20),
        coins: pv.coins + (action === "log" ? 2 : 5),
        dailyDay: day,
        dailyCount: n,
        lastEvent: { circle: id, item: itemRef.id, event: eventRef.id },
      });
    });
  };
  return async (action: string, data: Record<string, any>) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await execute(action, data);
      } catch (e) {
        if (
          attempt >= 2 ||
          !["log", "complete", "createEntry", "comment"].includes(action) ||
          (e as { code?: string }).code !== "permission-denied"
        )
          throw e;
        await new Promise((r) => setTimeout(r, 150 + attempt * 200));
      }
    }
  };
}
import { Timestamp } from "firebase/firestore";
const TimestampNow = () => Timestamp.now();

export { scalableCommands as circleCommands } from "./scalable";
