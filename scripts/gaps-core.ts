const GAP_THRESHOLD_MILES = 20;
const GRID_SPACING_MILES = 10;
const EARTH_RADIUS_MILES = 3959;

export interface Station {
	latitude: number;
	longitude: number;
	station_name: string;
	open_date: string | null;
}

export interface GapFeature {
	type: "Feature";
	geometry: { type: "Point"; coordinates: [number, number] };
	properties: { nearestChargerMi: number };
}

export interface GapFeatureCollection {
	type: "FeatureCollection";
	features: GapFeature[];
}

export interface TimeBucket {
	key: string;
	label: string;
	cutoff: Date;
}

export interface ManifestEntry {
	key: string;
	label: string;
	gapCount: number;
}

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
	bounds: typeof US_BOUNDS,
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

async function fetchStations(apiKey: string): Promise<Station[]> {
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

	return stations;
}

function findNearestChargerDistance(
	lat: number,
	lng: number,
	stations: Station[],
): number {
	let minDist = Infinity;
	for (const s of stations) {
		const d = haversine(lat, lng, s.latitude, s.longitude);
		if (d < minDist) minDist = d;
	}
	return minDist;
}

function computeGapsForGrid(
	grid: { lat: number; lng: number }[],
	stations: Station[],
): GapFeature[] {
	const gapFeatures: GapFeature[] = [];

	for (const point of grid) {
		const distance = findNearestChargerDistance(point.lat, point.lng, stations);
		if (distance > GAP_THRESHOLD_MILES) {
			gapFeatures.push({
				type: "Feature",
				geometry: {
					type: "Point",
					coordinates: [
						Math.round(point.lng * 1000) / 1000,
						Math.round(point.lat * 1000) / 1000,
					],
				},
				properties: {
					nearestChargerMi: Math.round(distance * 10) / 10,
				},
			});
		}
	}

	return gapFeatures;
}

export function generateTimeBuckets(now = new Date()): TimeBucket[] {
	const buckets: TimeBucket[] = [];
	const year = now.getFullYear();
	const beforeMidYear = now.getMonth() < 6;
	const lastYear = beforeMidYear ? year - 1 : year;
	const lastHalf = beforeMidYear ? 2 : 1;

	for (let y = 2020; y <= lastYear; y++) {
		const halves = y === lastYear ? lastHalf : 2;
		for (let half = 1; half <= halves; half++) {
			const month = half === 1 ? 6 : 12;
			buckets.push({
				key: `${y}-H${half}`,
				label: half === 1 ? `Jan–Jun ${y}` : `Jul–Dec ${y}`,
				cutoff: new Date(y, month, 23, 23, 59, 59),
			});
		}
	}

	return buckets;
}

export async function computeAllGaps(
	apiKey: string,
): Promise<{
	manifest: ManifestEntry[];
	data: Map<string, GapFeatureCollection>;
	gridPoints: number;
	totalStations: number;
}> {
	console.log("Fetching DC fast chargers...");
	const stations = await fetchStations(apiKey);
	console.log(`Found ${stations.length} stations`);

	const grid = generateGrid(US_BOUNDS, GRID_SPACING_MILES);
	console.log(`Generated ${grid.length} land grid points (ocean points filtered)`);

	const buckets = generateTimeBuckets();
	const manifest: ManifestEntry[] = [];
	const data = new Map<string, GapFeatureCollection>();

	for (let i = 0; i < buckets.length; i++) {
		const bucket = buckets[i];
		const stationsAtTime = stations.filter((s) => {
			if (!s.open_date) return true;
			return new Date(s.open_date) <= bucket.cutoff;
		});

		const gaps = computeGapsForGrid(grid, stationsAtTime);

		data.set(bucket.key, {
			type: "FeatureCollection",
			features: gaps,
		});

		manifest.push({
			key: bucket.key,
			label: bucket.label,
			gapCount: gaps.length,
		});

		const pct = Math.round(((i + 1) / buckets.length) * 100);
		console.log(
			`[${pct}%] ${bucket.label}: ${stationsAtTime.length} stations, ${gaps.length} gaps`,
		);
	}

	return {
		manifest,
		data,
		gridPoints: grid.length,
		totalStations: stations.length,
	};
}
