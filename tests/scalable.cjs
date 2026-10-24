const fs = require("fs"),
  ts = require("typescript"),
  assert = require("node:assert/strict");
(async () => {
  const { initializeTestEnvironment, assertFails } =
    await import("@firebase/rules-unit-testing");
  const {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    limit,
    startAfter,
    where,
    orderBy,
    updateDoc,
    setDoc,
    writeBatch,
    Timestamp,
    setLogLevel,
  } = await import("firebase/firestore");
  setLogLevel("silent");
  for (const name of ["spark", "circles", "scalable"]) {
    let code = ts.transpileModule(fs.readFileSync(`src/${name}.ts`, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    }).outputText;
    if (name === "circles")
      code = code.replace(
        /export \{ scalableCommands as circleCommands \} from ["']\.\/scalable["'];?/g,
        "",
      );
    for (const n of ["spark", "circles", "scalable"])
      code = code.replaceAll(`"./${n}"`, `"./${n}-runtime.mjs"`);
    fs.writeFileSync(`.tools/${name}-runtime.mjs`, code);
  }
  const { createSparkCommand } = await import("../.tools/spark-runtime.mjs"),
    { scalableCommands } = await import("../.tools/scalable-runtime.mjs"),
    { legacyCircleCommands } = await import("../.tools/circles-runtime.mjs");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: "demo-pray-spark",
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  const db = (id, p = "google.com") =>
    env
      .authenticatedContext(id, { firebase: { sign_in_provider: p } })
      .firestore();
  const d = db("director"),
    a = db("guest", "anonymous"),
    b = db("leader2", "password");
  const dc = scalableCommands(d, "director"),
    ac = scalableCommands(a, "guest"),
    bc = scalableCommands(b, "leader2");
  let passed = 0;
  const test = async (n, f) => {
    await f();
    console.log("PASS " + n);
    passed++;
  };
  try {
    await env.clearFirestore();
    for (const [u, p] of [
      ["director", "google.com"],
      ["guest", "anonymous"],
      ["leader2", "password"],
    ])
      await createSparkCommand(
        db(u, p),
        u,
        u,
      )("bootstrap", {
        accountKind: p === "anonymous" ? "guest" : "permanent",
      });
    const { id: circle } = await dc("create", {
        name: "확장 기도단",
        teamName: "1팀",
      }),
      team = (await getDoc(doc(d, `circles/${circle}/members/director`))).data()
        .team;
    const password = "Example-team-password-123";
    await test("New circle stores memberships and teams as documents, not growing maps", async () => {
      const c = (await getDoc(doc(d, "circles", circle))).data();
      assert.equal(c.schema, 3);
      assert.equal(c.people, undefined);
      assert.equal(c.teams, undefined);
    });
    await dc("gate", {
      circle,
      schema: 3,
      team,
      code: "ABCD1234ABCD",
      password,
      open: true,
      approval: false,
    });
    await ac("join", { code: "ABCD1234ABCD", password, name: "guest" });
    await test("Pending admission cannot read circle entries or roster", async () => {
      await assertFails(getDoc(doc(a, "circles", circle)));
      await assertFails(
        getDocs(query(collection(a, `circles/${circle}/members`), limit(20))),
      );
    });
    await ac("admit", { circle, schema: 3 });
    const { team: t2 } = await dc("team", { circle, schema: 3, name: "2팀" });
    await dc("gate", {
      circle,
      schema: 3,
      team: t2,
      code: "EFGH5678EFGH",
      password,
      open: true,
      approval: true,
    });
    await bc("join", { code: "EFGH5678EFGH", password, name: "leader2" });
    await assertFails(bc("admit", { circle, schema: 3 }));
    await dc("approve", { circle, schema: 3, uid: "leader2" });
    await dc("promote", { circle, schema: 3, team: t2, uid: "leader2" });
    await test("Team leaders cannot create teams, alter another team or self-promote guests", async () => {
      await assertFails(bc("team", { circle, schema: 3, name: "forged" }));
      await assert.rejects(
        ac("promote", { circle, schema: 3, team, uid: "guest" }),
      );
      await assertFails(
        bc("gate", {
          circle,
          schema: 3,
          team,
          code: "ABCD1234ABCD",
          password,
          open: true,
          approval: false,
        }),
      );
    });
    const { id: privateId } = await bc("createEntry", {
      circle,
      schema: 3,
      title: "2팀만",
      body: "",
      kind: "prayer",
      teamId: t2,
    });
    await test("Other-team entries, actors and comments remain private", async () => {
      await assertFails(
        getDoc(doc(a, `circles/${circle}/entries/${privateId}`)),
      );
      await assertFails(
        getDocs(
          query(
            collection(a, `circles/${circle}/entries/${privateId}/actors`),
            limit(20),
          ),
        ),
      );
      await assertFails(
        getDocs(
          query(
            collection(a, `circles/${circle}/entries/${privateId}/comments`),
            limit(20),
          ),
        ),
      );
    });
    const { id: item } = await dc("createEntry", {
      circle,
      schema: 3,
      title: "함께",
      body: "",
      kind: "prayer",
      teamId: "all",
    });
    await Promise.all([
      ac("log", { circle, schema: 3, id: item, eventId: "a-first" }),
      bc("log", { circle, schema: 3, id: item, eventId: "b-first" }),
    ]);
    await test("Individual actor documents and shared totals stay atomic and idempotent", async () => {
      const v = (
        await getDoc(doc(d, `circles/${circle}/entries/${item}`))
      ).data();
      assert.equal(v.count, 2);
      assert.equal(v.participantCount, 2);
      assert.equal(v.counts, undefined);
      assert.equal(
        (
          await getDoc(doc(a, `circles/${circle}/entries/${item}/actors/guest`))
        ).data().count,
        1,
      );
      await ac("log", { circle, schema: 3, id: item, eventId: "a-first" });
      assert.equal((await getDoc(doc(a, "profiles/guest"))).data().xp, 10);
    });
    await test("Fast repeat, forged XP/totals and detached actor writes rejected", async () => {
      await assert.rejects(
        ac("log", { circle, schema: 3, id: item, eventId: "a-fast" }),
      );
      await assertFails(
        updateDoc(doc(a, `circles/${circle}/entries/${item}`), { count: 900 }),
      );
      await assertFails(
        updateDoc(doc(a, `circles/${circle}/entries/${item}/actors/guest`), {
          count: 900,
        }),
      );
      await assertFails(updateDoc(doc(a, "profiles/guest"), { xp: 999 }));
    });
    await ac("complete", { circle, schema: 3, id: item, rating: 5 });
    await test("Personal completion is independent and cannot reward twice", async () => {
      assert.equal(
        (await getDoc(doc(d, `circles/${circle}/entries/${item}`))).data()
          .closed,
        false,
      );
      await assert.rejects(
        ac("complete", { circle, schema: 3, id: item, rating: 5 }),
      );
      await assert.rejects(
        ac("log", { circle, schema: 3, id: item, eventId: "after-complete" }),
      );
    });
    await env.withSecurityRulesDisabled(async (c) => {
      const admin = c.firestore(),
        batch = writeBatch(admin);
      for (let i = 0; i < 105; i++)
        batch.set(
          doc(
            admin,
            `circles/${circle}/members/seed-${String(i).padStart(3, "0")}`,
          ),
          { name: `seed-${i}`, team, role: "member" },
        );
      for (let i = 0; i < 105; i++)
        batch.set(
          doc(
            admin,
            `circles/${circle}/entries/seed-${String(i).padStart(3, "0")}`,
          ),
          {
            schema: 3,
            title: `기도${i}`,
            body: "",
            kind: "prayer",
            teamId: "all",
            author: "director",
            authorName: "director",
            createdAt: Timestamp.fromMillis(1000 + i),
            count: 0,
            participantCount: 0,
            commentCount: 0,
            closed: false,
            source: "단장이 나눴어요",
          },
        );
      for (let i = 0; i < 105; i++)
        batch.set(
          doc(admin, `circles/${circle}/entries/${item}/comments/old-${i}`),
          {
            uid: "director",
            name: "director",
            text: "old",
            at: Timestamp.fromMillis(i),
          },
        );
      batch.update(doc(admin, `circles/${circle}/entries/${item}`), {
        commentCount: 105,
      });
      await batch.commit();
    });
    await test("More than 100 entries/comments/members and more than 20 teams work", async () => {
      for (let i = 0; i < 21; i++)
        await dc("team", { circle, schema: 3, name: `추가팀${i}` });
      await ac("comment", {
        circle,
        schema: 3,
        id: item,
        text: "106번째 댓글",
      });
      assert.equal(
        (await getDoc(doc(d, `circles/${circle}/entries/${item}`))).data()
          .commentCount,
        106,
      );
      await dc("createEntry", {
        circle,
        schema: 3,
        title: "100개 이후 기도",
        body: "",
        kind: "task",
        teamId: "all",
      });
    });
    await test("Cursor pagination reaches beyond 100 without duplicates; unbounded reads denied", async () => {
      let cursor,
        seen = new Set();
      for (;;) {
        const q = query(
          collection(a, `circles/${circle}/entries`),
          where("teamId", "in", ["all", team]),
          orderBy("createdAt", "desc"),
          ...(cursor ? [startAfter(cursor)] : []),
          limit(20),
        );
        const s = await getDocs(q);
        s.docs.forEach((d) => {
          assert(!seen.has(d.id));
          seen.add(d.id);
        });
        if (s.size < 20) break;
        cursor = s.docs.at(-1);
      }
      assert(seen.size > 100);
      await assertFails(
        getDocs(query(collection(a, `circles/${circle}/members`), limit(1000))),
      );
    });
    await test("No arbitrary daily ceiling; server-authoritative rewards still enforced", async () => {
      await env.withSecurityRulesDisabled((c) =>
        updateDoc(doc(c.firestore(), "profiles/leader2"), {
          dailyDay: Math.floor((Date.now() + 32400000) / 86400000),
          dailyCount: 1000,
        }),
      );
      const { id: fresh } = await bc("createEntry", {
        circle,
        schema: 3,
        title: "오늘도 실천",
        body: "",
        kind: "task",
        teamId: t2,
      });
      await bc("log", { circle, schema: 3, id: fresh, eventId: "after-1000" });
      assert.equal(
        (await getDoc(doc(b, "profiles/leader2"))).data().dailyCount,
        1001,
      );
    });
    // Existing V2 circle: staging is resumable and old records/counters are retained.
    const legacyDb = db("legacy-director");
    await createSparkCommand(
      legacyDb,
      "legacy-director",
      "기존단장",
    )("bootstrap");
    const old = legacyCircleCommands(legacyDb, "legacy-director"),
      { id: oldId } = await old("create", {
        name: "기존기도단",
        teamName: "기존팀",
      });
    const oldTeam = Object.keys(
      (await getDoc(doc(legacyDb, "circles", oldId))).data().teams,
    )[0];
    const { id: oldEntry } = await old("createEntry", {
      circle: oldId,
      title: "기존 기록",
      body: "보존",
      kind: "prayer",
      teamId: "all",
    });
    await old("log", { circle: oldId, id: oldEntry, eventId: "legacy-log" });
    const upgraded = scalableCommands(legacyDb, "legacy-director");
    await upgraded("migrate", { circle: oldId });
    await upgraded("migrate", { circle: oldId });
    await test("Resumable upgrade preserves old prayers and membership, then uses separate documents", async () => {
      const c = (await getDoc(doc(legacyDb, "circles", oldId))).data();
      assert.equal(c.schema, 3);
      assert.equal(
        (
          await getDoc(
            doc(legacyDb, `circles/${oldId}/members/legacy-director`),
          )
        ).data().role,
        "director",
      );
      assert.equal(
        (
          await getDoc(doc(legacyDb, `circles/${oldId}/entries/${oldEntry}`))
        ).data().count,
        1,
      );
      assert.equal(
        (
          await getDoc(doc(legacyDb, `circles/${oldId}/entries/${oldEntry}`))
        ).data().body,
        "보존",
      );
    });
    console.log(
      `Scalable storage: ${passed} pagination/no-cap/migration/security scenarios passed.`,
    );
  } finally {
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
