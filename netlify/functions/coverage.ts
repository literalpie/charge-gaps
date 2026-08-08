import { getStore } from "@netlify/blobs";

const MANIFEST_KEY = "manifest.json";

export default async (req: Request) => {
	const url = new URL(req.url);
	const key = url.searchParams.get("key") ?? MANIFEST_KEY;

	if (!/^[\w-]+\.json$/.test(key)) {
		return new Response("Invalid key", { status: 400 });
	}

	const store = getStore({ name: "coverage" });
	const blob = await store.get(key, { type: "text" });

	if (blob === null) {
		return new Response("Not found", { status: 404 });
	}

	const immutable = key !== MANIFEST_KEY;
	const cacheControl = immutable
		? "public, max-age=31536000, immutable"
		: "public, max-age=3600";

	return new Response(blob, {
		status: 200,
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": cacheControl,
			"netlify-cdn-cache-control": cacheControl,
		},
	});
};
