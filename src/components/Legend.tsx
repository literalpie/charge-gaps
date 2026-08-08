
interface LegendProps {
	class?: string;
}

export default function Legend(props: LegendProps) {
	return (
		<div
			class={`bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 text-sm ${props.class ?? ""}`}
		>
			<div class="font-semibold mb-2">Charge Gaps</div>
			<div class="flex items-center gap-2 mb-1">
				<span class="inline-block w-3 h-3 rounded-full bg-red-500" />
				<span>No fast charger (100kw+) within 20 mi</span>
			</div>
		</div>
	);
}
