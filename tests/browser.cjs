const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  const missingAssets = [];
  page.on("response", (r) => {
    if (
      r.url().startsWith(process.env.APP_URL || "http://localhost:5173") &&
      r.status() >= 400
    )
      missingAssets.push({ url: r.url(), status: r.status() });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const demoUrl = new URL(process.env.APP_URL || "http://localhost:5173");
  demoUrl.searchParams.set("demo", "1");
  await page.goto(demoUrl.toString());
  await page.waitForSelector(".hero img");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "새 퀘스트 만들기" }).click();
  await page.getByPlaceholder("어떤 퀘스트에 도전할까요?").fill("테스트 기도");
  await page
    .getByPlaceholder("자세한 내용, 함께 나누고 싶은 마음…")
    .fill("감사와 소망의 상세 이야기");
  await page.getByRole("button", { name: "퀘스트 등록", exact: true }).click();
  const untouchedPrayer = page.locator(".entry").filter({
    hasText: "우리 가족이 평안한 하루를 보내도록",
  });
  const untouchedCount = await untouchedPrayer.locator(".entry-foot").innerText();
  const targetPrayer = page.locator(".entry").filter({ hasText: "테스트 기도" });
  await page
    .getByRole("button", { name: "테스트 기도 기도 기록", exact: true })
    .click();
  assert.equal(
    await untouchedPrayer.locator(".entry-foot").innerText(),
    untouchedCount,
    "clicking one prayer must not increment another prayer",
  );
  assert.match(
    await targetPrayer.locator(".entry-foot").innerText(),
    /기도 1번/,
    "only the selected prayer's count increases",
  );
  assert.equal(await page.locator(".entry.just-recorded").count(), 1);
  assert.equal(await page.locator(".battle-scene.has-battled").count(), 1);
  assert.equal(
    await page.locator(".hero-copy .bar i").evaluate((el) => el.style.width),
    "30%",
  );
  await page.locator(".entry-title").filter({ hasText: "테스트 기도" }).click();
  await page
    .getByPlaceholder("오늘 마음에 남은 감동은…")
    .fill("마음에 평안이 찾아왔어요.");
  await page.getByRole("button", { name: "감동 남기기" }).click();
  await page.getByText("마음에 평안이 찾아왔어요.", { exact: true }).waitFor();
  await page.locator("summary").click();
  await page.getByRole("button", { name: "감사 보관함에 남기기" }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "감사 보관함" })
    .click();
  await page
    .locator(".entry-title")
    .filter({ hasText: "테스트 기도" })
    .waitFor();
  assert.match(
    await page.locator(".entry").filter({ hasText: "테스트 기도" }).innerText(),
    /100%/,
  );
  await page.getByRole("button", { name: "새 퀘스트 만들기" }).click();
  await page
    .getByPlaceholder("어떤 퀘스트에 도전할까요?")
    .fill("나만의 비밀 테스트");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "퀘스트 등록", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "오늘의 숲" })
    .click();
  await page.getByRole("button", { name: "나만의 비밀", exact: true }).click();
  await page
    .locator(".entry-title")
    .filter({ hasText: "나만의 비밀 테스트" })
    .waitFor();
  const secret = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:secrets:demo")),
  );
  assert.equal(secret[0].title, "나만의 비밀 테스트");
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("pray:demo:items")).some((e) => e.secret),
    ),
    false,
  );
  await page.reload();
  await page.getByRole("button", { name: "나만의 비밀", exact: true }).click();
  await page
    .locator(".entry-title")
    .filter({ hasText: "나만의 비밀 테스트" })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "우리 팀" })
    .click();
  await page.getByRole("button", { name: "팀원 초대", exact: true }).click();
  await page.getByText("지금은 체험 모드예요.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "기록", exact: true })
    .click();
  const beforeCoins = await page.evaluate(
    () => JSON.parse(localStorage.getItem("pray:demo:profile")).coins,
  );
  await page.getByRole("button", { name: "🌷 작은 꽃밭 20 코인" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:demo:profile")),
  );
  assert.equal(saved.coins, beforeCoins - 20);
  assert.deepEqual(saved.decorations, ["flower"]);
  assert.equal(
    await page
      .getByRole("button", { name: "🌷 작은 꽃밭 획득 완료" })
      .isDisabled(),
    true,
  );
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "오늘의 숲", exact: true })
    .click();
  assert.equal(await page.locator(".garden-decorations").innerText(), "🌷");
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `horizontal overflow at ${width}px`,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(missingAssets, []);
  console.log(
    "Browser checks passed: create, record, comment, complete, archive, secret isolation, reload, mobile layout, invite state, cosmetic purchase.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
