import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface CountryPanelProps {
  data: MaybeReadable<CityReport | undefined>;
  slots?: WibbleSlots;
}

export declare const CountryPanel: Component<CountryPanelProps>;
export default CountryPanel;
