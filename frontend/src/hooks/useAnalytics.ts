import { useState, useEffect } from 'react';

export interface ValidationStats {
	total: number;
	successful: number;
	allowed: number;
	avg_risk_score: number;
	unique_ephemeral_ids: number;
}

export interface BlockedStats {
	total_blocked: number;
	unique_ephemeral_ids: number;
	unique_ips: number;
	avg_risk_score: number;
	unique_block_reasons: number;
}

export interface BlockReason {
	block_reason: string;
	count: number;
	unique_ephemeral_ids: number;
	unique_ips: number;
	avg_risk_score: number;
}

export interface CountryData {
	country: string;
	count: number;
}

export interface BotScoreData {
	score_range: string;
	count: number;
}

export interface AsnData {
	asn: string;
	as_organization: string | null;
	count: number;
}

export interface TlsData {
	tls_version: string;
	tls_cipher: string | null;
	count: number;
}

export interface Ja3Data {
	ja3_hash: string;
	count: number;
}

export interface Ja4Data {
	ja4: string;
	count: number;
}

export interface UseAnalyticsReturn {
	stats: ValidationStats | null;
	countries: CountryData[];
	botScores: BotScoreData[];
	asnData: AsnData[];
	tlsData: TlsData[];
	ja3Data: Ja3Data[];
	ja4Data: Ja4Data[];
	timeSeriesData: any[];
	blockedStats: BlockedStats | null;
	blockReasons: BlockReason[];
	fraudPatterns: any;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

export function useAnalytics(apiKey: string, autoRefresh = false, refreshInterval = 30): UseAnalyticsReturn {
	const [stats, setStats] = useState<ValidationStats | null>(null);
	const [countries, setCountries] = useState<CountryData[]>([]);
	const [botScores, setBotScores] = useState<BotScoreData[]>([]);
	const [asnData, setAsnData] = useState<AsnData[]>([]);
	const [tlsData, setTlsData] = useState<TlsData[]>([]);
	const [ja3Data, setJa3Data] = useState<Ja3Data[]>([]);
	const [ja4Data, setJa4Data] = useState<Ja4Data[]>([]);
	const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
	const [blockedStats, setBlockedStats] = useState<BlockedStats | null>(null);
	const [blockReasons, setBlockReasons] = useState<BlockReason[]>([]);
	const [fraudPatterns, setFraudPatterns] = useState<any>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const loadData = async () => {
		if (!apiKey) return;

		setLoading(true);
		setError(null);

		const headers: HeadersInit = { 'X-API-KEY': apiKey };

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
				blockedStatsRes,
				blockReasonsRes,
			] = await Promise.all([
				fetch('/api/analytics/stats', { headers }),
				fetch('/api/analytics/countries', { headers }),
				fetch('/api/analytics/bot-scores', { headers }),
				fetch('/api/analytics/asn', { headers }),
				fetch('/api/analytics/tls', { headers }),
				fetch('/api/analytics/ja3', { headers }),
				fetch('/api/analytics/ja4', { headers }),
				fetch('/api/analytics/time-series?metric=submissions&interval=day', { headers }),
				fetch('/api/analytics/blocked-stats', { headers }),
				fetch('/api/analytics/block-reasons', { headers }),
			]);

			if (
				!statsRes.ok ||
				!countriesRes.ok ||
				!botScoresRes.ok ||
				!asnRes.ok ||
				!tlsRes.ok ||
				!ja3Res.ok ||
				!ja4Res.ok ||
				!timeSeriesRes.ok
			) {
				throw new Error('Failed to fetch analytics');
			}

			const [
				statsData,
				countriesData,
				botScoresData,
				asnDataRes,
				tlsDataRes,
				ja3DataRes,
				ja4DataRes,
				timeSeriesDataRes,
				blockedStatsData,
				blockReasonsData,
			] = await Promise.all([
				statsRes.json(),
				countriesRes.json(),
				botScoresRes.json(),
				asnRes.json(),
				tlsRes.json(),
				ja3Res.json(),
				ja4Res.json(),
				timeSeriesRes.json(),
				blockedStatsRes.json(),
				blockReasonsRes.json(),
			]);

			setStats((statsData as any).data);
			setCountries((countriesData as any).data);
			setBotScores((botScoresData as any).data);
			setAsnData((asnDataRes as any).data);
			setTlsData((tlsDataRes as any).data);
			setJa3Data((ja3DataRes as any).data);
			setJa4Data((ja4DataRes as any).data);
			setTimeSeriesData((timeSeriesDataRes as any).data || []);
			setBlockedStats((blockedStatsData as any).data);
			setBlockReasons((blockReasonsData as any).data);

			// Load fraud patterns separately
			try {
				const fraudRes = await fetch('/api/analytics/fraud-patterns', { headers });
				if (fraudRes.ok) {
					const fraudDataRes = await fraudRes.json();
					setFraudPatterns((fraudDataRes as any).data);
				}
			} catch (err) {
				console.error('Error loading fraud patterns:', err);
			}
		} catch (err) {
			console.error('Error loading analytics:', err);
			setError('Failed to load analytics data');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadData();
	}, [apiKey]);

	// Auto-refresh
	useEffect(() => {
		if (!autoRefresh || !apiKey) return;

		const intervalId = setInterval(loadData, refreshInterval * 1000);
		return () => clearInterval(intervalId);
	}, [autoRefresh, refreshInterval, apiKey]);

	return {
		stats,
		countries,
		botScores,
		asnData,
		tlsData,
		ja3Data,
		ja4Data,
		timeSeriesData,
		blockedStats,
		blockReasons,
		fraudPatterns,
		loading,
		error,
		refresh: loadData,
	};
}
