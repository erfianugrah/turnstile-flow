import { AlertTriangle, Shield, Activity, Globe, Zap } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { Alert, AlertDescription } from '../../ui/alert';

interface FraudPattern {
	blacklisted: any[];
	high_risk_ephemeral: any[];
	proxy_rotation: any[];
	high_frequency: any[];
}

interface FraudAlertProps {
	data: FraudPattern | null;
	loading?: boolean;
}

/**
 * FraudAlert displays ephemeral ID-based fraud patterns
 * Aligns with fraud detection in src/routes/submissions.ts:96-242
 * Shows: blacklisted IDs, high-risk patterns, proxy rotation, and high-frequency validators
 */
export function FraudAlert({ data, loading }: FraudAlertProps) {
	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield size={20} className="text-yellow-600" />
						Ephemeral ID Fraud Detection
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
		data.blacklisted.length +
		data.high_risk_ephemeral.length +
		data.proxy_rotation.length +
		data.high_frequency.length;

	if (totalAlerts === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield size={20} className="text-green-600 dark:text-green-400" />
						Ephemeral ID Fraud Detection
					</CardTitle>
					<CardDescription>No suspicious patterns detected</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm">
						All ephemeral IDs appear legitimate. No blacklisted IDs, proxy rotation, or abuse patterns detected.
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Shield size={20} className="text-yellow-600" />
					Ephemeral ID Fraud Detection
				</CardTitle>
				<CardDescription>
					{totalAlerts} suspicious {totalAlerts === 1 ? 'pattern' : 'patterns'} detected
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Blacklisted Ephemeral IDs */}
				{data.blacklisted.length > 0 && (
					<Alert className="border-red-600">
						<AlertDescription>
							<div className="font-semibold mb-2 flex items-center gap-2">
								<AlertTriangle size={16} className="text-red-600" />
								Blacklisted Ephemeral IDs ({data.blacklisted.length})
							</div>
							<div className="space-y-2 text-sm">
								{data.blacklisted.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded border border-red-600/20">
										<div className="flex justify-between items-start">
											<span className="font-mono text-xs break-all">{item.ephemeral_id}</span>
											<span className={`text-xs px-2 py-0.5 rounded ${
												item.confidence === 'high' ? 'bg-red-600 text-white' :
												item.confidence === 'medium' ? 'bg-orange-600 text-white' :
												'bg-yellow-600 text-white'
											}`}>
												{item.confidence}
											</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											{item.block_reason}
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											Submissions: {item.submission_count} • Expires: {new Date(item.expires_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
										</div>
									</div>
								))}
								{data.blacklisted.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.blacklisted.length - 3} more blocked IDs
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* High-Risk Ephemeral IDs (3+ submissions in 1 hour) */}
				{data.high_risk_ephemeral.length > 0 && (
					<Alert className="border-orange-600">
						<AlertDescription>
							<div className="font-semibold mb-2 flex items-center gap-2">
								<Activity size={16} className="text-orange-600" />
								High-Risk Ephemeral IDs ({data.high_risk_ephemeral.length})
							</div>
							<div className="text-xs text-muted-foreground mb-2">
								Ephemeral IDs with 3+ submissions in 1 hour (threshold: src/lib/turnstile.ts:178)
							</div>
							<div className="space-y-2 text-sm">
								{data.high_risk_ephemeral.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded border border-orange-600/20">
										<div className="flex justify-between">
											<span className="font-mono text-xs break-all">{item.ephemeral_id}</span>
											<span className="text-destructive font-semibold">{item.submission_count} submissions</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											{item.unique_ips} unique IPs • {item.countries || 'Unknown countries'}
										</div>
										<div className="text-xs text-muted-foreground">
											Timespan: {item.time_span_minutes?.toFixed(1) || '0'} minutes
										</div>
									</div>
								))}
								{data.high_risk_ephemeral.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.high_risk_ephemeral.length - 3} more high-risk IDs
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* Proxy Rotation (same ephemeral ID from multiple IPs) */}
				{data.proxy_rotation.length > 0 && (
					<Alert className="border-purple-600">
						<AlertDescription>
							<div className="font-semibold mb-2 flex items-center gap-2">
								<Globe size={16} className="text-purple-600" />
								Proxy Rotation Detected ({data.proxy_rotation.length})
							</div>
							<div className="text-xs text-muted-foreground mb-2">
								Same ephemeral ID from 3+ different IPs - possible botnet/proxy (src/lib/turnstile.ts:202)
							</div>
							<div className="space-y-2 text-sm">
								{data.proxy_rotation.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded border border-purple-600/20">
										<div className="flex justify-between">
											<span className="font-mono text-xs break-all">{item.ephemeral_id}</span>
											<span className="text-purple-600 font-semibold">{item.unique_ips} IPs</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											{item.submission_count} submissions • {item.countries || 'Unknown countries'}
										</div>
										<div className="text-xs text-muted-foreground font-mono mt-1 truncate" title={item.ip_addresses}>
											IPs: {item.ip_addresses}
										</div>
									</div>
								))}
								{data.proxy_rotation.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.proxy_rotation.length - 3} more proxy rotation patterns
									</div>
								)}
							</div>
						</AlertDescription>
					</Alert>
				)}

				{/* High-Frequency Validators (10+ attempts in 1 hour) */}
				{data.high_frequency.length > 0 && (
					<Alert className="border-yellow-600">
						<AlertDescription>
							<div className="font-semibold mb-2 flex items-center gap-2">
								<Zap size={16} className="text-yellow-600" />
								High-Frequency Validators ({data.high_frequency.length})
							</div>
							<div className="text-xs text-muted-foreground mb-2">
								Ephemeral IDs with 10+ validation attempts in 1 hour - possible bot (src/lib/turnstile.ts:221)
							</div>
							<div className="space-y-2 text-sm">
								{data.high_frequency.slice(0, 3).map((item: any, index: number) => (
									<div key={index} className="p-2 bg-secondary rounded border border-yellow-600/20">
										<div className="flex justify-between">
											<span className="font-mono text-xs break-all">{item.ephemeral_id}</span>
											<span className="text-yellow-600 font-semibold">{item.validation_count} attempts</span>
										</div>
										<div className="text-xs text-muted-foreground mt-1">
											Success: {item.successful_validations} • Failed: {item.failed_validations}
										</div>
										<div className="text-xs text-muted-foreground">
											{item.unique_ips} unique IPs • Timespan: {item.time_span_minutes?.toFixed(1) || '0'} minutes
										</div>
									</div>
								))}
								{data.high_frequency.length > 3 && (
									<div className="text-xs text-muted-foreground">
										+{data.high_frequency.length - 3} more high-frequency validators
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
