import { createFileRoute, useNavigate } from "@tanstack/solid-router";
import { createMemo } from "solid-js";
import Map from "../components/Map";
import Legend from "../components/Legend";
import Scrubber from "../components/Scrubber";
import { gapsDataUrl } from "../lib/gaps";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		date: typeof search.date === "string" ? search.date : undefined,
	}),
	component: Home,
});

function Home() {
	const search = Route.useSearch();
	const navigate = useNavigate({ from: "/" });
	const dataUrl = createMemo(() => {
		const date = search().date;
		return date ? gapsDataUrl(date) : "";
	});

	return (
		<div class="relative w-full h-screen">
			<Map center={[-96, 38]} zoom={3.95} dataUrl={dataUrl()} />
			<div class="absolute top-4 left-4 z-10">
				<h1 class="text-lg font-bold bg-white/90 backdrop-blur-sm rounded-lg shadow-lg px-3 py-2 mb-2">
					EV Charging Gaps
				</h1>
				<Legend />
			</div>
			<div class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[90%] max-w-xl">
				<Scrubber
					selectedKey={search().date}
					onSelect={(key) => navigate({ search: { date: key } })}
				/>
			</div>
		</div>
	);
}
