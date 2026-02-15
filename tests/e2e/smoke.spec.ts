import { expect, test } from "@playwright/test";

test("redirects root to home and renders app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/home(?:\/summary)?(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "Willkommen bei Domora" })).toBeVisible();
});

test("shows auth form controls", async ({ page }) => {
  await page.goto("/home/summary");
  await expect(page.getByRole("heading", { name: "Willkommen bei Domora" })).toBeVisible();
  await expect(page.getByLabel("E-Mail")).toBeVisible();
  await expect(page.getByLabel("Passwort")).toBeVisible();
  await expect(page.getByRole("button", { name: "Einloggen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrieren" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mit Google fortfahren" })).toBeVisible();
});

test("redirects section routes and keeps auth screen", async ({ page }) => {
  await page.goto("/shopping");
  await expect(page).toHaveURL(/\/shopping\/list(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: "Willkommen bei Domora" })).toBeVisible();
});

test("shows payment redirect success and cancel screens", async ({ page }) => {
  await page.goto("/redirect-payment/success");
  await expect(page.getByText("Zahlung abgeschlossen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Finanzübersicht" })).toBeVisible();

  await page.goto("/redirect-payment/cancel");
  await expect(page.getByText("Zahlung abgebrochen")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Finanzübersicht" })).toBeVisible();
});
