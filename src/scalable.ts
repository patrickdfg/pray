import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type Firestore,
  writeBatch,
} from "firebase/firestore";
import { legacyCircleCommands, joinProof } from "./circles";
const text = (v: unknown, max = 100) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    throw Error("입력 내용을 확인해 주세요.");
  return v.trim();
};
const key = (v: unknown) => {
  const s = text(v);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw Error("잘못된 식별자예요.");
  return s;
};
function changed(circle: string, team?: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("pray:directory", { detail: { circle, team } }),
    );
}
export function scalableCommands(db: Firestore, uid: string) {
  const profile = doc(db, "profiles", uid);
  const execute = async (
    action: string,
    data: Record<string, any>,
  ): Promise<any> => {
    if (action === "create") {
      const ref = doc(collection(db, "circles")),
        team = crypto.randomUUID();
      await runTransaction(db, async (tx) => {
        const p = await tx.get(profile);
        if (!p.exists() || p.data().activeCircle)
          throw Error("이미 기도단에 소속되어 있어요.");
        tx.set(ref, {
          schema: 3,
          name: text(data.name, 40),
          director: uid,
          createdAt: serverTimestamp(),
          lastEntry: "",
        });
        tx.set(doc(ref, "members", uid), {
          name: p.data().name,
          team,
          role: "director",
        });
        tx.set(doc(ref, "teamDocs", team), {
          name: text(data.teamName, 40),
          leader: uid,
          code: "",
          gate: "",
          open: false,
          approval: false,
        });
        tx.update(profile, { activeCircle: ref.id });
      });
      return { id: ref.id, schema: 3 };
    }
    if (action === "join") {
      const proof = await joinProof(data.code, data.password),
        g = await getDoc(doc(db, "circleGates", proof));
      if (!g.exists()) throw Error("팀 코드 또는 참여 비밀번호가 맞지 않아요.");
      if (g.data().schema !== 3)
        return legacyCircleCommands(db, uid)(action, data);
      const gate = g.data(),
        ref = doc(db, "circles", gate.circle),
        rr = doc(ref, "requests", uid);
      await runTransaction(db, async (tx) => {
        const p = await tx.get(profile),
          r = await tx.get(rr);
        if (!p.exists()) throw Error("먼저 이름으로 시작해 주세요.");
        if (p.data().activeCircle && p.data().activeCircle !== gate.circle)
          throw Error("이미 다른 기도단에 참여 중이에요.");
        if (r.exists()) return;
        tx.set(rr, {
          uid,
          name: text(data.name, 40),
          team: gate.team,
          proof,
          createdAt: serverTimestamp(),
          status: "pending",
        });
        tx.update(profile, { activeCircle: gate.circle });
      });
      return { id: gate.circle, schema: 3 };
    }
    const circle = key(data.circle),
      ref = doc(db, "circles", circle);
    let schema = data.schema;
    if (action === "admit" && !schema) {
      const r = await getDoc(doc(ref, "requests", uid));
      if (!r.exists()) throw Error("참여 요청을 확인해 주세요.");
      if (r.data().status === "accepted") return;
      const gate = await getDoc(doc(db, "circleGates", r.data().proof));
      schema = gate.data()?.schema || 2;
    }

    if (!schema) {
      const c = await getDoc(ref);
      schema = c.data()?.schema || 2;
    }
    if (action === "migrate") {
      const c = await getDoc(ref);
      if (!c.exists()) throw Error("기도단을 찾지 못했어요.");
      const original = c.data();
      if (original.schema === 3) return;
      if (original.director !== uid)
        throw Error("단장이 저장 구조를 전환할 수 있어요.");
      // Stage bounded batches first. The old document remains authoritative until activation.
      const copies: [any, any][] = [
        ...Object.entries(original.people || {}).map(
          ([id, p]) => [doc(ref, "members", id), p] as [any, any],
        ),
        ...Object.entries(original.teams || {}).map(
          ([id, t]) => [doc(ref, "teamDocs", id), t] as [any, any],
        ),
      ];
      for (let i = 0; i < copies.length; i += 30) {
        const batch = writeBatch(db);
        for (const [r, v] of copies.slice(i, i + 30)) batch.set(r, v);
        await batch.commit();
      }
      const gates = Object.values(original.teams || {}).filter(
        (t: any) => t.gate,
      ) as any[];
      for (let i = 0; i < gates.length; i += 8) {
        const batch = writeBatch(db);
        for (const t of gates.slice(i, i + 8))
          batch.update(doc(db, "circleGates", t.gate), { schema: 3 });
        await batch.commit();
      }
      await runTransaction(db, async (tx) => {
        const latest = await tx.get(ref),
          v = latest.data();
        if (v?.schema === 3) return;
        if (
          JSON.stringify(v?.people) !== JSON.stringify(original.people) ||
          JSON.stringify(v?.teams) !== JSON.stringify(original.teams)
        )
          throw Error(
            "전환 중 소속이 바뀌었어요. 다시 전환하면 이어서 처리해요.",
          );
        tx.update(ref, { schema: 3 });
      });
      changed(circle);
      return;
    }
    if (schema !== 3) return legacyCircleCommands(db, uid)(action, data);
    if (action === "admit" || action === "approve") {
      const target = action === "admit" ? uid : key(data.uid),
        rr = doc(ref, "requests", target),
        mr = doc(ref, "members", target);
      await runTransaction(db, async (tx) => {
        const r = await tx.get(rr);
        if (!r.exists()) throw Error("참여 요청을 확인해 주세요.");
        if (r.data().status === "accepted") return;
        tx.set(mr, {
          name: r.data().name,
          team: r.data().team,
          role: "member",
        });
        tx.update(rr, { status: "accepted" });
      });
      changed(circle);
      return;
    }
    if (action === "team") {
      const team = crypto.randomUUID(),
        r = doc(ref, "teamDocs", team);
      await runTransaction(db, async (tx) => {
        const c = await tx.get(ref);
        if (!c.exists()) throw Error("기도단을 찾지 못했어요.");
        tx.set(r, {
          name: text(data.name, 40),
          leader: c.data().director,
          code: "",
          gate: "",
          open: false,
          approval: false,
        });
      });
      changed(circle, team);
      return { team };
    }
    if (action === "gate") {
      const team = key(data.team),
        tr = doc(ref, "teamDocs", team),
        proof = await joinProof(data.code, data.password);
      await runTransaction(db, async (tx) => {
        const t = await tx.get(tr);
        if (!t.exists()) throw Error("팀을 선택해 주세요.");
        if (t.data().gate && t.data().gate !== proof)
          tx.delete(doc(db, "circleGates", t.data().gate));
        tx.set(doc(db, "circleGates", proof), {
          circle,
          team,
          code: data.code.trim().toUpperCase(),
          schema: 3,
        });
        tx.update(tr, {
          gate: proof,
          code: data.code.trim().toUpperCase(),
          open: !!data.open,
          approval: !!data.approval,
        });
      });
      changed(circle, team);
      return;
    }
    if (action === "promote") {
      const team = key(data.team),
        target = key(data.uid),
        tr = doc(ref, "teamDocs", team),
        mr = doc(ref, "members", target);
      try {
        await runTransaction(db, async (tx) => {
          const c = await tx.get(ref),
            t = await tx.get(tr),
            p = await tx.get(mr);
          if (
            !c.exists() ||
            !t.exists() ||
            !p.exists() ||
            p.data().team !== team ||
            target === c.data().director
          )
            throw Error("해당 팀원을 선택해 주세요.");
          const old = t.data().leader;
          tx.update(mr, { role: "leader" });
          if (old !== c.data().director && old !== target)
            tx.update(doc(ref, "members", old), { role: "member" });
          tx.update(tr, { leader: target });
        });
      } catch (e) {
        if ((e as any).code === "permission-denied")
          throw Error(
            "팀장을 맡을 분이 먼저 Google 또는 이메일 계정을 연결해 주세요.",
          );
        throw e;
      }
      changed(circle, team);
      return;
    }
    if (action === "createEntry") {
      const er = doc(collection(ref, "entries"));
      await runTransaction(db, async (tx) => {
        const m = await tx.get(doc(ref, "members", uid));
        if (!m.exists()) throw Error("참여 승인 후 등록할 수 있어요.");
        const p = m.data();
        tx.set(er, {
          schema: 3,
          title: text(data.title),
          body: typeof data.body === "string" ? data.body.trim() : "",
          kind: data.kind,
          author: uid,
          authorName: p.name,
          teamId: data.teamId || p.team,
          createdAt: serverTimestamp(),
          count: 0,
          participantCount: 0,
          commentCount: 0,
          source:
            p.role === "director"
              ? "단장이 나눴어요"
              : p.role === "leader"
                ? "팀장이 나눴어요"
                : "팀원이 나눴어요",
          closed: false,
        });
        tx.update(ref, { lastEntry: er.id });
      });
      if (typeof window !== "undefined")
        window.dispatchEvent(
          new CustomEvent("pray:new-entry", { detail: { circle, id: er.id } }),
        );
      return { id: er.id };
    }
    const item = key(data.id),
      er = doc(ref, "entries", item);
    return runTransaction(db, async (tx) => {
      const s = await tx.get(er);
      if (!s.exists()) throw Error("항목을 찾지 못했어요.");
      const v = s.data();
      if (action === "editItem") {
        tx.update(er, {
          title: text(data.title),
          body: typeof data.body === "string" ? data.body.trim() : "",
        });
        return;
      }
      if (action === "close") {
        tx.update(er, {
          closed: true,
          result: data.rating,
          closedAt: serverTimestamp(),
        });
        return;
      }
      if (action === "comment") {
        const m = await tx.get(doc(ref, "members", uid));
        if (!m.exists()) throw Error("소속을 확인해 주세요.");
        const cr = doc(collection(er, "comments"));
        tx.set(cr, {
          uid,
          name: m.data().name,
          text: text(data.text, 1000),
          at: serverTimestamp(),
        });
        tx.update(er, {
          commentCount: (v.commentCount ?? v.comments?.length ?? 0) + 1,
          lastComment: cr.id,
        });
        return;
      }
      if (action !== "log" && action !== "complete")
        throw Error("지원하지 않는 요청이에요.");
      const ar = doc(er, "actors", uid),
        event = doc(er, "events", key(data.eventId || crypto.randomUUID()));
      const p = await tx.get(profile),
        a = await tx.get(ar),
        e = await tx.get(event),
        m = await tx.get(doc(ref, "members", uid));
      if (e.exists()) return;
      if (!p.exists() || !m.exists()) throw Error("소속을 확인해 주세요.");
      const old = a.data() || {
        count: v.counts?.[uid] || 0,
        lastLog: v.lastTimes?.[uid] || null,
        rating: v.outcomes?.[uid]?.rating || null,
        completedAt: v.outcomes?.[uid]?.completedAt || null,
      };
      if (v.closed || old.rating != null)
        throw Error("이미 마무리한 기록이에요.");
      if (
        action === "log" &&
        old.lastLog &&
        Date.now() - old.lastLog.toMillis() < 3000
      )
        throw Error("잠깐 숨을 고르고 다시 기록해 주세요.");
      tx.set(event, { uid, kind: action, at: serverTimestamp() });
      const actor = {
        uid,
        name: m.data().name,
        count: old.count,
        lastLog: old.lastLog,
        lastEvent: event.id,
        rating: null as number | null,
        completedAt: null as any,
      };
      if (action === "log") {
        actor.count++;
        actor.lastLog = serverTimestamp();
        const first = !a.exists() && !(v.counts?.[uid] > 0);
        tx.update(er, {
          count: v.count + 1,
          participantCount:
            (v.participantCount ?? Object.keys(v.counts || {}).length) +
            (first ? 1 : 0),
          eventId: event.id,
          lastActor: uid,
        });
      } else {
        actor.rating = data.rating;
        actor.completedAt = serverTimestamp();
      }
      tx.set(ar, actor);
      const pv = p.data(),
        day = Math.floor((Date.now() + 32400000) / 86400000);
      tx.update(profile, {
        xp: pv.xp + (action === "log" ? 10 : 20),
        coins: pv.coins + (action === "log" ? 2 : 5),
        dailyDay: day,
        dailyCount: pv.dailyDay === day ? pv.dailyCount + 1 : 1,
        lastEvent: { circle, item, event: event.id },
      });
    });
  };
  return async (action: string, data: Record<string, any>) => {
    for (let i = 0; ; i++) {
      try {
        return await execute(action, data);
      } catch (e) {
        if (
          i >= 2 ||
          !["log", "complete", "createEntry", "comment"].includes(action) ||
          (e as any).code !== "permission-denied"
        )
          throw e;
        await new Promise((r) => setTimeout(r, 150 + i * 200));
      }
    }
  };
}
