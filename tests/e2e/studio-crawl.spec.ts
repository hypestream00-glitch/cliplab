import { test, expect, type Page } from "@playwright/test";

const studioRoutes = [
  "/studio",
  "/studio/create",
  "/studio/projects",
  "/studio/clips",
  "/studio/editor",
  "/studio/library",
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
  "/studio/trending",
  "/studio/competitions",
  "/studio/championships",
  "/studio/championships/new",
  "/studio/team",
  "/studio/api",
  "/studio/settings",
  "/studio/analytics",
  "/studio/settings/account",
  "/studio/settings/profile",
  "/studio/settings/workspace",
  "/studio/settings/billing",
  "/studio/settings/integrations",
  "/studio/settings/status",
  "/studio/settings/notifications",
  "/studio/settings/security",
];

const adminRoutes = ["/admin", "/admin/users", "/admin/workspaces", "/admin/jobs", "/admin/competitions", "/admin/trending", "/admin/billing"];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("demo123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url: URL) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("studio routes respond", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await login(page, "demo@cliplab.app");
  for (const route of studioRoutes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});

test("admin routes respond", async ({ page }) => {
  await login(page, "admin@cliplab.app");
  for (const route of adminRoutes) {
    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response?.status(), route).toBeLessThan(400);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});
