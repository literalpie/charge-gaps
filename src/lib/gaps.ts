const FN = "/.netlify/functions/gaps";

export function gapsDataUrl(key: string) {
	if (import.meta.env.DEV) return `/data/gaps/${key}.json`;
	return `${FN}?key=${key}.json`;
}

export function gapsManifestUrl() {
	if (import.meta.env.DEV) return "/data/gaps/manifest.json";
	return `${FN}?key=manifest.json`;
}
