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

		const data = payload[0].payload;
		const value = data[dataKey];
		const formattedValue = formatTooltip ? formatTooltip(value) : value.toLocaleString();

		let dateStr = data[xAxisKey];
		try {
			if (!dateStr.includes('-W')) {
				dateStr = format(parseISO(data[xAxisKey]), 'MMM d, yyyy HH:mm');
			}
		} catch {
			// Keep original if parsing fails
		}

		return (
			<div className="bg-popover border border-border rounded-lg shadow-lg p-3">
				<p className="text-xs text-muted-foreground mb-1">{dateStr}</p>
				<p className="text-sm font-semibold text-foreground">
					{yAxisLabel ? `${yAxisLabel}: ` : ''}
					{formattedValue}
				</p>
				{data.count !== undefined && (
					<p className="text-xs text-muted-foreground mt-1">
						Count: {data.count}
					</p>
				)}
			</div>
		);
	};

	const ChartComponent = type === 'area' ? AreaChart : LineChart;
	const DataComponent = type === 'area' ? Area : Line;

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
					{showLegend && <Legend />}
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
				</ChartComponent>
			</ResponsiveContainer>
		</div>
	);
}
