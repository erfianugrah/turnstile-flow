import { useState, useEffect } from 'react';
import type { PaginationState, SortingState } from '@tanstack/react-table';

export interface Submission {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	country: string | null;
	city: string | null;
	bot_score: number | null;
	created_at: string;
	remote_ip?: string | null;
	user_agent?: string | null;
	tls_version?: string | null;
	asn?: string | null;
	ja3_hash?: string | null;
	ephemeral_id?: string | null;
}

export interface UseSubmissionsFilters {
	searchQuery: string;
	selectedCountries: string[];
	botScoreRange: [number, number];
	dateRange: { start: Date; end: Date };
	allowedStatus: 'all' | 'allowed' | 'blocked';
}

export interface UseSubmissionsReturn {
	submissions: Submission[];
	totalCount: number;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useSubmissions(
	apiKey: string,
	filters: UseSubmissionsFilters,
	pagination: PaginationState,
	sorting: SortingState
): UseSubmissionsReturn {
	const [submissions, setSubmissions] = useState<Submission[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadData = async () => {
		if (!apiKey) return;

		setLoading(true);
		setError(null);

		const headers: HeadersInit = { 'X-API-KEY': apiKey };

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
			if (filters.searchQuery.trim()) {
				params.append('search', filters.searchQuery.trim());
			}

			// Add countries filter
			if (filters.selectedCountries.length > 0) {
				params.append('countries', filters.selectedCountries.join(','));
			}

			// Add bot score range filter
			if (filters.botScoreRange[0] !== 0 || filters.botScoreRange[1] !== 100) {
				params.append('botScoreMin', filters.botScoreRange[0].toString());
				params.append('botScoreMax', filters.botScoreRange[1].toString());
			}

			// Add date range
			params.append('startDate', filters.dateRange.start.toISOString());
			params.append('endDate', filters.dateRange.end.toISOString());

			// Add allowed status filter
			if (filters.allowedStatus === 'allowed') {
				params.append('allowed', 'true');
			} else if (filters.allowedStatus === 'blocked') {
				params.append('allowed', 'false');
			}
			// 'all' means no filter

			const res = await fetch(`/api/analytics/submissions?${params.toString()}`, { headers });

			if (!res.ok) {
				throw new Error('Failed to fetch submissions');
			}

			const data = await res.json();
			setSubmissions((data as any).data);
			setTotalCount((data as any).total || 0);
		} catch (err) {
			console.error('Error loading submissions:', err);
			setError('Failed to load submissions');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [
		apiKey,
		filters.searchQuery,
		filters.selectedCountries.join(','),
		filters.botScoreRange.join(','),
		filters.dateRange.start.toISOString(),
		filters.dateRange.end.toISOString(),
		filters.allowedStatus,
		pagination.pageIndex,
		pagination.pageSize,
		sorting.length > 0 ? sorting[0].id : '',
		sorting.length > 0 ? (sorting[0].desc ? 'desc' : 'asc') : '',
	]);

	return {
		submissions,
		totalCount,
		loading,
		error,
		refresh: loadData,
	};
}
