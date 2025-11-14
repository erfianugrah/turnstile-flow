import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import type { BlacklistEntry } from '../../../hooks/useBlacklist';
import type { BlockedValidation } from '../../../hooks/useBlockedValidations';
import { getRelativeTime, getTimeAgo, getTimeUrgency, getUrgencyClasses } from '../../../lib/time-utils';

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
	detectionType: 'ja4_fraud' | 'ephemeral_fraud' | 'ip_fraud' | 'other';
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

	// Limit to 50 events
	const displayEvents = filteredEvents.slice(0, 50);

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

	const getDetectionTypeBadge = (detectionType: string) => {
		switch (detectionType) {
			case 'ja4_fraud':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
						JA4 Session Hopping
					</span>
				);
			case 'ephemeral_fraud':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
						Ephemeral ID
					</span>
				);
			case 'ip_fraud':
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
						IP Fraud
					</span>
				);
			default:
				return (
					<span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
						Other
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
						title={`Expires at: ${new Date(event.expiresAt).toLocaleString()}`}
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
					<div className="flex flex-col gap-1">
						<label className="text-xs text-muted-foreground">Detection Type</label>
						<select
							value={detectionTypeFilter}
							onChange={(e) => setDetectionTypeFilter(e.target.value)}
							className="px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="all">All Types</option>
							<option value="ja4_fraud">JA4 Session Hopping</option>
							<option value="ephemeral_fraud">Ephemeral ID</option>
							<option value="ip_fraud">IP Fraud</option>
							<option value="other">Other</option>
						</select>
					</div>

					<div className="flex flex-col gap-1">
						<label className="text-xs text-muted-foreground">Status</label>
						<select
							value={statusFilter}
							onChange={(e) => setStatusFilter(e.target.value)}
							className="px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="all">All Status</option>
							<option value="active">Actively Blocked</option>
							<option value="detection">Detections Only</option>
						</select>
					</div>

					<div className="flex flex-col gap-1">
						<label className="text-xs text-muted-foreground">Risk Level</label>
						<select
							value={riskLevelFilter}
							onChange={(e) => setRiskLevelFilter(e.target.value)}
							className="px-3 py-1.5 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						>
							<option value="all">All Levels</option>
							<option value="critical">Critical (≥90)</option>
							<option value="high">High (70-89)</option>
							<option value="medium">Medium (50-69)</option>
							<option value="low">Low (&lt;50)</option>
						</select>
					</div>

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
						<div className="mb-4 text-sm text-muted-foreground">
							Showing {displayEvents.length} of {filteredEvents.length} events
							{hasActiveFilters && ` (${allEvents.length} total)`}
						</div>
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
						{filteredEvents.length > 50 && (
							<div className="mt-4 text-center text-sm text-muted-foreground">
								Showing first 50 events. Total: {filteredEvents.length}
								{hasActiveFilters && ` (${allEvents.length} unfiltered)`}
							</div>
						)}
					</>
				)}
			</CardContent>
		</Card>
	);
}

function inferDetectionType(blockReason: string): 'ja4_fraud' | 'ephemeral_fraud' | 'ip_fraud' | 'other' {
	const reason = blockReason.toLowerCase();
	if (reason.includes('ja4') || reason.includes('session hopping')) {
		return 'ja4_fraud';
	}
	if (reason.includes('ephemeral') || reason.includes('automated') || reason.includes('multiple submissions')) {
		return 'ephemeral_fraud';
	}
	if (reason.includes('ip')) {
		return 'ip_fraud';
	}
	return 'other';
}
