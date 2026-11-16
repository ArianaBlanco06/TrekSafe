import L from 'leaflet';

export const START_MARKER_COLOR = '#16a34a';
export const END_MARKER_COLOR = '#dc2626';

export const RISK_MARKER_COLORS = {
  verde: '#16a34a',
  amarillo: '#f59e0b',
  rojo: '#dc2626',
} as const;

export function makeMarkerIcon(color: string, size = 24) {
  const half = size / 2;
  return L.divIcon({
    className: 'treksafe-map-marker',
    iconSize: [size, size],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></div>`,
  });
}

export function makeNumberedMarkerIcon(orden: number) {
  const numero = Number.isInteger(orden) && orden > 0 ? orden : '?';
  return L.divIcon({
    className: 'treksafe-map-marker treksafe-route-point',
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14],
    html: `<div style="width:28px;height:28px;border-radius:50%;background:#2563eb;color:white;border:2px solid white;text-align:center;line-height:24px;font-weight:bold;box-shadow:0 1px 4px #0005">${numero}</div>`,
  });
}
