import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface RouteLayoutProps {
  path: MaybeReadable<string>;
  slots?: WibbleSlots;
}

export declare const RouteLayout: Component<RouteLayoutProps>;
export default RouteLayout;
