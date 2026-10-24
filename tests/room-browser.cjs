const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [],
    missing = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/room-") && r.status() >= 400) missing.push(r.url());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("room:test-seeded")) {
      localStorage.setItem(
        "pray:demo:profile",
        JSON.stringify({
          uid: "demo",
          name: "하은",
          xp: 120,
          coins: 200,
          decorations: ["flower"],
        }),
      );
      localStorage.setItem(
        "pray:room:demo",
        JSON.stringify({ mood: "morning", positions: {} }),
      );
      localStorage.setItem("room:test-seeded", "1");
    }
  });
  const url = new URL(process.env.APP_URL || "http://localhost:5173");
  url.searchParams.set("demo", "1");
  await page.goto(url.toString());
  // Existing purchases retain their original room and unlock six extra options.
  assert.equal(await page.locator(".hero .room-prop").count(), 1);
  await page.locator(".room-entry-button").click();
  assert.equal(await page.locator(".furniture-card").count(), 21);
  await page.getByRole("tab", { name: "내 보관함", exact: true }).click();
  assert.equal(await page.locator(".furniture-card").count(), 7);
  await page
    .getByRole("button", { name: "하트 다육이 방에 배치", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "하트 다육이 위치 조정", exact: true })
      .count(),
    1,
  );
  let profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:demo:profile")),
  );
  assert.equal(profile.coins, 200, "included items never charge again");
  await page.getByRole("tab", { name: "소품 가게", exact: true }).click();
  const bunny = page
    .locator(".furniture-card")
    .filter({ hasText: "포근한 토끼 인형" });
  await bunny
    .getByRole("button", { name: "50 코인으로 세트 열기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "포근한 토끼 인형 위치 조정", exact: true })
    .waitFor();
  profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:demo:profile")),
  );
  assert.equal(profile.coins, 150);
  assert.deepEqual(profile.decorations, ["flower", "lantern"]);
  await page.getByRole("tab", { name: "내 보관함", exact: true }).click();
  assert.equal(await page.locator(".furniture-card").count(), 14);
  await page
    .getByRole("button", { name: "하트 곰돌이 방에 배치", exact: true })
    .click();
  await page
    .getByRole("button", { name: "포근한 토끼 인형 보관하기", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "포근한 토끼 인형 위치 조정", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "하트 곰돌이 위치 조정", exact: true })
      .count(),
    1,
  );
  await page.getByRole("button", { name: "꾸미기 저장", exact: true }).click();
  await page.reload();
  await page.locator(".room-entry-button").click();
  assert.equal(
    await page
      .getByRole("button", { name: "하트 곰돌이 위치 조정", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "포근한 토끼 인형 위치 조정", exact: true })
      .count(),
    0,
  );
  const originalRoom = await page
    .getByLabel("꾸밀 방", { exact: true })
    .inputValue();
  await page.getByLabel("방 이름", { exact: true }).fill("작은 꽃방");
  await page.getByRole("button", { name: "빈 방 추가", exact: true }).click();
  assert.equal(await page.locator(".room-display .room-prop").count(), 0);
  assert.equal(await page.locator(".room-display .plain-room").count(), 1);
  await page
    .getByRole("button", { name: "하트 다육이 방에 배치", exact: true })
    .click();
  await page
    .getByRole("button", { name: "하트 다육이 위치 조정", exact: true })
    .press("ArrowRight");
  const newRoom = await page
    .getByLabel("꾸밀 방", { exact: true })
    .inputValue();
  await page.getByLabel("꾸밀 방", { exact: true }).selectOption(originalRoom);
  assert.equal(
    await page
      .getByRole("button", { name: "하트 곰돌이 위치 조정", exact: true })
      .count(),
    1,
  );
  await page.getByLabel("꾸밀 방", { exact: true }).selectOption(newRoom);
  assert.equal(
    await page
      .getByRole("button", { name: "하트 곰돌이 위치 조정", exact: true })
      .count(),
    0,
  );
  await page.reload();
  await page.locator(".room-entry-button").click();
  assert.equal(
    await page.getByLabel("꾸밀 방", { exact: true }).inputValue(),
    newRoom,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "하트 다육이 위치 조정", exact: true })
      .count(),
    1,
  );
  await page.getByLabel("방 이름", { exact: true }).fill("나의 꽃 정원");
  await page
    .getByRole("button", { name: "현재 방 이름 바꾸기", exact: true })
    .click();
  assert.equal(
    await page
      .locator('select[aria-label="꾸밀 방"] option:checked')
      .textContent(),
    "나의 꽃 정원",
  );
  await page.getByLabel("꾸밀 방", { exact: true }).selectOption(originalRoom);
  await page.getByRole("button", { name: "🧸 인형·쿠션", exact: true }).click();
  assert.equal(await page.locator(".furniture-card").count(), 4);
  await page
    .getByRole("searchbox", { name: "소품 검색", exact: true })
    .fill("고양이");
  assert.equal(await page.locator(".furniture-card").count(), 1);
  await page
    .getByRole("searchbox", { name: "소품 검색", exact: true })
    .fill("");
  await page.getByRole("button", { name: "🎀 전체", exact: true }).click();
  const sofa = page
    .locator(".furniture-card")
    .filter({ hasText: "딸기우유 소파" });
  await sofa
    .getByRole("button", { name: "100 코인으로 세트 열기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "딸기우유 소파 위치 조정", exact: true })
    .waitFor();
  profile = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:demo:profile")),
  );
  assert.equal(profile.coins, 50);
  assert.deepEqual(profile.decorations, ["flower", "lantern", "fountain"]);
  await page.getByRole("tab", { name: "내 보관함", exact: true }).click();
  assert.equal(await page.locator(".furniture-card").count(), 21);
  await page.getByRole("tab", { name: "소품 가게", exact: true }).click();
  await page
    .getByRole("button", { name: "딸기우유 소파 위치 조정", exact: true })
    .click();
  for (let i = 0; i < 30; i++)
    await page
      .getByRole("button", { name: "왼쪽으로 이동", exact: true })
      .click();
  assert.equal(
    await page
      .getByRole("button", { name: "딸기우유 소파 위치 조정", exact: true })
      .evaluate((el) => el.style.left),
    "21%",
  );
  await page.getByRole("button", { name: "꾸미기 저장", exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `overflow ${width}`,
    );
  }
  // Load and check every new asset while browsing all mobile categories.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of [
    "🌷 식물",
    "📚 책·문구",
    "🧸 인형·쿠션",
    "💡 조명",
    "🛋️ 가구",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    for (const image of await page.locator(".furniture-image img").all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(async (img) => {
        await img.decode();
      });
      assert.equal(await image.evaluate((img) => img.naturalWidth > 0), true);
    }
  }
  await page.getByRole("button", { name: "🧸 인형·쿠션", exact: true }).click();
  await page.getByRole("status").waitFor({ state: "hidden" });
  // Isolated catalog previews omit fixed page chrome so it does not cover cards.
  await page.addStyleTag({
    content: "header, .bottom-nav { visibility: hidden !important; }",
  });
  await page
    .locator(".room-shop")
    .screenshot({ path: "test-results/more-props-mobile.png" });
  await page
    .locator(".room-display")
    .screenshot({ path: "test-results/more-props-room.png" });
  assert.deepEqual(errors, []);
  assert.deepEqual(missing, []);
  console.log(
    "Room expansion passed: 21 assets, existing ownership, 3 packs, exact coin charges, 7/14/21 unlocks, independent placement, save/reload, categories, search and mobile widths.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
