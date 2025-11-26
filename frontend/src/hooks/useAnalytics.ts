import { useState, useEffect } from 'react';

export interface TurnstileEffectivenessEntry {
	success: boolean;
	allowed: boolean;
	testing_bypass: boolean;
	count: number;
	avg_risk_score: number;
	avg_bot_score: number;
}

export interface RiskDistribution {
	low: number;
	medium: number;
	high: number;
	critical: number;
}

export interface VelocityInsights {
	ja4_peak_last_hour: number | null;
	ip_peak_last_hour: number | null;
	avg_submissions_per_ephemeral_day: number | null;
	progressive_timeouts_24h: number | null;
}

export interface ClientHintInstability {
	tracked_ips: number;
	unstable_ips: number;
	avg_ua_variants: number;
	avg_platform_variants: number;
}

export interface ValidationStats {
	total: number;
	successful: number;
	allowed: number;
	avg_risk_score: number;
	unique_ephemeral_ids: number;
	ja4_fraud_blocks: number;
	active_blacklist: number;
	header_fingerprint_blocks?: number;
	tls_anomaly_blocks?: number;
	latency_mismatch_blocks?: number;
	email_fraud?: {
		total_with_email_check: number;
		markov_detected: number;
		ood_detected: number;
		avg_email_risk_score: number;
	};
	turnstile_effectiveness?: TurnstileEffectivenessEntry[];
	risk_distribution?: RiskDistribution;
	client_hint_instability?: ClientHintInstability;
	velocity_insights?: VelocityInsights;
	fingerprint_block_rate?: number;
	testing_bypass_total?: number;
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

export interface EmailPatternData {
	email_pattern_type: string;
	count: number;
	avg_risk_score: number;
	markov_detected_count: number;
}

export interface TimeSeriesPoint {
	timestamp: string;
	value: number;
	count?: number;
}

export interface FingerprintSeries {
	header: TimeSeriesPoint[];
	tls: TimeSeriesPoint[];
	latency: TimeSeriesPoint[];
}

export interface UseAnalyticsReturn {
	stats: ValidationStats | null;
	countries: CountryData[];
	botScores: BotScoreData[];
	asnData: AsnData[];
	tlsData: TlsData[];
	ja3Data: Ja3Data[];
	ja4Data: Ja4Data[];
	emailPatterns: EmailPatternData[];
	timeSeriesData: TimeSeriesPoint[];
	fingerprintSeries: FingerprintSeries;
	testingBypassSeries: TimeSeriesPoint[];
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
	const [emailPatterns, setEmailPatterns] = useState<EmailPatternData[]>([]);
	const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);
	const [fingerprintSeries, setFingerprintSeries] = useState<FingerprintSeries>({
		header: [],
		tls: [],
		latency: [],
	});
	const [testingBypassSeries, setTestingBypassSeries] = useState<TimeSeriesPoint[]>([]);
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
				emailPatternsRes,
				timeSeriesRes,
				fingerprintHeaderRes,
				fingerprintTlsRes,
				fingerprintLatencyRes,
				testingBypassRes,
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
				fetch('/api/analytics/email-patterns', { headers }),
				fetch('/api/analytics/time-series?metric=submissions&interval=day', { headers }),
				fetch('/api/analytics/time-series?metric=fingerprint_header_blocks&interval=day', { headers }),
				fetch('/api/analytics/time-series?metric=fingerprint_tls_blocks&interval=day', { headers }),
				fetch('/api/analytics/time-series?metric=fingerprint_latency_blocks&interval=day', { headers }),
				fetch('/api/analytics/time-series?metric=testing_bypass&interval=day', { headers }),
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
				!timeSeriesRes.ok ||
				!fingerprintHeaderRes.ok ||
				!fingerprintTlsRes.ok ||
				!fingerprintLatencyRes.ok ||
				!testingBypassRes.ok
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
			emailPatternsData,
				timeSeriesDataRes,
				fingerprintHeaderData,
				fingerprintTlsData,
				fingerprintLatencyData,
				testingBypassData,
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
				emailPatternsRes.json(),
				timeSeriesRes.json(),
				fingerprintHeaderRes.json(),
				fingerprintTlsRes.json(),
				fingerprintLatencyRes.json(),
				testingBypassRes.json(),
				blockedStatsRes.json(),
				blockReasonsRes.json(),
			]);

			setStats((statsData as any).data);
			setCountries((countriesData as any).data);
			setBotScores((botScoresData as any).data);
			setAsnData((asnDataRes as any).data);
			setTlsData((tlsDataRes as any).data);
		setEmailPatterns((emailPatternsData as any).data || []);
			setJa3Data((ja3DataRes as any).data);
			setJa4Data((ja4DataRes as any).data);
			setTimeSeriesData((timeSeriesDataRes as any).data || []);
			setFingerprintSeries({
				header: (fingerprintHeaderData as any).data || [],
				tls: (fingerprintTlsData as any).data || [],
				latency: (fingerprintLatencyData as any).data || [],
			});
			setTestingBypassSeries((testingBypassData as any).data || []);
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
			const errorMessage = err instanceof Error
				? err.message
				: 'Failed to load analytics data. Please check your API key and network connection.';
			setError(errorMessage);
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
		emailPatterns,
		timeSeriesData,
		fingerprintSeries,
		testingBypassSeries,
		blockedStats,
		blockReasons,
		fraudPatterns,
		loading,
		error,
		refresh: loadData,
	};
}
