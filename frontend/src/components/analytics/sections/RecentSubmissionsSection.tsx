import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { SearchBar } from '../filters/SearchBar';
import { DateRangePicker } from '../filters/DateRangePicker';
import { MultiSelect } from '../filters/MultiSelect';
import { RangeSlider } from '../filters/RangeSlider';
import { DataTable } from '../tables/DataTable';
import { createSubmissionColumns } from '../tables/columns';
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
			<CardContent className="space-y-4">
				{/* Filters */}
				<div className="space-y-4">
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<SearchBar
							value={searchQuery}
							onChange={onSearchQueryChange}
							placeholder="Search by email, name, or IP..."
						/>
						<MultiSelect
							options={countries.map((c) => ({ value: c.country, label: c.country }))}
							value={selectedCountries}
							onChange={onSelectedCountriesChange}
							placeholder="Filter by countries..."
						/>
						<DateRangePicker value={dateRange} onChange={onDateRangeChange} />
					</div>
					<div className="w-full">
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
						onPaginationChange={onPaginationChange}
						onSortingChange={onSortingChange}
					/>
				)}
			</CardContent>
		</Card>
	);
}
