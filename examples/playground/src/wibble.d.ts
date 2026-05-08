declare module "*.wib" {
  import type { Component } from "@wibble/core";

  const component: Component<Record<string, unknown>>;
  export const AppStore: any;
  export const appStore: any;
  export default component;
}
