const fs = require("fs");
const assert = require("node:assert/strict");
const ts = require("typescript");
(async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } =
    await import("@firebase/rules-unit-testing");
  const {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    limit,
    updateDoc,
    setDoc,
    Timestamp,
    writeBatch,
    serverTimestamp,
    setLogLevel,
  } = await import("firebase/firestore");
  setLogLevel("silent");
  fs.mkdirSync(".tools", { recursive: true });
  fs.writeFileSync(
    ".tools/spark-runtime.mjs",
    ts.transpileModule(fs.readFileSync("src/spark.ts", "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText,
  );
  const { createSparkCommand } = await import("../.tools/spark-runtime.mjs");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: "demo-pray-spark",
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  const db = (uid, provider = "google.com") =>
    env
      .authenticatedContext(uid, { firebase: { sign_in_provider: provider } })
      .firestore();
  const l = db("leader"),
    f = db("friend"),
    o = db("outsider"),
    lead = createSparkCommand(l, "leader", "팀장"),
    friend = createSparkCommand(f, "friend", "친구");
  let checks = 0;
  async function test(name, fn) {
    await fn();
    checks++;
    console.log(`PASS ${name}`);
  }
  try {
    await env.clearFirestore();
    await test("Authentication required; permanent email and guest identities supported", async () => {
      await assertFails(
        createSparkCommand(
          env.unauthenticatedContext().firestore(),
          "anon",
          "x",
        )("bootstrap"),
      );
      await assertSucceeds(
        createSparkCommand(
          db("password", "password"),
          "password",
          "x",
        )("bootstrap"),
      );
    });
    await test("Profile bootstrap and atomic team creation", async () => {
      await lead("bootstrap");
      await friend("bootstrap");
      assert.equal((await getDoc(doc(l, "profiles/leader"))).data().xp, 0);
    });
    const { id: team } = await lead("createTeam", { name: "모험단" });
    await test("One team per user; team owner linked as leader", async () => {
      await assert.rejects(lead("createTeam", { name: "again" }));
      assert.equal(
        (await getDoc(doc(l, `teams/${team}/members/leader`))).data().role,
        "leader",
      );
    });
    const { token } = await lead("invite", { team });
    await test("Invite join attaches member below inviter", async () => {
      await friend("join", { token });
      await friend("join", { token });
      assert.equal(
        (await getDoc(doc(f, `teams/${team}/members/friend`))).data().parentUid,
        "leader",
      );
      assert.equal(
        (await getDoc(doc(l, `teams/${team}`))).data().memberCount,
        2,
      );
      assert.equal((await getDoc(doc(l, `invites/${token}`))).data().uses, 1);
    });
    await test("No cross-team reads and no invite enumeration", async () => {
      await assertFails(getDoc(doc(o, `teams/${team}`)));
      await assertFails(getDocs(collection(f, "invites")));
      await assertFails(getDocs(collection(f, `teams/${team}/items`)));
      await assertSucceeds(
        getDocs(query(collection(f, `teams/${team}/items`), limit(100))),
      );
    });
    const { id } = await lead("createItem", {
      team,
      title: "팀 기도",
      body: "함께!",
      kind: "prayer",
    });
    const itemPath = `teams/${team}/items/${id}`;
    await test("Team member can publish; private content rejected", async () => {
      await friend("createItem", { team, title: "실천", kind: "task" });
      await assert.rejects(
        friend("createItem", {
          team,
          title: "비밀",
          kind: "prayer",
          secret: true,
        }),
      );
      await assertFails(updateDoc(doc(f, itemPath), { secret: true }));
    });
    await test("Only the active item's author can edit title and body; rewards stay intact", async () => {
      await lead("editItem", {
        team,
        id,
        title: "수정된 기도",
        body: "함께 나누는 수정",
      });
      const edited = (await getDoc(doc(l, itemPath))).data();
      assert.equal(edited.title, "수정된 기도");
      assert.equal(edited.body, "함께 나누는 수정");
      assert.equal(edited.count, 0);
      assert.deepEqual(edited.comments, []);
      assert.equal((await getDoc(doc(l, "profiles/leader"))).data().xp, 0);
      await assert.rejects(
        friend("editItem", { team, id, title: "남의 글", body: "침범" }),
      );
      await assertFails(updateDoc(doc(f, itemPath), { title: "직접 우회" }));
      await assertFails(
        updateDoc(doc(l, itemPath), { title: "", body: "빈 제목" }),
      );
      await assertFails(
        updateDoc(doc(l, itemPath), { title: "초과", body: "x".repeat(3001) }),
      );
      await assertFails(
        updateDoc(doc(l, itemPath), { title: "권한 위조", author: "friend" }),
      );
      await assertFails(
        updateDoc(doc(l, itemPath), { title: "횟수 위조", count: 99 }),
      );
    });
    await test("Activity reward is atomic and idempotent", async () => {
      await friend("log", { team, id, eventId: "event1" });
      await friend("log", { team, id, eventId: "event1" });
      assert.equal((await getDoc(doc(f, itemPath))).data().count, 1);
      assert.equal((await getDoc(doc(f, "profiles/friend"))).data().xp, 10);
      await assert.rejects(friend("log", { team, id, eventId: "event2" }));
    });
    await test("Forged XP, counter and event are denied", async () => {
      await assertFails(updateDoc(doc(f, "profiles/friend"), { xp: 1000 }));
      await assertFails(updateDoc(doc(f, itemPath), { count: 500 }));
      await assertFails(
        setDoc(doc(f, `${itemPath}/events/forged`), {
          uid: "friend",
          kind: "log",
          at: Timestamp.now(),
        }),
      );
      await assertFails(
        updateDoc(doc(f, "profiles/friend"), { xp: 20, coins: 4 }),
      );
    });
    await test("Independent member outcomes and duplicate completion denial", async () => {
      await friend("complete", { team, id, rating: 1 });
      await assert.rejects(friend("complete", { team, id, rating: 5 }));
      await lead("log", { team, id, eventId: "leader-event" });
      await lead("complete", { team, id, rating: 5 });
      const v = (await getDoc(doc(f, itemPath))).data();
      assert.equal(v.outcomes.friend.rating, 1);
      assert.equal(v.outcomes.friend.count, 1);
      assert.equal(v.outcomes.leader.rating, 5);
      await assertFails(
        updateDoc(doc(f, itemPath), { "outcomes.leader.rating": 1 }),
      );
      await assert.rejects(friend("log", { team, id, eventId: "closed" }));
    });
    await test("Archived entries cannot be edited even by their author", async () => {
      await assert.rejects(
        lead("editItem", { team, id, title: "완료 후 수정", body: "불가" }),
      );
      await assertFails(
        updateDoc(doc(l, itemPath), { title: "직접 완료 후 수정" }),
      );
    });
    await test("Comments append with real author and cannot rewrite history", async () => {
      await friend("comment", { team, id, text: "응원해!" });
      const v = (await getDoc(doc(f, itemPath))).data();
      assert.equal(v.comments[0].name, "친구");
      await assertFails(updateDoc(doc(f, itemPath), { comments: [] }));
      await assertFails(
        updateDoc(doc(f, itemPath), {
          comments: [
            ...v.comments,
            { id: "fake", name: "팀장", text: "forged", at: Timestamp.now() },
          ],
        }),
      );
    });
    await test("Cosmetic balance checks and repeat purchase protection", async () => {
      await assert.rejects(friend("purchase", { decoration: "flower" }));
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(doc(c.firestore(), "profiles/friend"), { coins: 50 }),
      );
      await friend("purchase", { decoration: "flower" });
      await friend("purchase", { decoration: "flower" });
      assert.equal((await getDoc(doc(f, "profiles/friend"))).data().coins, 30);
      await assertFails(
        updateDoc(doc(f, "profiles/friend"), {
          decorations: ["flower", "lantern"],
          coins: 30,
        }),
      );
    });
    await test("Simultaneous activity transactions preserve both counts", async () => {
      const entry = await lead("createItem", {
        team,
        title: "동시 기록",
        kind: "task",
      });
      await Promise.all([
        lead("log", { team, id: entry.id, eventId: "parallel1" }),
        friend("log", { team, id: entry.id, eventId: "parallel2" }),
      ]);
      assert.equal(
        (await getDoc(doc(f, `teams/${team}/items/${entry.id}`))).data().count,
        2,
      );
    });
    await test("More than 200 legitimate activities allowed; forged counters and resets rejected", async () => {
      const entry = await lead("createItem", {
          team,
          title: "하루 한도 테스트",
          kind: "task",
        }),
        path = `teams/${team}/items/${entry.id}`;
      const day = Math.floor((Date.now() + 9 * 3600000) / 86400000);
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(doc(c.firestore(), "profiles/friend"), {
          dailyDay: day,
          dailyCount: 200,
        }),
      );
      await friend("log", { team, id: entry.id, eventId: "cap-client" });
      const p = (await getDoc(doc(f, "profiles/friend"))).data(),
        batch = writeBatch(f),
        eventId = "cap-forged";
      batch.set(doc(f, `${path}/events/${eventId}`), {
        uid: "friend",
        kind: "log",
        at: serverTimestamp(),
      });
      batch.set(doc(f, `${path}/actors/friend`), {
        uid: "friend",
        count: 1,
        lastLog: serverTimestamp(),
        lastEvent: eventId,
      });
      batch.update(doc(f, path), {
        count: 1,
        lastLog: serverTimestamp(),
        lastActor: "friend",
        eventId,
      });
      batch.update(doc(f, "profiles/friend"), {
        xp: p.xp + 10,
        coins: p.coins + 2,
        dailyDay: day,
        dailyCount: 201,
        lastEvent: { team, item: entry.id, event: eventId },
      });
      await assertFails(batch.commit());
      assert.equal((await getDoc(doc(f, path))).data().count, 1);
      await assertFails(
        updateDoc(doc(f, "profiles/friend"), { dailyCount: 0 }),
      );
    });
    await test("More than 100 items allowed; detached counter updates rejected", async () => {
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(doc(c.firestore(), `teams/${team}`), { itemCount: 100 }),
      );
      await lead("createItem", { team, title: "101번째", kind: "prayer" });
      await assertFails(
        updateDoc(doc(l, `teams/${team}`), {
          itemCount: 102,
          lastItem: "forged-item",
        }),
      );
    });
    await test("More than 100 members allowed; expired invitations still rejected", async () => {
      const out = createSparkCommand(o, "outsider", "새친구");
      await out("bootstrap");
      const link = await lead("invite", { team });
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(doc(c.firestore(), `teams/${team}`), { memberCount: 100 }),
      );
      await out("join", { token: link.token });
      assert.equal(
        (await getDoc(doc(o, "profiles/outsider"))).data().activeTeam,
        team,
      );
      await env.withSecurityRulesDisabled(async (c) =>
        updateDoc(doc(c.firestore(), `invites/${link.token}`), {
          expiresAt: Timestamp.fromMillis(0),
        }),
      );
      await assert.rejects(out("join", { token: link.token }));
    });
    console.log(
      `Firestore emulator: ${checks} integration/security scenarios passed.`,
    );
  } finally {
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
