import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlacklistEntry } from '../../../hooks/useBlacklist';

interface BlacklistSectionProps {
	entries: BlacklistEntry[];
}

export function BlacklistSection({ entries }: BlacklistSectionProps) {
	const getRiskColor = (score: number) => {
		if (score >= 90) return 'text-red-600 dark:text-red-400';
		if (score >= 70) return 'text-orange-600 dark:text-orange-400';
		return 'text-yellow-600 dark:text-yellow-400';
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Active Blacklist Entries</CardTitle>
				<CardDescription>
					Currently blocked ephemeral IDs and IP addresses ({entries.length} active)
				</CardDescription>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-muted-foreground text-sm">No active blacklist entries</p>
					</div>
				) : (
					<div className="space-y-3">
						{entries.map((entry) => {
							const now = new Date().getTime();
							const expiresAt = new Date(entry.expires_at).getTime();
							const timeRemaining = Math.max(0, Math.ceil((expiresAt - now) / 1000 / 60)); // minutes

							// Progressive timeout display
							const progressiveTimeouts = [
								{ offense: 1, duration: '1h' },
								{ offense: 2, duration: '4h' },
								{ offense: 3, duration: '8h' },
								{ offense: 4, duration: '12h' },
								{ offense: 5, duration: '24h' },
							];
							const currentTimeout = progressiveTimeouts[Math.min(entry.offense_count - 1, 4)];
							const nextTimeout = entry.offense_count < 5 ? progressiveTimeouts[entry.offense_count] : null;

							return (
								<div
									key={entry.id}
									className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
								>
									<div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground block text-xs">Identifier</span>
											<p className="font-mono text-xs mt-1 truncate" title={entry.ephemeral_id || entry.ip_address || 'N/A'}>
												{entry.ephemeral_id ? `Eph: ${entry.ephemeral_id.slice(0, 12)}...` : `IP: ${entry.ip_address}`}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground block text-xs">Block Reason</span>
											<p className="font-medium mt-1 truncate text-xs" title={entry.block_reason}>
												{entry.block_reason}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground block text-xs">Offense #{entry.offense_count}</span>
											<p className="font-medium mt-1">
												{currentTimeout?.duration}
												{nextTimeout && <span className="text-muted-foreground text-xs ml-1">(next: {nextTimeout.duration})</span>}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground block text-xs">Risk Score</span>
											<p className={`font-bold mt-1 ${getRiskColor(entry.risk_score)}`}>
												{entry.risk_score}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground block text-xs">Expires In</span>
											<p className="font-medium mt-1">
												{timeRemaining > 60
													? `${Math.floor(timeRemaining / 60)}h ${timeRemaining % 60}m`
													: `${timeRemaining}m`}
											</p>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
