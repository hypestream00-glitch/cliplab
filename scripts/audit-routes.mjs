import { chromium } from "playwright";

const routes = [
  "/studio",
  "/studio/create",
  "/studio/projects",
  "/studio/clips",
  "/studio/accounts",
  "/studio/metrics",
  "/studio/metrics/accounts",
  "/studio/metrics/content",
  "/studio/publishing",
  "/studio/publishing/calendar",
  "/studio/publishing/queue",
  "/studio/live",
  "/studio/live/channels",
  "/studio/settings",
  "/studio/settings/profile",
  "/studio/settings/workspace",
  "/studio/settings/billing",
  "/studio/settings/integrations",
  "/studio/settings/security",
  "/studio/templates",
  "/studio/championships",
  "/studio/championships/new",
  "/studio/team",
  "/studio/api",
  "/studio/editor",
];

const errors = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message, url: page.url() }));
page.on("response", (response) => {
  if (response.status() >= 500) {
    errors.push({ type: "http", status: response.status(), url: response.url() });
  }
});

await page.goto("http://localhost:3000/login");
await page.getByLabel("E-mail").fill("demo@cliplab.app");
await page.getByLabel("Senha").fill("demo123456");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/studio", { timeout: 20000 });

const results = [];

async function visit(route) {
  const response = await page.goto(`http://localhost:3000${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(400);
  const heading = await page.locator("h1").first().textContent().catch(() => null);
  const body = (await page.locator("body").innerText()).slice(0, 400);
  const hasNextError =
    body.includes("Application error") ||
    body.includes("Something went wrong") ||
    body.includes("Unhandled Runtime Error") ||
    body.includes("This page could not be found");
  results.push({
    route,
    status: response?.status() ?? 0,
    heading,
    hasNextError,
    snippet: body.replaceAll("\n", " | ").slice(0, 200),
  });
}

for (const route of routes) {
  await visit(route);
}

const extraSelectors = [
  { from: "/studio/projects", selector: 'a[href^="/studio/projects/"]' },
  { from: "/studio/clips", selector: 'a[href^="/studio/clips/"]' },
  { from: "/studio/metrics/accounts", selector: 'a[href^="/studio/metrics/accounts/"]' },
  { from: "/studio/live", selector: 'a[href^="/studio/live/"]' },
  { from: "/studio/championships", selector: 'a[href^="/studio/championships/"]' },
];

for (const extra of extraSelectors) {
  await page.goto(`http://localhost:3000${extra.from}`, { waitUntil: "domcontentloaded" });
  const href = await page.locator(extra.selector).first().getAttribute("href").catch(() => null);
  if (href && href !== extra.from) {
    await visit(href);
  }
}

console.log(JSON.stringify({ results, errors }, null, 2));
await browser.close();
if (results.some((item) => item.status >= 400 || item.hasNextError) || errors.length) {
  process.exit(1);
}
