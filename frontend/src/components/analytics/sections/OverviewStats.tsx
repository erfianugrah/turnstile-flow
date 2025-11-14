import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import type { ValidationStats } from '../../../hooks/useAnalytics';

interface OverviewStatsProps {
	stats: ValidationStats | null;
}

export function OverviewStats({ stats }: OverviewStatsProps) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Total Validations
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">{stats?.total || 0}</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Success Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">
						{stats && stats.total > 0
							? ((stats.successful / stats.total) * 100).toFixed(1)
							: 0}
						%
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Allowed Rate
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">
						{stats && stats.total > 0
							? ((stats.allowed / stats.total) * 100).toFixed(1)
							: 0}
						%
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader className="pb-2">
					<CardTitle className="text-sm font-medium text-muted-foreground">
						Avg Risk Score
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="text-3xl font-bold">
						{stats?.avg_risk_score ? stats.avg_risk_score.toFixed(1) : '0.0'}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
