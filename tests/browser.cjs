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
  await page.getByRole("button", { name: "새 마음 기록하기" }).click();
  await page.getByPlaceholder("어떤 마음을 심어 볼까요?").fill("테스트 기도");
  await page
    .getByPlaceholder("자세한 내용, 함께 나누고 싶은 마음…")
    .fill("감사와 소망의 상세 이야기");
  await page.getByRole("button", { name: "마음 심기", exact: true }).click();
  const untouchedPrayer = page.locator(".entry").filter({
    hasText: "우리 가족이 평안한 하루를 보내도록",
  });
  const untouchedCount = await untouchedPrayer
    .locator(".entry-foot")
    .innerText();
  const targetPrayer = page
    .locator(".entry")
    .filter({ hasText: "테스트 기도" });
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
  assert.equal(await page.locator('.record[aria-busy="true"]').count(), 0);
  const task = page
    .locator(".entry")
    .filter({ hasText: "고마운 사람에게 안부 전하기" });
  const otherTask = page
    .locator(".entry")
    .filter({ hasText: "잠들기 전 감사 세 가지 적기" });
  const otherTaskCount = await otherTask.locator(".entry-foot").innerText();
  await task.locator(".record").click();
  assert.match(await task.locator(".entry-foot").innerText(), /실천 기록 4번/);
  assert.equal(
    await otherTask.locator(".entry-foot").innerText(),
    otherTaskCount,
  );

  assert.equal(await page.locator(".battle-scene.has-battled").count(), 1);
  assert.equal(
    await page.locator(".hero-copy .bar i").evaluate((el) => el.style.width),
    "40%",
  );
  // The pencil is always present for the author's active entries, on mobile too.
  await page.setViewportSize({ width: 320, height: 900 });
  const editButton = page.getByRole("button", {
    name: "테스트 기도 수정",
    exact: true,
  });
  assert.equal(await editButton.isVisible(), true);
  const editBox = await editButton.boundingBox();
  assert.ok(editBox.width >= 44 && editBox.height >= 44);
  await editButton.click();
  await page.getByLabel("제목", { exact: true }).fill("테스트 기도 수정됨");
  await page
    .getByLabel("마음에 담긴 이야기", { exact: true })
    .fill("수정한 상세 이야기");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await page
    .getByRole("heading", { name: "테스트 기도 수정됨", exact: true })
    .waitFor();
  assert.equal(
    await page.locator(".detail-body").innerText(),
    "수정한 상세 이야기",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  assert.match(
    await page
      .locator(".entry")
      .filter({ hasText: "테스트 기도 수정됨" })
      .innerText(),
    /기도 1번/,
  );
  assert.equal(
    await page
      .getByRole("button", {
        name: "우리 가족이 평안한 하루를 보내도록 수정",
        exact: true,
      })
      .count(),
    0,
  );
  await page.setViewportSize({ width: 1440, height: 1080 });
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
  await page.getByRole("button", { name: "새 마음 기록하기" }).click();
  await page
    .getByPlaceholder("어떤 마음을 심어 볼까요?")
    .fill("나만의 비밀 테스트");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "마음 심기", exact: true }).click();
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "오늘의 숲" })
    .click();
  await page.getByRole("button", { name: "나만의 비밀", exact: true }).click();
  await page
    .locator(".entry-title")
    .filter({ hasText: "나만의 비밀 테스트" })
    .waitFor();
  await page
    .getByRole("button", { name: "나만의 비밀 테스트 수정", exact: true })
    .click();
  await page
    .getByLabel("마음에 담긴 이야기", { exact: true })
    .fill("이 기기에만 남는 수정");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  const secret = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:secrets:demo")),
  );
  assert.equal(secret[0].title, "나만의 비밀 테스트");
  assert.equal(secret[0].body, "이 기기에만 남는 수정");
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
  assert.equal(
    await page.locator('.hero .room-prop img[alt="작은 꽃밭"]').count(),
    1,
  );
  await page.locator(".room-entry-button").click();
  assert.equal(
    await page
      .locator(".furniture-card")
      .filter({ hasText: "별빛 랜턴" })
      .locator("button.primary")
      .isDisabled(),
    true,
  );
  const prop = page.getByRole("button", {
    name: "작은 꽃밭 위치 조정",
    exact: true,
  });
  await prop.click();
  await page
    .getByRole("button", { name: "오른쪽으로 이동", exact: true })
    .click();
  assert.equal(await prop.evaluate((el) => el.style.left), "20%");
  // Dragging an owned furnishing updates its position in this exact room.
  const propBounds = await prop.boundingBox();
  const sceneBounds = await page
    .locator(".room-display .room-scene")
    .boundingBox();
  await page.mouse.move(
    propBounds.x + propBounds.width / 2,
    propBounds.y + propBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    sceneBounds.x + sceneBounds.width * 0.6,
    sceneBounds.y + sceneBounds.height * 0.85,
    { steps: 5 },
  );
  await page.mouse.up();
  assert.ok(
    Math.abs(parseFloat(await prop.evaluate((el) => el.style.left)) - 60) < 1,
  );
  await page.getByRole("status").waitFor({ state: "hidden" });
  await page.screenshot({
    path: "test-results/final-room-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.screenshot({
    path: "test-results/final-room-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const roomCoins = await page.evaluate(
    () => JSON.parse(localStorage.getItem("pray:demo:profile")).coins,
  );
  await page.getByRole("tab", { name: "내 보관함", exact: true }).click();
  await page
    .getByRole("button", { name: "작은 꽃밭 보관하기", exact: true })
    .click();
  assert.equal(await prop.count(), 0);
  await page
    .getByRole("button", { name: "작은 꽃밭 방에 배치", exact: true })
    .click();
  assert.equal(await prop.count(), 1);
  await page.getByRole("tab", { name: "방 분위기", exact: true }).click();
  await page.getByRole("button", { name: /분홍 노을/ }).click();
  await page.getByRole("button", { name: "꾸미기 저장", exact: true }).click();
  const savedRoom = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("pray:room:demo")),
  );
  assert.equal(savedRoom.mood, "sunset");
  assert.ok(Math.abs(savedRoom.positions.flower.x - 60) < 1);
  assert.equal(savedRoom.positions.flower.hidden, false);
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("pray:demo:profile")).coins,
    ),
    roomCoins,
  );
  await page.reload();
  assert.equal(await page.locator(".hero .room-scene.mood-sunset").count(), 1);
  await page.locator(".room-entry-button").click();
  assert.ok(
    Math.abs(parseFloat(await prop.evaluate((el) => el.style.left)) - 60) < 1,
  );
  await page
    .locator(".bottom-nav")
    .getByRole("button", { name: "오늘의 숲", exact: true })
    .click();
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
  // Every screen and open forms must fit each supported size.
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [
      "오늘의 숲",
      "기도 모아보기",
      "작은 실천",
      "우리 팀",
      "성장 기록",
      "감사 보관함",
      "내 방 꾸미기",
    ]) {
      if (width <= 700)
        await page
          .getByRole("button", { name: "메뉴 열기", exact: true })
          .click();
      await page
        .locator(".sidebar")
        .getByRole("button", { name, exact: name !== "기도 모아보기" })
        .click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} overflow at ${width}px`,
      );
    }
    if (width <= 700)
      await page
        .getByRole("button", { name: "메뉴 열기", exact: true })
        .click();
    await page
      .locator(".sidebar")
      .getByRole("button", { name: "오늘의 숲", exact: true })
      .click();
    await page.screenshot({
      path: `test-results/home-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: "새 마음 기록하기" }).click();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.getByRole("button", { name: "닫기", exact: true }).click();
  }
  // Save clean design previews with a fresh demo profile and no transient toast.
  const preview = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  await preview.goto(demoUrl.toString());
  await preview.locator(".room-background").waitFor();
  await preview.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) => img.decode().catch(() => {})),
    );
  });
  await preview.screenshot({
    path: "test-results/final-desktop.png",
    fullPage: true,
  });
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.screenshot({
    path: "test-results/final-mobile.png",
    fullPage: true,
  });
  await preview.screenshot({ path: "test-results/final-mobile-screen.png" });
  await preview.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(missingAssets, []);
  console.log(
    "Browser checks passed: create, isolated prayer/task record, edit, comment, complete, archive, secret isolation, reload, mobile layout, invite, purchase, room drag, inventory, mood and saved room persistence.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
