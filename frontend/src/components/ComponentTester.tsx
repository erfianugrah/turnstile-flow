import { useState } from 'react';
import { SearchBar } from './analytics/filters/SearchBar';
import { DateRangePicker } from './analytics/filters/DateRangePicker';
import { MultiSelect } from './analytics/filters/MultiSelect';
import { TimeSeriesChart } from './analytics/charts/TimeSeriesChart';
import { BarChart } from './analytics/charts/BarChart';
import { DataTable } from './analytics/tables/DataTable';
import { subDays } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';

// Sample data for testing
const timeSeriesData = [
	{ timestamp: '2025-11-11T00:00:00Z', value: 85, count: 10 },
	{ timestamp: '2025-11-12T00:00:00Z', value: 92, count: 15 },
	{ timestamp: '2025-11-13T00:00:00Z', value: 78, count: 8 },
];

const barChartData = [
	{ country: 'US', count: 150 },
	{ country: 'CA', count: 45 },
	{ country: 'GB', count: 30 },
	{ country: 'DE', count: 25 },
];

const countryOptions = [
	{ value: 'US', label: 'United States' },
	{ value: 'CA', label: 'Canada' },
	{ value: 'GB', label: 'United Kingdom' },
	{ value: 'DE', label: 'Germany' },
	{ value: 'FR', label: 'France' },
];

interface Submission {
	id: number;
	email: string;
	country: string;
	bot_score: number;
	created_at: string;
}

const tableData: Submission[] = [
	{
		id: 1,
		email: 'john@example.com',
		country: 'US',
		bot_score: 85,
		created_at: '2025-11-11T08:00:00Z',
	},
	{
		id: 2,
		email: 'jane@example.com',
		country: 'US',
		bot_score: 92,
		created_at: '2025-11-12T08:00:00Z',
	},
	{
		id: 3,
		email: 'bob@example.com',
		country: 'CA',
		bot_score: 78,
		created_at: '2025-11-13T08:00:00Z',
	},
];

const columns: ColumnDef<Submission>[] = [
	{
		accessorKey: 'id',
		header: 'ID',
	},
	{
		accessorKey: 'email',
		header: 'Email',
	},
	{
		accessorKey: 'country',
		header: 'Country',
	},
	{
		accessorKey: 'bot_score',
		header: 'Bot Score',
	},
	{
		accessorKey: 'created_at',
		header: 'Created',
		cell: ({ row }) => new Date(row.original.created_at).toLocaleDateString(),
	},
];

export default function ComponentTester() {
	const [search, setSearch] = useState('');
	const [dateRange, setDateRange] = useState({
		start: subDays(new Date(), 30),
		end: new Date(),
	});
	const [selectedCountries, setSelectedCountries] = useState<string[]>([]);

	return (
		<div className="space-y-12">
			{/* Filters Section */}
			<section>
				<h2 className="text-2xl font-bold mb-4">Filter Components</h2>
				<div className="space-y-6">
					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">SearchBar</h3>
						<SearchBar
							value={search}
							onChange={setSearch}
							placeholder="Search by email, name, or IP..."
						/>
						{search && (
							<p className="mt-2 text-sm text-muted-foreground">
								Search value: "{search}"
							</p>
						)}
					</div>

					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">DateRangePicker</h3>
						<DateRangePicker value={dateRange} onChange={setDateRange} />
						<p className="mt-2 text-sm text-muted-foreground">
							Selected: {dateRange.start.toLocaleDateString()} -{' '}
							{dateRange.end.toLocaleDateString()}
						</p>
					</div>

					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">MultiSelect</h3>
						<MultiSelect
							options={countryOptions}
							value={selectedCountries}
							onChange={setSelectedCountries}
							placeholder="Select countries..."
							label="Countries"
						/>
						{selectedCountries.length > 0 && (
							<p className="mt-2 text-sm text-muted-foreground">
								Selected: {selectedCountries.join(', ')}
							</p>
						)}
					</div>
				</div>
			</section>

			{/* Charts Section */}
			<section>
				<h2 className="text-2xl font-bold mb-4">Chart Components</h2>
				<div className="space-y-6">
					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">TimeSeriesChart (Line)</h3>
						<TimeSeriesChart
							data={timeSeriesData}
							type="line"
							height={250}
							yAxisLabel="Bot Score"
							formatTooltip={(value) => `${value.toFixed(0)}`}
						/>
					</div>

					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">TimeSeriesChart (Area)</h3>
						<TimeSeriesChart
							data={timeSeriesData}
							type="area"
							height={250}
							yAxisLabel="Bot Score"
							formatTooltip={(value) => `${value.toFixed(0)}`}
						/>
					</div>

					<div className="p-4 border border-border rounded-lg bg-card">
						<h3 className="text-lg font-semibold mb-3">BarChart (Vertical)</h3>
						<BarChart
							data={barChartData}
							xAxisKey="country"
							yAxisKey="count"
							layout="vertical"
							height={250}
						/>
					</div>
				</div>
			</section>

			{/* Table Section */}
			<section>
				<h2 className="text-2xl font-bold mb-4">Table Components</h2>
				<div className="p-4 border border-border rounded-lg bg-card">
					<h3 className="text-lg font-semibold mb-3">DataTable</h3>
					<DataTable
						data={tableData}
						columns={columns}
						totalCount={tableData.length}
					/>
				</div>
			</section>
		</div>
	);
}
