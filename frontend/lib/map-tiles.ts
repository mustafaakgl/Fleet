export type MapTileTheme = 'light' | 'dark';

export const MAP_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export const MAP_TILE_URLS: Record<MapTileTheme, string> = {
  light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

export function mapTileUrl(theme: MapTileTheme): string {
  return MAP_TILE_URLS[theme];
}
