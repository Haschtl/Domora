import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import App from "./App";

const rootRoute = createRootRoute({
  component: App
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
  component: () => null
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "home",
  component: () => null
});

const shoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "shopping",
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
  component: () => null
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  homeRoute,
  shoppingRoute,
  tasksRoute,
  tasksOverviewRoute,
  tasksStatsRoute,
  tasksHistoryRoute,
  financesRoute,
  financesOverviewRoute,
  financesStatsRoute,
  financesArchiveRoute,
  financesSubscriptionsRoute,
  settingsRoute
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
