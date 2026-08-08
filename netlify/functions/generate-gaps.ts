import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { computeAllGaps } from "../../scripts/gaps-core";

export default async () => {
	const apiKey = process.env.NREL_API_KEY;
	if (!apiKey) {
		console.error("NREL_API_KEY not set");
		return new Response(JSON.stringify({ error: "NREL_API_KEY not set" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}

	const { manifest, data, totalStations } = await computeAllGaps(apiKey);

	const store = getStore({ name: "gaps" });

	await store.setJSON("manifest.json", manifest);
	for (const [key, bits] of data) {
		await store.setJSON(`${key}.json`, { bits });
	}

	const summary = {
		ok: true,
		buckets: data.size,
		gridPoints: manifest.grid.total,
		totalStations,
	};
	console.log("Stored:", summary);

	return new Response(JSON.stringify(summary), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
};

export const config: Config = {
	background: true,
};
