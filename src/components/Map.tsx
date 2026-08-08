import { createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchCoverageManifest, type GridSpec } from "../lib/coverage";

setWorkerUrl(workerUrl);

type CoverageData = Parameters<GeoJSONSource["setData"]>[0];

function isCovered(bits: number[], index: number): boolean {
	return (bits[index >> 5] >>> (index & 31)) & 1 ? true : false;
}

function buildSquares(grid: GridSpec, bits: number[]): CoverageData {
	const features: Feature[] = [];
	const halfLat = grid.latStep / 2;
	const halfLng = grid.lngStep / 2;

	for (let latIdx = 0; latIdx < grid.latCount; latIdx++) {
		const lat = grid.south + latIdx * grid.latStep;
		for (let lngIdx = 0; lngIdx < grid.lngCount; lngIdx++) {
			const index = latIdx * grid.lngCount + lngIdx;
			if (!isCovered(bits, index)) continue;
			const lng = grid.west + lngIdx * grid.lngStep;
			const c = [
				[lng - halfLng, lat - halfLat],
				[lng + halfLng, lat - halfLat],
				[lng + halfLng, lat + halfLat],
				[lng - halfLng, lat + halfLat],
			];
			features.push({
				type: "Feature",
				properties: {},
				geometry: { type: "Polygon", coordinates: [c] },
			} as Feature);
		}
	}
	return { type: "FeatureCollection", features } as FeatureCollection;
}

const coverageCache = new Map<string, CoverageData>();
const bitsCache = new Map<string, number[]>();

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

	function computeCoverage(grid: GridSpec, bits: number[]): number | null {
		if (!map) return null;
		const b = map.getBounds();
		const west = Math.max(b.getWest(), grid.west);
		const east = Math.min(b.getEast(), grid.east);
		const south = Math.max(b.getSouth(), grid.south);
		const north = Math.min(b.getNorth(), grid.north);
		if (west >= east || south >= north) return null;

		const latStart = Math.max(0, Math.ceil((south - grid.south) / grid.latStep));
		const latEnd = Math.min(grid.latCount - 1, Math.floor((north - grid.south) / grid.latStep));
		const lngStart = Math.max(0, Math.ceil((west - grid.west) / grid.lngStep));
		const lngEnd = Math.min(grid.lngCount - 1, Math.floor((east - grid.west) / grid.lngStep));
		if (latStart > latEnd || lngStart > lngEnd) return null;

		let total = 0;
		let covered = 0;
		for (let latIdx = latStart; latIdx <= latEnd; latIdx++) {
			for (let lngIdx = lngStart; lngIdx <= lngEnd; lngIdx++) {
				total++;
				if (isCovered(bits, latIdx * grid.lngCount + lngIdx)) covered++;
			}
		}
		return total > 0 ? (covered / total) * 100 : null;
	}

	function updateCoverage() {
		if (!currentUrl) return;
		const bits = bitsCache.get(currentUrl);
		if (!bits) return;
		fetchCoverageManifest().then((manifest) => {
			setCoveragePct(computeCoverage(manifest.grid, bits));
		});
	}

	async function loadCoverage(url: string) {
		if (!map) return;
		try {
			const manifest = await fetchCoverageManifest();
			const grid = manifest.grid;

			let bits = bitsCache.get(url);
			if (!bits) {
				const res = await fetch(url);
				if (!res.ok) return;
				bits = ((await res.json()) as { bits: number[] }).bits;
				bitsCache.set(url, bits);
			}
			currentUrl = url;

			let geojson = coverageCache.get(url);
			if (!geojson) {
				geojson = buildSquares(grid, bits);
				coverageCache.set(url, geojson);
			}

			if (map.getSource("coverage")) {
				(map.getSource("coverage") as GeoJSONSource).setData(geojson);
			} else {
				map.addSource("coverage", { type: "geojson", data: geojson });
				map.addLayer({
					id: "coverage-cells",
					type: "fill",
					source: "coverage",
					paint: {
						"fill-color": "#3b82f6",
						"fill-opacity": 0.3,
					},
				});
			}
			updateCoverage();
		} catch (e) {
			console.warn("Could not load coverage data:", e);
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
			if (props.dataUrl) loadCoverage(props.dataUrl);
		});
	});

	createEffect(() => {
		const url = props.dataUrl;
		if (loaded && url) {
			loadCoverage(url);
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
