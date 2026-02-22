/**
 * Merges top_crises.json with a world boundaries GeoJSON to produce
 * crisisCountries2025.json with severity_color in each feature's properties.
 * Run from DSLFrontend: node scripts/mergeCrisisGeoJSON.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'src', 'data');
const TOP_CRISES_PATH = path.join(DATA_DIR, 'top_crises.json');
const WORLD_BOUNDARIES_PATH = path.join(DATA_DIR, 'world_boundaries.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'crisisCountries2025.json');

// 50m includes small states (e.g. Grenada) that 110m drops
const WORLD_GEOJSON_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

function calculateColor(ratio) {
  if (ratio == null || Number.isNaN(ratio)) return '#e5e7eb';
  if (ratio <= 0.15) return '#7f1d1d'; // Dark Red
  if (ratio <= 0.3) return '#b91c1c';  // Red
  if (ratio <= 0.5) return '#f87171';  // Light Red
  if (ratio <= 0.75) return '#fca5a5'; // Pale Red
  return '#e5e7eb';                    // Funded / Grey
}

function getIsoFromFeature(properties) {
  const iso = properties.ISO_A3 ?? properties.ADM0_A3 ?? properties.iso_code ?? properties.BRK_A3;
  return iso && String(iso) !== '-99' ? String(iso) : null;
}

async function ensureWorldBoundaries(forceRedownload = false) {
  if (fs.existsSync(WORLD_BOUNDARIES_PATH) && !forceRedownload) {
    console.log('Using existing world_boundaries.json');
    return;
  }
  console.log('Downloading world boundaries from Natural Earth (50m)...');
  const res = await fetch(WORLD_GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch world GeoJSON: ${res.status}`);
  const geojson = await res.json();
  fs.writeFileSync(WORLD_BOUNDARIES_PATH, JSON.stringify(geojson));
  console.log('Saved world_boundaries.json');
}

function getCrisisByCountry(topCrises) {
  // One record per country_iso3: use latest year, then first occurrence
  const byIso = new Map();
  for (const c of topCrises) {
    const iso = c.country_iso3;
    const existing = byIso.get(iso);
    if (!existing || (c.year > existing.year)) byIso.set(iso, c);
  }
  return byIso;
}

async function main() {
  await ensureWorldBoundaries();

  const topCrises = JSON.parse(fs.readFileSync(TOP_CRISES_PATH, 'utf8'));
  const worldGeoJSON = JSON.parse(fs.readFileSync(WORLD_BOUNDARIES_PATH, 'utf8'));
  const crisisByIso = getCrisisByCountry(topCrises);

  const DEFAULT_COLOR = '#f3f4f6'; // neutral grey for countries not in crisis data

  const mergedFeatures = worldGeoJSON.features
    .map((feature) => {
      const iso = getIsoFromFeature(feature.properties);
      if (!iso) return null;
      const crisis = crisisByIso.get(iso);
      if (crisis) {
        return {
          ...feature,
          properties: {
            ...feature.properties,
            ...crisis,
            severity_color: calculateColor(crisis.coverage_ratio),
          },
        };
      }
      // Keep all other countries with default (neutral) color
      return {
        ...feature,
        properties: {
          ...feature.properties,
          severity_color: DEFAULT_COLOR,
        },
      };
    })
    .filter((f) => f !== null);

  const finalGeoJSON = {
    type: 'FeatureCollection',
    features: mergedFeatures,
  };

  const crisisCount = mergedFeatures.filter((f) => crisisByIso.has(getIsoFromFeature(f.properties))).length;
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalGeoJSON));
  console.log(`Wrote ${mergedFeatures.length} countries (${crisisCount} crisis, ${mergedFeatures.length - crisisCount} other) to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
