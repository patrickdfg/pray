const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launch({ headless: true, channel: "chrome" });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.APP_URL || "http://localhost:5173");
  const button = p.locator(".google-login");
  await button.waitFor();
  await p.waitForFunction(
    () => !document.querySelector(".google-login").disabled,
  );
  assert.match(await p.locator(".mode").innerText(), /로그인 필요/);
  await p.screenshot({ path: "test-results/google-signin.png" });
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(await button.isVisible(), true);
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  console.log(
    "Google signup/login entry is enabled on desktop and mobile; account login requires Google.",
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
