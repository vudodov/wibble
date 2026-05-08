/** Requires a non-empty city name. */
export function requiredCity(value: string): string | undefined {
  return value.trim().length === 0 ? "Enter a city name." : undefined;
}

/** Keeps example searches readable while still demonstrating custom validation. */
export function cityNameLength(value: string): string | undefined {
  return value.trim().length < 2 ? "Use at least two characters." : undefined;
}

/** Normalizes user-entered city names before storing them. */
export function cleanCityName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
