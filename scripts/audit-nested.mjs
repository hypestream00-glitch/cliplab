import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("http://localhost:3000/login");
await page.getByLabel("E-mail").fill("demo@cliplab.app");
await page.getByLabel("Senha").fill("demo123456");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/studio", { timeout: 20000 });

await page.goto("http://localhost:3000/studio/live");
const channelHref = await page.locator('a[href*="/studio/live/"]').filter({ hasNot: page.locator("text=Canais") }).first().getAttribute("href");
const channelRes = channelHref ? await page.goto(`http://localhost:3000${channelHref}`) : null;

await page.goto("http://localhost:3000/studio/editor");
await page.waitForTimeout(500);
const editorHeading = await page.locator("h1").first().textContent();
const editorUrl = page.url();

await page.goto("http://localhost:3000/studio/accounts");
const connectCount = await page.getByRole("button", { name: "Conectar" }).count();
const metricsCount = await page.getByRole("link", { name: "Métricas" }).count();

console.log(JSON.stringify({
  channelHref,
  channelStatus: channelRes?.status() ?? null,
  channelHeading: await page.goto(channelHref ? `http://localhost:3000${channelHref}` : "http://localhost:3000/studio/live").then(async () => page.locator("h1").first().textContent()),
  editorUrl,
  editorHeading,
  connectCount,
  metricsCount,
  errors,
}, null, 2));
await browser.close();
