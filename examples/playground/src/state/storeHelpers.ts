const cityCountries: Record<string, string> = {
  "Cape Town": "South Africa",
  Melbourne: "Australia",
  Reykjavik: "Iceland",
  Tokyo: "Japan"
};

export function countryForCity(city: string): string {
  return cityCountries[city] ?? "Unknown";
}

export function favoritesLabelFor(cities: string[]): string {
  return cities.join(", ") || "None yet";
}

export function toggleFavoriteCity(cities: string[], city: string): string[] {
  if (cities.includes(city)) {
    return cities.filter((candidate) => candidate !== city);
  }

  return [...cities, city].sort();
}

export function routeChangeCount(currentCount: number, lastPath: string, nextPath: string): number {
  return lastPath === nextPath ? currentCount : currentCount + 1;
}
