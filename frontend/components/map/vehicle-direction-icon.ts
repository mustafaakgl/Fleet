import L from 'leaflet';

export function createVehicleDirectionIcon(options: {
  headingDeg: number | null;
  selected: boolean;
  offline: boolean;
  fillColor: string;
  hasAlarm?: boolean;
}): L.DivIcon {
  const size = options.selected ? 28 : 22;
  const rotation = options.headingDeg ?? 0;
  const fill = options.offline ? '#6b7280' : options.fillColor;

  return L.divIcon({
    className: 'vehicle-direction-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;">
      <div style="width:${size}px;height:${size}px;transform:rotate(${rotation}deg);display:flex;align-items:center;justify-content:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2 L20 20 L12 16 L4 20 Z" stroke="#ffffff" stroke-width="1.5"/>
      </svg>
      </div>
      ${options.hasAlarm ? '<span style="position:absolute;top:-1px;right:-1px;display:block;width:7px;height:7px;border-radius:9999px;background:#dc2626;border:1px solid #ffffff;"></span>' : ''}
    </div>`,
  });
}
