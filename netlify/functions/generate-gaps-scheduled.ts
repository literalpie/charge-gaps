import type { Config } from "@netlify/functions";

export default async () => {
	const baseUrl =
		process.env.URL ?? process.env.SITE_URL ?? process.env.DEPLOY_URL;
	if (!baseUrl) {
		console.error("No site URL available to trigger background function");
		return;
	}

	const res = await fetch(`${baseUrl}/.netlify/functions/generate-gaps`, {
		method: "POST",
	});
	console.log("Triggered background function:", res.status);
};

export const config: Config = {
	schedule: "0 0 1 1,6 *",
};
