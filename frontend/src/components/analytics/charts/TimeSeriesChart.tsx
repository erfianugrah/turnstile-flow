import {
	ResponsiveContainer,
	LineChart,
	Line,
	AreaChart,
	Area,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface DataPoint {
	timestamp: string;
	value: number;
	count?: number;
}

interface SeriesConfig {
	key: string;
	label: string;
	color?: string;
	type?: 'line' | 'area';
}

interface TimeSeriesChartProps {
	data: DataPoint[];
	type?: 'line' | 'area';
	dataKey?: string;
	xAxisKey?: string;
	height?: number;
	color?: string;
	showGrid?: boolean;
	showLegend?: boolean;
	yAxisLabel?: string;
	formatYAxis?: (value: number) => string;
	formatTooltip?: (value: number) => string;
	className?: string;
	series?: SeriesConfig[];
}

/**
 * TimeSeriesChart component for displaying trend data
 * Supports line and area chart types with customizable styling
 */
export function TimeSeriesChart({
	data,
	type = 'line',
	dataKey = 'value',
	xAxisKey = 'timestamp',
	height = 300,
	color = 'hsl(var(--primary))',
	showGrid = true,
	showLegend = false,
	yAxisLabel,
	formatYAxis,
	formatTooltip,
	className = '',
	series,
}: TimeSeriesChartProps) {
	// Format timestamp for display
	const formatXAxis = (timestamp: string) => {
		try {
			// Handle ISO week format (e.g., "2025-W45")
			if (timestamp.includes('-W')) {
				return timestamp;
			}
			const date = parseISO(timestamp);
			return format(date, 'MMM d');
		} catch {
			return timestamp;
		}
	};

	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload || !payload.length) return null;

		const point = payload[0].payload;
		let dateStr = point[xAxisKey];
		try {
			if (!dateStr.includes('-W')) {
				dateStr = format(parseISO(point[xAxisKey]), 'MMM d, yyyy HH:mm');
			}
		} catch {
			// Keep original if parsing fails
		}

		return (
			<div className="bg-popover border border-border rounded-lg shadow-lg p-3">
				<p className="text-xs text-muted-foreground mb-1">{dateStr}</p>
				{series && series.length > 1 ? (
					<ul className="space-y-1">
						{payload.map((entry: any) => {
							const rawValue = entry.value ?? entry.payload?.[entry.dataKey] ?? 0;
							const displayValue = formatTooltip
								? formatTooltip(rawValue)
								: rawValue.toLocaleString();
							return (
								<li key={entry.dataKey} className="text-sm font-semibold flex items-center justify-between gap-4">
									<span className="text-muted-foreground">{entry.name || entry.dataKey}</span>
									<span style={{ color: entry.color || 'hsl(var(--foreground))' }}>{displayValue}</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-sm font-semibold text-foreground">
						{yAxisLabel ? `${yAxisLabel}: ` : ''}
						{(() => {
							const value = payload[0].payload[dataKey];
							return formatTooltip ? formatTooltip(value) : value?.toLocaleString();
						})()}
					</p>
				)}
				{point.count !== undefined && (
					<p className="text-xs text-muted-foreground mt-1">
						Count: {point.count}
					</p>
				)}
			</div>
		);
	};

	const useMultipleSeries = !!series && series.length > 0;
	const ChartComponent = useMultipleSeries
		? LineChart
		: type === 'area'
			? AreaChart
			: LineChart;
	const DataComponent = type === 'area' ? Area : Line;
	const multiSeriesColors = [
		'hsl(200, 82%, 55%)',
		'hsl(142, 72%, 45%)',
		'hsl(28, 82%, 58%)',
		'hsl(353, 82%, 58%)',
		'hsl(262, 82%, 68%)',
	];

	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height={height}>
				<ChartComponent data={data}>
					{showGrid && (
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="hsl(var(--border))"
							opacity={0.3}
						/>
					)}
					<XAxis
						dataKey={xAxisKey}
						tickFormatter={formatXAxis}
						stroke="hsl(var(--muted-foreground))"
						fontSize={12}
						tickLine={false}
						axisLine={false}
					/>
					<YAxis
						stroke="hsl(var(--muted-foreground))"
						fontSize={12}
						tickLine={false}
						axisLine={false}
						tickFormatter={formatYAxis}
					/>
					<Tooltip content={<CustomTooltip />} />
					{(showLegend || useMultipleSeries) && <Legend />}
					{useMultipleSeries
						? series!.map((serie, index) => {
								const strokeColor = serie.color || multiSeriesColors[index % multiSeriesColors.length];
								const SerieComponent = serie.type === 'area' ? Area : Line;
								return (
									<SerieComponent
										key={serie.key}
										type="monotone"
										dataKey={serie.key}
										name={serie.label}
										stroke={strokeColor}
										fill={serie.type === 'area' ? strokeColor : undefined}
										fillOpacity={serie.type === 'area' ? 0.12 : undefined}
										strokeWidth={2}
										dot={false}
										activeDot={{ r: 4, strokeWidth: 0 }}
									/>
								);
						  })
						: (
							<DataComponent
								type="monotone"
								dataKey={dataKey}
								stroke={color}
								fill={type === 'area' ? color : undefined}
								fillOpacity={type === 'area' ? 0.1 : undefined}
								strokeWidth={2}
								dot={false}
								activeDot={{ r: 4, strokeWidth: 0 }}
							/>
						)}
				</ChartComponent>
			</ResponsiveContainer>
		</div>
	);
}
