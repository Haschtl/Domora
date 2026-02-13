import { expect, test } from "@playwright/test";

test("redirects root to home and renders app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.locator("body")).toBeVisible();
});
