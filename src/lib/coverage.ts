const FN = "/.netlify/functions/coverage";

export interface GridSpec {
	west: number;
	south: number;
	east: number;
	north: number;
	latStep: number;
	lngStep: number;
	latCount: number;
	lngCount: number;
	total: number;
}

export interface ManifestEntry {
	key: string;
	label: string;
	coveredCount: number;
}

export interface CoverageManifest {
	grid: GridSpec;
	buckets: ManifestEntry[];
}

export function coverageDataUrl(key: string) {
	if (import.meta.env.DEV) return `/data/coverage/${key}.json`;
	return `${FN}?key=${key}.json`;
}

export function coverageManifestUrl() {
	if (import.meta.env.DEV) return "/data/coverage/manifest.json";
	return `${FN}?key=manifest.json`;
}

let manifestPromise: Promise<CoverageManifest> | undefined;

export function fetchCoverageManifest(): Promise<CoverageManifest> {
	if (!manifestPromise) {
		manifestPromise = fetch(coverageManifestUrl()).then((res) => {
			if (!res.ok) throw new Error(`Manifest error: ${res.status}`);
			return res.json() as Promise<CoverageManifest>;
		});
	}
	return manifestPromise;
}
