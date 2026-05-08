import type { Component, MaybeReadable, WibbleSlots } from "@wibble/core";

export interface ApiTraceProps {
  data: MaybeReadable<CityReport | undefined>;
  status: MaybeReadable<string>;
  refreshing: MaybeReadable<boolean>;
  error: MaybeReadable<unknown>;
  slots?: WibbleSlots;
}

export declare const ApiTrace: Component<ApiTraceProps>;
export default ApiTrace;
