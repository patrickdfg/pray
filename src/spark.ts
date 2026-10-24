import {
  type Firestore,
  doc,
  collection,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
} from "firebase/firestore";
export function normalize(value: any): any {
  if (value instanceof Timestamp) return value.toMillis();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, normalize(v)]),
    );
  return value;
}
function text(v: unknown, max: number) {
  if (typeof v !== "string" || !v.trim() || v.length > max)
    throw Error("입력 내용을 확인해 주세요.");
  return v.trim();
}
function key(v: unknown) {
  const id = text(v, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error("잘못된 식별자예요.");
  return id;
}
function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
export function createSparkCommand(
  db: Firestore,
  uid: string,
  displayName: string,
) {
  const profileRef = doc(db, "profiles", uid),
    name = displayName.slice(0, 80);
  const execute = async (
    action: string,
    data: Record<string, any> = {},
  ): Promise<any> => {
    if (action === "bootstrap")
      return runTransaction(db, async (tx) => {
        const p = await tx.get(profileRef);
        if (!p.exists())
          tx.set(profileRef, {
            uid,
            name,
            xp: 0,
            coins: 0,
            decorations: [],
            activeTeam: "",
            createdAt: serverTimestamp(),
            dailyDay: 0,
            dailyCount: 0,
            lastEvent: null,
            accountKind: data.accountKind || "permanent",
          });
        else if (data.accountKind)
          tx.update(profileRef, { accountKind: data.accountKind });
        return { ok: true };
      });
    if (action === "createTeam") {
      const teamName = text(data.name, 40),
        teamRef = doc(collection(db, "teams"));
      return runTransaction(db, async (tx) => {
        const p = await tx.get(profileRef);
        if (!p.exists() || p.data().activeTeam)
          throw Error("이미 팀에 참여 중이거나 프로필이 없어요.");
        tx.set(teamRef, {
          name: teamName,
          leader: uid,
          createdAt: serverTimestamp(),
          memberCount: 1,
          itemCount: 0,
          lastMember: uid,
          lastItem: "",
        });
        tx.set(doc(teamRef, "members", uid), {
          uid,
          name: p.data().name,
          parentUid: "",
          role: "leader",
          inviteToken: "",
          joinedAt: serverTimestamp(),
        });
        tx.update(profileRef, { activeTeam: teamRef.id });
        return { id: teamRef.id };
      });
    }
    if (action === "join") {
      const token = key(data.token),
        invRef = doc(db, "invites", token);
      return runTransaction(db, async (tx) => {
        const inv = await tx.get(invRef),
          p = await tx.get(profileRef);
        if (!inv.exists() || !p.exists())
          throw Error("유효하지 않은 초대예요.");
        const i = inv.data();
        if (i.expiresAt.toMillis() <= Date.now())
          throw Error("초대가 만료되었어요. 새 링크를 받아 주세요.");
        if (p.data().activeTeam === i.team) return { ok: true };
        if (p.data().activeTeam) throw Error("이미 다른 팀에 참여 중이에요.");
        tx.set(doc(db, "teams", i.team, "members", uid), {
          uid,
          name: p.data().name,
          parentUid: i.parentUid,
          role: "member",
          inviteToken: token,
          joinedAt: serverTimestamp(),
        });
        tx.update(doc(db, "teams", i.team), {
          memberCount: increment(1),
          lastMember: uid,
        });
        tx.update(invRef, { uses: increment(1) });
        tx.update(profileRef, { activeTeam: i.team });
        return { ok: true };
      });
    }
    if (action === "purchase") {
      const prices: Record<string, number> = {
        flower: 20,
        lantern: 50,
        fountain: 100,
      };
      const id = key(data.decoration),
        cost = prices[id];
      if (!Object.hasOwn(prices, id)) throw Error("없는 장식이에요.");
      return runTransaction(db, async (tx) => {
        const p = await tx.get(profileRef);
        if (!p.exists()) throw Error("프로필이 없어요.");
        const v = p.data();
        if (v.decorations.includes(id)) return { ok: true };
        if (v.coins < cost) throw Error("코인이 조금 더 필요해요.");
        tx.update(profileRef, {
          coins: v.coins - cost,
          decorations: [...v.decorations, id],
        });
        return { ok: true };
      });
    }
    const team = key(data.team),
      teamRef = doc(db, "teams", team);
    if (action === "invite") {
      const token = randomToken();
      return runTransaction(db, async (tx) => {
        tx.set(doc(db, "invites", token), {
          team,
          parentUid: uid,
          createdAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
          uses: 0,
        });
        return { token };
      });
    }
    if (action === "createItem") {
      const title = text(data.title, 100),
        body = typeof data.body === "string" ? data.body.trim() : "";
      if (
        !["prayer", "task"].includes(data.kind) ||
        data.secret ||
        body.length > 3000
      )
        throw Error("공유 항목의 내용을 확인해 주세요.");
      const ref = doc(collection(teamRef, "items"));
      return runTransaction(db, async (tx) => {
        const t = await tx.get(teamRef),
          p = await tx.get(profileRef);
        if (!t.exists() || !p.exists()) throw Error("팀을 먼저 만들어 주세요.");
        tx.set(ref, {
          title,
          body,
          kind: data.kind,
          secret: false,
          author: uid,
          authorName: p.data().name,
          count: 0,
          myCount: 0,
          createdAt: serverTimestamp(),
          comments: [],
          outcomes: {},
          source: t.data().leader === uid ? "팀장에게서 왔어요" : "",
          lastActor: "",
          eventId: "",
          lastLog: null,
        });
        tx.update(teamRef, { itemCount: increment(1), lastItem: ref.id });
        return { id: ref.id };
      });
    }
    const id = key(data.id),
      itemRef = doc(teamRef, "items", id);
    if (action === "editItem") {
      const title = text(data.title, 100);
      if (typeof data.body !== "string" || data.body.length > 3000)
        throw Error("내용은 3,000자까지 적을 수 있어요.");
      return runTransaction(db, async (tx) => {
        const item = await tx.get(itemRef);
        if (
          !item.exists() ||
          item.data().author !== uid ||
          item.data().outcomes[uid]
        )
          throw Error("내가 작성한 진행 중인 항목만 수정할 수 있어요.");
        tx.update(itemRef, { title, body: data.body.trim() });
        return { ok: true };
      });
    }
    if (action === "comment") {
      const content = text(data.text, 1000);
      return runTransaction(db, async (tx) => {
        const item = await tx.get(itemRef),
          p = await tx.get(profileRef);
        if (!item.exists() || !p.exists())
          throw Error("항목을 찾을 수 없어요.");
        tx.update(itemRef, {
          comments: [
            ...item.data().comments,
            {
              id: crypto.randomUUID(),
              name: p.data().name,
              text: content,
              at: Timestamp.now(),
            },
          ],
        });
        return { ok: true };
      });
    }
    if (action !== "log" && action !== "complete")
      throw Error("지원하지 않는 요청이에요.");
    const eventId = action === "log" ? key(data.eventId) : crypto.randomUUID(),
      eventRef = doc(itemRef, "events", eventId),
      actorRef = doc(itemRef, "actors", uid);
    return runTransaction(db, async (tx) => {
      const item = await tx.get(itemRef),
        p = await tx.get(profileRef),
        event = await tx.get(eventRef),
        actor = await tx.get(actorRef);
      if (!item.exists() || !p.exists()) throw Error("항목을 찾을 수 없어요.");
      if (event.exists()) return { ok: true };
      const v = item.data(),
        profile = p.data();
      if (v.outcomes[uid]) throw Error("이미 마무리한 퀘스트예요.");
      if (
        action === "log" &&
        actor.exists() &&
        Date.now() - actor.data().lastLog.toMillis() < 3000
      )
        throw Error("3초 뒤 다시 기록할 수 있어요.");
      if (
        action === "complete" &&
        (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5)
      )
        throw Error("1~5단계로 골라 주세요.");
      const day = Math.floor((Date.now() + 9 * 3600000) / 86400000),
        dailyCount = profile.dailyDay === day ? profile.dailyCount + 1 : 1;
      tx.set(eventRef, { uid, kind: action, at: serverTimestamp() });
      if (action === "log") {
        tx.update(itemRef, {
          count: v.count + 1,
          lastLog: serverTimestamp(),
          lastActor: uid,
          eventId,
        });
        tx.set(actorRef, {
          uid,
          count: (actor.data()?.count || 0) + 1,
          lastLog: serverTimestamp(),
          lastEvent: eventId,
        });
      } else
        tx.update(itemRef, {
          outcomes: {
            ...v.outcomes,
            [uid]: {
              rating: data.rating,
              completedAt: serverTimestamp(),
              count: v.count,
            },
          },
          lastActor: uid,
          eventId,
        });
      tx.update(profileRef, {
        xp: profile.xp + (action === "log" ? 10 : 20),
        coins: profile.coins + (action === "log" ? 2 : 5),
        lastEvent: { team, item: id, event: eventId },
        dailyDay: day,
        dailyCount,
      });
      return { ok: true };
    });
  };
  return async (action: string, data: Record<string, any> = {}) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await execute(action, data);
      } catch (error) {
        if (
          attempt >= 2 ||
          ![
            "log",
            "complete",
            "createItem",
            "join",
            "comment",
            "purchase",
          ].includes(action) ||
          (error as { code?: string }).code !== "permission-denied"
        )
          throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 150 + attempt * 200 + Math.random() * 100),
        );
      }
    }
  };
}
