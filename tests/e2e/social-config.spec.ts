import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("demo@cliplab.app");
  await page.getByLabel("Senha").fill("demo123456");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url: URL) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
}

test("social platforms without credentials show configuration required", async ({ page }) => {
  await login(page);
  await page.goto("/studio/accounts");
  await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
  await expect(page.getByText("Configuração necessária").first()).toBeVisible();
  await expect(page.getByText("Conexão de redes sociais ainda não configurada").first()).toBeVisible();
  await expect(page.getByText("TIKTOK_CLIENT_KEY")).toHaveCount(0);
  await expect(page.getByText("META_APP_ID")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar de verdade" })).toHaveCount(0);
});
