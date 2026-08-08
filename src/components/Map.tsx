import { createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

type GapData = Parameters<GeoJSONSource["setData"]>[0];

const HALF_LNG = 5 / 53;
const HALF_LAT = 5 / 69;

function toSquares(fc: GapData): GapData {
	const features = (fc as FeatureCollection).features.map((f) => {
		const [lng, lat] = (f.geometry as Point).coordinates;
		const c = [
			[lng - HALF_LNG, lat - HALF_LAT],
			[lng + HALF_LNG, lat - HALF_LAT],
			[lng + HALF_LNG, lat + HALF_LAT],
			[lng - HALF_LNG, lat + HALF_LAT],
		];
		return {
			type: "Feature",
			properties: f.properties ?? {},
			geometry: { type: "Polygon", coordinates: [c] },
		} as Feature;
	});
	return { ...(fc as FeatureCollection), features } as FeatureCollection;
}

const gapCache = new Map<string, GapData>();
const rawCache = new Map<string, GapData>();

const US_BOUNDS = {
	north: 49,
	south: 24.5,
	east: -66.9,
	west: -124.7,
};

const LAT_STEP = 10 / 69;
const LNG_STEP = 10 / 53;

interface MapProps {
	center?: [number, number];
	zoom?: number;
	dataUrl?: string;
	class?: string;
	children?: JSX.Element;
}

export default function ChargeGapMap(props: MapProps) {
	let container: HTMLDivElement | undefined;
	let map: MapLibreMap | undefined;
	let loaded = false;
	let currentUrl: string | undefined;
	const [coveragePct, setCoveragePct] = createSignal<number | null>(null);

	function computeCoverage(): number | null {
		if (!map || !currentUrl) return null;
		const raw = rawCache.get(currentUrl);
		if (!raw) return null;
		const b = map.getBounds();
		const west = Math.max(b.getWest(), US_BOUNDS.west);
		const east = Math.min(b.getEast(), US_BOUNDS.east);
		const south = Math.max(b.getSouth(), US_BOUNDS.south);
		const north = Math.min(b.getNorth(), US_BOUNDS.north);
		if (west >= east || south >= north) return null;

		const totalLat = Math.floor((north - US_BOUNDS.south) / LAT_STEP) -
			Math.ceil((south - US_BOUNDS.south) / LAT_STEP) + 1;
		const totalLng = Math.floor((east - US_BOUNDS.west) / LNG_STEP) -
			Math.ceil((west - US_BOUNDS.west) / LNG_STEP) + 1;
		const total = totalLat * totalLng;
		if (total <= 0) return null;

		let gaps = 0;
		for (const f of (raw as FeatureCollection).features) {
			const [lng, lat] = (f.geometry as Point).coordinates;
			if (lng >= west && lng <= east && lat >= south && lat <= north) gaps++;
		}
		return (1 - gaps / total) * 100;
	}

	function updateCoverage() {
		setCoveragePct(computeCoverage());
	}

	async function loadGaps(url: string) {
		if (!map) return;
		try {
			let geojson = gapCache.get(url);
			if (!geojson) {
				const res = await fetch(url);
				if (!res.ok) return;
				const raw = (await res.json()) as GapData;
				rawCache.set(url, raw);
				geojson = toSquares(raw);
				gapCache.set(url, geojson);
			}
			currentUrl = url;

			if (map.getSource("gaps")) {
				(map.getSource("gaps") as GeoJSONSource).setData(geojson);
			} else {
				map.addSource("gaps", { type: "geojson", data: geojson });
				map.addLayer({
					id: "gap-points",
					type: "fill",
					source: "gaps",
					paint: {
						"fill-color": "#ef4444",
						"fill-opacity": 0.3,
					},
				});
			}
			updateCoverage();
		} catch (e) {
			console.warn("Could not load gap data:", e);
		}
	}

	onMount(() => {
		if (!container) return;

		map = new MapLibreMap({
			container,
			style: {
				version: 8,
				sources: {
					osm: {
						type: "raster",
						tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
						tileSize: 256,
						attribution: "© OpenStreetMap contributors",
					},
				},
				layers: [{ id: "osm", type: "raster", source: "osm" }],
			},
			center: props.center ?? [-98, 39],
			zoom: props.zoom ?? 3.95,
		});

		map.addControl(new NavigationControl(), "top-right");


		map.on("moveend", updateCoverage);

		map.on("load", () => {
			loaded = true;
			if (props.dataUrl) loadGaps(props.dataUrl);
		});
	});

	createEffect(() => {
		const url = props.dataUrl;
		if (loaded && url) {
			loadGaps(url);
		}
	});

	onCleanup(() => {
		map?.remove();
	});

	return (
		<div
			ref={container}
			class={props.class}
			style={{ width: "100%", height: "100%" }}
		>
			<div class="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-1">
				<div class="bg-black/70 text-white text-sm font-mono px-2 py-1 rounded">
					coverage: {(() => {
						const c = coveragePct();
						return c === null ? "—" : `${c.toFixed(1)}%`;
					})()}
				</div>
			</div>
			{props.children}
		</div>
	);
}
