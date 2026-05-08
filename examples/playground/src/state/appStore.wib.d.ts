import type { Readable, Resource, WritableSignal } from "@wibble/core";
import type { StoreDefinition } from "@wibble/store";

export interface AppStoreInstance {
  readonly selectedCity: WritableSignal<string>;
  readonly availableCities: WritableSignal<string[]>;
  readonly favoriteCities: WritableSignal<string[]>;
  readonly visitCount: WritableSignal<number>;
  readonly lastRoute: WritableSignal<string>;
  readonly routeChanges: WritableSignal<number>;
  readonly selectedCountry: Readable<string>;
  readonly favoritesLabel: Readable<string>;
  selectCity(city: string): void;
  toggleFavorite(): void;
  recordRoute(path: string): void;
}

export declare function createAppStore(): AppStoreInstance;
export declare const AppStore: StoreDefinition<AppStoreInstance>;
export declare const appStore: AppStoreInstance;
