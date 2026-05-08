export interface CityLocation {
  name: string;
  country: string;
  countryCode: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface WeatherNow {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  isDay: boolean;
}

export interface CountryInfo {
  name: string;
  capital: string;
  region: string;
  subregion: string;
  population: number;
  area: number;
  languages: string;
  currencies: string;
  flags: {
    svg: string;
    alt: string;
  };
}

export interface CityReport {
  location: CityLocation;
  weather: WeatherNow;
  country: CountryInfo;
  sources: {
    geocodingUrl: string;
    forecastUrl: string;
    countryUrl: string;
  };
  fetchedAt: string;
}

interface GeocodingResponse {
  results?: Array<{
    name: string;
    country: string;
    country_code: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone: string;
  }>;
}

interface ForecastResponse {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    weather_code: number;
    is_day: number;
  };
}

interface RestCountry {
  name: {
    common: string;
  };
  capital?: string[];
  region?: string;
  subregion?: string;
  population?: number;
  area?: number;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string; symbol?: string }>;
  flags?: {
    svg?: string;
    alt?: string;
  };
}

type RestCountriesResponse = RestCountry | RestCountry[];

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

function firstValue(values: string[] | undefined, fallback: string): string {
  return values?.[0] ?? fallback;
}

function joinNames(values: Record<string, string> | undefined): string {
  return values ? Object.values(values).slice(0, 3).join(", ") : "Unknown";
}

function joinCurrencies(values: RestCountry["currencies"]): string {
  if (!values) {
    return "Unknown";
  }

  return Object.values(values)
    .map((currency) => currency.symbol ? `${currency.name} (${currency.symbol})` : currency.name)
    .slice(0, 2)
    .join(", ");
}

function firstCountry(response: RestCountriesResponse): RestCountry | undefined {
  return Array.isArray(response) ? response[0] : response;
}

export async function loadCityReport(city: string, signal?: AbortSignal): Promise<CityReport> {
  const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const geocoding = await fetchJson<GeocodingResponse>(geocodingUrl, signal);
  const first = geocoding.results?.[0];
  if (!first) {
    throw new Error(`No location found for ${city}.`);
  }

  const current = [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_direction_10m"
  ].join(",");
  const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${first.latitude}&longitude=${first.longitude}&current=${current}&timezone=auto`;
  const countryUrl = `https://restcountries.com/v3.1/alpha/${first.country_code}?fields=name,capital,region,subregion,population,area,flags,languages,currencies`;

  const [forecast, countryResponse] = await Promise.all([
    fetchJson<ForecastResponse>(forecastUrl, signal),
    fetchJson<RestCountriesResponse>(countryUrl, signal)
  ]);
  const country = firstCountry(countryResponse);
  if (!country) {
    throw new Error(`No country metadata found for ${first.country_code}.`);
  }

  return {
    location: {
      name: first.name,
      country: first.country,
      countryCode: first.country_code,
      admin1: first.admin1,
      latitude: first.latitude,
      longitude: first.longitude,
      timezone: first.timezone
    },
    weather: {
      temperature: forecast.current.temperature_2m,
      apparentTemperature: forecast.current.apparent_temperature,
      humidity: forecast.current.relative_humidity_2m,
      precipitation: forecast.current.precipitation,
      cloudCover: forecast.current.cloud_cover,
      windSpeed: forecast.current.wind_speed_10m,
      windDirection: forecast.current.wind_direction_10m,
      weatherCode: forecast.current.weather_code,
      isDay: forecast.current.is_day === 1
    },
    country: {
      name: country.name.common,
      capital: firstValue(country.capital, "Unknown"),
      region: country.region ?? "Unknown",
      subregion: country.subregion ?? "Unknown",
      population: country.population ?? 0,
      area: country.area ?? 0,
      languages: joinNames(country.languages),
      currencies: joinCurrencies(country.currencies),
      flags: {
        svg: country.flags?.svg ?? "",
        alt: country.flags?.alt ?? `${country.name.common} flag`
      }
    },
    sources: {
      geocodingUrl,
      forecastUrl,
      countryUrl
    },
    fetchedAt: new Date().toLocaleTimeString()
  };
}

export function locationTitle(report: CityReport | undefined, selectedCity: string): string {
  return report ? `${report.location.name}, ${report.location.country}` : selectedCity;
}

export function locationSubtitle(report: CityReport | undefined): string {
  if (!report) {
    return "Waiting for API data";
  }

  const region = report.location.admin1 ?? report.country.subregion;
  return `${region} - ${report.location.timezone}`;
}

export function weatherLabel(code: number | undefined): string {
  if (code == null) {
    return "Loading";
  }

  if (code === 0) {
    return "Clear";
  }
  if ([1, 2, 3].includes(code)) {
    return "Partly cloudy";
  }
  if ([45, 48].includes(code)) {
    return "Fog";
  }
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
    return "Rain";
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return "Snow";
  }
  if ([95, 96, 99].includes(code)) {
    return "Thunderstorm";
  }

  return `Code ${code}`;
}

export function compassDirection(degrees: number | undefined): string {
  if (degrees == null) {
    return "Unknown";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % directions.length;
  return directions[index] ?? "N";
}

export function numberLabel(value: number | undefined, unit: string): string {
  if (value == null) {
    return "-";
  }

  return `${value.toLocaleString()} ${unit}`;
}

export function populationDensity(population: number | undefined, area: number | undefined): string {
  if (!population || !area) {
    return "-";
  }

  return `${Math.round(population / area).toLocaleString()} people/km2`;
}
