import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlockedValidation } from '../../../hooks/useBlockedValidations';

interface BlockedValidationsSectionProps {
	validations: BlockedValidation[];
}

export function BlockedValidationsSection({ validations }: BlockedValidationsSectionProps) {
	const getRiskColor = (score: number) => {
		if (score >= 90) return 'text-red-600 dark:text-red-400';
		if (score >= 70) return 'text-orange-600 dark:text-orange-400';
		return 'text-yellow-600 dark:text-yellow-400';
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Recent Blocked Validation Attempts</CardTitle>
				<CardDescription>
					Recent attempts blocked by fraud detection ({validations.length} shown)
				</CardDescription>
			</CardHeader>
			<CardContent>
				{validations.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-muted-foreground text-sm">No blocked validation attempts</p>
					</div>
				) : (
					<div className="space-y-3">
						{validations.slice(0, 20).map((validation) => (
							<div
								key={validation.id}
								className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
							>
								<div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground block text-xs">IP Address</span>
										<p className="font-mono text-xs mt-1">
											{validation.ip_address}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground block text-xs">Block Reason</span>
										<p className="font-medium mt-1 truncate" title={validation.block_reason}>
											{validation.block_reason}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground block text-xs">Risk Score</span>
										<p className={`font-bold mt-1 ${getRiskColor(validation.risk_score)}`}>
											{validation.risk_score}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground block text-xs">Timestamp</span>
										<p className="font-medium mt-1 text-xs">
											{new Date(validation.challenge_ts).toLocaleString()}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
