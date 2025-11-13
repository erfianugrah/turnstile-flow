import { AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';

interface FraudPattern {
	duplicate_ips: any[];
	low_bot_scores: any[];
	rapid_submissions: any[];
	duplicate_emails: any[];
}

interface FraudAlertProps {
	data: FraudPattern | null;
	loading?: boolean;
}

/**
 * FraudAlert displays potential fraud patterns detected in submissions
 * Shows warnings for duplicate IPs, low bot scores, rapid submissions, and duplicate emails
 */
export function FraudAlert({ data, loading }: FraudAlertProps) {
	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle size={20} className="text-yellow-600" />
						Fraud Detection
					</CardTitle>
					<CardDescription>Analyzing for suspicious patterns</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">Loading...</p>
				</CardContent>
			</Card>
		);
	}

	if (!data) {
		return null;
	}

	const totalAlerts =
		data.duplicate_ips.length +
		data.low_bot_scores.length +
		data.rapid_submissions.length +
		data.duplicate_emails.length;

	if (totalAlerts === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle size={20} className="text-green-600 dark:text-green-400" />
						Fraud Detection
					</CardTitle>
					<CardDescription>No suspicious patterns detected</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">
						All submissions appear legitimate based on recent activity.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<AlertTriangle size={20} className="text-yellow-600" />
					Fraud Detection
				</CardTitle>
				<CardDescription>
					{totalAlerts} suspicious {totalAlerts === 1 ? 'pattern' : 'patterns'} detected
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Duplicate IPs */}
				{data.duplicate_ips.length > 0 && (
					<Alert>
						<AlertDescription>
							<div className="font-semibold mb-2">Duplicate IP Addresses ({data.duplicate_ips.length})</div>
							<div className="space-y-2 text-sm">
								{data.duplicate_ips.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded">
										<div className="flex justify-between">
											<span className="font-mono">{item.remote_ip}</span>
											<span className="text-muted-foreground">{item.submission_count} submissions</span>
										</div>
										{item.avg_bot_score !== null && (
											<div className="text-xs text-muted-foreground mt-1">
												Avg bot score: {item.avg_bot_score.toFixed(0)}
											</div>
										)}
									</div>
								))}
								{data.duplicate_ips.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.duplicate_ips.length - 3} more
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* Low Bot Scores */}
				{data.low_bot_scores.length > 0 && (
					<Alert>
						<AlertDescription>
							<div className="font-semibold mb-2">Low Bot Scores ({data.low_bot_scores.length})</div>
							<div className="space-y-2 text-sm">
								{data.low_bot_scores.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded">
										<div className="flex justify-between">
											<span>{item.email}</span>
											<span className="text-destructive font-semibold">Score: {item.bot_score}</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											{item.remote_ip} • {item.country || 'Unknown'}
										</div>
									</div>
								))}
								{data.low_bot_scores.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.low_bot_scores.length - 3} more
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* Rapid Submissions */}
				{data.rapid_submissions.length > 0 && (
					<Alert>
						<AlertDescription>
							<div className="font-semibold mb-2">Rapid Submissions ({data.rapid_submissions.length})</div>
							<div className="space-y-2 text-sm">
								{data.rapid_submissions.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded">
										<div className="flex justify-between">
											<span className="font-mono">{item.remote_ip}</span>
											<span className="text-muted-foreground">{item.count} in {item.time_span_minutes}min</span>
										</div>
									</div>
								))}
								{data.rapid_submissions.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.rapid_submissions.length - 3} more
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* Duplicate Emails */}
				{data.duplicate_emails.length > 0 && (
					<Alert>
						<AlertDescription>
							<div className="font-semibold mb-2">Duplicate Emails ({data.duplicate_emails.length})</div>
							<div className="space-y-2 text-sm">
								{data.duplicate_emails.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded">
										<div className="flex justify-between">
											<span>{item.email}</span>
											<span className="text-muted-foreground">{item.submission_count} submissions</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											{item.unique_ips} unique IPs • {item.countries}
										</div>
									</div>
								))}
								{data.duplicate_emails.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.duplicate_emails.length - 3} more
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}
			</CardContent>
		</Card>
	);
}
