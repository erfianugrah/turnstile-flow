import {
	ResponsiveContainer,
	PieChart as RechartsPieChart,
	Pie,
	Cell,
	Tooltip,
	Legend,
} from 'recharts';

interface DataItem {
	name: string;
	value: number;
	[key: string]: any;
}

interface PieChartProps {
	data: DataItem[];
	nameKey?: string;
	valueKey?: string;
	height?: number;
	colors?: string[];
	showLegend?: boolean;
	innerRadius?: number;
	formatTooltip?: (value: number) => string;
	className?: string;
}

const DEFAULT_COLORS = [
	'hsl(var(--chart-1))',
	'hsl(var(--chart-2))',
	'hsl(var(--chart-3))',
	'hsl(var(--chart-4))',
	'hsl(var(--chart-5))',
	'hsl(210, 80%, 60%)',
	'hsl(280, 70%, 60%)',
	'hsl(30, 85%, 55%)',
];

/**
 * PieChart component for displaying proportional data
 * Supports custom colors, tooltips, and optional donut mode
 */
export function PieChart({
	data,
	nameKey = 'name',
	valueKey = 'value',
	height = 300,
	colors = DEFAULT_COLORS,
	showLegend = true,
	innerRadius = 0,
	formatTooltip,
	className = '',
}: PieChartProps) {
	const CustomTooltip = ({ active, payload }: any) => {
		if (!active || !payload || !payload.length) return null;

		const data = payload[0].payload;
		const value = data[valueKey];
		const formattedValue = formatTooltip ? formatTooltip(value) : value.toLocaleString();

		// Calculate percentage
		const total = payload[0].payload.percent
			? 100
			: data.payload?.total ||
			  payload[0].payload.total ||
			  data.value;
		const percentage = payload[0].payload.percent ||
			((value / total) * 100).toFixed(1);

		return (
			<div className="bg-popover border border-border rounded-lg shadow-lg p-3">
				<p className="text-sm font-semibold text-foreground mb-1">{data[nameKey]}</p>
				<p className="text-xs text-muted-foreground">
					{formattedValue} ({percentage}%)
				</p>
			</div>
		);
	};

	const CustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
		const RADIAN = Math.PI / 180;
		const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
		const x = cx + radius * Math.cos(-midAngle * RADIAN);
		const y = cy + radius * Math.sin(-midAngle * RADIAN);

		// Only show label if percentage is above 5%
		if (percent < 0.05) return null;

		return (
			<text
				x={x}
				y={y}
				fill="hsl(var(--background))"
				textAnchor={x > cx ? 'start' : 'end'}
				dominantBaseline="central"
				className="text-xs font-semibold"
			>
				{`${(percent * 100).toFixed(0)}%`}
			</text>
		);
	};

	return (
		<div className={className}>
			<ResponsiveContainer width="100%" height={height}>
				<RechartsPieChart>
					<Pie
						data={data}
						dataKey={valueKey}
						nameKey={nameKey}
						cx="50%"
						cy="50%"
						innerRadius={innerRadius}
						outerRadius={height / 3}
						paddingAngle={2}
						label={CustomLabel}
						labelLine={false}
					>
						{data.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={colors[index % colors.length]}
							/>
						))}
					</Pie>
					<Tooltip content={<CustomTooltip />} />
					{showLegend && (
						<Legend
							verticalAlign="bottom"
							height={36}
							iconType="circle"
							formatter={(value, entry: any) => (
								<span className="text-xs text-foreground">{value}</span>
							)}
						/>
					)}
				</RechartsPieChart>
			</ResponsiveContainer>
		</div>
	);
}
