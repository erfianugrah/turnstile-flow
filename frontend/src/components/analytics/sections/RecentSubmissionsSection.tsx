import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { SearchBar } from '../filters/SearchBar';
import { DateRangePicker } from '../filters/DateRangePicker';
import { MultiSelect } from '../filters/MultiSelect';
import { SingleSelect } from '../filters/SingleSelect';
import { RangeSlider } from '../filters/RangeSlider';
import { DataTable } from '../tables/DataTable';
import { createSubmissionColumns } from '../tables/columns';
import { RiskScoreInfo } from '../RiskScoreInfo';
import { subDays } from 'date-fns';
import type { CountryData } from '../../../hooks/useAnalytics';
import type { Submission } from '../../../hooks/useSubmissions';
import type { PaginationState, SortingState } from '@tanstack/react-table';

interface RecentSubmissionsSectionProps {
	submissions: Submission[];
	totalCount: number;
	countries: CountryData[];
	loading: boolean;
	onLoadDetail: (id: number) => void;
	// Filter states
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
	selectedCountries: string[];
	onSelectedCountriesChange: (countries: string[]) => void;
	botScoreRange: [number, number];
	onBotScoreRangeChange: (range: [number, number]) => void;
	allowedStatus: 'all' | 'allowed' | 'blocked';
	onAllowedStatusChange: (status: 'all' | 'allowed' | 'blocked') => void;
	dateRange: { start: Date; end: Date };
	onDateRangeChange: (range: { start: Date; end: Date }) => void;
	// Pagination/sorting states
	pagination: PaginationState;
	onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
	sorting: SortingState;
	onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
}

export function RecentSubmissionsSection({
	submissions,
	totalCount,
	countries,
	loading,
	onLoadDetail,
	searchQuery,
	onSearchQueryChange,
	selectedCountries,
	onSelectedCountriesChange,
	botScoreRange,
	onBotScoreRangeChange,
	allowedStatus,
	onAllowedStatusChange,
	dateRange,
	onDateRangeChange,
	pagination,
	onPaginationChange,
	sorting,
	onSortingChange,
}: RecentSubmissionsSectionProps) {
	const columns = createSubmissionColumns(onLoadDetail);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Submissions</CardTitle>
				<CardDescription>
					Search and filter form submissions (click row for full details)
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Risk Score Info */}
				<RiskScoreInfo />

				{/* Filters */}
				<div className="space-y-5">
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
						<SearchBar
							value={searchQuery}
							onChange={onSearchQueryChange}
							placeholder="Search by email, name, or IP..."
						/>
						<SingleSelect
							options={[
								{ value: 'all', label: 'All Submissions' },
							{ value: 'allowed', label: 'Allowed Only' },
							{ value: 'blocked', label: 'Blocked Only' },
							]}
							value={allowedStatus}
							onChange={(value) => onAllowedStatusChange(value as 'all' | 'allowed' | 'blocked')}
							placeholder="Filter by status..."
						/>
						<MultiSelect
							options={countries.map((c) => ({ value: c.country, label: c.country }))}
							value={selectedCountries}
							onChange={onSelectedCountriesChange}
							placeholder="Filter by countries..."
						/>
						<DateRangePicker value={dateRange} onChange={onDateRangeChange} />
					</div>
					<div className="w-full max-w-2xl">
						<RangeSlider
							min={0}
							max={100}
							value={botScoreRange}
							onChange={onBotScoreRangeChange}
							label="Bot Score Range"
							step={1}
						/>
					</div>
				</div>

				{/* Data Table */}
				{loading ? (
					<div className="flex items-center justify-center py-16">
						<p className="text-muted-foreground">Loading submissions...</p>
					</div>
				) : (
					<DataTable
						data={submissions}
						columns={columns}
						totalCount={totalCount}
						manualPagination={true}
						manualSorting={true}
						pagination={pagination}
						sorting={sorting}
						onPaginationChange={onPaginationChange}
						onSortingChange={onSortingChange}
					/>
				)}
			</CardContent>
		</Card>
	);
}
