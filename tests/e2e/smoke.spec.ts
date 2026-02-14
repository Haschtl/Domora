import { expect, test } from "@playwright/test";

test("redirects root to home and renders app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home(?:\/summary)?(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "Willkommen bei Domora" })).toBeVisible();
});
