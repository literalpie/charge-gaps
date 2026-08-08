const GAP_THRESHOLD_MILES = 20;
const GRID_SPACING_MILES = 10;
const EARTH_RADIUS_MILES = 3959;
const CELL_DEG = 0.25;
const MILES_PER_DEG_LNG = 53;

export interface Station {
	latitude: number;
	longitude: number;
	station_name: string;
	open_date: string | null;
}

export interface GapFeature {
	type: "Feature";
	geometry: { type: "Point"; coordinates: [number, number] };
	properties: { nearestChargerMi: number | null };
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

const toRad = (deg: number) => (deg * Math.PI) / 180;

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

interface IndexedStation {
	lat: number;
	lng: number;
	latRad: number;
	lngRad: number;
}

/**
 * Stations bucketed into a uniform lat/lng grid so nearest-neighbor
 * searches only touch nearby cells instead of every station.
 */
class StationIndex {
	private cells = new Map<number, IndexedStation[]>();

	private static cellKey(cx: number, cy: number) {
		return cx * 2000 + (cy + 1000);
	}

	constructor(stations: Station[]) {
		for (const s of stations) {
			const cx = Math.floor(s.latitude / CELL_DEG);
			const cy = Math.floor(s.longitude / CELL_DEG);
			const key = StationIndex.cellKey(cx, cy);
			let bucket = this.cells.get(key);
			if (!bucket) {
				bucket = [];
				this.cells.set(key, bucket);
			}
			bucket.push({
				lat: s.latitude,
				lng: s.longitude,
				latRad: toRad(s.latitude),
				lngRad: toRad(s.longitude),
			});
		}
	}

	private get(cx: number, cy: number): IndexedStation[] | undefined {
		return this.cells.get(StationIndex.cellKey(cx, cy));
	}

	/**
	 * Search for the nearest station to (lat, lng), expanding outward
	 * cell by cell. Returns once the gap decision is certain (a station
	 * within GAP_THRESHOLD_MILES is found) or the search area can no
	 * longer contain a closer station.
	 */
	nearest(lat: number, lng: number): { isGap: boolean; distance: number } {
		const cx = Math.floor(lat / CELL_DEG);
		const cy = Math.floor(lng / CELL_DEG);
		const qLatRad = toRad(lat);
		const qLngRad = toRad(lng);
		const qCosLat = Math.cos(qLatRad);
		let best = Infinity;

		const maxRings = 300;
		for (let r = 0; r < maxRings; r++) {
			if (r > 0 && (r - 1) * CELL_DEG * MILES_PER_DEG_LNG > best) break;

			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
					if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
					const cellStations = this.get(cx + dx, cy + dy);
					if (!cellStations) continue;
					for (const s of cellStations) {
						const dLat = s.latRad - qLatRad;
						const dLng = s.lngRad - qLngRad;
						const a =
							Math.sin(dLat / 2) ** 2 +
							qCosLat * Math.cos(s.latRad) * Math.sin(dLng / 2) ** 2;
						const d =
							EARTH_RADIUS_MILES *
							2 *
							Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
						if (d < best) {
							best = d;
							if (best <= GAP_THRESHOLD_MILES) {
								return { isGap: false, distance: best };
							}
						}
					}
				}
			}
		}

		return {
			isGap: best > GAP_THRESHOLD_MILES,
			distance: Number.isFinite(best) ? best : NaN,
		};
	}
}

function computeGapsForGrid(
	grid: { lat: number; lng: number }[],
	index: StationIndex,
): GapFeature[] {
	const gapFeatures: GapFeature[] = [];

	for (const point of grid) {
		const nearest = index.nearest(point.lat, point.lng);
		if (nearest.isGap) {
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
					nearestChargerMi: Number.isFinite(nearest.distance)
						? Math.round(nearest.distance * 10) / 10
						: null,
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

async function fetchPage(
	apiKey: string,
	offset: number,
): Promise<{ items: Station[]; total: number }> {
	const url = new URL("https://developer.nlr.gov/api/alt-fuel-stations/v1.json");
	url.searchParams.set("api_key", apiKey);
	url.searchParams.set("fuel_type", "ELEC");
	url.searchParams.set("ev_charging_level", "dc_fast");
	url.searchParams.set("ev_power_kw_min", "100");
	url.searchParams.set("status", "E");
	url.searchParams.set("access", "public");
	url.searchParams.set("limit", "200");
	url.searchParams.set("offset", String(offset));

	const res = await fetch(url.toString());
	if (!res.ok) throw new Error(`NREL API error: ${res.status}`);
	const data = await res.json();

	return {
		items: (data.fuel_stations ?? []) as Station[],
		total: data.total_results ?? 0,
	};
}

async function fetchStations(apiKey: string): Promise<Station[]> {
	const first = await fetchPage(apiKey, 1);
	const stations: Station[] = [...first.items];

	const offsets: number[] = [];
	for (let offset = 201; offset <= first.total; offset += 200) {
		offsets.push(offset);
	}

	const CONCURRENCY = 10;
	for (let i = 0; i < offsets.length; i += CONCURRENCY) {
		const chunk = offsets.slice(i, i + CONCURRENCY);
		const pages = await Promise.all(chunk.map((o) => fetchPage(apiKey, o)));
		for (const page of pages) stations.push(...page.items);
	}

	return stations;
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

	stations.sort((a, b) => {
		if (!a.open_date && !b.open_date) return 0;
		if (!a.open_date) return -1;
		if (!b.open_date) return 1;
		return a.open_date.localeCompare(b.open_date);
	});

	const buckets = generateTimeBuckets();
	const manifest: ManifestEntry[] = [];
	const data = new Map<string, GapFeatureCollection>();

	for (let i = 0; i < buckets.length; i++) {
		const bucket = buckets[i];
		const cutoffTime = bucket.cutoff.getTime();

		let lo = 0;
		let hi = stations.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			const sd = stations[mid].open_date;
			if (sd === null || new Date(sd).getTime() <= cutoffTime) {
				lo = mid + 1;
			} else {
				hi = mid;
			}
		}

		const stationsAtTime = stations.slice(0, lo);
		const index = new StationIndex(stationsAtTime);
		const gaps = computeGapsForGrid(grid, index);

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
