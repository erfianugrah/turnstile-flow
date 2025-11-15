import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlacklistEntry } from '../../../hooks/useBlacklist';
import type { BlockedValidation } from '../../../hooks/useBlockedValidations';
import { getRelativeTime, getTimeAgo, getTimeUrgency, getUrgencyClasses } from '../../../lib/time-utils';
import { SingleSelect } from '../filters/SingleSelect';

interface SecurityEventsProps {
	activeBlocks: BlacklistEntry[];
	recentDetections: BlockedValidation[];
}

type SecurityEvent = {
	id: string;
	type: 'active_block' | 'detection';
	timestamp: string;
	ephemeralId?: string | null;
	ipAddress: string | null;
	identifierType: 'ephemeral' | 'ip';
	blockReason: string;
	riskScore: number;
	detectionType: 'token_replay' | 'ephemeral_id_fraud' | 'ja4_ip_clustering' | 'ja4_rapid_global' | 'ja4_extended_global' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'turnstile_failed' | 'duplicate_email' | 'other' | null;
	country?: string | null;
	city?: string | null;
	ja4?: string | null;
	// For active blocks
	expiresAt?: string;
	offenseCount?: number;
};

export function SecurityEvents({ activeBlocks, recentDetections }: SecurityEventsProps) {
	// Filter states
	const [detectionTypeFilter, setDetectionTypeFilter] = useState<string>('all');
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [riskLevelFilter, setRiskLevelFilter] = useState<string>('all');

	// Pagination state
	const [pageIndex, setPageIndex] = useState(0);
	const [pageSize] = useState(10);

	// Convert active blocks to unified format
	const activeBlockEvents: SecurityEvent[] = activeBlocks.map((entry) => ({
		id: `block-${entry.id}`,
		type: 'active_block' as const,
		timestamp: entry.blocked_at,
		ephemeralId: entry.ephemeral_id,
		ipAddress: entry.ip_address,
		identifierType: entry.ephemeral_id ? 'ephemeral' : 'ip',
		blockReason: entry.block_reason,
		riskScore: entry.risk_score,
		detectionType: inferDetectionType(entry.block_reason),
		expiresAt: entry.expires_at,
		offenseCount: entry.offense_count,
		// Enriched metadata from LEFT JOIN with turnstile_validations
		country: entry.country,
		city: entry.city,
		ja4: entry.ja4,
	}));

	// Convert recent detections to unified format
	const detectionEvents: SecurityEvent[] = recentDetections.map((validation) => ({
		id: `detection-${validation.id}`,
		type: 'detection' as const,
		timestamp: validation.challenge_ts,
		ephemeralId: validation.ephemeral_id,
		ipAddress: validation.ip_address,
		identifierType: validation.ephemeral_id ? 'ephemeral' : 'ip',
		blockReason: validation.block_reason,
		riskScore: validation.risk_score,
		detectionType: validation.detection_type,
		country: validation.country,
		city: validation.city,
		ja4: validation.ja4,
	}));

	// Merge and sort by timestamp (most recent first)
	const allEvents = [...activeBlockEvents, ...detectionEvents].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
	);

	// Apply filters
	const filteredEvents = allEvents.filter((event) => {
		// Detection type filter
		if (detectionTypeFilter !== 'all' && event.detectionType !== detectionTypeFilter) {
			return false;
		}

		// Status filter
		if (statusFilter === 'active' && event.type !== 'active_block') {
			return false;
		}
		if (statusFilter === 'detection' && event.type !== 'detection') {
			return false;
		}

		// Risk level filter
		if (riskLevelFilter === 'critical' && event.riskScore < 90) {
			return false;
		}
		if (riskLevelFilter === 'high' && (event.riskScore < 70 || event.riskScore >= 90)) {
			return false;
		}
		if (riskLevelFilter === 'medium' && (event.riskScore < 50 || event.riskScore >= 70)) {
			return false;
		}
		if (riskLevelFilter === 'low' && event.riskScore >= 50) {
			return false;
		}

		return true;
	});

	// Reset pagination when filters change
	useEffect(() => {
		setPageIndex(0);
	}, [detectionTypeFilter, statusFilter, riskLevelFilter]);

	// Apply pagination
	const totalPages = Math.ceil(filteredEvents.length / pageSize);
	const start = pageIndex * pageSize;
	const end = start + pageSize;
	const displayEvents = filteredEvents.slice(start, end);

	const getRiskColor = (score: number) => {
		if (score >= 90) return 'text-red-600 dark:text-red-400';
		if (score >= 70) return 'text-orange-600 dark:text-orange-400';
		return 'text-yellow-600 dark:text-yellow-400';
	};

	const getRiskLevel = (score: number): string => {
		if (score >= 90) return 'Critical';
		if (score >= 70) return 'High';
		if (score >= 50) return 'Medium';
		return 'Low';
	};

	const getDetectionTypeBadge = (detectionType: string | null) => {
		switch (detectionType) {
			case 'token_replay':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						Token Replay
					</span>
				);
			case 'ephemeral_id_fraud':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
						Ephemeral ID
					</span>
				);
			case 'ja4_ip_clustering':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 IP Clustering
					</span>
				);
			case 'ja4_rapid_global':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 Rapid Global
					</span>
				);
			case 'ja4_extended_global':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 Extended Global
					</span>
				);
			case 'ja4_session_hopping':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 Session Hopping (Legacy)
					</span>
				);
			case 'ip_diversity':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
						IP Diversity
					</span>
				);
			case 'validation_frequency':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
						Validation Frequency
					</span>
				);
			case 'turnstile_failed':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
						Turnstile Failed
					</span>
				);
			case 'duplicate_email':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
						Duplicate Email
					</span>
				);
			default:
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
						{detectionType || 'Other'}
					</span>
				);
		}
	};

	const getStatusBadge = (event: SecurityEvent) => {
		if (event.type === 'active_block' && event.expiresAt) {
			const relativeTime = getRelativeTime(event.expiresAt);
			const urgency = getTimeUrgency(event.expiresAt);
			const urgencyClasses = getUrgencyClasses(urgency);

			return (
				<div className="flex items-center gap-2">
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						🚫 Actively Blocked
					</span>
					<span
						className={`inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium ${urgencyClasses.text} ${urgencyClasses.bg} ${urgencyClasses.border}`}
						title={`Expires at: ${new Date(event.expiresAt).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`}
					>
						Expires: {relativeTime}
					</span>
					{event.offenseCount && event.offenseCount > 1 && (
						<span className="text-xs text-muted-foreground">
							(Offense #{event.offenseCount})
						</span>
					)}
				</div>
			);
		} else {
			const timeAgo = getTimeAgo(event.timestamp);
			return (
				<div className="flex items-center gap-2">
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
						⚠️ Detected
					</span>
					<span className="text-xs text-muted-foreground">{timeAgo}</span>
				</div>
			);
		}
	};

	const totalActiveBlocks = activeBlocks.length;
	const totalDetections = recentDetections.length;
	const hasActiveFilters = detectionTypeFilter !== 'all' || statusFilter !== 'all' || riskLevelFilter !== 'all';

	return (
		<Card>
			<CardHeader>
				<CardTitle>Security Events</CardTitle>
				<CardDescription>
					Recent threat detections and active enforcement. Shows {totalActiveBlocks} actively blocked{' '}
					{totalActiveBlocks === 1 ? 'identity' : 'identities'} and {totalDetections} recent{' '}
					{totalDetections === 1 ? 'detection' : 'detections'}.
					Active blocks expire based on progressive timeouts (1h → 4h → 8h → 12h → 24h).
				</CardDescription>
			</CardHeader>
			<CardContent>
				{/* Filters */}
				<div className="flex flex-wrap gap-3 mb-4 pb-4 border-b border-border">
					<SingleSelect
						label="Detection Type"
						options={[
							{ value: 'all', label: 'All Types' },
							{ value: 'token_replay', label: 'Token Replay' },
							{ value: 'ephemeral_id_fraud', label: 'Ephemeral ID' },
							{ value: 'ja4_ip_clustering', label: 'JA4 IP Clustering' },
							{ value: 'ja4_rapid_global', label: 'JA4 Rapid Global' },
							{ value: 'ja4_extended_global', label: 'JA4 Extended Global' },
							{ value: 'ja4_session_hopping', label: 'JA4 Session Hopping (Legacy)' },
							{ value: 'ip_diversity', label: 'IP Diversity' },
							{ value: 'validation_frequency', label: 'Validation Frequency' },
							{ value: 'turnstile_failed', label: 'Turnstile Failed' },
							{ value: 'duplicate_email', label: 'Duplicate Email' },
							{ value: 'other', label: 'Other' }
						]}
						value={detectionTypeFilter}
						onChange={setDetectionTypeFilter}
						className="min-w-[200px]"
					/>

					<SingleSelect
						label="Status"
						options={[
							{ value: 'all', label: 'All Status' },
							{ value: 'active', label: 'Actively Blocked' },
							{ value: 'detection', label: 'Detections Only' }
						]}
						value={statusFilter}
						onChange={setStatusFilter}
						className="min-w-[200px]"
					/>

					<SingleSelect
						label="Risk Level"
						options={[
							{ value: 'all', label: 'All Levels' },
							{ value: 'critical', label: 'Critical (≥90)' },
							{ value: 'high', label: 'High (70-89)' },
							{ value: 'medium', label: 'Medium (50-69)' },
							{ value: 'low', label: 'Low (<50)' }
						]}
						value={riskLevelFilter}
						onChange={setRiskLevelFilter}
						className="min-w-[200px]"
					/>

					{hasActiveFilters && (
						<div className="flex items-end">
							<button
								onClick={() => {
									setDetectionTypeFilter('all');
									setStatusFilter('all');
									setRiskLevelFilter('all');
								}}
								className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								Clear Filters
							</button>
						</div>
					)}
				</div>

				{displayEvents.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-muted-foreground text-sm">
							{hasActiveFilters ? 'No events match the selected filters' : 'No security events'}
						</p>
					</div>
				) : (
					<>
						<div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
							{displayEvents.map((event) => {
								const riskLevel = getRiskLevel(event.riskScore);

								return (
									<div
										key={event.id}
										className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
									>
										<div className="flex-1 space-y-3 min-w-0">
											{/* Header Row: Status + Detection Type */}
											<div className="flex items-center justify-between gap-2 flex-wrap">
												{getStatusBadge(event)}
												{getDetectionTypeBadge(event.detectionType)}
											</div>

											{/* Main Info Grid */}
											<div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
												<div className="min-w-0">
													<span className="text-muted-foreground block">
														{event.identifierType === 'ephemeral' ? 'Ephemeral ID:' : 'IP Address:'}
													</span>
													<p className="font-mono text-xs mt-1 truncate select-all" title={event.ephemeralId || event.ipAddress || 'N/A'}>
														{event.ephemeralId || event.ipAddress}
													</p>
													{event.ipAddress && event.identifierType === 'ephemeral' && (
														<p className="font-mono text-xs mt-0.5 text-muted-foreground truncate select-all" title={event.ipAddress || 'N/A'}>
															IP: {event.ipAddress}
														</p>
													)}
													{event.country && (
														<p className="text-xs mt-0.5 text-muted-foreground">
															<span className="font-medium">Country:</span> {event.country}
														</p>
													)}
													{event.city && (
														<p className="text-xs mt-0.5 text-muted-foreground">
															<span className="font-medium">City:</span> {event.city}
														</p>
													)}
												</div>
												<div className="min-w-0">
													<span className="text-muted-foreground block" title="Risk assessment score (0-100)">
														Risk Score:
													</span>
													<p className={`font-bold mt-1 text-base ${getRiskColor(event.riskScore)}`}>
														{event.riskScore}
														<span className="text-xs font-normal ml-1">({riskLevel})</span>
													</p>
												</div>
												<div className="min-w-0">
													<span className="text-muted-foreground block" title="TLS fingerprint">
														JA4 Fingerprint:
													</span>
													<p className="font-mono text-xs mt-1 truncate select-all" title={event.ja4 || 'N/A'}>
														{event.ja4 || 'N/A'}
													</p>
												</div>
											</div>

											{/* Block Reason */}
											<div className="min-w-0 pt-1 border-t border-border/50">
												<span className="text-muted-foreground block text-xs">Block Reason:</span>
												<p className="font-medium mt-1 text-xs" title={event.blockReason}>
													{event.blockReason}
												</p>
											</div>
										</div>
									</div>
								);
							})}
						</div>

						{/* Pagination Controls */}
						<div className="flex items-center justify-between pt-4 border-t border-border">
							<div className="text-sm text-muted-foreground">
								{(() => {
									const total = filteredEvents.length;
									const startItem = Math.min(start + 1, total);
									const endItem = Math.min(end, total);

									if (total === 0) return 'No results';
									if (total === 1) return 'Showing 1 event';
									return `Showing ${startItem} to ${endItem} of ${total} events${hasActiveFilters ? ` (${allEvents.length} total)` : ''}`;
								})()}
							</div>
							<div className="flex items-center gap-2">
								<button
									onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
									disabled={pageIndex === 0}
									className="p-2 border border-border rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									title="Previous page"
								>
									<ChevronLeft size={16} />
								</button>
								<span className="text-sm text-muted-foreground px-2">
									Page {pageIndex + 1} of {totalPages || 1}
								</span>
								<button
									onClick={() => setPageIndex(Math.min(totalPages - 1, pageIndex + 1))}
									disabled={pageIndex >= totalPages - 1}
									className="p-2 border border-border rounded hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
									title="Next page"
								>
									<ChevronRight size={16} />
								</button>
							</div>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}

function inferDetectionType(blockReason: string): 'token_replay' | 'ephemeral_id_fraud' | 'ja4_ip_clustering' | 'ja4_rapid_global' | 'ja4_extended_global' | 'ja4_session_hopping' | 'ip_diversity' | 'validation_frequency' | 'turnstile_failed' | 'duplicate_email' | 'other' {
	const reason = blockReason.toLowerCase();
	if (reason.includes('token') && reason.includes('replay')) {
		return 'token_replay';
	}
	// Phase 1.8: Layer-specific JA4 detection types
	if (reason.includes('ja4') && reason.includes('ip_clustering')) {
		return 'ja4_ip_clustering';
	}
	if (reason.includes('ja4') && reason.includes('rapid_global')) {
		return 'ja4_rapid_global';
	}
	if (reason.includes('ja4') && reason.includes('extended_global')) {
		return 'ja4_extended_global';
	}
	// Fallback to legacy type for old JA4 blocks
	if (reason.includes('ja4') || reason.includes('session hopping')) {
		return 'ja4_session_hopping';
	}
	if (reason.includes('ephemeral') || reason.includes('automated') || reason.includes('multiple submissions')) {
		return 'ephemeral_id_fraud';
	}
	if (reason.includes('ip') && (reason.includes('diversity') || reason.includes('multiple ip'))) {
		return 'ip_diversity';
	}
	if (reason.includes('validation') && reason.includes('frequency')) {
		return 'validation_frequency';
	}
	if (reason.includes('turnstile')) {
		return 'turnstile_failed';
	}
	if (reason.includes('duplicate') && reason.includes('email')) {
		return 'duplicate_email';
	}
	return 'other';
}
