import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, Point } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

setWorkerUrl(workerUrl);

type GapData = Parameters<GeoJSONSource["setData"]>[0];

const HALF_LNG = 5 / 53;
const HALF_LAT = 5 / 69;

function toSquares(fc: GapData): GapData {
	const features = (fc as FeatureCollection).features.map<Feature>((f) => {
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
		} satisfies Feature;
	});
	return { ...(fc as FeatureCollection), features } as FeatureCollection;
}

const gapCache = new Map<string, GapData>();

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

	async function loadGaps(url: string) {
		if (!map) return;
		try {
			let geojson = gapCache.get(url);
			if (!geojson) {
				const res = await fetch(url);
				if (!res.ok) return;
				geojson = toSquares(await res.json());
				gapCache.set(url, geojson);
			}

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
			zoom: props.zoom ?? 5,
		});

		map.addControl(new NavigationControl(), "top-right");

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
			{props.children}
		</div>
	);
}
