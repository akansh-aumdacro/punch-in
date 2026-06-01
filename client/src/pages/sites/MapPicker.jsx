import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// react-leaflet doesn't ship marker images that Vite can resolve out of the box.
// Use the CDN icon explicitly so dev builds don't fail with broken markers.
const icon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      map.setView([lat, lng]);
    }
  }, [lat, lng, map]);
  return null;
}

export default function MapPicker({ lat, lng, radius, onPick }) {
  const hasPoint = typeof lat === 'number' && typeof lng === 'number';
  const center = hasPoint ? [lat, lng] : [20.5937, 78.9629]; // default: India centroid

  return (
    <div className="h-72 rounded-md overflow-hidden border border-slate-300">
      <MapContainer
        center={center}
        zoom={hasPoint ? 15 : 5}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onPick={onPick} />
        {hasPoint && (
          <>
            <Marker position={[lat, lng]} icon={icon} />
            <Circle
              center={[lat, lng]}
              radius={radius || 100}
              pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.1 }}
            />
            <Recenter lat={lat} lng={lng} />
          </>
        )}
      </MapContainer>
    </div>
  );
}
