import { useState, useEffect } from 'react';

export interface BlockedValidation {
	id: number;
	ephemeral_id: string | null;
	ip_address: string;
	country: string | null;
	city: string | null;
	block_reason: string;
	risk_score: number;
	challenge_ts: string;
	ja4: string | null;
	detection_type: 'token_replay' | 'ephemeral_id_fraud' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'turnstile_failed' | 'duplicate_email' | 'other' | null;
}

export interface UseBlockedValidationsReturn {
	validations: BlockedValidation[];
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useBlockedValidations(apiKey: string, limit = 100): UseBlockedValidationsReturn {
	const [validations, setValidations] = useState<BlockedValidation[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadData = async () => {
		if (!apiKey) return;

		setLoading(true);
		setError(null);

		const headers: HeadersInit = { 'X-API-KEY': apiKey };

		try {
			const res = await fetch(`/api/analytics/blocked-validations?limit=${limit}`, { headers });

			if (!res.ok) {
				throw new Error('Failed to fetch blocked validations');
			}

			const data = await res.json();
			setValidations((data as any).data || []);
		} catch (err) {
			console.error('Error loading blocked validations:', err);
			setError('Failed to load blocked validations');
			setValidations([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [apiKey, limit]);

	return {
		validations,
		loading,
		error,
		refresh: loadData,
	};
}
