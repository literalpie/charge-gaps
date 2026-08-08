import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { gapsManifestUrl } from "../lib/gaps";

interface Bucket {
	key: string;
	label: string;
	gapCount: number;
}

interface ScrubberProps {
	class?: string;
	selectedKey?: string;
	onSelect: (key: string) => void;
}

export default function Scrubber(props: ScrubberProps) {
	const [playing, setPlaying] = createSignal(false);
	const [buckets, setBuckets] = createSignal<Bucket[]>([]);
	let interval: ReturnType<typeof setInterval> | undefined;

	const selected = createMemo(() => {
		const data = buckets();
		if (data.length === 0) return 0;
		const idx = data.findIndex((b) => b.key === props.selectedKey);
		return idx >= 0 ? idx : data.length - 1;
	});

	onMount(async () => {
		try {
			const res = await fetch(gapsManifestUrl());
			if (!res.ok) return;
			const data = (await res.json()) as Bucket[];
			setBuckets(data);
			if (data.length > 0) {
				const idx = data.findIndex((b) => b.key === props.selectedKey);
				props.onSelect(data[idx >= 0 ? idx : data.length - 1].key);
			}
		} catch {}
	});

	function applyIndex(idx: number) {
		const data = buckets();
		if (data && data[idx]) props.onSelect(data[idx].key);
	}

	function togglePlay() {
		if (playing()) {
			clearInterval(interval);
			setPlaying(false);
			return;
		}

		const data = buckets();
		if (!data.length) return;

		if (selected() >= data.length - 1) {
			applyIndex(0);
		}

		setPlaying(true);
		interval = setInterval(() => {
			const next = selected() + 1;
			const d = buckets();
			if (!d.length || next >= d.length) {
				clearInterval(interval);
				setPlaying(false);
				return;
			}
			applyIndex(next);
		}, 1000);
	}

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
