import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

type ScreenshotTarget = {
  id: string;
  viewportWidth: number;
  viewportHeight: number;
  deviceScaleFactor: number;
  outputWidth: number;
  outputHeight: number;
  label: string;
};

type ScreenshotScene = {
  id: string;
  label: string;
  path: string;
  action?: (page: Page) => Promise<void>;
};

const screenshotTargets: ScreenshotTarget[] = [
  {
    id: "phone",
    viewportWidth: 360,
    viewportHeight: 640,
    deviceScaleFactor: 3,
    outputWidth: 1080,
    outputHeight: 1920,
    label: "Phone portrait (1080x1920)"
  },
  {
    id: "tablet-7",
    viewportWidth: 1200,
    viewportHeight: 1920,
    deviceScaleFactor: 1,
    outputWidth: 1200,
    outputHeight: 1920,
    label: "7-inch tablet portrait (1200x1920)"
  },
  {
    id: "tablet-10",
    viewportWidth: 1600,
    viewportHeight: 2560,
    deviceScaleFactor: 1,
    outputWidth: 1600,
    outputHeight: 2560,
    label: "10-inch tablet portrait (1600x2560)"
  }
];

const outputRoot = process.env.PLAYSTORE_SCREENSHOT_DIR ?? "screenshots/google-play";
const screenshotEmail = process.env.PLAYSTORE_SCREENSHOT_EMAIL?.trim() ?? "";
const screenshotPassword = process.env.PLAYSTORE_SCREENSHOT_PASSWORD?.trim() ?? "";
const hasCredentials = screenshotEmail.length > 0 && screenshotPassword.length > 0;

const settleDelayRaw = Number(process.env.PLAYSTORE_SCREENSHOT_SETTLE_MS ?? "400");
const settleDelayMs = Number.isFinite(settleDelayRaw) && settleDelayRaw >= 0 ? settleDelayRaw : 400;
const networkIdleTimeoutRaw = Number(process.env.PLAYSTORE_SCREENSHOT_NETWORKIDLE_TIMEOUT_MS ?? "1500");
const networkIdleTimeoutMs =
  Number.isFinite(networkIdleTimeoutRaw) && networkIdleTimeoutRaw >= 0 ? networkIdleTimeoutRaw : 1500;
const screenshotTimeoutRaw = Number(process.env.PLAYSTORE_SCREENSHOT_TIMEOUT_MS ?? "480000");
const screenshotTimeoutMs = Number.isFinite(screenshotTimeoutRaw) && screenshotTimeoutRaw > 0 ? screenshotTimeoutRaw : 480000;

const dismissPushPromptIfVisible = async (page: Page) => {
  const laterButton = page.getByRole("button", { name: /Später|Later/i }).first();
  const isVisible = await laterButton.isVisible({ timeout: 500 }).catch(() => false);
  if (isVisible) {
    await laterButton.click();
  }
};

const waitForUiSettle = async (page: Page) => {
  if (page.isClosed()) return;
  await page.waitForLoadState("domcontentloaded");
  if (networkIdleTimeoutMs > 0) {
    await page.waitForLoadState("networkidle", { timeout: networkIdleTimeoutMs }).catch(() => undefined);
  }
  if (page.isClosed()) return;
  await dismissPushPromptIfVisible(page);
  if (page.isClosed()) return;
  await page.waitForTimeout(settleDelayMs);
};

const isNotFoundPage = async (page: Page) =>
  page
    .getByText(/Seite nicht gefunden|not found|404/i)
    .first()
    .isVisible({ timeout: 700 })
    .catch(() => false);

const maybeRecoverFromNotFound = async (page: Page) => {
  if (!(await isNotFoundPage(page))) return;
  const backButton = page.getByRole("button", { name: /Zurück|Back/i }).first();
  if (await backButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await backButton.click();
    await waitForUiSettle(page);
  }
};

const closeBlockingOverlays = async (page: Page) => {
  const visibleOverlays = page.locator('[role="dialog"]:visible, [role="menu"]:visible');
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const overlayCount = await visibleOverlays.count().catch(() => 0);
    if (overlayCount === 0) break;
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(140);
  }
  // extra defensive escape for stale dropdown focus traps
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(80);
};

const mainTabPatternBySection: Record<string, RegExp> = {
  home: /Home/i,
  shopping: /Einkaufen|Shopping/i,
  tasks: /Aufgaben|Tasks/i,
  finances: /Finanzen|Finances/i,
  settings: /Einstellungen|Settings/i
};

const subTabPatternBySection: Record<string, Record<string, RegExp>> = {
  home: {
    summary: /Summary/i,
    bucket: /Bucket/i,
    feed: /Feed/i
  },
  shopping: {
    list: /Einkaufsliste|Shopping list/i,
    history: /Shopping history|Historie|History/i
  },
  tasks: {
    overview: /Übersicht|Overview/i,
    stats: /Statistik|Stats/i,
    history: /Historie|History/i,
    settings: /^Einstellungen$|^Settings$/i
  },
  finances: {
    overview: /Übersicht|Overview/i,
    stats: /Statistik|Stats/i,
    archive: /Archiv|Archive/i,
    subscriptions: /Verträge|Subscriptions|Contracts/i
  },
  settings: {
    me: /Ich|Me/i,
    household: /WG|Household/i
  }
};

const normalizePath = (value: string) => value.replace(/\/+$/, "") || "/";

const isOnScenePath = (page: Page, scenePath: string) => {
  const currentPath = normalizePath(new URL(page.url()).pathname);
  const targetPath = normalizePath(scenePath);
  return currentPath === targetPath || currentPath.endsWith(targetPath);
};

const findVisibleButtonByText = (page: Page, pattern: RegExp) =>
  page.locator("button:visible").filter({ hasText: pattern }).first();

const activateButton = async (page: Page, button: Locator) => {
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.scrollIntoViewIfNeeded().catch(() => undefined);

  try {
    await button.click({ timeout: 2_500 });
    return;
  } catch {
    await closeBlockingOverlays(page);
  }

  try {
    await button.focus();
    await page.keyboard.press("Enter");
    return;
  } catch {
    await button.evaluate((element) => (element as HTMLElement).click());
  }
};

const navigateSceneViaUi = async (page: Page, scenePath: string) => {
  await closeBlockingOverlays(page);
  if (isOnScenePath(page, scenePath)) return;

  const parts = scenePath.split("/").filter(Boolean);
  const section = parts[0];
  const subSection = parts[1];

  const mainTabPattern = section ? mainTabPatternBySection[section] : undefined;
  if (!mainTabPattern) {
    throw new Error(`Unsupported scene path section: ${scenePath}`);
  }

  const mainTabButton = findVisibleButtonByText(page, mainTabPattern);
  await activateButton(page, mainTabButton);
  await waitForUiSettle(page);
  await closeBlockingOverlays(page);

  if (isOnScenePath(page, scenePath)) return;
  if (!subSection) return;

  const subPattern = subTabPatternBySection[section]?.[subSection];
  if (!subPattern) return;
  const subTabButton = findVisibleButtonByText(page, subPattern);
  await activateButton(page, subTabButton);
  await waitForUiSettle(page);
};

const signInOnCurrentPage = async (page: Page) => {
  const authHeading = page.getByRole("heading", { name: /Willkommen bei Domora|Welcome to Domora/i });
  await page.getByLabel(/E-Mail|Email/i).fill(screenshotEmail);
  await page.getByLabel(/Passwort|Password/i).fill(screenshotPassword);
  await page.getByRole("button", { name: /Einloggen|Sign in/i }).click();
  await expect(authHeading).toBeHidden({ timeout: 30_000 });
  await waitForUiSettle(page);
};

const signInIfNeeded = async (page: Page) => {
  await page.goto("/home/summary", { waitUntil: "domcontentloaded" });

  const authHeading = page.getByRole("heading", { name: /Willkommen bei Domora|Welcome to Domora/i });
  const authVisible = await authHeading.isVisible({ timeout: 2_000 }).catch(() => false);

  if (!authVisible) {
    await waitForUiSettle(page);
    return;
  }

  await signInOnCurrentPage(page);
};

const createHouseholdIfNeeded = async (page: Page) => {
  const createHouseholdButton = page.getByRole("button", { name: /WG anlegen|Create shared flat/i }).first();
  const setupVisible = await createHouseholdButton.isVisible({ timeout: 1_500 }).catch(() => false);
  if (!setupVisible) return;

  const householdNameInput = page.getByLabel(/WG-Name|Name/i).first();
  await expect(householdNameInput).toBeVisible({ timeout: 10_000 });
  await householdNameInput.fill(`Screenshots WG ${Date.now()}`);
  await createHouseholdButton.click();
  await waitForUiSettle(page);
};

const ensureSceneReady = async (page: Page, scenePath: string) => {
  const authHeading = page.getByRole("heading", { name: /Willkommen bei Domora|Welcome to Domora/i });
  if (await authHeading.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await signInOnCurrentPage(page);
  }

  await createHouseholdIfNeeded(page);
  await maybeRecoverFromNotFound(page);
  await navigateSceneViaUi(page, scenePath);
  await maybeRecoverFromNotFound(page);

  if (await isNotFoundPage(page)) {
    throw new Error(`Route recovery failed for ${scenePath}; still on not-found page.`);
  }

  if (await authHeading.isVisible({ timeout: 1_000 }).catch(() => false)) {
    throw new Error(`Not authenticated on ${scenePath}. Check PLAYSTORE_SCREENSHOT_EMAIL/PASSWORD.`);
  }

  const createHouseholdButton = page.getByRole("button", { name: /WG anlegen|Create shared flat/i }).first();
  if (await createHouseholdButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    throw new Error(`No active household on ${scenePath}. Create/select a household for screenshot user.`);
  }
};

const ensureTasksOverviewReady = async (page: Page) => {
  await ensureSceneReady(page, "/tasks/overview");
};

const ensureAtLeastOneTaskExists = async (page: Page) => {
  await ensureTasksOverviewReady(page);

  const actionsButtons = page.getByRole("button", { name: /Aufgaben-Aktionen|Task actions/i });
  if ((await actionsButtons.count()) > 0) return;

  const createTaskButton = page.getByRole("button", { name: /Aufgabe anlegen|Create task/i }).first();
  await expect(createTaskButton).toBeVisible({ timeout: 10_000 });
  await createTaskButton.click();

  const createTaskDialog = page.getByRole("dialog").last();
  await expect(createTaskDialog).toBeVisible({ timeout: 10_000 });
  await createTaskDialog
    .getByPlaceholder(/Bad putzen|Clean bathroom/i)
    .fill(`Screenshot Task ${Date.now()}`);
  await createTaskDialog.getByRole("button", { name: /Aufgabe anlegen|Create task/i }).click();

  await expect(actionsButtons.first()).toBeVisible({ timeout: 15_000 });
};

const openTaskDetailsDialog = async (page: Page) => {
  await ensureAtLeastOneTaskExists(page);

  const actionsButton = page.getByRole("button", { name: /Aufgaben-Aktionen|Task actions/i }).first();
  await expect(actionsButton).toBeVisible({ timeout: 10_000 });
  await actionsButton.click();

  const detailsMenuItem = page.getByRole("menuitem", { name: /^Details$/i }).first();
  await expect(detailsMenuItem).toBeVisible();
  await detailsMenuItem.click();

  const detailsDialogTitle = page.getByRole("heading", { name: /Details:/i }).first();
  await expect(detailsDialogTitle).toBeVisible({ timeout: 10_000 });
};

const openRentDetails = async (page: Page) => {
  const rentButton = page.locator("button").filter({ hasText: /Miete|Rent/i }).first();
  await expect(rentButton).toBeVisible({ timeout: 10_000 });
  await rentButton.click();

  await expect(page.getByText(/Miet-Übersicht|Rent overview/i).first()).toBeVisible({ timeout: 10_000 });
};

const scrollToContractsSection = async (page: Page) => {
  const rentOverviewTitle = page.getByText(/Miet-Übersicht|Rent overview/i).first();
  if (await rentOverviewTitle.isVisible({ timeout: 700 }).catch(() => false)) {
    const backButton = page.getByRole("button", { name: /Zurück|Back/i }).first();
    if (await backButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await backButton.click();
      await waitForUiSettle(page);
    }
  }

  await closeBlockingOverlays(page);

  // Use a content-unique control instead of ambiguous "Verträge/Contracts" text
  // to avoid matching hidden sidebar buttons on mobile.
  const addContractButton = page.getByRole("button", { name: /Vertrag anlegen|Add contract/i }).first();
  await expect(addContractButton).toBeVisible({ timeout: 10_000 });
  await addContractButton.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
};

const scrollWindow = async (page: Page, y: number) => {
  await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
};

const validatePlayStoreDimensions = async (filePath: string, target: ScreenshotTarget) => {
  const metadata = await sharp(filePath).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  expect(width, `${filePath} width`).toBe(target.outputWidth);
  expect(height, `${filePath} height`).toBe(target.outputHeight);
  expect(width, `${filePath} min width`).toBeGreaterThanOrEqual(320);
  expect(height, `${filePath} min height`).toBeGreaterThanOrEqual(320);
  expect(width, `${filePath} max width`).toBeLessThanOrEqual(3840);
  expect(height, `${filePath} max height`).toBeLessThanOrEqual(3840);
  expect(Math.max(width, height) / Math.min(width, height), `${filePath} aspect ratio`).toBeLessThanOrEqual(2);
};

const screenshotScenes: ScreenshotScene[] = [
  { id: "01-home-summary", label: "Home Summary", path: "/home/summary" },
  { id: "02-home-feed", label: "Home Feed", path: "/home/feed" },
  { id: "03-home-bucket", label: "Home Bucket", path: "/home/bucket" },
  { id: "04-tasks-overview", label: "Tasks Overview", path: "/tasks/overview" },
  { id: "05-task-details", label: "Task Details", path: "/tasks/overview", action: openTaskDetailsDialog },
  { id: "06-task-stats-1", label: "Task Stats 1", path: "/tasks/stats" },
  {
    id: "07-task-stats-2",
    label: "Task Stats 2",
    path: "/tasks/stats",
    action: async (page) => {
      await scrollWindow(page, 1_100);
    }
  },
  { id: "08-shopping-list", label: "Shopping List", path: "/shopping/list" },
  { id: "09-shopping-history", label: "Shopping History", path: "/shopping/history" },
  { id: "10-finance-overview", label: "Finance Overview", path: "/finances/overview" },
  {
    id: "11-finance-rent",
    label: "Finance Rent",
    path: "/finances/subscriptions",
    action: openRentDetails
  },
  {
    id: "12-finance-contracts",
    label: "Finance Contracts",
    path: "/finances/subscriptions",
    action: scrollToContractsSection
  },
  { id: "13-finance-archive", label: "Finance Archive", path: "/finances/archive" },
  { id: "14-finance-stats-1", label: "Finance Stats 1", path: "/finances/stats" },
  {
    id: "15-finance-stats-2",
    label: "Finance Stats 2",
    path: "/finances/stats",
    action: async (page) => {
      await scrollWindow(page, 1_100);
    }
  },
  { id: "16-settings-me", label: "Settings Me", path: "/settings/me" },
  { id: "17-settings-household", label: "Settings Household", path: "/settings/household" }
];

test.describe("Google Play Screenshot Generation", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!hasCredentials, "Set PLAYSTORE_SCREENSHOT_EMAIL and PLAYSTORE_SCREENSHOT_PASSWORD before running this spec.");

  test.beforeAll(async () => {
    await mkdir(outputRoot, { recursive: true });
    await writeFile(
      join(outputRoot, "manifest.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          outputRoot,
          targets: screenshotTargets,
          scenes: screenshotScenes.map((scene) => ({
            id: scene.id,
            label: scene.label,
            path: scene.path
          }))
        },
        null,
        2
      ),
      "utf8"
    );
  });

  for (const target of screenshotTargets) {
    test.describe(`target:${target.id}`, () => {
      test.setTimeout(screenshotTimeoutMs);

      test.use({
        viewport: {
          width: target.viewportWidth,
          height: target.viewportHeight
        },
        deviceScaleFactor: target.deviceScaleFactor,
        locale: "de-DE"
      });

      test(`captures full scene set for ${target.label}`, async ({ page }) => {
        await signInIfNeeded(page);

        const targetDir = join(outputRoot, target.id);
        await mkdir(targetDir, { recursive: true });

        const totalScenes = screenshotScenes.length;
        let sceneIndex = 0;
        for (const scene of screenshotScenes) {
          sceneIndex += 1;
          console.log(`[${target.id}] ${sceneIndex}/${totalScenes} ${scene.id} ${scene.label}`);
          await ensureSceneReady(page, scene.path);

          if (scene.action) {
            await scene.action(page);
            await waitForUiSettle(page);
          }

          const screenshotPath = join(targetDir, `${scene.id}.png`);
          await page.screenshot({
            path: screenshotPath,
            type: "png",
            fullPage: false,
            animations: "disabled",
            scale: "device"
          });
          await validatePlayStoreDimensions(screenshotPath, target);
        }
      });
    });
  }
});
