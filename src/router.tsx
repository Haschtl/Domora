import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import App from "./App";

const rootRoute = createRootRoute({
  component: App
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/shopping" });
  },
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
  component: () => null
});

const financesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "finances",
  component: () => null
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: () => null
});

const routeTree = rootRoute.addChildren([indexRoute, shoppingRoute, tasksRoute, financesRoute, settingsRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent"
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
