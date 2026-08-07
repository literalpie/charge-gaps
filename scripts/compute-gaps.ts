import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OHIO_ONLY = false;
const CURRENT_ONLY = false;
const GAP_THRESHOLD_MILES = 20;
const GRID_SPACING_MILES = 5;
const EARTH_RADIUS_MILES = 3959;

interface Station {
	latitude: number;
	longitude: number;
	station_name: string;
	ev_dc_fast_capable: boolean;
	ev_level3_evse_num?: number;
	open_date: string | null;
}

interface GeoJsonFeature {
	type: "Feature";
	geometry: { type: "Point"; coordinates: [number, number] };
	properties: {
		nearestChargerMi: number;
		nearestChargerName: string;
		lat: number;
		lng: number;
	};
}

interface GeoJsonFeatureCollection {
	type: "FeatureCollection";
	features: GeoJsonFeature[];
}

const OHIO_BOUNDS = {
	north: 41.98,
	south: 38.4,
	east: -80.52,
	west: -84.82,
};

const US_BOUNDS = {
	north: 49,
	south: 24.5,
	east: -66.9,
	west: -124.7,
};

function haversine(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_MILES * c;
}

function generateGrid(
	bounds: typeof OHIO_BOUNDS,
	spacingMi: number,
): { lat: number; lng: number }[] {
	const latStep = spacingMi / 69;
	const lngStep = spacingMi / 53;
	const points: { lat: number; lng: number }[] = [];

	for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
		for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
			points.push({ lat, lng });
		}
	}
	return points;
}

const CACHE_PATH = join(
	process.cwd(),
	".station-cache.json",
);

async function fetchStations(apiKey: string): Promise<Station[]> {
	if (existsSync(CACHE_PATH)) {
		console.log("Loading stations from cache...");
		const raw = readFileSync(CACHE_PATH, "utf-8");
		return JSON.parse(raw) as Station[];
	}

	const stations: Station[] = [];
	let offset = 1;
	let total = Infinity;

	while (offset <= total) {
		const url = new URL(
			"https://developer.nlr.gov/api/alt-fuel-stations/v1.json",
		);
		url.searchParams.set("api_key", apiKey);
		url.searchParams.set("fuel_type", "ELEC");
		url.searchParams.set("ev_charging_level", "dc_fast");
		url.searchParams.set("ev_power_kw_min", "100");
		if (OHIO_ONLY) url.searchParams.set("state", "OH");
		url.searchParams.set("status", "E");
		url.searchParams.set("access", "public");
		url.searchParams.set("limit", "200");
		url.searchParams.set("offset", String(offset));

		console.log(`Fetching stations offset=${offset}...`);
		const res = await fetch(url.toString());
		if (!res.ok) throw new Error(`NREL API error: ${res.status}`);
		const data = await res.json();

		total = data.total_results ?? 0;
		const fuelStations: Station[] = data.fuel_stations ?? [];
		stations.push(...fuelStations);
		offset += fuelStations.length;

		if (fuelStations.length === 0) break;
	}

	writeFileSync(CACHE_PATH, JSON.stringify(stations));
	console.log(`Cached ${stations.length} stations to ${CACHE_PATH}`);

	return stations;
}

function findNearestCharger(
	lat: number,
	lng: number,
	stations: Station[],
): { distance: number; name: string } {
	let minDist = Infinity;
	let name = "";
	for (const s of stations) {
		const d = haversine(lat, lng, s.latitude, s.longitude);
		if (d < minDist) {
			minDist = d;
			name = s.station_name;
		}
	}
	return { distance: minDist, name };
}

interface TimeBucket {
	key: string;
	label: string;
	cutoff: Date;
}

function generateTimeBuckets(): TimeBucket[] {
	const buckets: TimeBucket[] = [];
	for (let year = 2020; year <= 2026; year++) {
		for (let half = 1; half <= 2; half++) {
			if (year === 2026 && half === 2) break;
			const month = half === 1 ? 6 : 12;
			const key = `${year}-H${half}`;
			const label = half === 1 ? `Jan–Jun ${year}` : `Jul–Dec ${year}`;
			buckets.push({
				key,
				label,
				cutoff: new Date(year, month, 23, 23, 59, 59),
			});
		}
	}
	return buckets;
}

function computeGapsForGrid(
	grid: { lat: number; lng: number }[],
	stations: Station[],
): GeoJsonFeature[] {
	const gapFeatures: GeoJsonFeature[] = [];

	for (const point of grid) {
		const nearest = findNearestCharger(point.lat, point.lng, stations);
		if (nearest.distance > GAP_THRESHOLD_MILES) {
			gapFeatures.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [point.lng, point.lat],
				},
				properties: {
					nearestChargerMi: Math.round(nearest.distance * 10) / 10,
					nearestChargerName: nearest.name,
					lat: point.lat,
					lng: point.lng,
				},
			});
		}
	}

	return gapFeatures;
}

export default async function computeGaps() {
	const apiKey = process.env.NREL_API_KEY;
	if (!apiKey) {
		throw new Error("NREL_API_KEY not set");
	}

	const scope = OHIO_ONLY ? "Ohio" : "US";
	console.log(`Fetching DC fast chargers in ${scope}...`);
	const allStations = await fetchStations(apiKey);
	console.log(`Found ${allStations.length} stations`);

	const bounds = OHIO_ONLY ? OHIO_BOUNDS : US_BOUNDS;
	const grid = generateGrid(bounds, GRID_SPACING_MILES);
	console.log(
		`Generated ${grid.length} land grid points (ocean points filtered)`,
	);

	const buckets = generateTimeBuckets();
	const outputDir = join(process.cwd(), "public", "data", "gaps");
	mkdirSync(outputDir, { recursive: true });

	const manifest: { key: string; label: string; gapCount: number }[] = [];

	const bucketsToProcess = CURRENT_ONLY ? [buckets[buckets.length - 1]] : buckets;
	const scope2 = CURRENT_ONLY ? " (current only)" : "";
	console.log(`Processing ${bucketsToProcess.length} bucket(s)${scope2}`);

	for (let i = 0; i < bucketsToProcess.length; i++) {
		const bucket = bucketsToProcess[i];
		const stationsAtTime = allStations.filter((s) => {
			if (!s.open_date) return true;
			return new Date(s.open_date) <= bucket.cutoff;
		});

		const gaps = computeGapsForGrid(grid, stationsAtTime);

		const geojson: GeoJsonFeatureCollection = {
			type: "FeatureCollection",
			features: gaps,
		};

		const filePath = join(outputDir, `${bucket.key}.json`);
		writeFileSync(filePath, JSON.stringify(geojson));

		manifest.push({
			key: bucket.key,
			label: bucket.label,
			gapCount: gaps.length,
		});

		const pct = Math.round(((i + 1) / bucketsToProcess.length) * 100);
		console.log(
			`[${pct}%] ${bucket.label}: ${stationsAtTime.length} stations, ${gaps.length} gaps`,
		);
	}

	let finalManifest = manifest;
	if (CURRENT_ONLY) {
		const manifestPath = join(outputDir, "manifest.json");
		if (existsSync(manifestPath)) {
			const existing = JSON.parse(readFileSync(manifestPath, "utf-8")) as typeof manifest;
			const merged = existing.filter((m) => m.key !== manifest[0].key);
			merged.push(manifest[0]);
			merged.sort((a, b) => a.key.localeCompare(b.key));
			finalManifest = merged;
		}
	}

	const manifestPath = join(outputDir, "manifest.json");
	writeFileSync(manifestPath, JSON.stringify(finalManifest, null, 2));

	const summary = {
		totalStations: allStations.length,
		gridPoints: grid.length,
		buckets: bucketsToProcess.length,
		outputDir,
	};
	console.log("Done:", summary);
}

computeGaps();
