import { test } from "@playwright/test";

test.describe("SOCIAL E2E MANUAL", () => {
  test.skip(!process.env.RUN_SOCIAL_E2E, "Never runs in npm test / build / preflight. Set RUN_SOCIAL_E2E=1 only for a controlled real post.");

  test("select connected account and clip then publish explicitly", async ({ page }) => {
    test.fail(true, "Manual: /studio/publishing → conta real → Publicar de verdade. Não automatizar.");
    await page.goto("/studio/publishing");
  });
});
