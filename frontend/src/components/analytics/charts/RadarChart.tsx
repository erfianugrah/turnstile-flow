import {
	ResponsiveContainer,
	RadarChart as RechartsRadarChart,
	Radar,
	PolarGrid,
	PolarAngleAxis,
	PolarRadiusAxis,
	Tooltip,
	Legend,
} from 'recharts';

interface DataItem {
	metric: string;
	value: number;
	fullMark?: number;
	[key: string]: any;
}

interface RadarChartProps {
	data: DataItem[];
	dataKey?: string;
	height?: number;
	color?: string;
	fillOpacity?: number;
	showLegend?: boolean;
	formatTooltip?: (value: number) => string;
	className?: string;
}

/**
 * RadarChart component for displaying multi-dimensional data
 * Shows multiple metrics on a radial grid for easy comparison
 */
export function RadarChart({
	data,
	dataKey = 'value',
	height = 300,
	color = 'hsl(var(--primary))',
	fillOpacity = 0.6,
	showLegend = false,
	formatTooltip,
	className = '',
}: RadarChartProps) {
	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload || !payload.length) return null;

		const data = payload[0].payload;
		const value = data[dataKey];
		const formattedValue = formatTooltip ? formatTooltip(value) : value.toLocaleString();

		return (
			<div className="bg-popover border border-border rounded-lg shadow-lg p-3">
				<p className="text-sm font-semibold text-foreground mb-1">{data.metric}</p>
				<p className="text-xs text-muted-foreground">
					{formattedValue}
					{data.fullMark && ` / ${data.fullMark}`}
				</p>
			</div>
		);
	};

	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height={height}>
				<RechartsRadarChart data={data}>
					<PolarGrid stroke="hsl(var(--border))" />
					<PolarAngleAxis
						dataKey="metric"
						tick={{
							fill: 'hsl(var(--foreground))',
							fontSize: 12,
						}}
					/>
					<PolarRadiusAxis
						angle={90}
						domain={[0, 'auto']}
						tick={{
							fill: 'hsl(var(--muted-foreground))',
							fontSize: 10,
						}}
					/>
					<Radar
						name="Metrics"
						dataKey={dataKey}
						stroke={color}
						fill={color}
						fillOpacity={fillOpacity}
					/>
					<Tooltip content={<CustomTooltip />} />
					{showLegend && <Legend />}
				</RechartsRadarChart>
			</ResponsiveContainer>
		</div>
	);
}
