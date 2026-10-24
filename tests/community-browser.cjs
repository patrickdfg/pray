const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("fs");
(async () => {
  const { initializeTestEnvironment } =
    await import("@firebase/rules-unit-testing");
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const env = await initializeTestEnvironment({
    projectId: "demo-pray-spark",
    firestore: {
      host,
      port: Number(port),
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
  await env.clearFirestore();
  const server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5175"],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        VITE_USE_EMULATORS: "true",
        VITE_FIREBASE_PROJECT_ID: "demo-pray-spark",
        VITE_FIREBASE_API_KEY: "fake-api-key",
        VITE_FIREBASE_AUTH_DOMAIN: "demo-pray-spark.firebaseapp.com",
        VITE_FIREBASE_APP_ID: "demo-app",
      },
    },
  );
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      try {
        await fetch("http://127.0.0.1:5175");
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    browser = await chromium.launch({
      channel: process.env.CI ? undefined : "chrome",
      headless: true,
    });
    const director = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      }),
      guest = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      p = await director.newPage(),
      g = await guest.newPage();
    const errors = [];
    for (const x of [p, g]) x.on("pageerror", (e) => errors.push(e.message));
    await p.goto("http://127.0.0.1:5175");
    await p
      .getByText("이메일로 로그인 · 별명 계정 연결", { exact: true })
      .first()
      .click();
    await p
      .getByLabel("이메일", { exact: true })
      .first()
      .fill("director@example.test");
    await p
      .getByLabel("계정 비밀번호", { exact: true })
      .first()
      .fill("Test-account-password!");
    await p.getByText("새 이메일 계정 만들기", { exact: true }).first().click();
    await p
      .getByRole("button", { name: "이메일로 계속하기", exact: true })
      .first()
      .click();
    await p
      .locator(".mode")
      .filter({ hasText: "함께하는 숲" })
      .waitFor({ state: "attached" });
    await p.getByLabel("기도단 이름", { exact: true }).fill("테스트 기도단");
    await p.getByLabel("첫 팀 이름", { exact: true }).fill("하나팀");
    await p.getByRole("button", { name: "기도단 만들기", exact: true }).click();
    await p
      .locator("aside nav")
      .getByRole("button", { name: "우리 팀", exact: true })
      .click();
    await p
      .getByText("팀 입장 관리 · 코드와 비밀번호", { exact: true })
      .click();
    await p
      .getByLabel("새 참여 비밀번호", { exact: true })
      .fill("Team-test-password!");
    await p.getByText("신규 참여 허용", { exact: true }).click();
    await p
      .getByRole("button", {
        name: "참여 비밀번호와 입장 설정 저장",
        exact: true,
      })
      .click();
    await p
      .getByText("입장 설정을 저장했어요. 기존 팀원의 소속은 유지돼요.", {
        exact: true,
      })
      .waitFor();
    const code = (
      await p
        .getByText("팀 코드:", { exact: false })
        .filter({ has: p.locator("strong") })
        .innerText()
    )
      .replace("팀 코드:", "")
      .trim();
    assert.match(code, /^[A-Z0-9]{12}$/);
    await g.goto("http://127.0.0.1:5175");
    await g.getByLabel("별명", { exact: true }).fill("민수");
    await g.getByLabel("팀 코드", { exact: true }).fill(code);
    await g
      .getByLabel("참여 비밀번호", { exact: true })
      .fill("Team-test-password!");
    await g
      .getByRole("button", { name: "별명으로 팀 참여", exact: true })
      .click();
    await g
      .getByText("팀에 참여했어요. 기도와 실천을 함께 기록해요!", {
        exact: true,
      })
      .waitFor();
    await p
      .getByRole("button", { name: "새 마음 기록하기", exact: true })
      .click();
    await p.getByPlaceholder("어떤 마음을 심어 볼까요?").fill("모두의 평안");
    await p.getByLabel("공유 범위").selectOption("all");
    await p.getByRole("button", { name: "마음 심기", exact: true }).click();
    await g
      .locator(".bottom-nav")
      .getByRole("button", { name: "기도", exact: true })
      .click();
    await g
      .getByRole("button", { name: "모두의 평안 기도 기록", exact: true })
      .click();
    await g.getByText("나는 1번", { exact: false }).waitFor();
    await p
      .locator("aside nav")
      .getByRole("button", { name: "기도", exact: false })
      .click();
    await p
      .locator(".entry")
      .filter({ hasText: "모두의 평안" })
      .getByText("1번", { exact: false })
      .first()
      .waitFor();
    await g.reload();
    await g
      .locator(".mode")
      .filter({ hasText: "함께하는 숲" })
      .waitFor({ state: "attached" });
    await g
      .locator(".bottom-nav")
      .getByRole("button", { name: "기도", exact: true })
      .click();
    await g.getByText("나는 1번", { exact: false }).waitFor();
    const googleContext = await browser.newContext({
      viewport: { width: 1000, height: 900 },
    });
    const googlePage = await googleContext.newPage();
    await googlePage.goto("http://127.0.0.1:5175");
    const popupPromise = googlePage.waitForEvent("popup");
    await googlePage
      .getByRole("button", { name: "Google로 가입·로그인", exact: true })
      .first()
      .click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await popup.getByText("Add new account", { exact: true }).click();
    await popup.locator("#email-input").fill("google@example.test");
    await popup.locator("#display-name-input").fill("구글친구");
    await popup
      .getByRole("button", { name: "Sign in with Google.com", exact: true })
      .click();
    await googlePage
      .locator(".mode")
      .filter({ hasText: "함께하는 숲" })
      .waitFor({ state: "attached" });
    await googlePage.reload();
    await googlePage
      .locator(".mode")
      .filter({ hasText: "함께하는 숲" })
      .waitFor({ state: "attached" });
    const state = await guest.storageState({ indexedDB: true });
    assert(state.origins.some((o) => o.indexedDB?.length));
    const restored = await browser.newContext({
        viewport: { width: 390, height: 844 },
        storageState: state,
      }),
      r = await restored.newPage();
    await r.goto("http://127.0.0.1:5175");
    await r
      .locator(".mode")
      .filter({ hasText: "함께하는 숲" })
      .waitFor({ state: "attached" });
    await r
      .locator(".bottom-nav")
      .getByRole("button", { name: "기도", exact: true })
      .click();
    await r.getByText("나는 1번", { exact: false }).waitFor();
    await r
      .locator(".bottom-nav")
      .getByRole("button", { name: "우리 팀", exact: true })
      .click();
    await r
      .getByText("이메일로 로그인 · 별명 계정 연결", { exact: true })
      .click();
    await r.getByLabel("이메일", { exact: true }).fill("member@example.test");
    await r
      .getByLabel("계정 비밀번호", { exact: true })
      .fill("Member-account-password!");
    await r
      .getByRole("button", { name: "이메일로 계속하기", exact: true })
      .click();
    await r
      .getByText("계정을 연결했어요. 다음 방문에도 로그인이 유지돼요.", {
        exact: true,
      })
      .waitFor();
    await r.reload();
    await r
      .locator(".bottom-nav")
      .getByRole("button", { name: "기도", exact: true })
      .click();
    await r.getByText("나는 1번", { exact: false }).waitFor();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await p.setViewportSize({ width, height: 950 });
      if (width < 768)
        await p
          .locator(".bottom-nav")
          .getByRole("button", { name: "우리 팀", exact: true })
          .click();
      else
        await p
          .locator("aside nav")
          .getByRole("button", { name: "우리 팀", exact: true })
          .click();
      assert.equal(
        await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `overflow ${width}`,
      );
    }
    fs.mkdirSync("test-results", { recursive: true });
    await r.screenshot({
      path: "test-results/community-mobile.png",
      fullPage: true,
    });
    await p.screenshot({
      path: "test-results/community-desktop.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "Community UI passed: email director, Google popup and restored login, code/password anonymous admission, live shared prayer and personal counts, reload, browser restart persistence, email linking without UID/data loss, 320–1440px layout.",
    );
  } catch (e) {
    if (browser) {
      for (const [i, c] of browser.contexts().entries()) {
        for (const [j, p] of c.pages().entries()) {
          console.log(
            `STATE ${i}-${j}`,
            (await p.locator("body").innerText()).slice(-2500),
          );
          await p
            .screenshot({
              path: `test-results/community-error-${i}-${j}.png`,
              fullPage: true,
            })
            .catch(() => {});
        }
      }
    }
    throw e;
  } finally {
    await browser?.close();
    server.kill();
    await env.cleanup();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
