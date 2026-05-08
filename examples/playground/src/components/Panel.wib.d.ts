import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface PanelProps {
  label: MaybeReadable<string>;
  title: MaybeReadable<string>;
  variant?: MaybeReadable<string>;
  slots?: WibbleSlots;
}

export declare const Panel: Component<PanelProps>;
export default Panel;
