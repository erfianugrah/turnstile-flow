import { Card, CardHeader, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import type { FraudDetectionConfig } from '../../hooks/useConfig';

const DEFAULT_JA4_WEIGHT = 0.06;

interface JA4Signals {
	ips_quantile_1h?: number;
	ips_rank_1h?: number;
	reqs_quantile_1h?: number;
	reqs_rank_1h?: number;
	heuristic_ratio_1h?: number;
	browser_ratio_1h?: number;
	h2h3_ratio_1h?: number;
	cache_ratio_1h?: number;
	uas_rank_1h?: number;
	paths_rank_1h?: number;
}

interface JA4SignalsDetailProps {
	signals: JA4Signals;
	ja4Fingerprint: string;
	config?: FraudDetectionConfig;
}

export function JA4SignalsDetail({ signals, ja4Fingerprint, config }: JA4SignalsDetailProps) {
	// Use config thresholds or defaults
	const ipsThreshold = config?.ja4.ipsQuantileThreshold ?? 0.95;
	const reqsThreshold = config?.ja4.reqsQuantileThreshold ?? 0.99;
	const heuristicThreshold = config?.ja4.heuristicRatioThreshold ?? 0.8;
	const browserThreshold = config?.ja4.browserRatioThreshold ?? 0.2;
	const h2h3Threshold = config?.ja4.h2h3RatioThreshold ?? 0.9;
	const cacheThreshold = config?.ja4.cacheRatioThreshold ?? 0.5;
	const ja4WeightPercent = Math.round(((config?.risk.weights.ja4SessionHopping ?? DEFAULT_JA4_WEIGHT) * 100));

	if (!signals || Object.keys(signals).length === 0) {
		return (
			<Card>
				<CardHeader>
					<h4 className="text-sm font-semibold">JA4 Signals</h4>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">No JA4 signals available</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
				<CardHeader>
					<h4 className="text-sm font-semibold">JA4 Intelligence (Cloudflare Global)</h4>
					<p className="text-xs text-muted-foreground font-mono break-all">{ja4Fingerprint}</p>
					<p className="text-xs text-muted-foreground mt-1">
						1-hour Cloudflare telemetry feeds the Session Hopping component ({ja4WeightPercent}% weight) and seeds the fingerprint baseline cache used by the TLS/header anomaly detectors.
					</p>
				</CardHeader>
			<CardContent className="space-y-3">
				{/* Critical signals used in fraud detection */}
				<div className="space-y-2">
					<h5 className="text-xs font-semibold text-muted-foreground uppercase">
						Active Detection Signals
					</h5>

					<SignalRow
						label="IP Diversity (Global)"
						value={signals.ips_quantile_1h}
						threshold={ipsThreshold}
						description="This JA4 is used by many different IPs globally. High values can indicate popular browser OR proxy/bot networks."
						format="percentile"
						used={true}
					/>

					<SignalRow
						label="Request Volume (Global)"
						value={signals.reqs_quantile_1h}
						threshold={reqsThreshold}
						description="This JA4 generates high request volume globally. Can indicate popular browser OR bot networks."
						format="percentile"
						used={true}
					/>
				</div>

				{/* Global rankings */}
				<div className="space-y-2">
					<h5 className="text-xs font-semibold text-muted-foreground uppercase">
						Global Rankings (Cloudflare 1h)
					</h5>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						<RankRow
							label="IP Diversity Rank"
							value={signals.ips_rank_1h}
							description="Lower rank ⇒ more IPs globally share this JA4."
						/>
						<RankRow
							label="Request Volume Rank"
							value={signals.reqs_rank_1h}
							description="Lower rank ⇒ higher global volume."
						/>
						<RankRow
							label="UA Diversity Rank"
							value={signals.uas_rank_1h}
							description="Tracks how many UA strings present this JA4."
						/>
						<RankRow
							label="Path Diversity Rank"
							value={signals.paths_rank_1h}
							description="Measures path spread; low values usually automation."
						/>
					</div>
				</div>

				{/* Optional signals (captured but not used) */}
				<div className="space-y-2">
					<h5 className="text-xs font-semibold text-muted-foreground uppercase">
						Behavioral Signals (Monitoring)
					</h5>

					<SignalRow
						label="Heuristic Ratio"
						value={signals.heuristic_ratio_1h}
						threshold={heuristicThreshold}
						description="Ratio of heuristic bot detections. High values indicate bot-like behavior."
						format="percentage"
						used={false}
					/>

					<SignalRow
						label="Browser Ratio"
						value={signals.browser_ratio_1h}
						threshold={browserThreshold}
						description="Ratio of browser-like requests. Low values may indicate automation."
						format="percentage"
						used={false}
					/>

					<SignalRow
						label="HTTP/2-3 Ratio"
						value={signals.h2h3_ratio_1h}
						threshold={h2h3Threshold}
						description="Ratio of HTTP/2 and HTTP/3 requests. Unusual values may indicate custom clients."
						format="percentage"
						used={false}
					/>

					<SignalRow
						label="Cache Ratio"
						value={signals.cache_ratio_1h}
						threshold={cacheThreshold}
						description="Ratio of cached responses. Very low values may indicate scraping."
						format="percentage"
						used={false}
					/>
				</div>

				<div className="flex items-start gap-2 p-3 rounded-md border border-border/60 bg-muted/30 text-xs">
					<Info className="h-4 w-4 mt-0.5 text-primary" />
					<p>
						Known-good JA4 + TLS combinations are cached so repeat traffic skips anomaly checks. New or suspicious combos bypass the cache and
						contribute to the fingerprint risk components immediately.
					</p>
				</div>
			</CardContent>
		</Card>
	);
}

interface SignalRowProps {
	label: string;
	value: number | undefined;
	threshold: number;
	description: string;
	format: 'percentile' | 'percentage';
	used: boolean;
}

function SignalRow({ label, value, threshold, description, format, used }: SignalRowProps) {
	if (value === undefined || value === null) {
		return (
			<div className="flex items-start gap-2 p-2 rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
				<div className="flex-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">{label}</span>
						{used && <Badge variant="outline" className="text-xs">Active</Badge>}
					</div>
					<p className="text-xs text-muted-foreground mt-1">{description}</p>
					<p className="text-xs text-muted-foreground mt-1">Value: N/A</p>
				</div>
			</div>
		);
	}

	const isHigh = value >= threshold;
	const icon = isHigh ? (
		<AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
	) : (
		<CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
	);

	const displayValue =
		format === 'percentile'
			? `${(value * 100).toFixed(1)}th percentile`
			: `${(value * 100).toFixed(1)}%`;

	return (
		<div
			className={`flex items-start gap-2 p-2 rounded border ${
				isHigh
					? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950'
					: 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900'
			}`}
		>
			{icon}
			<div className="flex-1">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">{label}</span>
					{used && <Badge variant="outline" className="text-xs">Active</Badge>}
				</div>
				<p className="text-xs text-muted-foreground mt-1">{description}</p>
				<p className="text-xs font-mono mt-1">
					Value: <span className="font-semibold">{displayValue}</span>
				</p>
			</div>
		</div>
	);
}

function RankRow({
	label,
	value,
	description,
}: {
	label: string;
	value: number | undefined;
	description: string;
}) {
	return (
		<div className="p-2 rounded border border-border/60 bg-muted/40">
			<div className="flex items-center justify-between">
				<span className="text-sm font-medium">{label}</span>
				<Badge variant="outline" className="text-xs">
					Rank
				</Badge>
			</div>
			<p className="text-xs text-muted-foreground mt-1">{description}</p>
			<p className="text-xs font-mono mt-1">
				Value:{' '}
				<span className="font-semibold">
					{typeof value === 'number' ? `#${value}` : 'N/A'}
				</span>
			</p>
		</div>
	);
}
