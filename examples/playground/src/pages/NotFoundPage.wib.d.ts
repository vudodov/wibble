import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface NotFoundPageProps {
  path: MaybeReadable<string>;
  slots?: WibbleSlots;
}

export declare const NotFoundPage: Component<NotFoundPageProps>;
export default NotFoundPage;
