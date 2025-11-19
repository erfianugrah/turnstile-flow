import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { FraudAssessment } from '../FraudAssessment';
import { JA4SignalsDetail } from '../JA4SignalsDetail';
import type { FraudDetectionConfig } from '../../../hooks/useConfig';

export interface ValidationDetail {
	// Validation data
	id: number;
	token_hash: string;
	success: boolean;
	allowed: boolean;
	block_reason: string | null;
	challenge_ts: string;
	hostname: string | null;
	action: string | null;
	ephemeral_id: string | null;
	risk_score: number;
	risk_score_breakdown: string | null;
	error_codes: string | null;
	submission_id: number | null;
	detection_type: string | null;
	// Geographic data
	remote_ip: string;
	country: string | null;
	region: string | null;
	city: string | null;
	postal_code: string | null;
	timezone: string | null;
	continent: string | null;
	is_eu_country: string | null;
	// Network data
	user_agent: string;
	asn: number | null;
	as_organization: string | null;
	colo: string | null;
	http_protocol: string | null;
	tls_version: string | null;
	// Bot detection
	bot_score: number | null;
	client_trust_score: number | null;
	verified_bot: boolean;
	js_detection_passed: boolean;
	detection_ids: string | null;
	// Fingerprints
	ja3_hash: string | null;
	ja4: string | null;
	ja4_signals: string | null;
	// Timestamps
	created_at: string;
}

// Helper function to format detection layer names for display
function formatDetectionLayer(layer: string): string {
	const layerMap: Record<string, string> = {
		'email_fraud_detection': 'Email Fraud Detection (Layer 1)',
		'ephemeral_id_tracking': 'Ephemeral ID Tracking (Layer 2)',
		'ja4_fingerprinting': 'JA4 Fingerprinting (Layer 4)',
		'token_replay_protection': 'Token Replay Protection',
		'turnstile_validation': 'Turnstile Validation',
		'pre_validation_blacklist': 'Pre-Validation Blacklist (Layer 0)',
	};
	return layerMap[layer] || layer;
}

interface ValidationDetailDialogProps {
	validation: ValidationDetail | null;
	loading: boolean;
	onClose: () => void;
	config?: FraudDetectionConfig;
}

export function ValidationDetailDialog({ validation, loading, onClose, config }: ValidationDetailDialogProps) {
	return (
		<Dialog open={validation !== null} onClose={onClose}>
			<DialogContent className="p-0 max-w-4xl max-h-[90vh] overflow-y-auto">
				{loading ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-muted-foreground">Loading details...</p>
					</div>
				) : validation ? (
					<>
						<DialogHeader>
							<DialogTitle>
								Validation Details - ID #{validation.id}
							</DialogTitle>
							<DialogDescription>
								Complete information for this blocked validation attempt
							</DialogDescription>
						</DialogHeader>

						<div className="p-6 space-y-6">
							{/* Validation Status */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Validation Status</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Success:</span>
										<p className={`font-bold ${validation.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
											{validation.success ? 'Yes' : 'No'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Allowed:</span>
										<p className={`font-bold ${validation.allowed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
											{validation.allowed ? 'Yes' : 'No (Blocked)'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Detection Layer:</span>
										<p className="font-medium">
											{validation.detection_type ? formatDetectionLayer(validation.detection_type) : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Submission ID:</span>
										<p className="font-mono text-xs">{validation.submission_id !== null ? validation.submission_id : 'No submission created'}</p>
									</div>
									{validation.block_reason && (
										<div className="col-span-2">
											<span className="text-muted-foreground">Block Reason:</span>
											<p className="font-medium text-red-600 dark:text-red-400">{validation.block_reason}</p>
										</div>
									)}
									<div>
										<span className="text-muted-foreground">Challenge Time:</span>
										<p className="font-medium">
											{new Date(validation.challenge_ts).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Created:</span>
										<p className="font-medium">
											{new Date(validation.created_at).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Hostname:</span>
										<p className="font-medium">{validation.hostname || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Action:</span>
										<p className="font-medium">{validation.action || 'N/A'}</p>
									</div>
									{validation.error_codes && (
										<div className="col-span-2">
											<span className="text-muted-foreground">Error Codes:</span>
											<p className="font-mono text-xs break-all">{validation.error_codes}</p>
										</div>
									)}
								</div>
							</div>

							{/* Fraud Risk Assessment */}
							{validation.risk_score_breakdown && (() => {
								try {
									const breakdown = JSON.parse(validation.risk_score_breakdown);
									return <FraudAssessment breakdown={breakdown} config={config} />;
								} catch (e) {
									return null;
								}
							})()}

							{/* Geographic Data */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Geographic Data</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">IP Address:</span>
										<p className="font-mono text-xs">{validation.remote_ip}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Country:</span>
										<p className="font-medium">{validation.country || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Region:</span>
										<p className="font-medium">{validation.region || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">City:</span>
										<p className="font-medium">{validation.city || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Postal Code:</span>
										<p className="font-medium">{validation.postal_code || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Timezone:</span>
										<p className="font-medium">{validation.timezone || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Continent:</span>
										<p className="font-medium">{validation.continent || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">EU Country:</span>
										<p className="font-medium">{validation.is_eu_country === '1' ? 'Yes' : validation.is_eu_country === '0' ? 'No' : 'N/A'}</p>
									</div>
								</div>
							</div>

							{/* Network Data */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Network Data</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div className="col-span-2">
										<span className="text-muted-foreground">User Agent:</span>
										<p className="font-mono text-xs break-all">{validation.user_agent}</p>
									</div>
									<div>
										<span className="text-muted-foreground">ASN:</span>
										<p className="font-mono text-xs">
											{validation.asn ? `AS${validation.asn}` : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">AS Organization:</span>
										<p className="font-medium text-xs">{validation.as_organization || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Colo:</span>
										<p className="font-mono text-xs">{validation.colo || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">HTTP Protocol:</span>
										<p className="font-mono text-xs">{validation.http_protocol || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">TLS Version:</span>
										<p className="font-mono text-xs">{validation.tls_version || 'N/A'}</p>
									</div>
								</div>
							</div>

							{/* Bot Detection */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Bot Detection</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Bot Score:</span>
										<p
											className={`font-bold ${
												validation.bot_score && validation.bot_score < 30
													? 'text-destructive'
													: validation.bot_score && validation.bot_score >= 70
													? 'text-green-600 dark:text-green-400'
													: 'text-yellow-600 dark:text-yellow-400'
											}`}
										>
											{validation.bot_score !== null ? validation.bot_score : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Client Trust Score:</span>
										<p className="font-medium">
											{validation.client_trust_score !== null ? validation.client_trust_score : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Verified Bot:</span>
										<p className="font-medium">{validation.verified_bot ? 'Yes' : 'No'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">JS Detection Passed:</span>
										<p className="font-medium">{validation.js_detection_passed ? 'Yes' : 'No'}</p>
									</div>
									<div className="col-span-2">
										<span className="text-muted-foreground">Detection IDs:</span>
										<p className="font-mono text-xs">{validation.detection_ids || 'N/A'}</p>
									</div>
								</div>
							</div>

							{/* Fingerprints */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Fingerprints</h3>
								<div className="grid grid-cols-1 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Ephemeral ID:</span>
										<p className="font-mono text-xs break-all">{validation.ephemeral_id || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Token Hash:</span>
										<p className="font-mono text-xs break-all">{validation.token_hash}</p>
									</div>
									<div>
										<span className="text-muted-foreground">JA3 Hash:</span>
										<p className="font-mono text-xs break-all">{validation.ja3_hash || 'N/A'}</p>
									</div>
								</div>
							</div>

							{/* JA4 Intelligence */}
							{validation.ja4 && validation.ja4_signals && (() => {
								try {
									const signals = JSON.parse(validation.ja4_signals);
									return <JA4SignalsDetail signals={signals} ja4Fingerprint={validation.ja4} config={config} />;
								} catch (e) {
									return (
										<div>
											<h3 className="text-lg font-semibold mb-3">JA4 Fingerprint</h3>
											<p className="font-mono text-xs break-all">{validation.ja4}</p>
										</div>
									);
								}
							})()}
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
