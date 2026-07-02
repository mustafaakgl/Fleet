'use client';

import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import { MAP_TILE_ATTRIBUTION, mapTileUrl, type MapTileTheme } from '@/lib/map-tiles';
import { usePrefersDark } from '@/lib/use-prefers-dark';

export function ThemedTileLayer({ theme }: { theme?: MapTileTheme }) {
  const prefersDark = usePrefersDark();
  const resolvedTheme = theme ?? (prefersDark ? 'dark' : 'light');

  return (
    <TileLayer
      key={resolvedTheme}
      attribution={MAP_TILE_ATTRIBUTION}
      url={mapTileUrl(resolvedTheme)}
      data-testid={`map-tile-${resolvedTheme}`}
    />
  );
}

export function MapThemeSync({ theme }: { theme?: MapTileTheme }) {
  const map = useMap();
  const prefersDark = usePrefersDark();
  const resolvedTheme = theme ?? (prefersDark ? 'dark' : 'light');

  useEffect(() => {
    map.invalidateSize();
  }, [map, resolvedTheme]);

  return null;
}
