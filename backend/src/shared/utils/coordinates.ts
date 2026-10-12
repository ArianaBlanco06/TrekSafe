const COORD_PAIR_RE = /^(-?\d{1,2}(?:\.\d{1,7})?)\s*,\s*(-?\d{1,3}(?:\.\d{1,7})?)$/;

const PERU_LAT_MIN = -18.5;
const PERU_LAT_MAX = 0.5;
const PERU_LON_MIN = -81.5;
const PERU_LON_MAX = -68.5;

export type ParsedCoordinates = {
  lat: number;
  lon: number;
  formatted: string;
};

export function parseDecimalCoordinates(value: string): ParsedCoordinates | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(COORD_PAIR_RE);
  if (!match) return null;

  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    lat,
    lon,
    formatted: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
  };
}

export function isValidPeruCoordinates(lat: number, lon: number): boolean {
  return (
    lat >= PERU_LAT_MIN &&
    lat <= PERU_LAT_MAX &&
    lon >= PERU_LON_MIN &&
    lon <= PERU_LON_MAX
  );
}

export function validateCoordinateInput(value: string): string | null {
  const parsed = parseDecimalCoordinates(value);
  if (!parsed) {
    return 'Formato inválido. Usa decimal: -9.0105, -77.6042';
  }
  if (!isValidPeruCoordinates(parsed.lat, parsed.lon)) {
    return 'Las coordenadas deben estar dentro del territorio peruano';
  }
  return null;
}
