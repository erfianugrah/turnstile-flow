import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { SearchBar } from './analytics/filters/SearchBar';
import { DateRangePicker } from './analytics/filters/DateRangePicker';
import { MultiSelect } from './analytics/filters/MultiSelect';
import { RangeSlider } from './analytics/filters/RangeSlider';
import { TimeSeriesChart } from './analytics/charts/TimeSeriesChart';
import { BarChart } from './analytics/charts/BarChart';
import { PieChart } from './analytics/charts/PieChart';
import { DonutChart } from './analytics/charts/DonutChart';
import { RadarChart } from './analytics/charts/RadarChart';
import { DataTable } from './analytics/tables/DataTable';
import { FraudAlert } from './analytics/cards/FraudAlert';
import { GlobalControlsBar } from './analytics/controls/GlobalControlsBar';
import { Download, RefreshCw } from 'lucide-react';
import { subDays } from 'date-fns';
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table';

interface ValidationStats {
	total: number;
	successful: number;
	allowed: number;
	avg_risk_score: number;
	unique_ephemeral_ids: number;
}

interface Submission {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	country: string | null;
	city: string | null;
	bot_score: number | null;
	created_at: string;
	// Expanded fields for table
	remote_ip?: string | null;
	user_agent?: string | null;
	tls_version?: string | null;
	asn?: string | null;
	ja3_hash?: string | null;
	ephemeral_id?: string | null;
}

interface SubmissionDetail {
	// Form data
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	address: string;
	date_of_birth: string;
	created_at: string;
	// Geographic data
	remote_ip: string;
	country: string | null;
	region: string | null;
	city: string | null;
	postal_code: string | null;
	timezone: string | null;
	latitude: number | null;
	longitude: number | null;
	continent: string | null;
	is_eu_country: boolean | null;
	// Network data
	user_agent: string;
	asn: string | null;
	as_organization: string | null;
	colo: string | null;
	http_protocol: string | null;
	tls_version: string | null;
	tls_cipher: string | null;
	// Bot detection
	bot_score: number | null;
	client_trust_score: number | null;
	verified_bot: boolean;
	detection_ids: string | null;
	// Fingerprints
	ephemeral_id: string | null;
	ja3_hash: string | null;
	ja4: string | null;
	ja4_signals: string | null;
}

interface CountryData {
	country: string;
	count: number;
}

interface BotScoreData {
	score_range: string;
	count: number;
}

interface AsnData {
	asn: string;
	as_organization: string | null;
	count: number;
}

interface TlsData {
	tls_version: string;
	tls_cipher: string | null;
	count: number;
}

interface Ja3Data {
	ja3_hash: string;
	count: number;
}

interface Ja4Data {
	ja4: string;
	count: number;
}

export default function AnalyticsDashboard() {
	const [stats, setStats] = useState<ValidationStats | null>(null);
	const [submissions, setSubmissions] = useState<Submission[]>([]);
	const [countries, setCountries] = useState<CountryData[]>([]);
	const [botScores, setBotScores] = useState<BotScoreData[]>([]);
	const [asnData, setAsnData] = useState<AsnData[]>([]);
	const [tlsData, setTlsData] = useState<TlsData[]>([]);
	const [ja3Data, setJa3Data] = useState<Ja3Data[]>([]);
	const [ja4Data, setJa4Data] = useState<Ja4Data[]>([]);
	const [fraudPatterns, setFraudPatterns] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// API Key state
	const [apiKey, setApiKey] = useState<string>('');
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState('');
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);

	// Modal state
	const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
	const [modalLoading, setModalLoading] = useState(false);

	// Filter states
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
	const [botScoreRange, setBotScoreRange] = useState<[number, number]>([0, 100]);
	const [dateRange, setDateRange] = useState({
		start: subDays(new Date(), 30),
		end: new Date(),
	});

	// Pagination and sorting states
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});
	const [sorting, setSorting] = useState<SortingState>([{ id: 'created_at', desc: true }]);
	const [totalCount, setTotalCount] = useState(0);
	const [submissionsLoading, setSubmissionsLoading] = useState(false);

	// Time-series data
	const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);

	// Auto-refresh state
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [refreshInterval, setRefreshInterval] = useState(30); // seconds

	// Table view state
	const [tableView, setTableView] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');

	useEffect(() => {
		// Check for saved API key in localStorage
		const savedApiKey = localStorage.getItem('analytics-api-key');
		if (savedApiKey) {
			setApiKey(savedApiKey);
			loadAnalytics(savedApiKey);
		} else {
			setShowApiKeyDialog(true);
			setLoading(false);
		}
	}, []);

	// Reset pagination when filters change
	useEffect(() => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, [searchQuery, selectedCountries.join(','), botScoreRange.join(','), dateRange.start.toISOString(), dateRange.end.toISOString()]);

	// Reload submissions when filters, pagination, or sorting change
	useEffect(() => {
		if (apiKey) {
			loadSubmissions(apiKey);
		}
	}, [
		searchQuery,
		selectedCountries.join(','),
		botScoreRange.join(','),
		dateRange.start.toISOString(),
		dateRange.end.toISOString(),
		pagination.pageIndex,
		pagination.pageSize,
		sorting.length > 0 ? sorting[0].id : '',
		sorting.length > 0 ? sorting[0].desc : false,
		apiKey,
	]);

	// Auto-refresh interval
	useEffect(() => {
		if (!autoRefresh || !apiKey) return;

		const intervalId = setInterval(() => {
			loadAnalytics(apiKey);
			loadSubmissions(apiKey);
		}, refreshInterval * 1000);

		return () => clearInterval(intervalId);
	}, [autoRefresh, refreshInterval, apiKey]);

	const loadAnalytics = async (key: string) => {
		setLoading(true);
		setError(null);

		const headers = key ? { 'X-API-KEY': key } : {};

		try {
			const [
				statsRes,
				countriesRes,
				botScoresRes,
				asnRes,
				tlsRes,
				ja3Res,
				ja4Res,
				timeSeriesRes,
				fraudRes,
			] = await Promise.all([
				fetch('/api/analytics/stats', { headers }),
				fetch('/api/analytics/countries', { headers }),
				fetch('/api/analytics/bot-scores', { headers }),
				fetch('/api/analytics/asn', { headers }),
				fetch('/api/analytics/tls', { headers }),
				fetch('/api/analytics/ja3', { headers }),
				fetch('/api/analytics/ja4', { headers }),
				fetch('/api/analytics/time-series?metric=submissions&interval=day', { headers }),
				fetch('/api/analytics/fraud-patterns', { headers }),
			]);

			// Check for 401 errors (unauthorized)
			if (statsRes.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				setLoading(false);
				return;
			}

			if (
				!statsRes.ok ||
				!countriesRes.ok ||
				!botScoresRes.ok ||
				!asnRes.ok ||
				!tlsRes.ok ||
				!ja3Res.ok ||
				!ja4Res.ok ||
				!timeSeriesRes.ok ||
				!fraudRes.ok
			) {
				throw new Error('Failed to fetch analytics');
			}

			const [statsData, countriesData, botScoresData, asnData, tlsData, ja3DataRes, ja4DataRes, timeSeriesDataRes, fraudDataRes] =
				await Promise.all([
					statsRes.json(),
					countriesRes.json(),
					botScoresRes.json(),
					asnRes.json(),
					tlsRes.json(),
					ja3Res.json(),
					ja4Res.json(),
					timeSeriesRes.json(),
					fraudRes.json(),
				]);

			setStats(statsData.data);
			setCountries(countriesData.data);
			setBotScores(botScoresData.data);
			setAsnData(asnData.data);
			setTlsData(tlsData.data);
			setJa3Data(ja3DataRes.data);
			setJa4Data(ja4DataRes.data);
			setTimeSeriesData(timeSeriesDataRes.data || []);
			setFraudPatterns(fraudDataRes.data);

			// Load submissions separately with filters
			await loadSubmissions(key);
		} catch (err) {
			console.error('Error loading analytics:', err);
			setError('Failed to load analytics data');
		} finally {
			setLoading(false);
		}
	};

	const loadSubmissions = async (key: string) => {
		setSubmissionsLoading(true);
		const headers = key ? { 'X-API-KEY': key } : {};

		try {
			// Build query parameters
			const params = new URLSearchParams();
			params.append('limit', pagination.pageSize.toString());
			params.append('offset', (pagination.pageIndex * pagination.pageSize).toString());

			// Add sorting
			if (sorting.length > 0) {
				params.append('sortBy', sorting[0].id);
				params.append('sortOrder', sorting[0].desc ? 'desc' : 'asc');
			}

			// Add search query
			if (searchQuery.trim()) {
				params.append('search', searchQuery.trim());
			}

			// Add countries filter
			if (selectedCountries.length > 0) {
				params.append('countries', selectedCountries.join(','));
			}

			// Add bot score range filter
			if (botScoreRange[0] !== 0 || botScoreRange[1] !== 100) {
				params.append('botScoreMin', botScoreRange[0].toString());
				params.append('botScoreMax', botScoreRange[1].toString());
			}

			// Add date range
			params.append('startDate', dateRange.start.toISOString());
			params.append('endDate', dateRange.end.toISOString());

			const res = await fetch(`/api/analytics/submissions?${params.toString()}`, { headers });

			if (res.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				return;
			}

			if (!res.ok) {
				throw new Error('Failed to fetch submissions');
			}

			const data = await res.json();
			setSubmissions(data.data);
			setTotalCount(data.total || 0);
		} catch (err) {
			console.error('Error loading submissions:', err);
			// Don't set global error, just log it
		} finally {
			setSubmissionsLoading(false);
		}
	};

	const loadSubmissionDetail = async (id: number) => {
		setModalLoading(true);
		const headers = apiKey ? { 'X-API-KEY': apiKey } : {};
		try {
			const res = await fetch(`/api/analytics/submissions/${id}`, { headers });
			if (res.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				return;
			}
			if (!res.ok) {
				throw new Error('Failed to fetch submission details');
			}
			const data = await res.json();
			setSelectedSubmission(data.data);
		} catch (err) {
			console.error('Error loading submission details:', err);
			alert('Failed to load submission details');
		} finally {
			setModalLoading(false);
		}
	};

	const handleExport = async (format: 'csv' | 'json') => {
		if (!apiKey) return;

		const headers = { 'X-API-KEY': apiKey };

		try {
			// Build query parameters (same as loadSubmissions but without limit/offset)
			const params = new URLSearchParams();
			params.append('format', format);

			// Add sorting
			if (sorting.length > 0) {
				params.append('sortBy', sorting[0].id);
				params.append('sortOrder', sorting[0].desc ? 'desc' : 'asc');
			}

			// Add search query
			if (searchQuery.trim()) {
				params.append('search', searchQuery.trim());
			}

			// Add countries filter
			if (selectedCountries.length > 0) {
				params.append('countries', selectedCountries.join(','));
			}

			// Add bot score range filter
			if (botScoreRange[0] !== 0 || botScoreRange[1] !== 100) {
				params.append('botScoreMin', botScoreRange[0].toString());
				params.append('botScoreMax', botScoreRange[1].toString());
			}

			// Add date range
			params.append('startDate', dateRange.start.toISOString());
			params.append('endDate', dateRange.end.toISOString());

			const res = await fetch(`/api/analytics/export?${params.toString()}`, { headers });

			if (res.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				return;
			}

			if (!res.ok) {
				throw new Error('Failed to export data');
			}

			// Get the blob and trigger download
			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// Extract filename from Content-Disposition header or use default
			const contentDisposition = res.headers.get('Content-Disposition');
			const filenameMatch = contentDisposition?.match(/filename="?([^"]+)"?/);
			const filename = filenameMatch ? filenameMatch[1] : `submissions-export-${new Date().toISOString().split('T')[0]}.${format}`;

			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Error exporting data:', err);
			alert('Failed to export data');
		}
	};

	const handleApiKeySubmit = () => {
		if (!apiKeyInput.trim()) {
			setApiKeyError('Please enter an API key');
			return;
		}

		setApiKeyError(null);
		const trimmedKey = apiKeyInput.trim();
		localStorage.setItem('analytics-api-key', trimmedKey);
		setApiKey(trimmedKey);
		setShowApiKeyDialog(false);
		setApiKeyInput('');
		loadAnalytics(trimmedKey);
	};

	const handleManualRefresh = () => {
		if (apiKey) {
			loadAnalytics(apiKey);
			loadSubmissions(apiKey);
		}
	};

	const handleClearFilters = () => {
		setSearchQuery('');
		setSelectedCountries([]);
		setBotScoreRange([0, 100]);
		setDateRange({
			start: subDays(new Date(), 30),
			end: new Date(),
		});
	};

	const hasActiveFilters =
		searchQuery.trim() !== '' ||
		selectedCountries.length > 0 ||
		botScoreRange[0] !== 0 ||
		botScoreRange[1] !== 100 ||
		dateRange.start.getTime() !== subDays(new Date(), 30).setHours(0, 0, 0, 0) ||
		dateRange.end.getTime() !== new Date().setHours(23, 59, 59, 999);

	// Define columns for DataTable
	const columns: ColumnDef<Submission>[] = [
		{
			accessorKey: 'id',
			header: 'ID',
			cell: ({ row }) => <span className="font-mono text-xs">{row.original.id}</span>,
		},
		{
			accessorKey: 'first_name',
			header: 'Name',
			cell: ({ row }) => (
				<span>
					{row.original.first_name} {row.original.last_name}
				</span>
			),
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: ({ row }) => <span className="text-xs">{row.original.email}</span>,
		},
		{
			accessorKey: 'country',
			header: 'Country',
			cell: ({ row }) => <span>{row.original.country || 'N/A'}</span>,
		},
		{
			accessorKey: 'remote_ip',
			header: 'IP',
			cell: ({ row }) => (
				<span className="font-mono text-xs">{row.original.remote_ip || 'N/A'}</span>
			),
		},
		{
			accessorKey: 'bot_score',
			header: 'Bot Score',
			cell: ({ row }) => {
				const score = row.original.bot_score;
				return (
					<span
						className={`font-semibold ${
							score && score < 30
								? 'text-destructive'
								: score && score >= 70
								? 'text-green-600 dark:text-green-400'
								: 'text-yellow-600 dark:text-yellow-400'
						}`}
					>
						{score !== null ? score : 'N/A'}
					</span>
				);
			},
		},
		{
			accessorKey: 'created_at',
			header: 'Date',
			cell: ({ row }) => (
				<span className="text-xs">{new Date(row.original.created_at).toLocaleString()}</span>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => (
				<button
					onClick={() => loadSubmissionDetail(row.original.id)}
					className="text-xs text-primary hover:underline"
				>
					View Details
				</button>
			),
		},
	];

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<p className="text-muted-foreground">Loading analytics...</p>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<>
			{/* API Key Dialog - Required, cannot close without entering key */}
			<Dialog open={showApiKeyDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Enter Analytics API Key</DialogTitle>
						<DialogDescription>
							Please enter your API key to access the analytics dashboard. This key matches the X-API-KEY secret configured in your Cloudflare Workers.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<input
								type="password"
								placeholder="Enter API key"
								value={apiKeyInput}
								onChange={(e) => setApiKeyInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										handleApiKeySubmit();
									}
								}}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
								autoFocus
							/>
							{apiKeyError && (
								<p className="text-sm text-destructive">{apiKeyError}</p>
							)}
						</div>
						<div className="flex justify-end gap-3">
							<button
								onClick={handleApiKeySubmit}
								className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md h-10 px-4 py-2"
							>
								Submit
							</button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<div className="space-y-6">
				{/* Auto-refresh Controls */}
				<GlobalControlsBar
					autoRefresh={autoRefresh}
					refreshInterval={refreshInterval}
					onAutoRefreshChange={setAutoRefresh}
					onRefreshIntervalChange={setRefreshInterval}
					onManualRefresh={handleManualRefresh}
					onExportCSV={() => handleExport('csv')}
					onExportJSON={() => handleExport('json')}
					hasActiveFilters={hasActiveFilters}
					onClearFilters={handleClearFilters}
					tableView={tableView}
					onTableViewChange={setTableView}
					isLoading={loading || submissionsLoading}
				/>

				{/* Stats Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Validations
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">{stats?.total || 0}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Success Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats && stats.total > 0
								? ((stats.successful / stats.total) * 100).toFixed(1)
								: 0}
							%
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Allowed Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats && stats.total > 0
								? ((stats.allowed / stats.total) * 100).toFixed(1)
								: 0}
							%
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Avg Risk Score
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats?.avg_risk_score ? stats.avg_risk_score.toFixed(1) : '0.0'}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Fraud Detection */}
			<FraudAlert data={fraudPatterns} loading={loading} />

			{/* Submissions Time Series */}
			<Card>
				<CardHeader>
					<CardTitle>Submissions Over Time</CardTitle>
					<CardDescription>Daily submission volume (last 30 days)</CardDescription>
				</CardHeader>
				<CardContent>
					{timeSeriesData.length > 0 ? (
						<TimeSeriesChart
							data={timeSeriesData}
							type="area"
							height={250}
							yAxisLabel="Submissions"
							formatTooltip={(value) => `${value.toFixed(0)} submissions`}
						/>
					) : (
						<div className="flex items-center justify-center h-[250px]">
							<p className="text-muted-foreground text-sm">No time-series data available</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Recent Submissions with Filters */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Submissions</CardTitle>
					<CardDescription>
						Search and filter form submissions (click row for full details)
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Filters Row 1 */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<SearchBar
							value={searchQuery}
							onChange={setSearchQuery}
							placeholder="Search by email, name, or IP..."
						/>
						<MultiSelect
							options={countries.map((c) => ({ value: c.country, label: c.country }))}
							value={selectedCountries}
							onChange={setSelectedCountries}
							placeholder="Filter by countries..."
							label="Countries"
						/>
						<DateRangePicker value={dateRange} onChange={setDateRange} />
					</div>

					{/* Filters Row 2 */}
					<div className="w-full">
						<RangeSlider
							min={0}
							max={100}
							value={botScoreRange}
							onChange={setBotScoreRange}
							label="Bot Score Range"
							step={1}
						/>
					</div>

					{/* Data Table */}
					{submissionsLoading ? (
						<div className="flex items-center justify-center py-12">
							<p className="text-muted-foreground">Loading submissions...</p>
						</div>
					) : (
						<DataTable
							data={submissions}
							columns={columns}
							totalCount={totalCount}
							manualPagination={true}
							manualSorting={true}
							onPaginationChange={(updater) => {
								const newPagination =
									typeof updater === 'function' ? updater(pagination) : updater;
								setPagination(newPagination);
							}}
							onSortingChange={(updater) => {
								const newSorting =
									typeof updater === 'function' ? updater(sorting) : updater;
								setSorting(newSorting);
							}}
						/>
					)}
				</CardContent>
			</Card>

			{/* Country Distribution and Bot Scores */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Submissions by Country</CardTitle>
						<CardDescription>Top countries</CardDescription>
					</CardHeader>
					<CardContent>
						{countries.length === 0 ? (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							<BarChart
								data={countries.slice(0, 10)}
								xAxisKey="country"
								yAxisKey="count"
								layout="vertical"
								height={300}
								formatTooltip={(value) => `${value} submissions`}
							/>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Bot Score Distribution</CardTitle>
						<CardDescription>Score ranges</CardDescription>
					</CardHeader>
					<CardContent>
						{botScores.length === 0 ? (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							<DonutChart
								data={botScores.map((item) => ({
									name: item.score_range,
									value: item.count,
								}))}
								height={300}
								centerLabel="Total"
								centerValue={botScores.reduce((sum, item) => sum + item.count, 0).toString()}
								formatTooltip={(value) => `${value} submissions`}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Network & Fingerprint Analytics */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>ASN Distribution</CardTitle>
						<CardDescription>Top autonomous systems</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{asnData.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								asnData.map((item) => (
									<div
										key={item.asn}
										className="flex flex-col py-2 border-b last:border-0"
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm font-medium">
												AS{item.asn}
											</span>
											<span className="text-muted-foreground text-sm">
												{item.count}
											</span>
										</div>
										{item.as_organization && (
											<span className="text-xs text-muted-foreground truncate">
												{item.as_organization}
											</span>
										)}
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>TLS Versions</CardTitle>
						<CardDescription>TLS versions & ciphers</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{tlsData.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								tlsData.map((item, idx) => (
									<div
										key={`${item.tls_version}-${item.tls_cipher}-${idx}`}
										className="flex flex-col py-2 border-b last:border-0"
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm font-medium">
												{item.tls_version}
											</span>
											<span className="text-muted-foreground text-sm">
												{item.count}
											</span>
										</div>
										{item.tls_cipher && (
											<span className="text-xs text-muted-foreground font-mono truncate">
												{item.tls_cipher}
											</span>
										)}
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>JA3 Fingerprints</CardTitle>
						<CardDescription>Top JA3 hashes</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{ja3Data.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								ja3Data.map((item) => (
									<div
										key={item.ja3_hash}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-mono text-xs truncate flex-1 mr-2">
											{item.ja3_hash}
										</span>
										<span className="text-muted-foreground text-sm">
											{item.count}
										</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>JA4 Fingerprints</CardTitle>
						<CardDescription>Top JA4 hashes</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{ja4Data.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								ja4Data.map((item) => (
									<div
										key={item.ja4}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-mono text-xs truncate flex-1 mr-2">
											{item.ja4}
										</span>
										<span className="text-muted-foreground text-sm">
											{item.count}
										</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Advanced Analytics Visualizations */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Performance Metrics</CardTitle>
						<CardDescription>Multi-dimensional analysis</CardDescription>
					</CardHeader>
					<CardContent>
						{stats ? (
							<RadarChart
								data={[
									{
										metric: 'Success Rate',
										value: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0,
										fullMark: 100,
									},
									{
										metric: 'Allowed Rate',
										value: stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0,
										fullMark: 100,
									},
									{
										metric: 'Avg Bot Score',
										value: stats.avg_risk_score || 0,
										fullMark: 100,
									},
									{
										metric: 'Total Volume',
										value: Math.min((stats.total / 1000) * 100, 100),
										fullMark: 100,
									},
									{
										metric: 'Unique IDs',
										value: Math.min((stats.unique_ephemeral_ids / 500) * 100, 100),
										fullMark: 100,
									},
								]}
								height={300}
								formatTooltip={(value) => `${value.toFixed(1)}%`}
							/>
						) : (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>TLS Version Distribution</CardTitle>
						<CardDescription>TLS versions breakdown</CardDescription>
					</CardHeader>
					<CardContent>
						{tlsData.length === 0 ? (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							<PieChart
								data={tlsData.map((item) => ({
									name: item.tls_version || 'Unknown',
									value: item.count,
								}))}
								height={300}
								formatTooltip={(value) => `${value} connections`}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Submission Detail Modal */}
			<Dialog
				open={selectedSubmission !== null}
				onClose={() => setSelectedSubmission(null)}
			>
				<DialogContent className="p-0">
					{modalLoading ? (
						<div className="flex items-center justify-center py-12">
							<p className="text-muted-foreground">Loading details...</p>
						</div>
					) : selectedSubmission ? (
						<>
							<DialogHeader>
								<DialogTitle>
									Submission Details - ID #{selectedSubmission.id}
								</DialogTitle>
								<DialogDescription>
									Complete information for this submission
								</DialogDescription>
							</DialogHeader>

							<div className="p-6 space-y-6">
								{/* Form Data */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Form Data</h3>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">Name:</span>
											<p className="font-medium">
												{selectedSubmission.first_name}{' '}
												{selectedSubmission.last_name}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Email:</span>
											<p className="font-medium">{selectedSubmission.email}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Phone:</span>
											<p className="font-medium">{selectedSubmission.phone}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Date of Birth:</span>
											<p className="font-medium">
												{selectedSubmission.date_of_birth}
											</p>
										</div>
										<div className="col-span-2">
											<span className="text-muted-foreground">Address:</span>
											<p className="font-medium">{selectedSubmission.address}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Submitted:</span>
											<p className="font-medium">
												{new Date(
													selectedSubmission.created_at
												).toLocaleString()}
											</p>
										</div>
									</div>
								</div>

								{/* Geographic Data */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Geographic Data</h3>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">IP Address:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.remote_ip}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Country:</span>
											<p className="font-medium">
												{selectedSubmission.country || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Region:</span>
											<p className="font-medium">
												{selectedSubmission.region || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">City:</span>
											<p className="font-medium">
												{selectedSubmission.city || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Postal Code:</span>
											<p className="font-medium">
												{selectedSubmission.postal_code || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Timezone:</span>
											<p className="font-medium">
												{selectedSubmission.timezone || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Coordinates:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.latitude &&
												selectedSubmission.longitude
													? `${selectedSubmission.latitude}, ${selectedSubmission.longitude}`
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Continent:</span>
											<p className="font-medium">
												{selectedSubmission.continent || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">EU Country:</span>
											<p className="font-medium">
												{selectedSubmission.is_eu_country ? 'Yes' : 'No'}
											</p>
										</div>
									</div>
								</div>

								{/* Network Data */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Network Data</h3>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div className="col-span-2">
											<span className="text-muted-foreground">User Agent:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.user_agent}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">ASN:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.asn
													? `AS${selectedSubmission.asn}`
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">
												AS Organization:
											</span>
											<p className="font-medium text-xs">
												{selectedSubmission.as_organization || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Colo:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.colo || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">HTTP Protocol:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.http_protocol || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">TLS Version:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.tls_version || 'N/A'}
											</p>
										</div>
										<div className="col-span-2">
											<span className="text-muted-foreground">TLS Cipher:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.tls_cipher || 'N/A'}
											</p>
										</div>
									</div>
								</div>

								{/* Bot Detection */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Bot Detection</h3>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">Bot Score:</span>
											<p
												className={`font-bold ${
													selectedSubmission.bot_score &&
													selectedSubmission.bot_score < 30
														? 'text-destructive'
														: selectedSubmission.bot_score &&
														  selectedSubmission.bot_score >= 70
														? 'text-green-600 dark:text-green-400'
														: 'text-yellow-600 dark:text-yellow-400'
												}`}
											>
												{selectedSubmission.bot_score !== null
													? selectedSubmission.bot_score
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">
												Client Trust Score:
											</span>
											<p className="font-medium">
												{selectedSubmission.client_trust_score !== null
													? selectedSubmission.client_trust_score
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Verified Bot:</span>
											<p className="font-medium">
												{selectedSubmission.verified_bot ? 'Yes' : 'No'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Detection IDs:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.detection_ids || 'N/A'}
											</p>
										</div>
									</div>
								</div>

								{/* Fingerprints */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Fingerprints</h3>
									<div className="grid grid-cols-1 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">
												Ephemeral ID:
											</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ephemeral_id || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA3 Hash:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja3_hash || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA4:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja4 || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA4 Signals:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja4_signals || 'N/A'}
											</p>
										</div>
									</div>
								</div>
							</div>
						</>
					) : null}
				</DialogContent>
			</Dialog>
			</div>
		</>
	);
}
