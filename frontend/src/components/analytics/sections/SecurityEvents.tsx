import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { subDays } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlacklistEntry } from '../../../hooks/useBlacklist';
import type { BlockedValidation } from '../../../hooks/useBlockedValidations';
import { getRelativeTime, getTimeAgo, getTimeUrgency, getUrgencyClasses } from '../../../lib/time-utils';
import { SingleSelect } from '../filters/SingleSelect';
import { DateRangePicker } from '../filters/DateRangePicker';

interface SecurityEventsProps {
	activeBlocks: BlacklistEntry[];
	recentDetections: BlockedValidation[];
	onLoadDetail: (id: number) => void;
	apiKey: string;
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
	detectionType: 'email_fraud_detection' | 'ephemeral_id_tracking' | 'ja4_fingerprinting' | 'token_replay_protection' | 'turnstile_validation' | 'pre_validation_blacklist' | 'other' | null;
	country?: string | null;
	city?: string | null;
	ja4?: string | null;
	erfid?: string | null;
	// For active blocks
	expiresAt?: string;
	offenseCount?: number;
};

export function SecurityEvents({ activeBlocks, recentDetections, onLoadDetail, apiKey }: SecurityEventsProps) {
	// Filter states
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [riskLevelFilter, setRiskLevelFilter] = useState<string>('all');
	const [dateRange, setDateRange] = useState({
		start: subDays(new Date(), 7),
		end: new Date(),
	});

	// Pagination state
	const [pageIndex, setPageIndex] = useState(0);
	const [pageSize] = useState(15);

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
		erfid: entry.erfid,
		// Enriched metadata from LEFT JOIN with turnstile_validations
		country: entry.country,
		city: entry.city,
		ja4: entry.ja4,
	}));

	// Convert recent detections to unified format, but exclude detections that have active blocks
	// Deduplicate by checking if ephemeral_id or ip_address matches an active block
	const activeIdentifiers = new Set(
		activeBlocks.map(block => block.ephemeral_id || block.ip_address).filter(Boolean)
	);

	const detectionEvents: SecurityEvent[] = recentDetections
		.filter((validation) => {
			const identifier = validation.ephemeral_id || validation.ip_address;
			// Only include detections that don't have a corresponding active block
			return identifier && !activeIdentifiers.has(identifier);
		})
		.map((validation) => ({
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

		// Date range filter
		const eventDate = new Date(event.timestamp);
		if (eventDate < dateRange.start || eventDate > dateRange.end) {
			return false;
		}

		return true;
	});

	// Reset pagination when filters change
	useEffect(() => {
		setPageIndex(0);
	}, [statusFilter, riskLevelFilter, dateRange.start, dateRange.end]);

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
			case 'token_replay_protection':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						Token Replay Protection
					</span>
				);
			case 'email_fraud_detection':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
						Email Fraud Detection (Layer 1)
					</span>
				);
			case 'ephemeral_id_tracking':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
						Ephemeral ID Tracking (Layer 2)
					</span>
				);
			case 'ja4_fingerprinting':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 Fingerprinting (Layer 4)
					</span>
				);
			case 'turnstile_validation':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
						Turnstile Validation
					</span>
				);
			case 'pre_validation_blacklist':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
						Pre-Validation Blacklist (Layer 0)
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
						🚫 Blocked
					</span>
					<span
						className={`inline-flex items-center px-2 py-1 rounded-md border text-xs font-medium ${urgencyClasses.text} ${urgencyClasses.bg} ${urgencyClasses.border}`}
						title={`Expires at: ${new Date(event.expiresAt).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`}
					>
						Expires {relativeTime}
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
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
						🕒 Blocked (Expired)
					</span>
					<span className="text-xs text-muted-foreground">{timeAgo}</span>
				</div>
			);
		}
	};

	const totalActiveBlocks = activeBlocks.length;
	const totalDetections = recentDetections.length;
	const hasActiveFilters =
		statusFilter !== 'all' ||
		riskLevelFilter !== 'all' ||
		dateRange.start.getTime() !== subDays(new Date(), 7).setHours(0, 0, 0, 0) ||
		dateRange.end.getTime() !== new Date().setHours(23, 59, 59, 999);

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
				<div className="mb-4 pb-4 border-b border-border">
					<div className="flex flex-wrap items-end gap-3">
						<SingleSelect
							label="Status"
							options={[
								{ value: 'all', label: 'All' },
								{ value: 'active', label: 'Blocked (Active)' },
								{ value: 'detection', label: 'Blocked (Expired)' }
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

						<div className="flex flex-col gap-1">
							<span className="text-sm text-muted-foreground whitespace-nowrap">Time Range:</span>
							<DateRangePicker value={dateRange} onChange={setDateRange} />
						</div>

						{hasActiveFilters && (
							<div className="flex items-end">
								<button
									onClick={() => {
										setStatusFilter('all');
										setRiskLevelFilter('all');
										setDateRange({
											start: subDays(new Date(), 7),
											end: new Date(),
										});
									}}
									className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
								>
									Clear Filters
								</button>
							</div>
						)}
					</div>
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
								// Parse block_reason to get the actual calculated risk score
							const parsed = parseBlockReason(event.blockReason);
							// Use parsed risk score if available, otherwise fall back to database value
							const actualRiskScore = parsed.riskScore ?? event.riskScore;
							const riskLevel = getRiskLevel(actualRiskScore);

								return (
									<div
										key={event.id}
										className="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors space-y-4"
									>
										{/* Header Row: Status + Risk Score + Detection Type + Button */}
										<div className="flex items-start justify-between gap-4">
											<div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													{getStatusBadge(event)}
												</div>
												<div className="flex items-center gap-2">
													<span className="inline-flex px-2 py-0.5 rounded-md bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs font-medium flex-shrink-0" title="Risk assessment score (0-100)">
														Risk Score:
													</span>
													<span className={`text-xs font-semibold ${getRiskColor(actualRiskScore)}`}>
														{actualRiskScore}
														<span className="text-xs font-normal ml-1 text-muted-foreground">({riskLevel})</span>
													</span>
												</div>
											</div>
											{/* View Details Button - Top Right */}
											<button
												onClick={async () => {
													if (event.type === 'detection') {
														// For detections, use the validation ID directly
														const numericId = parseInt(event.id.split('-')[1], 10);
														if (!isNaN(numericId)) {
															onLoadDetail(numericId);
														}
													} else if (event.erfid) {
														// For active blocks, look up validation by erfid
														try {
															const response = await fetch(`/api/analytics/validations/by-erfid/${event.erfid}`, {
																headers: {
																	'X-API-KEY': apiKey
																}
															});

															if (response.ok) {
																const data = await response.json() as { success: boolean; data?: { id: number } };
																if (data.success && data.data && data.data.id) {
																	onLoadDetail(data.data.id);
																} else {
																	console.error('Invalid validation data received');
																	alert('Could not load validation details');
																}
															} else {
																console.error('Failed to fetch validation by erfid');
																alert('Could not find validation record for this block');
															}
														} catch (error) {
															console.error('Error fetching validation by erfid:', error);
															alert('Error loading validation details');
														}
													}
												}}
												className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-xs font-medium flex-shrink-0"
												title="View validation details"
											>
												<Eye size={14} />
												<span>Details</span>
											</button>
										</div>

										{/* Main Info Grid */}
										<div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
												<div className="min-w-0 space-y-1.5">
													{event.ipAddress && event.identifierType === 'ephemeral' && (
														<p className="flex items-center gap-2">
															<span className="inline-flex px-2 py-0.5 rounded-md bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-xs font-medium flex-shrink-0">IP:</span>
															<span className="font-mono text-xs text-foreground truncate select-all">{event.ipAddress}</span>
														</p>
													)}
													{event.country && (
														<p className="flex items-center gap-2">
															<span className="inline-flex px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium flex-shrink-0">Country:</span>
															<span className="text-xs text-foreground">{event.country}</span>
														</p>
													)}
													{event.city && (
														<p className="flex items-center gap-2">
															<span className="inline-flex px-2 py-0.5 rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs font-medium flex-shrink-0">City:</span>
															<span className="text-xs text-foreground">{event.city}</span>
														</p>
													)}
												</div>
												<div className="min-w-0 space-y-1.5">
													<p className="flex items-center gap-2 min-w-0">
														<span className="inline-flex px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-medium flex-shrink-0">
															{event.identifierType === 'ephemeral' ? 'Ephemeral ID:' : 'IP Address:'}
														</span>
														<span className="font-mono text-xs font-medium text-foreground select-all overflow-hidden text-ellipsis whitespace-nowrap" title={event.ephemeralId || event.ipAddress || 'N/A'}>
															{event.ephemeralId || event.ipAddress}
														</span>
													</p>
													<p className="flex items-center gap-2 min-w-0">
														<span className="inline-flex px-2 py-0.5 rounded-md bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 text-xs font-medium flex-shrink-0" title="TLS fingerprint">
															JA4:
														</span>
														<span className="font-mono text-xs font-medium text-foreground select-all overflow-hidden text-ellipsis whitespace-nowrap" title={event.ja4 || 'N/A'}>
															{event.ja4 || 'N/A'}
														</span>
													</p>
												</div>
											<div className="min-w-0">
												{/* Empty column for spacing */}
											</div>
										</div>

										{/* Block Reason */}
										<div className="min-w-0 pt-3 border-t border-border/50">
											<span className="inline-flex px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs font-medium mb-2">Detection Details</span>
											{(() => {
												const parsed = parseBlockReason(event.blockReason);
												return (
													<div className="mt-2 space-y-2">
														{/* Trigger Pills */}
														{parsed.triggers.length > 0 ? (
															<div className="space-y-1.5">
																<span className="text-xs text-muted-foreground">Triggers:</span>
																<div className="flex flex-wrap gap-1.5">
																	{parsed.triggers.map((trigger, idx) => {
																		// Truncate long trigger text for display
																		const displayText = trigger.length > 80
																			? trigger.substring(0, 80) + '...'
																			: trigger;
																		return (
																			<span
																				key={idx}
																				className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${getTriggerPillColor(trigger)}`}
																				title={trigger}
																			>
																				{displayText}
																			</span>
																		);
																	})}
																</div>
															</div>
														) : (
															<p className="text-xs text-muted-foreground italic">
																No detailed triggers available
															</p>
														)}
													</div>
												);
											})()}
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

function inferDetectionType(blockReason: string): 'email_fraud_detection' | 'ephemeral_id_tracking' | 'ja4_fingerprinting' | 'token_replay_protection' | 'turnstile_validation' | 'pre_validation_blacklist' | 'other' {
	const reason = blockReason.toLowerCase();

	// Token replay protection
	if (reason.includes('token') && reason.includes('replay')) {
		return 'token_replay_protection';
	}

	// Email fraud detection (Layer 1)
	if (reason.includes('email') && (reason.includes('fraud') || reason.includes('random') || reason.includes('sequential') || reason.includes('dated'))) {
		return 'email_fraud_detection';
	}

	// JA4 fingerprinting (Layer 4) - covers all JA4-based detection
	if (reason.includes('ja4') || reason.includes('session hopping')) {
		return 'ja4_fingerprinting';
	}

	// Ephemeral ID tracking (Layer 2) - covers submission count, validation frequency, IP diversity, duplicate email
	if (reason.includes('ephemeral') || reason.includes('automated') || reason.includes('multiple submissions') ||
	    reason.includes('validation') || reason.includes('frequency') ||
	    reason.includes('ip') && reason.includes('diversity') || reason.includes('multiple ip') ||
	    reason.includes('duplicate') && reason.includes('email')) {
		return 'ephemeral_id_tracking';
	}

	// Turnstile validation
	if (reason.includes('turnstile')) {
		return 'turnstile_validation';
	}

	return 'other';
}

/**
 * Parse block reason to extract risk score and triggers
 */
function parseBlockReason(blockReason: string): {
	riskScore?: number;
	threshold?: number;
	triggers: string[];
	fullText: string;
} {
	// Try to parse "Risk score X >= Y. Triggers: ..." format
	const riskScoreMatch = blockReason.match(/Risk score (\d+(?:\.\d+)?) >= (\d+)/);
	const triggersMatch = blockReason.match(/Triggers: (.+)$/);

	const riskScore = riskScoreMatch ? parseFloat(riskScoreMatch[1]) : undefined;
	const threshold = riskScoreMatch ? parseInt(riskScoreMatch[2], 10) : undefined;

	let triggers: string[] = [];
	if (triggersMatch) {
		// Split by comma, but preserve commas within trigger descriptions
		triggers = triggersMatch[1].split(/,\s*(?=[A-Z])/).map(t => t.trim());
	}

	return {
		riskScore,
		threshold,
		triggers,
		fullText: blockReason,
	};
}

/**
 * Get pill color based on trigger keyword
 */
function getTriggerPillColor(trigger: string): string {
	const lower = trigger.toLowerCase();

	if (lower.includes('email')) {
		return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
	}
	if (lower.includes('ja4') || lower.includes('session')) {
		return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
	}
	if (lower.includes('ip') || lower.includes('proxy')) {
		return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
	}
	if (lower.includes('velocity') || lower.includes('rapid') || lower.includes('frequency')) {
		return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
	}
	if (lower.includes('bot') || lower.includes('global')) {
		return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300';
	}
	if (lower.includes('duplicate')) {
		return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300';
	}

	// Default color
	return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
}
