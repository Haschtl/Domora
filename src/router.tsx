import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import App from "./App";

const rootRoute = createRootRoute({
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
  component: () => null
});

const homeFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home/feed",
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
  component: () => null
});

const shoppingHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping/history",
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
  component: () => null
});

const tasksStatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/stats",
  component: () => null
});

const tasksHistoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/history",
  component: () => null
});

const tasksSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks/settings",
  component: () => null
});

const financesOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/overview",
  component: () => null
});

const financesStatsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/stats",
  component: () => null
});

const financesArchiveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/archive",
  component: () => null
});

const financesSubscriptionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances/subscriptions",
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
  defaultPreload: "intent"
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
