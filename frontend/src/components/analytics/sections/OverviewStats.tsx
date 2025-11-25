import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import type { ValidationStats } from '../../../hooks/useAnalytics';

interface OverviewStatsProps {
	stats: ValidationStats | null;
}

// Helper to get status color and text based on metric value
function getAllowedRateStatus(rate: number): { color: string; status: string } {
	if (rate >= 90) return { color: 'text-green-600 dark:text-green-400', status: 'Excellent' };
	if (rate >= 70) return { color: 'text-yellow-600 dark:text-yellow-400', status: 'Good' };
	return { color: 'text-red-600 dark:text-red-400', status: 'Low' };
}

function getRiskScoreStatus(score: number): { color: string; status: string } {
	if (score < 30) return { color: 'text-green-600 dark:text-green-400', status: 'Low Risk' };
	if (score < 60) return { color: 'text-yellow-600 dark:text-yellow-400', status: 'Medium Risk' };
	return { color: 'text-red-600 dark:text-red-400', status: 'High Risk' };
}

export function OverviewStats({ stats }: OverviewStatsProps) {
	const allowedRate = stats && stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0;
	const avgRiskScore = stats?.avg_risk_score || 0;
	const activeBlacklist = stats?.active_blacklist || 0;
	const highRiskRate = stats && stats.total > 0
		? ((stats.total - stats.allowed) / stats.total) * 100
		: 0;
	const headerBlocks = stats?.header_fingerprint_blocks || 0;
	const tlsBlocks = stats?.tls_anomaly_blocks || 0;
	const latencyBlocks = stats?.latency_mismatch_blocks || 0;
	const fingerprintBlocks = headerBlocks + tlsBlocks + latencyBlocks;

	const allowedStatus = getAllowedRateStatus(allowedRate);
	const riskStatus = getRiskScoreStatus(avgRiskScore);

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 w-full">
			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Total Validations
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">{stats?.total || 0}</div>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Allowed Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">{allowedRate.toFixed(1)}%</div>
					<div className={`flex items-center gap-1 text-xs font-medium mt-1 ${allowedStatus.color}`}>
						{allowedRate >= 85 ? <TrendingUp size={14} /> : allowedRate < 70 ? <TrendingDown size={14} /> : null}
						<span className="truncate">{allowedStatus.status}</span>
					</div>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Avg Risk Score
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">{avgRiskScore.toFixed(1)}</div>
					<div className={`flex items-center gap-1 text-xs font-medium mt-1 ${riskStatus.color}`}>
						{avgRiskScore < 40 ? <TrendingDown size={14} /> : avgRiskScore > 60 ? <TrendingUp size={14} /> : null}
						<span className="truncate">{riskStatus.status}</span>
					</div>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground break-words" title="Active Blacklist">
						Active Blacklist
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold text-destructive">
						{activeBlacklist}
					</div>
					<p className="text-xs text-muted-foreground mt-1 break-words">
						Currently timed out users
					</p>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground break-words" title="High Risk Rate">
						High Risk Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold text-destructive">
						{highRiskRate.toFixed(1)}%
					</div>
					<p className="text-xs text-muted-foreground mt-1 break-words">
						Validations with elevated risk
					</p>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground break-words" title="Fingerprint Blocks">
						Fingerprint Blocks
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className={`text-3xl font-bold ${fingerprintBlocks > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
						{fingerprintBlocks}
					</div>
					<div className="text-xs text-muted-foreground mt-2 space-y-1">
						<div>Header reuse: <span className="font-semibold">{headerBlocks}</span></div>
						<div>TLS anomaly: <span className="font-semibold">{tlsBlocks}</span></div>
						<div>Latency mismatch: <span className="font-semibold">{latencyBlocks}</span></div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
