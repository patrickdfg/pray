const fs = require("fs"),
  assert = require("node:assert/strict"),
  ts = require("typescript");
(async () => {
  const { initializeTestEnvironment, assertFails } =
    await import("@firebase/rules-unit-testing");
  const {
    doc,
    getDoc,
    getDocs,
    collection,
    query,
    where,
    limit,
    updateDoc,
    setLogLevel,
  } = await import("firebase/firestore");
  setLogLevel("silent");
  for (const [src, out] of [
    ["spark", "spark-runtime"],
    ["circles", "circles-runtime"],
  ]) {
    let code = ts
      .transpileModule(fs.readFileSync(`src/${src}.ts`, "utf8"), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      })
      .outputText.replace(
        /export \{ scalableCommands as circleCommands \} from [\"\']\.\/scalable[\"\'];?/g,
        "",
      )
      .replace('"./spark"', '"./spark-runtime.mjs"')
      .replace("'./spark'", "'./spark-runtime.mjs'");
    fs.writeFileSync(`.tools/${out}.mjs`, code);
  }
  const { createSparkCommand } = await import("../.tools/spark-runtime.mjs"),
    { legacyCircleCommands: circleCommands, joinProof } =
      await import("../.tools/circles-runtime.mjs");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: "demo-pray-spark",
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  let passed = 0;
  const test = async (n, f) => {
    await f();
    passed++;
    console.log("PASS " + n);
  };
  const db = (u, provider = "google.com") =>
    env
      .authenticatedContext(u, { firebase: { sign_in_provider: provider } })
      .firestore();
  const d = db("director"),
    a = db("guest-a", "anonymous"),
    b = db("member-b", "password"),
    z = db("stranger", "anonymous");
  const dc = circleCommands(d, "director"),
    ac = circleCommands(a, "guest-a"),
    bc = circleCommands(b, "member-b");
  try {
    await env.clearFirestore();
    for (const [u, provider, name] of [
      ["director", "google.com", "단장"],
      ["guest-a", "anonymous", "민수"],
      ["member-b", "password", "지영"],
      ["stranger", "anonymous", "외부인"],
    ])
      await createSparkCommand(
        db(u, provider),
        u,
        name,
      )("bootstrap", {
        accountKind: provider === "anonymous" ? "guest" : "permanent",
      });
    await test("Anonymous cannot forge permanent identity or create leadership", async () => {
      await assertFails(
        updateDoc(doc(a, "profiles/guest-a"), { accountKind: "permanent" }),
      );
      await assertFails(ac("create", { name: "fake", teamName: "fake" }));
    });
    const { id: circle } = await dc("create", {
      name: "사랑기도단",
      teamName: "1팀",
    });
    let c = (await getDoc(doc(d, "circles", circle))).data();
    const team = Object.keys(c.teams)[0],
      code = "ABCD1234ABCD",
      password = "safe-team-password-2026";
    await dc("gate", {
      circle,
      team,
      code,
      password,
      open: true,
      approval: false,
    });
    await test("No unauthenticated roster or enumerable passwords", async () => {
      await assertFails(getDoc(doc(z, "circles", circle)));
      await assertFails(
        getDocs(query(collection(z, "circleGates"), limit(10))),
      );
      await assert.rejects(
        ac("join", { code, password: "wrong-password", name: "민수" }),
      );
    });
    await ac("join", { code, password, name: "민수" });
    await test("Admission request alone cannot read team data", async () =>
      assertFails(getDoc(doc(a, "circles", circle))));
    await ac("admit", { circle });
    await test("Correct team password admits unique anonymous member", async () => {
      assert.equal(
        (await getDoc(doc(a, "circles", circle))).data().people["guest-a"].role,
        "member",
      );
    });
    await test("Guests cannot modify admission settings or promote themselves", async () => {
      await assertFails(
        ac("gate", {
          circle,
          team,
          code,
          password,
          open: true,
          approval: false,
        }),
      );
      await assertFails(dc("promote", { circle, team, uid: "guest-a" }));
    });
    const { team: team2 } = await dc("team", { circle, name: "2팀" });
    await dc("gate", {
      circle,
      team: team2,
      code: "FEDC5678FEDC",
      password,
      open: true,
      approval: true,
    });
    await bc("join", { code: "FEDC5678FEDC", password, name: "지영" });
    await test("Approval-required team does not auto-admit", async () => {
      await assertFails(bc("admit", { circle }));
      await assertFails(getDoc(doc(b, "circles", circle)));
    });
    await dc("approve", { circle, uid: "member-b" });
    await dc("promote", { circle, team: team2, uid: "member-b" });
    await test("Director appoints permanent team leader", async () =>
      assert.equal(
        (await getDoc(doc(b, "circles", circle))).data().teams[team2].leader,
        "member-b",
      ));
    const { id: privateItem } = await bc("createEntry", {
      circle,
      title: "2팀만",
      body: "비공개 팀 이야기",
      kind: "prayer",
      teamId: team2,
    });
    await test("Other-team prayers and unfiltered queries are denied", async () => {
      await assertFails(
        getDoc(doc(a, `circles/${circle}/entries/${privateItem}`)),
      );
      await assertFails(
        getDocs(query(collection(a, `circles/${circle}/entries`), limit(100))),
      );
      await assertFails(
        ac("createEntry", {
          circle,
          title: "forged",
          body: "",
          kind: "task",
          teamId: "all",
        }),
      );
    });
    const { id: item } = await dc("createEntry", {
      circle,
      title: "모두 함께",
      body: "수련회 기도",
      kind: "prayer",
      teamId: "all",
    });
    await test("Scoped member query includes common and own team only", async () => {
      const s = await getDocs(
        query(
          collection(a, `circles/${circle}/entries`),
          where("teamId", "in", ["all", team]),
          limit(100),
        ),
      );
      assert.equal(s.size, 1);
    });
    await Promise.all([
      ac("log", { circle, id: item, eventId: "guest-log-1" }),
      bc("log", { circle, id: item, eventId: "member-log-1" }),
    ]);
    await test("Concurrent personal counts and shared total stay consistent", async () => {
      const v = (
        await getDoc(doc(d, `circles/${circle}/entries/${item}`))
      ).data();
      assert.equal(v.count, 2);
      assert.deepEqual(v.counts, { "guest-a": 1, "member-b": 1 });
      await ac("log", { circle, id: item, eventId: "guest-log-1" });
      assert.equal((await getDoc(doc(a, "profiles/guest-a"))).data().xp, 10);
    });
    await test("Cooldown, forged totals, XP and comment impersonation rejected", async () => {
      await assertFails(ac("log", { circle, id: item, eventId: "too-fast" }));
      await assertFails(
        updateDoc(doc(a, `circles/${circle}/entries/${item}`), { count: 999 }),
      );
      await assertFails(updateDoc(doc(a, "profiles/guest-a"), { xp: 999 }));
      await assertFails(
        ac("comment", { circle, id: item, name: "단장", text: "fake" }),
      );
    });
    await ac("comment", {
      circle,
      id: item,
      name: "민수",
      text: "함께 기도해요",
    });
    await ac("complete", { circle, id: item, rating: 4 });
    await test("Personal completion freezes personal count without closing shared item", async () => {
      const v = (
        await getDoc(doc(d, `circles/${circle}/entries/${item}`))
      ).data();
      assert.equal(v.closed, false);
      assert.equal(v.outcomes["guest-a"].count, 1);
      assert.equal(v.outcomes["member-b"], undefined);
    });
    await test("Only author or responsible leader can close shared item", async () => {
      await assertFails(ac("close", { circle, id: item, rating: 5 }));
      await dc("close", { circle, id: item, rating: 5 });
      await assert.rejects(
        bc("log", { circle, id: item, eventId: "after-close" }),
      );
    });
    await dc("gate", {
      circle,
      team,
      code,
      password: "rotated-password-2026",
      open: false,
      approval: false,
    });
    await test("Password rotation revokes old admission proof; locked teams reject new joins", async () => {
      const zz = circleCommands(z, "stranger");
      await assert.rejects(zz("join", { code, password, name: "외부인" }));
      await assertFails(
        zz("join", { code, password: "rotated-password-2026", name: "외부인" }),
      );
      assert.equal(
        (await getDoc(doc(a, "circles", circle))).data().people["guest-a"].name,
        "민수",
      );
    });
    console.log(
      `Circles: ${passed} hierarchy/admission/privacy/accounting scenarios passed.`,
    );
  } finally {
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
