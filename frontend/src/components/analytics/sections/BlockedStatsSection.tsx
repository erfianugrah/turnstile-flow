import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlockedStats, BlockReason } from '../../../hooks/useAnalytics';

interface BlockedStatsSectionProps {
	blockedStats: BlockedStats | null;
	blockReasons: BlockReason[];
}

export function BlockedStatsSection({ blockedStats, blockReasons }: BlockedStatsSectionProps) {
	if (!blockedStats || blockedStats.total_blocked === 0) {
		return null;
	}

	return (
		<>
			{/* Blocked & Mitigated Requests Stats */}
			<Card>
				<CardHeader>
					<CardTitle>Blocked & Mitigated Requests</CardTitle>
					<CardDescription>Submissions blocked by fraud detection</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Total Blocked</p>
							<p className="text-2xl font-bold text-destructive">{blockedStats.total_blocked}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Unique Ephemeral IDs</p>
							<p className="text-2xl font-bold">{blockedStats.unique_ephemeral_ids}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Unique IPs</p>
							<p className="text-2xl font-bold">{blockedStats.unique_ips}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Avg Risk Score</p>
							<p className="text-2xl font-bold">{blockedStats.avg_risk_score.toFixed(1)}</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Block Reasons Breakdown */}
			<Card>
				<CardHeader>
					<CardTitle>Block Reasons</CardTitle>
					<CardDescription>Distribution of why submissions were blocked</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-3">
						{blockReasons.map((reason, index) => {
							const getRiskColor = (score: number) => {
								if (score >= 90) return 'text-red-600 dark:text-red-400';
								if (score >= 70) return 'text-orange-600 dark:text-orange-400';
								return 'text-yellow-600 dark:text-yellow-400';
							};

							const getFrequencyColor = (count: number) => {
								if (count >= 10) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
								if (count >= 5) return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
								return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
							};

							return (
								<div
									key={index}
									className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
								>
									<div className="flex-1 space-y-2 min-w-0">
										<div className="flex items-start justify-between gap-2">
											<p className="font-semibold text-sm break-words flex-1" title={reason.block_reason}>
												{reason.block_reason}
											</p>
											<span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 ${getFrequencyColor(reason.count)}`}>
												{reason.count} blocked
											</span>
										</div>
										<div className="grid grid-cols-3 gap-4 text-xs">
											<div>
												<span className="text-muted-foreground block">Unique Ephemeral IDs:</span>
												<p className="font-medium">{reason.unique_ephemeral_ids}</p>
											</div>
											<div>
												<span className="text-muted-foreground block">Unique IPs:</span>
												<p className="font-medium">{reason.unique_ips}</p>
											</div>
											<div>
												<span className="text-muted-foreground block">Avg Risk Score:</span>
												<p className={`font-bold ${getRiskColor(reason.avg_risk_score)}`}>
													{reason.avg_risk_score.toFixed(1)}
												</p>
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				</CardContent>
			</Card>
		</>
	);
}
