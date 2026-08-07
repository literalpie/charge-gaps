import { createFileRoute } from "@tanstack/solid-router";
import { createSignal } from "solid-js";
import Map from "../components/Map";
import Legend from "../components/Legend";
import Scrubber from "../components/Scrubber";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	const [dataUrl, setDataUrl] = createSignal("/data/gaps.json");

	return (
		<div class="relative w-full h-screen">
			<Map center={[-98, 39]} zoom={5} dataUrl={dataUrl()} />
			<div class="absolute top-4 left-4 z-10">
				<h1 class="text-lg font-bold bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 mb-2">
					EV Charging Gaps
				</h1>
				<Legend />
			</div>
			<div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-xl">
				<Scrubber onChange={(key) => setDataUrl(`/data/gaps/${key}.json`)} />
			</div>
		</div>
	);
}
