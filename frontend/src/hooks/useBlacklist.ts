import { useState, useEffect } from 'react';

export interface BlacklistEntry {
	id: number;
	ephemeral_id: string | null;
	ip_address: string | null;
	block_reason: string;
	risk_score: number;
	offense_count: number;
	blocked_at: string;
	expires_at: string;
}

export interface UseBlacklistReturn {
	entries: BlacklistEntry[];
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useBlacklist(apiKey: string): UseBlacklistReturn {
	const [entries, setEntries] = useState<BlacklistEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadData = async () => {
		if (!apiKey) return;

		setLoading(true);
		setError(null);

		const headers: HeadersInit = { 'X-API-KEY': apiKey };

		try {
			const res = await fetch('/api/analytics/blacklist', { headers });

			if (!res.ok) {
				throw new Error('Failed to fetch blacklist entries');
			}

			const data = await res.json();
			setEntries((data as any).data || []);
		} catch (err) {
			console.error('Error loading blacklist entries:', err);
			setError('Failed to load blacklist entries');
			setEntries([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [apiKey]);

	return {
		entries,
		loading,
		error,
		refresh: loadData,
	};
}
