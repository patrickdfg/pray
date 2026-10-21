import { beforeEach, describe, it, expect, vi } from "vitest";
const fake = vi.hoisted(() => {
  const docs = new Map<string, any>();
  let counter = 0;
  const snapshot = (path: string) => ({
    exists: docs.has(path),
    data: () => structuredClone(docs.get(path)),
  });
  const ref = (path: string): any => ({
    path,
    id: path.split("/").at(-1),
    get: async () => snapshot(path),
    create: async (data: any) => {
      if (docs.has(path)) throw Error("duplicate");
      docs.set(path, structuredClone(data));
    },
    collection: (name: string) => ({
      doc: (id = String(++counter)) => ref(`${path}/${name}/${id}`),
    }),
  });
  const tx = {
    get: async (r: any) => snapshot(r.path),
    create: (r: any, d: any) => {
      if (docs.has(r.path)) throw Error("duplicate");
      docs.set(r.path, structuredClone(d));
    },
    update: (r: any, d: any) => {
      if (!docs.has(r.path)) throw Error("missing");
      docs.set(r.path, { ...docs.get(r.path), ...structuredClone(d) });
    },
    set: (r: any, d: any) => docs.set(r.path, structuredClone(d)),
  };
  return {
    docs,
    db: {
      doc: ref,
      collection: (p: string) => ({
        doc: (id = String(++counter)) => ref(`${p}/${id}`),
      }),
      runTransaction: async (fn: any) => fn(tx),
    },
  };
});
vi.mock("firebase-admin/app", () => ({ initializeApp: () => {} }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => fake.db }));
vi.mock("firebase-functions/v2/https", () => ({
  onCall: (_opts: any, handler: any) => handler,
  HttpsError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
import { garden } from "../src/index";
const invoke = (
  uid: string,
  action: string,
  payload: Record<string, unknown> = {},
) =>
  (garden as any)({
    auth: {
      uid,
      token: { name: uid, firebase: { sign_in_provider: "google.com" } },
    },
    data: { action, ...payload },
  });
async function setup() {
  await invoke("leader", "bootstrap");
  const t = await invoke("leader", "createTeam", { name: "소망의 숲" });
  const invitation = await invoke("leader", "invite", { team: t.id });
  await invoke("friend", "bootstrap");
  await invoke("friend", "join", { token: invitation.token });
  return t.id;
}
beforeEach(() => fake.docs.clear());
describe("callable business rules (in-memory Firestore adapter)", () => {
  it("rejects unauthenticated and non Google callers", async () => {
    await expect(
      (garden as any)({ data: { action: "bootstrap" } }),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    await expect(
      (garden as any)({
        auth: {
          uid: "x",
          token: { firebase: { sign_in_provider: "password" } },
        },
        data: { action: "bootstrap" },
      }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("joins below the inviter and preserves an existing parent on reused links", async () => {
    const team = await setup();
    expect(fake.docs.get(`teams/${team}/members/friend`).parentUid).toBe(
      "leader",
    );
    const link = await invoke("friend", "invite", { team });
    await invoke("leader", "join", { token: link.token });
    expect(fake.docs.get(`teams/${team}/members/leader`).parentUid).toBe("");
  });
  it("rejects expired invitations and cross-team reassignment", async () => {
    const team = await setup();
    const link = await invoke("leader", "invite", { team });
    const old = fake.docs.get(`invites/${link.token}`);
    fake.docs.set(`invites/${link.token}`, { ...old, expiresAt: 0 });
    await invoke("new", "bootstrap");
    await expect(
      invoke("new", "join", { token: link.token }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await invoke("other", "bootstrap");
    const t = await invoke("other", "createTeam", { name: "다른 팀" });
    const l = await invoke("other", "invite", { team: t.id });
    await expect(
      invoke("friend", "join", { token: l.token }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });
  it("prevents outsiders and rejects secret content at the shared write endpoint", async () => {
    const team = await setup();
    await expect(
      invoke("outsider", "createItem", { team, title: "x", kind: "prayer" }),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      invoke("friend", "createItem", {
        team,
        title: "비밀",
        kind: "prayer",
        secret: true,
      }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
  it("rewards a unique activity once and throttles rapid repeats", async () => {
    const team = await setup();
    const { id } = await invoke("leader", "createItem", {
      team,
      title: "가족",
      kind: "prayer",
    });
    await invoke("friend", "log", { team, id, eventId: "evt1" });
    await invoke("friend", "log", { team, id, eventId: "evt1" });
    expect(fake.docs.get("profiles/friend").xp).toBe(10);
    expect(fake.docs.get(`teams/${team}/items/${id}`).count).toBe(1);
    await expect(
      invoke("friend", "log", { team, id, eventId: "evt2" }),
    ).rejects.toMatchObject({ code: "resource-exhausted" });
  });
  it("lets each member finish once without closing someone else’s journey", async () => {
    const team = await setup();
    const { id } = await invoke("leader", "createItem", {
      team,
      title: "작은 실천",
      kind: "task",
    });
    await invoke("friend", "complete", { team, id, rating: 1 });
    await expect(
      invoke("friend", "complete", { team, id, rating: 5 }),
    ).rejects.toMatchObject({ code: "already-exists" });
    expect(fake.docs.get("profiles/friend").xp).toBe(20);
    await invoke("leader", "log", { team, id, eventId: "leader1" });
    await invoke("leader", "complete", { team, id, rating: 5 });
    const item = fake.docs.get(`teams/${team}/items/${id}`);
    expect(item.outcomes.friend.rating).toBe(1);
    expect(item.outcomes.leader.rating).toBe(5);
    expect(item.outcomes.friend.count).toBe(0);
    await expect(
      invoke("friend", "log", { team, id, eventId: "friend2" }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
  });
  it("charges for cosmetics once and refuses insufficient balance or invalid ids", async () => {
    await invoke("friend", "bootstrap");
    await expect(
      invoke("friend", "purchase", { decoration: "flower" }),
    ).rejects.toMatchObject({ code: "failed-precondition" });
    fake.docs.get("profiles/friend").coins = 50;
    await invoke("friend", "purchase", { decoration: "flower" });
    await invoke("friend", "purchase", { decoration: "flower" });
    expect(fake.docs.get("profiles/friend").coins).toBe(30);
    expect(fake.docs.get("profiles/friend").decorations).toEqual(["flower"]);
    await expect(
      invoke("friend", "purchase", { decoration: "prototype" }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });
  it("validates ratings and stores comments with authenticated author identity", async () => {
    const team = await setup();
    const { id } = await invoke("leader", "createItem", {
      team,
      title: "평안",
      kind: "prayer",
    });
    await expect(
      invoke("friend", "complete", { team, id, rating: 6 }),
    ).rejects.toMatchObject({ code: "invalid-argument" });
    await invoke("friend", "comment", {
      team,
      id,
      text: "힘내요",
      name: "forged",
    });
    expect(fake.docs.get(`teams/${team}/items/${id}`).comments[0].name).toBe(
      "friend",
    );
  });
});
