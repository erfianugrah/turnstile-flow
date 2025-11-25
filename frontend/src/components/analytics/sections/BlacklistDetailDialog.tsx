import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import type { BlacklistEntry } from '../../../hooks/useBlacklist';
import type { FraudDetectionConfig } from '../../../hooks/useConfig';
import { formatDistanceToNow } from 'date-fns';
import { JA4SignalsDetail } from '../JA4SignalsDetail';

interface BlacklistDetailDialogProps {
	entry: BlacklistEntry | null;
	onClose: () => void;
	config?: FraudDetectionConfig;
}

const detectionLabels: Record<string, string> = {
	'email_fraud_detection': 'Email Fraud Detection (Layer 1)',
	'ephemeral_id_tracking': 'Ephemeral ID Tracking (Layer 2)',
	'ja4_fingerprinting': 'JA4 Fingerprinting (Layer 4)',
	'token_replay_protection': 'Token Replay Protection',
	'pre_validation_blacklist': 'Pre-Validation Blacklist (Layer 0)',
	'duplicate_email': 'Duplicate Email Enforcement',
	'holistic_risk': 'Holistic Risk (Layer 3)',
	'header_fingerprint_reuse': 'Header Fingerprint Reuse (Layer 4.5)',
	'tls_fingerprint_anomaly': 'TLS Fingerprint Anomaly (Layer 4.5)',
	'latency_mismatch': 'Latency / Device Mismatch (Layer 4.5)',
};

export function BlacklistDetailDialog({ entry, onClose, config }: BlacklistDetailDialogProps) {
	if (!entry) {
		return null;
	}

	const detectionLabel = entry.detection_type ? detectionLabels[entry.detection_type] || entry.detection_type : 'Active Block';
	const detectionConfidence = entry.detection_confidence ? entry.detection_confidence.toUpperCase() : 'UNKNOWN';

	let metadata: Record<string, any> | null = null;
	if (entry.detection_metadata) {
		try {
			metadata = JSON.parse(entry.detection_metadata);
		} catch (error) {
			metadata = { raw: entry.detection_metadata };
		}
	}

	const blockedAgo = formatDistanceToNow(new Date(entry.blocked_at), { addSuffix: true });
	const expiresIn = formatDistanceToNow(new Date(entry.expires_at), { addSuffix: true });

	return (
		<Dialog open={!!entry} onClose={onClose}>
			<DialogContent className="p-0 max-w-3xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Active Block Details</DialogTitle>
					<DialogDescription>
						Block reason recorded {blockedAgo}. Expires {expiresIn}.
					</DialogDescription>
				</DialogHeader>

				<div className="p-6 space-y-6">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
						<div className="space-y-2">
							<p className="text-muted-foreground">Detection Type</p>
							<p className="font-semibold">{detectionLabel}</p>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground">Confidence</p>
							<p className="font-semibold">{detectionConfidence}</p>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground">Risk Score</p>
							<p className="font-semibold">{entry.risk_score}</p>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground">Offense Count</p>
							<p className="font-semibold">{entry.offense_count}</p>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground">Identifiers</p>
							<div className="text-xs space-y-1">
								{entry.ephemeral_id && (
									<p><span className="font-medium">Ephemeral ID:</span> <span className="font-mono select-all break-all">{entry.ephemeral_id}</span></p>
								)}
								{entry.ip_address && (
									<p><span className="font-medium">IP:</span> <span className="font-mono select-all break-all">{entry.ip_address}</span></p>
								)}
								{entry.ja4 && (
									<p><span className="font-medium">JA4:</span> <span className="font-mono select-all break-all">{entry.ja4}</span></p>
								)}
							</div>
						</div>
						<div className="space-y-2">
							<p className="text-muted-foreground">Location</p>
							<p>{entry.city || entry.country ? `${entry.city || 'Unknown'}, ${entry.country || 'Unknown'}` : 'Unknown'}</p>
						</div>
					</div>

					<div className="space-y-2">
						<p className="text-muted-foreground">Block Reason</p>
						<div className="bg-muted/60 rounded-md p-3 text-sm border border-border/50">
							<p className="font-medium text-foreground">{entry.block_reason}</p>
						</div>
					</div>

					{metadata && (
						<div className="space-y-2">
							<p className="text-muted-foreground">Detection Metadata</p>
							<div className="bg-muted/40 rounded-md p-3 text-xs border border-border/50 space-y-1">
								{Object.entries(metadata).map(([key, value]) => (
									<div key={key} className="flex items-start gap-2">
										<span className="font-medium text-muted-foreground capitalize">{key}:</span>
										<span className="font-mono break-all">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</span>
									</div>
								))}
							</div>
						</div>
					)}

					{entry.ja4 && entry.ja4_signals && (() => {
						try {
							const signals = JSON.parse(entry.ja4_signals);
							return <JA4SignalsDetail signals={signals} ja4Fingerprint={entry.ja4} config={config} />;
						} catch (_err) {
							return null;
						}
					})()}
				</div>
			</DialogContent>
		</Dialog>
	);
}
