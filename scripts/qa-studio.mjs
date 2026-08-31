import { chromium } from "playwright";

const studioRoutes = [
  "/studio",
  "/studio/create",
  "/studio/projects",
  "/studio/clips",
  "/studio/editor",
  "/studio/templates",
  "/studio/publishing",
  "/studio/publishing/calendar",
  "/studio/publishing/queue",
  "/studio/publishing/autopilot",
  "/studio/accounts",
  "/studio/metrics",
  "/studio/metrics/accounts",
  "/studio/metrics/content",
  "/studio/live",
  "/studio/live/channels",
  "/studio/championships",
  "/studio/championships/new",
  "/studio/team",
  "/studio/api",
  "/studio/settings",
  "/studio/settings/profile",
  "/studio/settings/workspace",
  "/studio/settings/billing",
  "/studio/settings/integrations",
  "/studio/settings/notifications",
  "/studio/settings/security",
];

const adminRoutes = ["/admin", "/admin/users", "/admin/workspaces", "/admin/jobs", "/admin/billing"];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (error) => errors.push({ type: "pageerror", message: error.message, url: page.url() }));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push({ type: "console", message: msg.text(), url: page.url() });
});
page.on("response", (response) => {
  if (response.status() >= 500) errors.push({ type: "http", status: response.status(), url: response.url() });
});

async function login(email) {
  await page.goto("http://localhost:3000/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("demo123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function crawl(routes, extra = []) {
  const results = [];
  const seen = new Set();
  const queue = [...routes, ...extra];
  while (queue.length) {
    const route = queue.shift();
    const pathOnly = route.split("?")[0];
    if (seen.has(pathOnly)) continue;
    seen.add(pathOnly);
    const response = await page.goto(`http://localhost:3000${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(200);
    const heading = await page.locator("h1").first().textContent().catch(() => null);
    results.push({
      route: page.url().replace("http://localhost:3000", ""),
      requested: route,
      status: response?.status() ?? 0,
      heading,
    });
    const hrefs = await page.$$eval("a[href]", (nodes) =>
      nodes
        .map((node) => node.getAttribute("href") || "")
        .filter((href) => href.startsWith("/studio") || href.startsWith("/admin")),
    );
    for (const href of hrefs) {
      const clean = href.split("#")[0];
      if (!seen.has(clean.split("?")[0]) && (clean.startsWith("/studio") || clean.startsWith("/admin"))) {
        queue.push(clean);
      }
    }
  }
  return results;
}

await login("demo@cliplab.app");
const studioResults = await crawl(studioRoutes);
await page.setViewportSize({ width: 390, height: 844 });
await page.goto("http://localhost:3000/studio", { waitUntil: "domcontentloaded" });
await page.setViewportSize({ width: 1440, height: 900 });

await page.context().clearCookies();
await login("admin@cliplab.app");
const adminResults = await crawl(adminRoutes);

const results = [...studioResults, ...adminResults];
const broken = results.filter((item) => item.status >= 400);
console.log(JSON.stringify({ count: results.length, broken, errors, results }, null, 2));
await browser.close();
if (errors.length || broken.length) process.exit(1);
