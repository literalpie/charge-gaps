import { Tooltip } from "@msviderok/base-ui-solid/tooltip";

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
				<span>No fast charger within 30 mi</span>
			</div>
			<Tooltip.Root>
				<Tooltip.Trigger class="text-gray-500 underline text-xs cursor-help">
					What counts as a fast charger?
				</Tooltip.Trigger>
				<Tooltip.Portal>
					<Tooltip.Positioner>
						<Tooltip.Popup class="max-w-64 text-xs bg-white shadow-lg rounded p-2">
							DC fast chargers above 100kW, sourced from NREL's
							Alternative Fuel Stations API. Only public, existing
							stations are included.
						</Tooltip.Popup>
					</Tooltip.Positioner>
				</Tooltip.Portal>
			</Tooltip.Root>
		</div>
	);
}
