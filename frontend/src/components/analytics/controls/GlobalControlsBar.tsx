import { useState } from 'react';
import { Download, RefreshCw, X, Save, Filter, Eye } from 'lucide-react';

interface GlobalControlsBarProps {
	// Auto-refresh controls
	autoRefresh: boolean;
	refreshInterval: number;
	onAutoRefreshChange: (enabled: boolean) => void;
	onRefreshIntervalChange: (interval: number) => void;
	onManualRefresh?: () => void;

	// Export controls
	onExportCSV?: () => void;
	onExportJSON?: () => void;

	// Filter controls
	hasActiveFilters: boolean;
	onClearFilters?: () => void;

	// View options
	tableView?: 'compact' | 'comfortable' | 'spacious';
	onTableViewChange?: (view: 'compact' | 'comfortable' | 'spacious') => void;

	// Loading state
	isLoading?: boolean;
}

/**
 * GlobalControlsBar provides unified dashboard controls
 * Includes auto-refresh, export, filter management, and view options
 */
export function GlobalControlsBar({
	autoRefresh,
	refreshInterval,
	onAutoRefreshChange,
	onRefreshIntervalChange,
	onManualRefresh,
	onExportCSV,
	onExportJSON,
	hasActiveFilters,
	onClearFilters,
	tableView = 'comfortable',
	onTableViewChange,
	isLoading = false,
}: GlobalControlsBarProps) {
	const [showExportMenu, setShowExportMenu] = useState(false);
	const [showViewMenu, setShowViewMenu] = useState(false);

	return (
		<div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-card border border-border rounded-lg shadow-sm">
			{/* Left Section - Auto-refresh & Manual Refresh */}
			<div className="flex items-center gap-3">
				{/* Manual Refresh Button */}
				{onManualRefresh && (
					<button
						onClick={onManualRefresh}
						disabled={isLoading}
						className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors disabled:opacity-50"
						title="Refresh data"
					>
						<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
						Refresh
					</button>
				)}

				{/* Auto-refresh Toggle */}
				<label className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-secondary rounded-md">
					<input
						type="checkbox"
						checked={autoRefresh}
						onChange={(e) => onAutoRefreshChange(e.target.checked)}
						className="w-4 h-4 accent-primary cursor-pointer"
					/>
					<span className="text-sm text-foreground">Auto</span>
				</label>

				{/* Refresh Interval Selector */}
				{autoRefresh && (
					<select
						value={refreshInterval}
						onChange={(e) => onRefreshIntervalChange(parseInt(e.target.value))}
						className="px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground"
					>
						<option value={10}>10s</option>
						<option value={30}>30s</option>
						<option value={60}>60s</option>
						<option value={120}>2min</option>
						<option value={300}>5min</option>
					</select>
				)}
			</div>

			{/* Center Section - Filter Controls */}
			<div className="flex items-center gap-2">
				{hasActiveFilters && (
					<>
						<div className="flex items-center gap-2 px-3 py-2 bg-primary/10 text-primary rounded-md">
							<Filter size={16} />
							<span className="text-sm font-medium">Filters Active</span>
						</div>
						{onClearFilters && (
							<button
								onClick={onClearFilters}
								className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
								title="Clear all filters"
							>
								<X size={14} />
								Clear
							</button>
						)}
					</>
				)}
			</div>

			{/* Right Section - Export & View Options */}
			<div className="flex items-center gap-2">
				{/* View Options */}
				{onTableViewChange && (
					<div className="relative">
						<button
							onClick={() => setShowViewMenu(!showViewMenu)}
							className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
							title="View options"
						>
							<Eye size={16} />
							View
						</button>
						{showViewMenu && (
							<div className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-md shadow-lg z-10">
								<div className="p-2 space-y-1">
									<button
										onClick={() => {
											onTableViewChange('compact');
											setShowViewMenu(false);
										}}
										className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-secondary ${
											tableView === 'compact' ? 'bg-secondary font-medium' : ''
										}`}
									>
										Compact
									</button>
									<button
										onClick={() => {
											onTableViewChange('comfortable');
											setShowViewMenu(false);
										}}
										className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-secondary ${
											tableView === 'comfortable' ? 'bg-secondary font-medium' : ''
										}`}
									>
										Comfortable
									</button>
									<button
										onClick={() => {
											onTableViewChange('spacious');
											setShowViewMenu(false);
										}}
										className={`w-full text-left px-3 py-2 text-sm rounded hover:bg-secondary ${
											tableView === 'spacious' ? 'bg-secondary font-medium' : ''
										}`}
									>
										Spacious
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Export Menu */}
				{(onExportCSV || onExportJSON) && (
					<div className="relative">
						<button
							onClick={() => setShowExportMenu(!showExportMenu)}
							disabled={isLoading}
							className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-primary border border-primary rounded-md hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
							title="Export data"
						>
							<Download size={16} />
							Export
						</button>
						{showExportMenu && (
							<div className="absolute right-0 mt-2 w-32 bg-card border border-border rounded-md shadow-lg z-10">
								<div className="p-2 space-y-1">
									{onExportCSV && (
										<button
											onClick={() => {
												onExportCSV();
												setShowExportMenu(false);
											}}
											className="w-full text-left px-3 py-2 text-sm rounded hover:bg-secondary"
										>
											CSV
										</button>
									)}
									{onExportJSON && (
										<button
											onClick={() => {
												onExportJSON();
												setShowExportMenu(false);
											}}
											className="w-full text-left px-3 py-2 text-sm rounded hover:bg-secondary"
										>
											JSON
										</button>
									)}
								</div>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
