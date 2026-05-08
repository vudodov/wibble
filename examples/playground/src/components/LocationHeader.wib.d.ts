import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface LocationHeaderProps {
  data: MaybeReadable<CityReport | undefined>;
  selectedCity: MaybeReadable<string>;
  status: MaybeReadable<string>;
  slots?: WibbleSlots;
}

export declare const LocationHeader: Component<LocationHeaderProps>;
export default LocationHeader;
