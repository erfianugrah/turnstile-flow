import { useState, useEffect } from 'react';
import { subDays } from 'date-fns';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { GlobalControlsBar } from './analytics/controls/GlobalControlsBar';
import { FraudAlert } from './analytics/cards/FraudAlert';
import { OverviewStats } from './analytics/sections/OverviewStats';
import { RecentSubmissionsSection } from './analytics/sections/RecentSubmissionsSection';
import { SecurityEvents } from './analytics/sections/SecurityEvents';
import { ChartsSection } from './analytics/sections/ChartsSection';
import { SubmissionDetailDialog, type SubmissionDetail } from './analytics/sections/SubmissionDetailDialog';
import { useAnalytics } from '../hooks/useAnalytics';
import { useSubmissions, type UseSubmissionsFilters } from '../hooks/useSubmissions';
import { useBlacklist } from '../hooks/useBlacklist';
import { useBlockedValidations } from '../hooks/useBlockedValidations';

export default function AnalyticsDashboard() {
	// API Key state
	const [apiKey, setApiKey] = useState<string>('');
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState('');
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);

	// Submission detail modal state
	const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
	const [modalLoading, setModalLoading] = useState(false);

	// Filter states
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
	const [botScoreRange, setBotScoreRange] = useState<[number, number]>([0, 100]);
	const [allowedStatus, setAllowedStatus] = useState<'all' | 'allowed' | 'blocked'>('all');
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

	// Auto-refresh state
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [refreshInterval, setRefreshInterval] = useState(30);

	// Check for saved API key on mount
	useEffect(() => {
		const savedApiKey = localStorage.getItem('analytics-api-key');
		if (savedApiKey) {
			setApiKey(savedApiKey);
		} else {
			setShowApiKeyDialog(true);
		}
	}, []);

	// Reset pagination when filters change
	useEffect(() => {
		setPagination((prev) => ({ ...prev, pageIndex: 0 }));
	}, [searchQuery, selectedCountries.join(','), botScoreRange.join(','), allowedStatus, dateRange.start.toISOString(), dateRange.end.toISOString()]);

	// Use hooks for data fetching
	const analyticsData = useAnalytics(apiKey, autoRefresh, refreshInterval);
	const blacklistData = useBlacklist(apiKey);
	const blockedValidationsData = useBlockedValidations(apiKey, 100);

	const filters: UseSubmissionsFilters = {
		searchQuery,
		selectedCountries,
		botScoreRange,
		dateRange,
		allowedStatus,
	};
	const submissionsData = useSubmissions(apiKey, filters, pagination, sorting);

	// API key handlers
	const handleApiKeySubmit = () => {
		if (!apiKeyInput.trim()) {
			setApiKeyError('Please enter an API key');
			return;
		}
		localStorage.setItem('analytics-api-key', apiKeyInput);
		setApiKey(apiKeyInput);
		setShowApiKeyDialog(false);
		setApiKeyError(null);
	};

	// Submission detail handler
	const loadSubmissionDetail = async (id: number) => {
		setModalLoading(true);
		const headers: HeadersInit = apiKey ? { 'X-API-KEY': apiKey } : {};
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
			setSelectedSubmission((data as any).data);
		} catch (err) {
			console.error('Error loading submission details:', err);
			alert('Failed to load submission details');
		} finally {
			setModalLoading(false);
		}
	};

	// Export handler
	const handleExport = async (format: 'csv' | 'json') => {
		if (!apiKey) return;

		const headers = { 'X-API-KEY': apiKey };

		try {
			const params = new URLSearchParams();
			params.append('format', format);

			// Add sorting
			if (sorting.length > 0) {
				params.append('sortBy', sorting[0].id);
				params.append('sortOrder', sorting[0].desc ? 'desc' : 'asc');
			}

			// Add filters
			if (searchQuery.trim()) {
				params.append('search', searchQuery.trim());
			}
			if (selectedCountries.length > 0) {
				params.append('countries', selectedCountries.join(','));
			}
			if (botScoreRange[0] !== 0 || botScoreRange[1] !== 100) {
				params.append('botScoreMin', botScoreRange[0].toString());
				params.append('botScoreMax', botScoreRange[1].toString());
			}
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

			const blob = await res.blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `submissions-${new Date().toISOString().split('T')[0]}.${format}`;
			document.body.appendChild(a);
			a.click();
			window.URL.revokeObjectURL(url);
			document.body.removeChild(a);
		} catch (err) {
			console.error('Error exporting data:', err);
			alert('Failed to export data');
		}
	};

	// Refresh handler
	const handleRefresh = () => {
		analyticsData.refresh();
		submissionsData.refresh();
		blacklistData.refresh();
		blockedValidationsData.refresh();
	};

	// Clear filters handler
	const handleClearFilters = () => {
		setSearchQuery('');
		setSelectedCountries([]);
		setBotScoreRange([0, 100]);
		setAllowedStatus('all');
		setDateRange({
			start: subDays(new Date(), 30),
			end: new Date(),
		});
	};

	// Check if filters are active
	const hasActiveFilters =
		searchQuery.trim() !== '' ||
		selectedCountries.length > 0 ||
		botScoreRange[0] !== 0 ||
		botScoreRange[1] !== 100 ||
		allowedStatus !== 'all' ||
		dateRange.start.getTime() !== subDays(new Date(), 30).setHours(0, 0, 0, 0) ||
		dateRange.end.getTime() !== new Date().setHours(23, 59, 59, 999);

	// Loading and error states
	if (analyticsData.loading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<p className="text-muted-foreground">Loading analytics...</p>
			</div>
		);
	}

	if (analyticsData.error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{analyticsData.error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<>
			{/* API Key Dialog */}
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
								className="w-full px-4 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							/>
							{apiKeyError && (
								<p className="text-sm text-destructive">{apiKeyError}</p>
							)}
						</div>
						<button
							onClick={handleApiKeySubmit}
							className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
						>
							Submit
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Main Dashboard */}
			<div className="space-y-6">
				<GlobalControlsBar
					onExportCSV={() => handleExport("csv")}
				onExportJSON={() => handleExport("json")}
					onManualRefresh={handleRefresh}
					autoRefresh={autoRefresh}
					onAutoRefreshChange={setAutoRefresh}
					refreshInterval={refreshInterval}
					onRefreshIntervalChange={setRefreshInterval}
					hasActiveFilters={hasActiveFilters}
					onClearFilters={handleClearFilters}
					isLoading={analyticsData.loading || submissionsData.loading}
				/>

				<OverviewStats stats={analyticsData.stats} />

				<FraudAlert data={analyticsData.fraudPatterns} loading={analyticsData.loading} />

				<RecentSubmissionsSection
					submissions={submissionsData.submissions}
					totalCount={submissionsData.totalCount}
					countries={analyticsData.countries}
					loading={submissionsData.loading}
					onLoadDetail={loadSubmissionDetail}
					searchQuery={searchQuery}
					onSearchQueryChange={setSearchQuery}
					selectedCountries={selectedCountries}
					onSelectedCountriesChange={setSelectedCountries}
					botScoreRange={botScoreRange}
					onBotScoreRangeChange={setBotScoreRange}
					allowedStatus={allowedStatus}
					onAllowedStatusChange={setAllowedStatus}
					dateRange={dateRange}
					onDateRangeChange={setDateRange}
					pagination={pagination}
					onPaginationChange={setPagination}
					sorting={sorting}
					onSortingChange={setSorting}
				/>

				<SecurityEvents
					activeBlocks={blacklistData.entries}
					recentDetections={blockedValidationsData.validations}
				/>


				<ChartsSection
					timeSeriesData={analyticsData.timeSeriesData}
					countries={analyticsData.countries}
					botScores={analyticsData.botScores}
					asnData={analyticsData.asnData}
					tlsData={analyticsData.tlsData}
					ja3Data={analyticsData.ja3Data}
					ja4Data={analyticsData.ja4Data}
				/>

				<SubmissionDetailDialog
					submission={selectedSubmission}
					loading={modalLoading}
					onClose={() => setSelectedSubmission(null)}
				/>
			</div>
		</>
	);
}
