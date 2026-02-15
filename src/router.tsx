import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import App from "./App";
import { appStore, setActiveHouseholdId } from "./lib/app-store";
import { getCurrentSession, getHouseholdsForUser } from "./lib/api";
import { ensureHouseholdQueries } from "./lib/household-queries";
import type { HouseholdQueryKey } from "./lib/household-queries";
import { queryClient } from "./lib/query-client";
import { queryKeys } from "./lib/query-keys";

const ensureSessionAndHousehold = async () => {
  const session = await queryClient.ensureQueryData({
    queryKey: queryKeys.session,
    queryFn: getCurrentSession
  });
  const userId = session?.user?.id;
  if (!userId) return null;

  const households = await queryClient.ensureQueryData({
    queryKey: queryKeys.households(userId),
    queryFn: () => getHouseholdsForUser(userId)
  });

  let householdId = appStore.state.activeHouseholdId;
  if (!householdId || !households.some((entry) => entry.id === householdId)) {
    householdId = households[0]?.id ?? null;
    setActiveHouseholdId(householdId);
  }

  return householdId;
};

const prefetchHouseholdData = async (queries: HouseholdQueryKey[]) => {
  const householdId = (await ensureSessionAndHousehold()) ?? appStore.state.activeHouseholdId;
  if (!householdId) return;
  await ensureHouseholdQueries(queryClient, householdId, queries);
};

const rootRoute = createRootRoute({
  beforeLoad: () => ensureSessionAndHousehold(),
  component: App
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/home/summary" });
  },
  component: () => null
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home",
  beforeLoad: () => {
    throw redirect({ to: "/home/summary" });
  },
  component: () => null
});

const homeSummaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home/summary",
  loader: () =>
    prefetchHouseholdData([
      "bucketItems",
      "tasks",
      "taskCompletions",
      "finances",
      "cashAuditRequests",
      "householdEvents"
    ]),
  component: () => null
});

const homeBucketRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home/bucket",
  loader: () =>
    prefetchHouseholdData([
      "bucketItems",
      "tasks",
      "taskCompletions",
      "finances",
      "cashAuditRequests",
      "householdEvents"
    ]),
  component: () => null
});

const homeFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home/feed",
  loader: () =>
    prefetchHouseholdData([
      "bucketItems",
      "tasks",
      "taskCompletions",
      "finances",
      "cashAuditRequests",
      "householdEvents"
    ]),
  component: () => null
});

const shoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping",
  beforeLoad: () => {
    throw redirect({ to: "/shopping/list" });
  },
  component: () => null
});

const shoppingListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping/list",
  loader: () => prefetchHouseholdData(["shoppingItems", "shoppingCompletions"]),
  component: () => null
});

const shoppingHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping/history",
  loader: () => prefetchHouseholdData(["shoppingItems", "shoppingCompletions"]),
  component: () => null
});

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks",
  beforeLoad: () => {
    throw redirect({ to: "/tasks/overview" });
  },
  component: () => null
});

const financesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances",
  beforeLoad: () => {
    throw redirect({ to: "/finances/overview" });
  },
  component: () => null
});

const tasksOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/overview",
  loader: () => prefetchHouseholdData(["tasks", "taskCompletions", "memberPimpers"]),
  component: () => null
});

const tasksStatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/stats",
  loader: () => prefetchHouseholdData(["tasks", "taskCompletions", "memberPimpers"]),
  component: () => null
});

const tasksHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/history",
  loader: () => prefetchHouseholdData(["tasks", "taskCompletions", "memberPimpers"]),
  component: () => null
});

const tasksSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/settings",
  loader: () => prefetchHouseholdData(["tasks", "taskCompletions", "memberPimpers"]),
  component: () => null
});

const financesOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/overview",
  loader: () => prefetchHouseholdData(["finances", "financeSubscriptions", "cashAuditRequests"]),
  component: () => null
});

const financesStatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/stats",
  loader: () => prefetchHouseholdData(["finances", "financeSubscriptions", "cashAuditRequests"]),
  component: () => null
});

const financesArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/archive",
  loader: () => prefetchHouseholdData(["finances", "financeSubscriptions", "cashAuditRequests"]),
  component: () => null
});

const financesSubscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/subscriptions",
  loader: () => prefetchHouseholdData(["finances", "financeSubscriptions", "cashAuditRequests"]),
  component: () => null
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  beforeLoad: () => {
    throw redirect({ to: "/settings/me" });
  },
  component: () => null
});

const settingsMeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/me",
  component: () => null
});

const settingsHouseholdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/household",
  component: () => null
});

const redirectPaymentSuccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "redirect-payment/success",
  component: () => null
});

const redirectPaymentCancelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "redirect-payment/cancel",
  component: () => null
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  homeRoute,
  homeSummaryRoute,
  homeBucketRoute,
  homeFeedRoute,
  shoppingRoute,
  shoppingListRoute,
  shoppingHistoryRoute,
  tasksRoute,
  tasksOverviewRoute,
  tasksStatsRoute,
  tasksHistoryRoute,
  tasksSettingsRoute,
  financesRoute,
  financesOverviewRoute,
  financesStatsRoute,
  financesArchiveRoute,
  financesSubscriptionsRoute,
  settingsRoute,
  settingsMeRoute,
  settingsHouseholdRoute,
  redirectPaymentSuccessRoute,
  redirectPaymentCancelRoute
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  basepath: import.meta.env.BASE_URL
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
