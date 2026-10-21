const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5173");
  await page.waitForSelector(".hero img");
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "새로운 씨앗 심기" }).click();
  await page.getByPlaceholder("어떤 씨앗을 심어 볼까요?").fill("테스트 기도");
  await page
    .getByPlaceholder("자세한 내용, 함께 나누고 싶은 마음…")
    .fill("감사와 소망의 상세 이야기");
  await page.getByRole("button", { name: "씨앗 심기", exact: true }).click();
  await page
    .getByRole("button", { name: "테스트 기도 기도 기록", exact: true })
    .click();
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
  await page.getByRole("button", { name: "새로운 씨앗 심기" }).click();
  await page
    .getByPlaceholder("어떤 씨앗을 심어 볼까요?")
    .fill("나만의 비밀 테스트");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "씨앗 심기", exact: true }).click();
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
  await page.getByRole("button", { name: "🌷 작은 꽃밭 20 잎사귀" }).click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:demo:profile")),
  );
  assert.equal(saved.coins, beforeCoins - 20);
  assert.deepEqual(saved.decorations, ["flower"]);
  assert.equal(
    await page
      .getByRole("button", { name: "🌷 작은 꽃밭 정원에 놓았어요" })
      .isDisabled(),
    true,
  );
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "오늘의 숲", exact: true })
    .click();
  assert.equal(await page.locator(".garden-decorations").innerText(), "🌷");
  assert.deepEqual(errors, []);
  console.log(
    "Browser checks passed: create, record, comment, complete, archive, secret isolation, reload, mobile layout, invite state, cosmetic purchase.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
