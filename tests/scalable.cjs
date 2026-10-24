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
    await test("Members create their own teams but cannot alter other teams or forge roles", async () => {
      await bc("team", { circle, schema: 3, name: "내가 만든 팀" });
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
    await test("A member creates a child team, admits a teammate, and that teammate creates another team without leaving the parent", async () => {
      const { team: child } = await ac("team", {
        circle,
        schema: 3,
        name: "민수의 팀",
      });
      const childDoc = (
        await getDoc(doc(a, "circles", circle, "teamDocs", child))
      ).data();
      assert.equal(childDoc.leader, "guest");
      assert.equal(childDoc.parentTeam, team);
      assert.equal(
        (await getDoc(doc(a, "circles", circle, "members", "guest"))).data()
          .team,
        team,
      );
      await ac("gate", {
        circle,
        schema: 3,
        team: child,
        code: "CHILD1234567",
        password,
        open: true,
        approval: true,
      });
      const n = db("new-friend", "anonymous"),
        nc = scalableCommands(n, "new-friend");
      await createSparkCommand(
        n,
        "new-friend",
        "친구",
      )("bootstrap", { accountKind: "guest" });
      await nc("join", { code: "CHILD1234567", password, name: "친구" });
      await assertFails(nc("admit", { circle, schema: 3 }));
      await ac("approve", { circle, schema: 3, uid: "new-friend" });
      const { id: childPrayer } = await ac("createEntry", {
        circle,
        schema: 3,
        teamId: child,
        title: "우리 작은 팀",
        body: "",
        kind: "prayer",
      });
      assert.equal(
        (await getDoc(doc(n, "circles", circle, "entries", childPrayer))).data()
          .source,
        "팀장이 나눴어요",
      );
      await assertFails(
        getDoc(doc(b, "circles", circle, "entries", childPrayer)),
      );
      await assertFails(
        updateDoc(doc(n, "circles", circle, "teamDocs", child), {
          parentTeam: t2,
        }),
      );
      const { team: grandchild } = await nc("team", {
        circle,
        schema: 3,
        name: "친구의 팀",
      });
      assert.equal(
        (await getDoc(doc(n, "circles", circle, "teamDocs", grandchild))).data()
          .parentTeam,
        child,
      );
      const { id: grandPrayer } = await nc("createEntry", {
        circle,
        schema: 3,
        teamId: grandchild,
        title: "세 번째 팀",
        body: "",
        kind: "task",
      });
      await assertFails(
        getDoc(doc(a, "circles", circle, "entries", grandPrayer)),
      );
      await getDoc(doc(d, "circles", circle, "entries", grandPrayer));
      await assertFails(
        setDoc(doc(n, "circles", circle, "teamDocs", "forged-parent"), {
          name: "위조",
          leader: "new-friend",
          parentTeam: t2,
          code: "",
          gate: "",
          open: false,
          approval: false,
        }),
      );
      const scoped = await getDocs(
        query(
          collection(a, "circles", circle, "entries"),
          where("teamId", "in", ["all", child]),
          orderBy("createdAt", "desc"),
          limit(20),
        ),
      );
      assert(scoped.docs.some((x) => x.id === childPrayer));
      const linked = db("new-friend", "password");
      await createSparkCommand(
        linked,
        "new-friend",
        "친구",
      )("bootstrap", { accountKind: "permanent" });
      await dc("promote", {
        circle,
        schema: 3,
        team: child,
        uid: "new-friend",
      });
      assert.equal(
        (await getDoc(doc(a, "circles", circle, "members", "guest"))).data()
          .team,
        team,
      );
      assert.equal(
        (await getDoc(doc(a, "circles", circle, "members", "guest"))).data()
          .role,
        "member",
      );
      await assertFails(
        ac("gate", {
          circle,
          schema: 3,
          team: child,
          code: "CHILD1234567",
          password,
          open: true,
          approval: false,
        }),
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
    await test("A single profile can create multiple circles without leaving the first", async () => {
      const { id: second } = await dc("create", {
        name: "두 번째 기도단",
        teamName: "새로운 첫 팀",
      });
      const profile = (await getDoc(doc(d, "profiles/director"))).data();
      assert.equal(profile.activeCircle, second);
      assert(profile.circleIds.includes(circle));
      assert(profile.circleIds.includes(second));
      assert.equal(
        (await getDoc(doc(d, `circles/${circle}/members/director`))).data().role,
        "director",
      );
      await updateDoc(doc(d, "profiles/director"), { activeCircle: circle });
      assert.equal(
        (await getDoc(doc(d, "profiles/director"))).data().activeCircle,
        circle,
      );
    });
    await test("Existing members can join an additional team, then lose only that team's access when released", async () => {
      await ac("join", { code: "EFGH5678EFGH", password, name: "guest" });
      const pendingRequest = (await getDoc(doc(a, `circles/${circle}/requests/guest`))).data();
      assert.equal(pendingRequest.status, "pending");
      await assertFails(ac("admit", { circle, schema: 3 }));
      await bc("approve", { circle, schema: 3, uid: "guest" });
      const member = (await getDoc(doc(a, `circles/${circle}/members/guest`))).data();
      assert.deepEqual(member.teams, [team, t2]);
      assert.equal(member.team, team);
      await getDoc(doc(a, `circles/${circle}/entries/${privateId}`));
      await assert.rejects(ac("removeMember", { circle, schema: 3, team: t2, uid: "guest" }));
      await bc("removeMember", { circle, schema: 3, team: t2, uid: "guest" });
      const released = (await getDoc(doc(a, `circles/${circle}/members/guest`))).data();
      assert.deepEqual(released.teams, [team]);
      await assertFails(getDoc(doc(a, `circles/${circle}/entries/${privateId}`)));
      await getDoc(doc(a, `circles/${circle}/entries/${item}`));
    });
    await test("A manager must release members before archiving; stored prayer remains recoverable", async () => {
      const { team: candidate } = await dc("team", { circle, schema: 3, name: "보관 테스트팀" });
      await dc("gate", {
        circle, schema: 3, team: candidate, code: "ARCHIVE12345",
        password, open: true, approval: false,
      });
      const extraDb = db("archive-member", "anonymous");
      await createSparkCommand(extraDb, "archive-member", "보관팀원")("bootstrap", { accountKind: "guest" });
      const extra = scalableCommands(extraDb, "archive-member");
      await extra("join", { code: "ARCHIVE12345", password, name: "보관팀원" });
      await extra("admit", { circle, schema: 3 });
      const { id: saved } = await dc("createEntry", {
        circle, schema: 3, teamId: candidate, title: "보존할 기도",
        body: "삭제하지 마세요", kind: "prayer",
      });
      await assert.rejects(dc("archiveTeam", { circle, schema: 3, team: candidate }), /해지/);
      await assertFails(
        updateDoc(doc(extraDb, `circles/${circle}/teamDocs/${candidate}`), { archived: true, open: false }),
      );
      await dc("removeMember", { circle, schema: 3, team: candidate, uid: "archive-member" });
      await dc("archiveTeam", { circle, schema: 3, team: candidate });
      const archived = (await getDoc(doc(d, `circles/${circle}/teamDocs/${candidate}`))).data();
      assert.equal(archived.archived, true);
      assert.equal(archived.open, false);
      assert.equal((await getDoc(doc(d, `circles/${circle}/entries/${saved}`))).data().body, "삭제하지 마세요");
      await assert.rejects(extra("join", { code: "ARCHIVE12345", password, name: "보관팀원" }));
      await dc("restoreTeam", { circle, schema: 3, team: candidate });
      assert.equal((await getDoc(doc(d, `circles/${circle}/teamDocs/${candidate}`))).data().archived, false);
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
