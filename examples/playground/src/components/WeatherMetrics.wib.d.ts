import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface WeatherMetricsProps {
  data: MaybeReadable<CityReport | undefined>;
  slots?: WibbleSlots;
}

export declare const WeatherMetrics: Component<WeatherMetricsProps>;
export default WeatherMetrics;
