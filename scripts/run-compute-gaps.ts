import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env file
const envPath = resolve(import.meta.dirname, "../.env");
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

const mod = await import("../netlify/functions/compute-gaps.ts");
const handler = mod.default;
const response = await handler(new Request("http://localhost/api/compute-gaps"), {} as any);
const body = await response.text();
console.log(body);
