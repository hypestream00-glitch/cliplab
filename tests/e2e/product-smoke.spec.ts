import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("demo@cliplab.app");
  await page.getByLabel("Senha").fill("demo123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url: URL) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("demo login reaches dashboard with persisted stats", async ({ page }) => {
  await login(page);
  await page.goto("/studio");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.getByText("Projetos", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Clips gerados")).toBeVisible();
});

test("create project form is wired and library/status exist", async ({ page }) => {
  await login(page);
  await page.goto("/studio/create");
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator('input[type="file"]').first()).toBeVisible();
  await page.goto("/studio/library");
  await expect(page.getByRole("heading", { name: "Biblioteca" })).toBeVisible();
  await page.goto("/studio/settings/status");
  await expect(page.getByRole("heading", { name: "System Status" })).toBeVisible();
  await expect(page.getByText("Database", { exact: true })).toBeVisible();
  await expect(page.getByText("OpenAI", { exact: true })).toBeVisible();
});

test("editor and settings persist surfaces load", async ({ page }) => {
  await login(page);
  await page.goto("/studio/editor");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/studio/settings/profile");
  await expect(page.getByRole("button", { name: "Salvar" })).toBeVisible();
  await page.goto("/studio/settings/notifications");
  await expect(page.getByRole("button", { name: "Salvar preferências" })).toBeVisible();
});
