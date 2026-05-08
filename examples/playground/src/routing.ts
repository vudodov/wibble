import { watch, type Component } from "@wibble/core";
import { createRouter } from "@wibble/router";
import { loadCityReport } from "./api/openApis";
import { appStore } from "./state/appStore.wib";
import WeatherPage from "./pages/WeatherPage.wib";
import CountryPage from "./pages/CountryPage.wib";
import InsightsPage from "./pages/InsightsPage.wib";
import TracePage from "./pages/TracePage.wib";
import RouteLayout from "./pages/RouteLayout.wib";
import NotFoundPage from "./pages/NotFoundPage.wib";

export const appRouter = createRouter([
  {
    path: "/",
    component: RouteLayout as Component<any>,
    children: [
      {
        path: "/",
        component: WeatherPage as Component<any>,
        load: ({ path }) => Promise.resolve({ path, page: "weather" })
      },
      {
        path: "country",
        component: CountryPage as Component<any>,
        load: () => loadCityReport(appStore.selectedCity.get())
      },
      {
        path: "insights",
        component: InsightsPage as Component<any>,
        resources: {
          routeInfo: ({ path }) => Promise.resolve({ path, page: "insights" })
        }
      },
      {
        path: "trace",
        component: TracePage as Component<any>,
        load: () => loadCityReport(appStore.selectedCity.get())
      },
      {
        path: "city/:city",
        component: WeatherPage as Component<any>,
        load: ({ params }) => {
          appStore.selectCity(params.city ?? "Melbourne");
          return loadCityReport(params.city ?? appStore.selectedCity.get());
        }
      },
      {
        path: "legacy",
        redirect: "/"
      },
      {
        path: "lazy",
        lazy: () => import("./pages/InsightsPage.wib") as Promise<{ default: Component<any> }>,
        load: ({ path }) => Promise.resolve({ path, page: "lazy-insights" })
      }
    ]
  }
], {
  notFound: {
    path: "*",
    component: NotFoundPage as Component<any>
  }
});

export function startRouting(): () => void {
  const stopRouter = appRouter.start();
  const stopWatch = watch(
    () => appRouter.current.get().context.path,
    (path) => appStore.recordRoute(path),
    { immediate: true }
  );

  return () => {
    stopWatch();
    stopRouter();
  };
}

export function navigateTo(path: string): void {
  appRouter.navigate(path);
}

export function currentPath(): string {
  return appRouter.current.get().context.path;
}

export function currentRouteName(): string {
  const path = currentPath();
  if (path === "/") {
    return "Weather";
  }
  if (path === "/country") {
    return "Country";
  }
  if (path === "/insights") {
    return "Insights";
  }
  if (path === "/trace") {
    return "Trace";
  }
  if (path.startsWith("/city/")) {
    return "City param";
  }
  if (path === "/lazy") {
    return "Lazy";
  }

  return "Not found";
}

export function routeResourceStatus(): string {
  const match = appRouter.current.get();
  const named = Object.entries(match.resources)
    .map(([name, resource]) => `${name}:${resource.status.get()}`)
    .join(",");
  return named || match.resource?.status.get() || "none";
}
