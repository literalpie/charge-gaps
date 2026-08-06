import { createEffect, onCleanup, onMount, type JSX } from "solid-js";
import {
	Map,
	NavigationControl,
	Popup as MaplibrePopup,
	type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface MapProps {
	center?: [number, number];
	zoom?: number;
	dataUrl?: string;
	class?: string;
	children?: JSX.Element;
}

interface GapProperties {
	nearestChargerMi: number;
	nearestChargerName: string;
}

export default function ChargeGapMap(props: MapProps) {
	let container: HTMLDivElement | undefined;
	let map: Map | undefined;
	const popup = new MaplibrePopup({ closeButton: false, closeOnClick: false });

	async function loadGaps(url: string) {
		if (!map) return;
		try {
			const res = await fetch(url);
			if (!res.ok) return;
			const geojson = await res.json();

			if (map.getSource("gaps")) {
				(map.getSource("gaps") as GeoJSONSource).setData(geojson);
			} else {
				map.addSource("gaps", { type: "geojson", data: geojson });
				map.addLayer({
					id: "gap-points",
					type: "circle",
					source: "gaps",
					paint: {
						"circle-radius": [
							"interpolate",
							["linear"],
							["zoom"],
							4, 2,
							7, 8,
							10, 14,
							12, 30,
						],
						"circle-color": "#ef4444",
						"circle-opacity": 0.7,
						"circle-stroke-width": 0,
					},
				});
			}
		} catch (e) {
			console.warn("Could not load gap data:", e);
		}
	}

	onMount(() => {
		if (!container) return;

		map = new Map({
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
			center: props.center ?? [-82.9, 40.4],
			zoom: props.zoom ?? 7,
		});

		map.addControl(new NavigationControl(), "top-right");

		map.on("load", async () => {
			if (!map) return;
			await loadGaps(props.dataUrl ?? "/data/gaps.json");

			map.on("mouseenter", "gap-points", (e) => {
				if (!map) return;
				map.getCanvas().style.cursor = "pointer";
				const feature = e.features?.[0];
				if (!feature) return;
				const p = feature.properties as GapProperties;
				const coords = (
					feature.geometry as { coordinates: [number, number] }
				).coordinates.slice() as [number, number];

				popup
					.setLngLat(coords)
					.setHTML(
						`<div style="padding:4px 8px;font-size:13px">
							<strong>Charging Gap</strong><br/>
							Nearest fast charger: ${p.nearestChargerMi} mi<br/>
							<em>${p.nearestChargerName}</em>
						</div>`,
					)
					.addTo(map);
			});

			map.on("mouseleave", "gap-points", () => {
				if (!map) return;
				map.getCanvas().style.cursor = "";
				popup.remove();
			});
		});
	});

	createEffect(() => {
		const url = props.dataUrl;
		if (map?.isStyleLoaded() && url) {
			loadGaps(url);
		}
	});

	onCleanup(() => {
		popup.remove();
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
