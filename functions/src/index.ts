import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { randomUUID, randomBytes } from "node:crypto";
initializeApp();
const db = getFirestore();
const deny = (message = "권한이 없거나 유효하지 않은 요청이에요."): never => {
  throw new HttpsError("permission-denied", message);
};
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new HttpsError("invalid-argument", "입력 내용을 확인해 주세요.");
  return value.trim();
}
function key(value: unknown) {
  const s = text(value, 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(s))
    throw new HttpsError("invalid-argument", "잘못된 식별자예요.");
  return s;
}
export const garden = onCall(
  { region: "asia-northeast3", maxInstances: 10 },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "먼저 Google로 로그인해 주세요.");
    if (request.auth.token.firebase?.sign_in_provider !== "google.com")
      deny("Google 계정으로 로그인해 주세요.");
    const uid = request.auth.uid,
      data = request.data || {},
      action = data.action;
    const userRef = db.doc(`profiles/${uid}`);
    const name = String(request.auth.token.name || "숲 친구").slice(0, 80);
    if (action === "bootstrap") {
      await db.runTransaction(async (tx) => {
        const p = await tx.get(userRef);
        if (!p.exists)
          tx.create(userRef, {
            uid,
            name,
            xp: 0,
            coins: 0,
            activeTeam: "",
            createdAt: Date.now(),
          });
      });
      return { ok: true };
    }
    if (action === "createTeam") {
      const teamName = text(data.name, 40),
        ref = db.collection("teams").doc();
      await db.runTransaction(async (tx) => {
        const profile = await tx.get(userRef);
        if (!profile.exists) deny("프로필을 먼저 만들어 주세요.");
        if (profile.data()!.activeTeam) deny("이미 참여 중인 팀이 있어요.");
        tx.create(ref, { name: teamName, leader: uid, createdAt: Date.now() });
        tx.create(ref.collection("members").doc(uid), {
          uid,
          name,
          role: "leader",
          parentUid: "",
          joinedAt: Date.now(),
        });
        tx.update(userRef, { activeTeam: ref.id });
      });
      return { id: ref.id };
    }
    if (action === "join") {
      const token = key(data.token),
        inviteRef = db.doc(`invites/${token}`);
      return db.runTransaction(async (tx) => {
        const inv = await tx.get(inviteRef),
          profile = await tx.get(userRef);
        if (!inv.exists || !profile.exists)
          deny("초대 링크가 유효하지 않아요.");
        const i = inv.data()!,
          p = profile.data()!;
        if (i.expiresAt < Date.now() || i.uses >= 100)
          deny("초대 링크가 만료되었어요. 새 링크를 받아 주세요.");
        const memberRef = db.doc(`teams/${i.team}/members/${uid}`),
          parentRef = db.doc(`teams/${i.team}/members/${i.parentUid}`);
        const member = await tx.get(memberRef),
          parent = await tx.get(parentRef);
        if (!parent.exists) deny();
        if (member.exists) {
          tx.update(userRef, { activeTeam: i.team });
          return { ok: true };
        }
        if (p.activeTeam) deny("이미 다른 팀에 참여 중이에요.");
        tx.create(memberRef, {
          uid,
          name,
          parentUid: i.parentUid,
          role: "member",
          joinedAt: Date.now(),
        });
        tx.update(userRef, { activeTeam: i.team });
        tx.update(inviteRef, { uses: i.uses + 1 });
        return { ok: true };
      });
    }
    if (action === "purchase") {
      const prices: Record<string, number> = {
        flower: 20,
        lantern: 50,
        fountain: 100,
      };
      const decoration = key(data.decoration),
        cost = prices[decoration];
      if (!cost) throw new HttpsError("invalid-argument", "없는 장식이에요.");
      return db.runTransaction(async (tx) => {
        const profile = await tx.get(userRef);
        if (!profile.exists) deny();
        const p = profile.data()!,
          owned = p.decorations || [];
        if (owned.includes(decoration)) return { ok: true };
        if (p.coins < cost)
          throw new HttpsError(
            "failed-precondition",
            "잎사귀가 조금 더 필요해요.",
          );
        tx.update(userRef, {
          coins: p.coins - cost,
          decorations: [...owned, decoration],
        });
        return { ok: true };
      });
    }
    const team = key(data.team),
      teamRef = db.doc(`teams/${team}`),
      memberRef = teamRef.collection("members").doc(uid);
    const member = await memberRef.get();
    if (!member.exists) deny("이 팀의 구성원만 사용할 수 있어요.");
    if (action === "invite") {
      const token = randomBytes(24).toString("hex");
      await db.doc(`invites/${token}`).create({
        team,
        parentUid: uid,
        expiresAt: Date.now() + 7 * 86400000,
        uses: 0,
      });
      return { token };
    }
    if (action === "createItem") {
      const title = text(data.title, 100);
      if (!["prayer", "task"].includes(data.kind) || data.secret === true)
        throw new HttpsError(
          "invalid-argument",
          "비밀 항목은 기기에만 저장해 주세요.",
        );
      const body = typeof data.body === "string" ? data.body.trim() : "";
      if (body.length > 3000)
        throw new HttpsError(
          "invalid-argument",
          "내용은 3000자까지 적을 수 있어요.",
        );
      const ref = teamRef.collection("items").doc();
      await ref.create({
        title,
        body,
        kind: data.kind,
        secret: false,
        author: uid,
        authorName: name,
        count: 0,
        myCount: 0,
        createdAt: Date.now(),
        comments: [],
        ...(member.data()!.role === "leader"
          ? { source: "팀장에게서 왔어요" }
          : {}),
      });
      return { id: ref.id };
    }
    const itemRef = teamRef.collection("items").doc(key(data.id));
    if (action === "log") {
      const eventId = key(data.eventId),
        eventRef = itemRef.collection("events").doc(eventId),
        actorRef = itemRef.collection("actors").doc(uid);
      return db.runTransaction(async (tx) => {
        const item = await tx.get(itemRef),
          profile = await tx.get(userRef),
          event = await tx.get(eventRef),
          actor = await tx.get(actorRef);
        if (!item.exists || !profile.exists) deny();
        if (event.exists) return { ok: true };
        if (item.data()!.outcomes?.[uid])
          throw new HttpsError(
            "failed-precondition",
            "이미 마무리한 기록이에요.",
          );
        if (actor.exists && Date.now() - actor.data()!.lastLog < 3000)
          throw new HttpsError(
            "resource-exhausted",
            "잠깐 숨을 고르고 다시 기록해 주세요.",
          );
        const now = Date.now(),
          p = profile.data()!;
        tx.update(itemRef, { count: item.data()!.count + 1, lastLog: now });
        tx.set(actorRef, {
          uid,
          count: (actor.data()?.count || 0) + 1,
          lastLog: now,
        });
        tx.create(eventRef, { uid, at: now });
        tx.update(userRef, { xp: p.xp + 10, coins: p.coins + 2 });
        return { ok: true };
      });
    }
    if (action === "complete") {
      const rating = data.rating;
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        throw new HttpsError("invalid-argument", "1~5단계로 기록해 주세요.");
      return db.runTransaction(async (tx) => {
        const item = await tx.get(itemRef),
          profile = await tx.get(userRef);
        if (!item.exists || !profile.exists) deny();
        if (item.data()!.outcomes?.[uid])
          throw new HttpsError("already-exists", "이미 마무리한 기록이에요.");
        tx.update(itemRef, {
          outcomes: {
            ...(item.data()!.outcomes || {}),
            [uid]: {
              rating,
              completedAt: Date.now(),
              count: item.data()!.count,
            },
          },
        });
        const p = profile.data()!;
        tx.update(userRef, { xp: p.xp + 20, coins: p.coins + 5 });
        return { ok: true };
      });
    }
    if (action === "comment") {
      const content = text(data.text, 1000);
      return db.runTransaction(async (tx) => {
        const item = await tx.get(itemRef);
        if (!item.exists) deny();
        const comments = item.data()!.comments || [];
        if (comments.length >= 100)
          throw new HttpsError(
            "resource-exhausted",
            "감동은 한 항목에 100개까지 남길 수 있어요.",
          );
        tx.update(itemRef, {
          comments: [
            ...comments,
            { id: randomUUID(), name, text: content, at: Date.now() },
          ],
        });
        return { ok: true };
      });
    }
    throw new HttpsError("invalid-argument", "지원하지 않는 요청이에요.");
  },
);
