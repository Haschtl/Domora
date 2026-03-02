export type HouseholdWeatherDay = {
  date: string;
  weatherCode: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipitationMm: number | null;
  precipitationProbabilityPercent: number | null;
  windSpeedKmh: number | null;
  windGustKmh: number | null;
  windDirectionDeg: number | null;
  uvIndexMax: number | null;
  sunrise: string | null;
  sunset: string | null;
};

export type HouseholdWeatherHourlyPoint = {
  time: string;
  tempC: number | null;
  apparentTempC: number | null;
  precipitationMm: number | null;
  snowfallCm: number | null;
  precipitationProbabilityPercent: number | null;
  cloudCoverPercent: number | null;
  uvIndex: number | null;
  windSpeedKmh: number | null;
};
