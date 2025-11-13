import { PieChart } from './PieChart';

interface DataItem {
	name: string;
	value: number;
	[key: string]: any;
}

interface DonutChartProps {
	data: DataItem[];
	nameKey?: string;
	valueKey?: string;
	height?: number;
	colors?: string[];
	showLegend?: boolean;
	centerLabel?: string;
	centerValue?: string;
	formatTooltip?: (value: number) => string;
	className?: string;
}

/**
 * DonutChart component - a pie chart with a hollow center
 * Optionally displays a label and value in the center
 */
export function DonutChart({
	data,
	nameKey = 'name',
	valueKey = 'value',
	height = 300,
	colors,
	showLegend = true,
	centerLabel,
	centerValue,
	formatTooltip,
	className = '',
}: DonutChartProps) {
	const innerRadius = height / 5;

	return (
		<div className={`relative ${className}`}>
			<PieChart
				data={data}
				nameKey={nameKey}
				valueKey={valueKey}
				height={height}
				colors={colors}
				showLegend={showLegend}
				innerRadius={innerRadius}
				formatTooltip={formatTooltip}
			/>
			{(centerLabel || centerValue) && (
				<div
					className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none"
					style={{ marginTop: showLegend ? '-18px' : '0' }}
				>
					{centerValue && (
						<div className="text-2xl font-bold text-foreground">
							{centerValue}
						</div>
					)}
					{centerLabel && (
						<div className="text-xs text-muted-foreground mt-1">
							{centerLabel}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
