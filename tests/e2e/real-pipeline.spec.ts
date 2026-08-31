import { test } from "@playwright/test";

test.describe("REAL E2E CHECK", () => {
  test.skip(!process.env.RUN_REAL_E2E, "Set RUN_REAL_E2E=1 with real OpenAI + FFmpeg to run.");

  test("login → upload → probe → transcribe REAL → clips → editor → render → download", async ({ page }) => {
    test.fail(true, "Execute manually when credentials exist: login, small upload, wait pipeline REAL, editor, render, download.");
    await page.goto("/login");
  });
});
