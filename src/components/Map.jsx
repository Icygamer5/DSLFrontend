import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import crisisCountries from '../data/crisisCountries2025.json';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

export default function Map({ mapStyle = 'mapbox://styles/mapbox/light-v11', projection = 'mercator', onCountryClick, selectedCountry }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const onCountryClickRef = useRef(onCountryClick);

  useEffect(() => {
    onCountryClickRef.current = onCountryClick;
  }, [onCountryClick]);

  const selectedIso = selectedCountry?.country_iso3 || selectedCountry?.ISO_A3 || selectedCountry?.ADM0_A3 || null;

  // Change projection at runtime when prop changes
  useEffect(() => {
    if (!map.current || typeof map.current.setProjection !== 'function') return;
    const proj = projection === 'globe' ? 'globe' : 'mercator';
    map.current.setProjection(proj);
  }, [projection]);

  // Pop-out highlight for selected country: brighter fill, thicker outline
  useEffect(() => {
    if (!map.current || !map.current.getLayer('country-fill')) return;
    const isoLiteral = selectedIso ? ['literal', selectedIso] : null;
    if (selectedIso && isoLiteral) {
      const isSelected = ['any', ['==', ['get', 'country_iso3'], isoLiteral], ['==', ['get', 'ISO_A3'], isoLiteral], ['==', ['get', 'ADM0_A3'], isoLiteral]];
      map.current.setPaintProperty('country-fill', 'fill-opacity', ['case', isSelected, 1, 0.75]);
      map.current.setPaintProperty('country-fill', 'fill-color', ['case', isSelected, '#fbbf24', ['get', 'severity_color']]);
      map.current.setPaintProperty('country-outline', 'line-width', ['case', isSelected, 4, 1]);
      map.current.setPaintProperty('country-outline', 'line-color', ['case', isSelected, '#f59e0b', '#374151']);
    } else {
      map.current.setPaintProperty('country-fill', 'fill-opacity', 0.75);
      map.current.setPaintProperty('country-fill', 'fill-color', ['get', 'severity_color']);
      map.current.setPaintProperty('country-outline', 'line-width', 1);
      map.current.setPaintProperty('country-outline', 'line-color', '#374151');
    }
  }, [selectedIso]);

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

      // Crisis countries GeoJSON (merged from top_crises + world boundaries, severity_color in properties)
      map.current.addSource('crisis-countries', {
        type: 'geojson',
        data: crisisCountries,
      });

      map.current.addLayer({
        id: 'country-fill',
        type: 'fill',
        source: 'crisis-countries',
        paint: {
          'fill-color': ['get', 'severity_color'],
          'fill-opacity': 0.75,
        },
      });

      map.current.addLayer({
        id: 'country-outline',
        type: 'line',
        source: 'crisis-countries',
        paint: {
          'line-color': '#374151',
          'line-width': 1,
        },
      });

      if (onCountryClickRef.current) {
        map.current.on('click', 'country-fill', (e) => {
          if (e.features && e.features[0] && e.features[0].properties) {
            onCountryClickRef.current(e.features[0].properties);
          }
        });
        map.current.getCanvas().style.cursor = 'pointer';
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once; projection/style updated in other effects
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