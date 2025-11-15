import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import type { ValidationStats } from '../../../hooks/useAnalytics';

interface OverviewStatsProps {
	stats: ValidationStats | null;
}

// Helper to get status color and text based on metric value
function getSuccessRateStatus(rate: number): { color: string; status: string } {
	if (rate >= 95) return { color: 'text-green-600 dark:text-green-400', status: 'Excellent' };
	if (rate >= 80) return { color: 'text-yellow-600 dark:text-yellow-400', status: 'Good' };
	return { color: 'text-red-600 dark:text-red-400', status: 'Low' };
}

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
	const successRate = stats && stats.total > 0 ? (stats.successful / stats.total) * 100 : 0;
	const allowedRate = stats && stats.total > 0 ? (stats.allowed / stats.total) * 100 : 0;
	const avgRiskScore = stats?.avg_risk_score || 0;
	const markovDetected = stats?.email_fraud?.markov_detected || 0;
	const ja4FraudBlocks = stats?.ja4_fraud_blocks || 0;

	const successStatus = getSuccessRateStatus(successRate);
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
						Success Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">{successRate.toFixed(1)}%</div>
					<div className={`flex items-center gap-1 text-xs font-medium mt-1 ${successStatus.color}`}>
						{successRate >= 90 ? <TrendingUp size={14} /> : successRate < 80 ? <TrendingDown size={14} /> : null}
						<span className="truncate">{successStatus.status}</span>
					</div>
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
					<CardTitle className="text-sm font-medium text-muted-foreground break-words" title="Session Hopping Blocks">
						Session Hopping Blocks
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold text-destructive">
						{ja4FraudBlocks}
					</div>
					<p className="text-xs text-muted-foreground mt-1 break-words">
						JA4 fingerprint attacks
					</p>
				</CardContent>
			</Card>

			<Card className="min-w-0">
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground break-words" title="Email Fraud Blocks">
						Email Fraud Blocks
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold text-destructive">
						{markovDetected}
					</div>
					<p className="text-xs text-muted-foreground mt-1 break-words">
						Markov Chain detections
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
