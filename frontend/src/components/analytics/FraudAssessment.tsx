import { Card, CardHeader, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { AlertTriangle, Calculator, Fingerprint as FingerprintIcon, Info } from 'lucide-react';
import type { FraudDetectionConfig } from '../../hooks/useConfig';

interface RiskComponent {
	score: number;
	weight: number;
	contribution: number;
	reason: string;
}

interface FingerprintDetails {
	headerReuse?: {
		total?: number;
		ipCount?: number;
		ja4Count?: number;
	};
	tlsAnomaly?: {
		ja4Count?: number;
		pairCount?: number;
	};
	latency?: {
		rtt?: number;
		platform?: string;
		deviceType?: string;
		claimedMobile?: boolean;
		suspectAsn?: boolean;
	};
}

interface RiskBreakdown {
	total: number;
	components: {
		tokenReplay?: RiskComponent;
		emailFraud?: RiskComponent;
		ephemeralId?: RiskComponent;
		validationFrequency?: RiskComponent;
		ipDiversity?: RiskComponent;
		ja4SessionHopping?: RiskComponent;
		ipRateLimit?: RiskComponent;
		headerFingerprint?: RiskComponent;
		tlsAnomaly?: RiskComponent;
		latencyMismatch?: RiskComponent;
	};
	fingerprintDetails?: FingerprintDetails;
	fingerprintWarnings?: string[];
}

interface FraudAssessmentProps {
	breakdown: RiskBreakdown;
	config?: FraudDetectionConfig;
}

export function FraudAssessment({ breakdown, config }: FraudAssessmentProps) {
	const { total, components } = breakdown;

	// Use config thresholds or defaults
	const blockThreshold = config?.risk.blockThreshold ?? 70;
	const mediumThreshold = config?.risk.levels.medium.min ?? 40;

	const severity = total >= blockThreshold ? 'destructive' : total >= mediumThreshold ? 'default' : 'secondary';
	const severityColor =
		total >= blockThreshold
			? 'border-red-500 dark:border-red-400'
			: total >= mediumThreshold
			? 'border-yellow-500 dark:border-yellow-400'
			: 'border-green-500 dark:border-green-400';

	const severityText = total >= blockThreshold ? 'HIGH RISK (Blocked)' : total >= mediumThreshold ? 'MEDIUM RISK' : 'LOW RISK';

	return (
		<Card className={`border-l-4 ${severityColor}`}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Calculator className="h-5 w-5" />
							Risk Score Calculation
						</h3>
						<p className="text-xs text-muted-foreground mt-1">
							{severityText} • Threshold: {blockThreshold}/100
						</p>
					</div>
					<Badge variant={severity} className="text-lg font-mono">
						{total}/100
					</Badge>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Overall progress bar */}
				<div>
					<div className="flex justify-between text-sm mb-2">
						<span>Final Risk Score</span>
						<span className="font-mono font-semibold">{total}/100</span>
					</div>
					<Progress value={total} className="h-3" />
				</div>

				{/* Calculation Formula */}
				<div className="space-y-3">
					<div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
						<Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
						<div>
							<p className="font-medium mb-1">How risk scores are calculated:</p>
							<p>Each component contributes: <span className="font-mono">Score × Weight = Contribution</span></p>
							<p className="mt-1">Final score = Sum of all contributions (max 100)</p>
							<p className="mt-1">
								<strong>Blocking rules:</strong> Token replay & Turnstile failures always block. Email/ephemeral/validation/JA4 can floor the score in
								defensive mode. IP rate limit is behavioral only. Fingerprint signals are attribution triggers — they still need the total to reach the threshold.
							</p>
						</div>
					</div>

					<h4 className="font-semibold text-sm">Component Breakdown:</h4>

					{/* Show ALL components in order, including zeros */}
			{getOrderedComponents(components).map(([key, component]) =>
				component ? (
					<ComponentCard
						key={key}
						id={key}
						component={component}
					/>
				) : null
			)}

					{renderFingerprintInsights(breakdown, config)}

					{/* Total calculation */}
					<div className="border-t-2 border-gray-300 dark:border-gray-700 pt-3 mt-3">
						<div className="flex items-center justify-between font-semibold">
							<span className="text-sm">Total Risk Score:</span>
							<span className="font-mono text-lg">{total}/100</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function ComponentCard({ id, component }: { id: string; component: RiskComponent }) {
	const hasScore = component.score > 0;

	const color = hasScore
		? component.score >= 70
			? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
			: component.score >= 40
			? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950'
			: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950'
		: 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50';

	return (
		<div className={`border rounded-lg p-3 ${color} ${!hasScore && 'opacity-60'}`}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<span className="font-medium text-sm">{formatComponentName(id, component)}</span>
						{!hasScore && <Badge variant="secondary" className="text-xs">Not Triggered</Badge>}
					</div>
					<div className="text-xs text-muted-foreground mb-2">
						{component.reason}
					</div>

					{/* Calculation formula */}
					<div className="font-mono text-xs bg-white/50 dark:bg-black/20 rounded px-2 py-1 border border-gray-200 dark:border-gray-700">
						<span className={hasScore ? 'font-semibold' : ''}>{component.score}</span>
						{' × '}
						<span>{(component.weight * 100).toFixed(0)}%</span>
						{' = '}
						<span className={hasScore ? 'font-semibold text-base' : ''}>
							{component.contribution.toFixed(2)} pts
						</span>
					</div>
				</div>

				<Badge variant={hasScore ? "default" : "outline"} className="font-mono flex-shrink-0">
					{component.score}/100
				</Badge>
			</div>
		</div>
	);
}

function getOrderedComponents(components: RiskBreakdown['components']): [string, RiskComponent | undefined][] {
	// Return components in a fixed order for consistency
	const order = [
		'tokenReplay',
		'emailFraud',
		'ephemeralId',
		'validationFrequency',
		'ipDiversity',
		'ja4SessionHopping',
		'ipRateLimit',
		'headerFingerprint',
		'tlsAnomaly',
		'latencyMismatch',
	];

	return order.map(key => [key, components[key as keyof typeof components]] as [string, RiskComponent | undefined]);
}

function formatComponentName(key: string, component: RiskComponent): string {
	const names: Record<string, string> = {
		tokenReplay: 'Token Replay',
		emailFraud: 'Email Fraud',
		ephemeralId: 'Device Tracking',
		validationFrequency: 'Validation Frequency',
		ipDiversity: 'IP Diversity',
		ja4SessionHopping: 'Session Hopping',
		ipRateLimit: 'IP Rate Limit',
		headerFingerprint: 'Header Fingerprint Reuse',
		tlsAnomaly: 'TLS Fingerprint Anomaly',
		latencyMismatch: 'Latency / Device Mismatch',
	};
	const label = names[key] || key;
	const weightPercent = (component.weight * 100).toFixed(0);
	return `${label} (${weightPercent}%)`;
}

function renderFingerprintInsights(breakdown: RiskBreakdown, config?: FraudDetectionConfig) {
	const details = breakdown.fingerprintDetails;
	const warnings = breakdown.fingerprintWarnings || [];
	const hasDetails = details && Object.values(details).some(Boolean);

	if (!hasDetails && warnings.length === 0) {
		return null;
	}

	const headerTriggered = (breakdown.components.headerFingerprint?.score ?? 0) > 0;
	const tlsTriggered = (breakdown.components.tlsAnomaly?.score ?? 0) > 0;
	const latencyTriggered = (breakdown.components.latencyMismatch?.score ?? 0) > 0;

	const headerConfig = config?.fingerprint.headerReuse;
	const tlsConfig = config?.fingerprint.tlsAnomaly;
	const latencyConfig = config?.fingerprint.latency;

	return (
		<div className="space-y-3 border-t border-border/70 pt-3 mt-4">
			<div className="flex items-center gap-2 text-sm font-semibold">
				<FingerprintIcon className="h-4 w-4 text-primary" />
				<span>Fingerprint Insights</span>
			</div>

			{warnings.length > 0 && (
				<div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-3">
					<AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
					<ul className="space-y-1 list-disc pl-4">
						{warnings.map((warning, idx) => (
							<li key={`fp-warning-${idx}`}>{warning}</li>
						))}
					</ul>
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{details?.headerReuse && (
					<div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2">
						<div className="flex items-center justify-between text-sm font-semibold text-foreground">
							<span>Header Fingerprint Reuse</span>
							<Badge variant={headerTriggered ? 'destructive' : 'secondary'}>
								{headerTriggered ? 'Triggered' : 'Learning'}
							</Badge>
						</div>
						<div className="grid grid-cols-3 gap-2 text-muted-foreground">
							<div>
								<p className="text-base font-semibold text-foreground">{details.headerReuse.total ?? 0}</p>
								<p>Requests ({headerConfig?.windowMinutes ?? 60}m)</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">{details.headerReuse.ipCount ?? 0}</p>
								<p>Unique IPs</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">{details.headerReuse.ja4Count ?? 0}</p>
								<p>Unique JA4</p>
							</div>
						</div>
						{headerConfig && (
							<p className="text-[11px] text-muted-foreground">
								Threshold: ≥{headerConfig.minRequests} requests across ≥{headerConfig.minDistinctIps} IPs and ≥{headerConfig.minDistinctJa4} JA4 fingerprints.
							</p>
						)}
					</div>
				)}

				{details?.tlsAnomaly && (
					<div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2">
						<div className="flex items-center justify-between text-sm font-semibold text-foreground">
							<span>TLS Fingerprint Baseline</span>
							<Badge variant={tlsTriggered ? 'destructive' : 'secondary'}>
								{tlsTriggered ? 'Mismatch' : 'Baseline'}
							</Badge>
						</div>
						<div className="grid grid-cols-2 gap-2 text-muted-foreground">
							<div>
								<p className="text-base font-semibold text-foreground">
									{details.tlsAnomaly.ja4Count !== undefined && details.tlsAnomaly.ja4Count >= 0
										? details.tlsAnomaly.ja4Count
										: 'Cached'}
								</p>
								<p>{details.tlsAnomaly.ja4Count === -1 ? 'Baseline stored' : 'JA4 samples (24h)'}</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">
									{details.tlsAnomaly.pairCount ?? '—'}
								</p>
								<p>Matching TLS pairs</p>
							</div>
						</div>
						{tlsConfig && (
							<p className="text-[11px] text-muted-foreground">
								Requires ≥{tlsConfig.minJa4Observations} JA4 observations in the last {tlsConfig.baselineHours}h before anomaly checks enforce.
							</p>
						)}
					</div>
				)}

				{details?.latency && (
					<div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-2 md:col-span-2">
						<div className="flex items-center justify-between text-sm font-semibold text-foreground">
							<span>Latency vs. Device Claim</span>
							<Badge variant={latencyTriggered ? 'destructive' : 'secondary'}>
								{latencyTriggered ? 'Mismatch' : 'Consistent'}
							</Badge>
						</div>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-muted-foreground">
							<div>
								<p className="text-base font-semibold text-foreground">
									{typeof details.latency.rtt === 'number' ? `${details.latency.rtt}ms` : 'N/A'}
								</p>
								<p>Client RTT</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">{details.latency.platform || 'Unknown'}</p>
								<p>Reported Platform</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">{details.latency.deviceType || 'Unknown'}</p>
								<p>Device Type</p>
							</div>
							<div>
								<p className="text-base font-semibold text-foreground">
									{details.latency.claimedMobile ? 'Yes' : 'No'}
								</p>
								<p>Claims Mobile</p>
							</div>
						</div>
						{latencyConfig && (
							<p className="text-[11px] text-muted-foreground">
								Mobile claims must exceed {latencyConfig.mobileRttThresholdMs}ms RTT unless device type reports mobile hardware. Datacenter ASN flagged: {details.latency.suspectAsn ? 'Yes' : 'No'}.
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
