import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';

export interface SubmissionDetail {
	// Form data
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	phone: string;
	address: string;
	date_of_birth: string;
	created_at: string;
	// Geographic data
	remote_ip: string;
	country: string | null;
	region: string | null;
	city: string | null;
	postal_code: string | null;
	timezone: string | null;
	latitude: number | null;
	longitude: number | null;
	continent: string | null;
	is_eu_country: boolean | null;
	// Network data
	user_agent: string;
	asn: string | null;
	as_organization: string | null;
	colo: string | null;
	http_protocol: string | null;
	tls_version: string | null;
	tls_cipher: string | null;
	// Bot detection
	bot_score: number | null;
	client_trust_score: number | null;
	verified_bot: boolean;
	detection_ids: string | null;
	// Fingerprints
	ephemeral_id: string | null;
	ja3_hash: string | null;
	ja4: string | null;
	ja4_signals: string | null;
}

interface SubmissionDetailDialogProps {
	submission: SubmissionDetail | null;
	loading: boolean;
	onClose: () => void;
}

export function SubmissionDetailDialog({ submission, loading, onClose }: SubmissionDetailDialogProps) {
	return (
		<Dialog open={submission !== null} onClose={onClose}>
			<DialogContent className="p-0 max-w-4xl max-h-[90vh] overflow-y-auto">
				{loading ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-muted-foreground">Loading details...</p>
					</div>
				) : submission ? (
					<>
						<DialogHeader>
							<DialogTitle>
								Submission Details - ID #{submission.id}
							</DialogTitle>
							<DialogDescription>
								Complete information for this submission
							</DialogDescription>
						</DialogHeader>

						<div className="p-6 space-y-6">
							{/* Form Data */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Form Data</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Name:</span>
										<p className="font-medium">
											{submission.first_name} {submission.last_name}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Email:</span>
										<p className="font-medium">{submission.email}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Phone:</span>
										<p className="font-medium">{submission.phone}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Date of Birth:</span>
										<p className="font-medium">{submission.date_of_birth}</p>
									</div>
									<div className="col-span-2">
										<span className="text-muted-foreground">Address:</span>
										<p className="font-medium">{submission.address}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Submitted:</span>
										<p className="font-medium">
											{new Date(submission.created_at).toLocaleString()}
										</p>
									</div>
								</div>
							</div>

							{/* Geographic Data */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Geographic Data</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">IP Address:</span>
										<p className="font-mono text-xs">{submission.remote_ip}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Country:</span>
										<p className="font-medium">{submission.country || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Region:</span>
										<p className="font-medium">{submission.region || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">City:</span>
										<p className="font-medium">{submission.city || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Postal Code:</span>
										<p className="font-medium">{submission.postal_code || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Timezone:</span>
										<p className="font-medium">{submission.timezone || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Coordinates:</span>
										<p className="font-mono text-xs">
											{submission.latitude && submission.longitude
												? `${submission.latitude}, ${submission.longitude}`
												: 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Continent:</span>
										<p className="font-medium">{submission.continent || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">EU Country:</span>
										<p className="font-medium">{submission.is_eu_country ? 'Yes' : 'No'}</p>
									</div>
								</div>
							</div>

							{/* Network Data */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Network Data</h3>
								<div className="grid grid-cols-2 gap-4 text-sm">
									<div className="col-span-2">
										<span className="text-muted-foreground">User Agent:</span>
										<p className="font-mono text-xs break-all">{submission.user_agent}</p>
									</div>
									<div>
										<span className="text-muted-foreground">ASN:</span>
										<p className="font-mono text-xs">
											{submission.asn ? `AS${submission.asn}` : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">AS Organization:</span>
										<p className="font-medium text-xs">{submission.as_organization || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Colo:</span>
										<p className="font-mono text-xs">{submission.colo || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">HTTP Protocol:</span>
										<p className="font-mono text-xs">{submission.http_protocol || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">TLS Version:</span>
										<p className="font-mono text-xs">{submission.tls_version || 'N/A'}</p>
									</div>
									<div className="col-span-2">
										<span className="text-muted-foreground">TLS Cipher:</span>
										<p className="font-mono text-xs">{submission.tls_cipher || 'N/A'}</p>
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
												submission.bot_score && submission.bot_score < 30
													? 'text-destructive'
													: submission.bot_score && submission.bot_score >= 70
													? 'text-green-600 dark:text-green-400'
													: 'text-yellow-600 dark:text-yellow-400'
											}`}
										>
											{submission.bot_score !== null ? submission.bot_score : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Client Trust Score:</span>
										<p className="font-medium">
											{submission.client_trust_score !== null ? submission.client_trust_score : 'N/A'}
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Verified Bot:</span>
										<p className="font-medium">{submission.verified_bot ? 'Yes' : 'No'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">Detection IDs:</span>
										<p className="font-mono text-xs">{submission.detection_ids || 'N/A'}</p>
									</div>
								</div>
							</div>

							{/* Fingerprints */}
							<div>
								<h3 className="text-lg font-semibold mb-3">Fingerprints</h3>
								<div className="grid grid-cols-1 gap-4 text-sm">
									<div>
										<span className="text-muted-foreground">Ephemeral ID:</span>
										<p className="font-mono text-xs break-all">{submission.ephemeral_id || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">JA3 Hash:</span>
										<p className="font-mono text-xs break-all">{submission.ja3_hash || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">JA4:</span>
										<p className="font-mono text-xs break-all">{submission.ja4 || 'N/A'}</p>
									</div>
									<div>
										<span className="text-muted-foreground">JA4 Signals:</span>
										<p className="font-mono text-xs break-all">{submission.ja4_signals || 'N/A'}</p>
									</div>
								</div>
							</div>
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
