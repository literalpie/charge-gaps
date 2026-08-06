import { createSignal, onCleanup, onMount } from "solid-js";

interface Bucket {
	key: string;
	label: string;
	gapCount: number;
}

interface ScrubberProps {
	class?: string;
	onChange: (key: string) => void;
}

export default function Scrubber(props: ScrubberProps) {
	const [buckets, setBuckets] = createSignal<Bucket[]>([]);
	const [selected, setSelected] = createSignal(0);
	const [playing, setPlaying] = createSignal(false);
	let interval: ReturnType<typeof setInterval> | undefined;

	function applyIndex(idx: number) {
		setSelected(idx);
		const bucket = buckets()[idx];
		if (bucket) props.onChange(bucket.key);
	}

	function togglePlay() {
		if (playing()) {
			clearInterval(interval);
			setPlaying(false);
			return;
		}

		if (selected() >= buckets().length - 1) {
			applyIndex(0);
		}

		setPlaying(true);
		interval = setInterval(() => {
			const next = selected() + 1;
			if (next >= buckets().length) {
				clearInterval(interval);
				setPlaying(false);
				return;
			}
			applyIndex(next);
		}, 1500);
	}

	onMount(async () => {
		try {
			const res = await fetch("/data/gaps/manifest.json");
			if (!res.ok) return;
			const data = (await res.json()) as Bucket[];
			setBuckets(data);
			setSelected(data.length - 1);
			props.onChange(data[data.length - 1].key);
		} catch (e) {
			console.warn("Could not load manifest:", e);
		}
	});

	onCleanup(() => {
		clearInterval(interval);
	});

	function handleChange(e: Event) {
		const idx = Number((e.target as HTMLInputElement).value);
		applyIndex(idx);
	}

	const current = () => buckets()[selected()];

	return (
		<div
			class={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 ${props.class ?? ""}`}
		>
			<div class="flex items-center justify-between mb-1">
				<span class="font-semibold text-sm">
					{current()?.label ?? "Loading..."}
				</span>
				<span class="text-xs text-gray-500 ml-2">
					{current()?.gapCount.toLocaleString() ?? "—"} gaps
				</span>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					onClick={togglePlay}
					class="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors text-sm"
				>
					{playing() ? "\u23F8" : "\u25B6"}
				</button>
				<input
					type="range"
					min="0"
					max={Math.max(0, buckets().length - 1)}
					value={selected()}
					onInput={handleChange}
					class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-red-500"
				/>
			</div>
			<div class="flex justify-between text-[10px] text-gray-400 mt-1">
				<span>2020</span>
				<span>Now</span>
			</div>
		</div>
	);
}
