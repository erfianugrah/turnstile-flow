import {
	ResponsiveContainer,
	BarChart as RechartsBarChart,
	Bar,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	Legend,
	Cell,
} from 'recharts';

interface BarChartProps {
	data: any[];
	xAxisKey: string;
	yAxisKey: string;
	height?: number;
	layout?: 'horizontal' | 'vertical';
	colors?: string[];
	showGrid?: boolean;
	showLegend?: boolean;
	formatYAxis?: (value: number) => string;
	formatTooltip?: (value: number) => string;
	className?: string;
}

const DEFAULT_COLORS = [
	'hsl(var(--chart-1))',
	'hsl(var(--chart-2))',
	'hsl(var(--chart-3))',
	'hsl(var(--chart-4))',
	'hsl(var(--chart-5))',
];

/**
 * BarChart component for displaying categorical data
 * Supports horizontal and vertical layouts with custom colors
 */
export function BarChart({
	data,
	xAxisKey,
	yAxisKey,
	height = 300,
	layout = 'vertical',
	colors = DEFAULT_COLORS,
	showGrid = true,
	showLegend = false,
	formatYAxis,
	formatTooltip,
	className = '',
}: BarChartProps) {
	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload || !payload.length) return null;

		const data = payload[0].payload;
		const value = data[yAxisKey];
		const formattedValue = formatTooltip ? formatTooltip(value) : value.toLocaleString();

		return (
			<div className="bg-popover border border-border rounded-lg shadow-lg p-3">
				<p className="text-sm font-semibold text-foreground mb-1">{data[xAxisKey]}</p>
				<p className="text-xs text-muted-foreground">{formattedValue}</p>
			</div>
		);
	};

	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height={height}>
				<RechartsBarChart data={data} layout={layout}>
					{showGrid && (
						<CartesianGrid
							strokeDasharray="3 3"
							stroke="hsl(var(--border))"
							opacity={0.3}
						/>
					)}
					{layout === 'horizontal' ? (
						<>
							<XAxis
								dataKey={xAxisKey}
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
						</>
					) : (
						<>
							<XAxis
								type="number"
								stroke="hsl(var(--muted-foreground))"
								fontSize={12}
								tickLine={false}
								axisLine={false}
								tickFormatter={formatYAxis}
							/>
							<YAxis
								type="category"
								dataKey={xAxisKey}
								stroke="hsl(var(--muted-foreground))"
								fontSize={12}
								tickLine={false}
								axisLine={false}
								width={100}
							/>
						</>
					)}
					<Tooltip content={<CustomTooltip />} />
					{showLegend && <Legend />}
					<Bar dataKey={yAxisKey} radius={[4, 4, 0, 0]}>
						{data.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={colors[index % colors.length]}
							/>
						))}
					</Bar>
				</RechartsBarChart>
			</ResponsiveContainer>
		</div>
	);
}
