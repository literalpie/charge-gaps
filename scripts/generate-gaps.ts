import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { computeAllGaps } from "./gaps-core.ts";

const envPath = resolve(import.meta.dirname, "../.env");
try {
	const envContent = readFileSync(envPath, "utf-8");
	for (const line of envContent.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		process.env[key] = value;
	}
} catch {
	console.log("No .env file found; skipping");
}

const apiKey = process.env.NREL_API_KEY;
if (!apiKey) {
	throw new Error("NREL_API_KEY not set");
}

const { manifest, data, totalStations } = await computeAllGaps(apiKey);

const outputDir = join(process.cwd(), "public", "data", "gaps");
mkdirSync(outputDir, { recursive: true });

writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest));
for (const [key, bits] of data) {
	writeFileSync(join(outputDir, `${key}.json`), JSON.stringify({ bits }));
}

console.log(
	`Wrote ${data.size} bucket(s) to ${outputDir} (${manifest.grid.total} grid points, ${totalStations} stations)`,
);
