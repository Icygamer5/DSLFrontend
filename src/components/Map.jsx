import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export default function Map({ data, mapStyle = 'mapbox://styles/mapbox/light-v11', projection = 'mercator' }) {
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current) return;
    if (map.current) return;

    const options = {
      container: mapContainer.current,
      style: mapStyle,
      center: [30.0, 15.0],
      zoom: 1.5,
    };
    if (projection === 'globe') {
      options.projection = 'globe';
    }
    map.current = new mapboxgl.Map(options);

    map.current.on('load', () => {
      // Make the map background (sky) transparent so the starfield shows through
      if (map.current.getLayer('background')) {
        map.current.setPaintProperty('background', 'background-opacity', 0);
      }

      // Use Mapbox's built-in high-resolution country boundaries
      map.current.addSource('mapbox-countries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      });

      // Fill layer: only Sudan (ISO 3166-1 alpha-3 = SDN)
      map.current.addLayer({
        id: 'country-highlight',
        type: 'fill',
        source: 'mapbox-countries',
        'source-layer': 'country_boundaries',
        paint: {
          'fill-color': '#008CFF', // UN Blue
          'fill-opacity': 0.6,
        },
        filter: ['==', ['get', 'iso_3166_1_alpha_3'], 'SDN'],
      });

      // Outline layer so the border stands out
      map.current.addLayer({
        id: 'country-outline',
        type: 'line',
        source: 'mapbox-countries',
        'source-layer': 'country_boundaries',
        paint: {
          'line-color': '#0055aa',
          'line-width': 2,
        },
        filter: ['==', ['get', 'iso_3166_1_alpha_3'], 'SDN'],
      });
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-slate-300">
        <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-700">Mapbox map placeholder</p>
          <p className="mt-1 text-xs text-slate-500">
            Set <code className="rounded bg-slate-100 px-1">VITE_MAPBOX_ACCESS_TOKEN</code> in{' '}
            <code className="rounded bg-slate-100 px-1">.env</code> to load the map.
          </p>
        </div>
      </div>
    );
  }

  return <div ref={mapContainer} className="h-full w-full" />;
}