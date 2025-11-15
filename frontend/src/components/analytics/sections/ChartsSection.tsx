import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../ui/card';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import { BarChart } from '../charts/BarChart';
import { DonutChart } from '../charts/DonutChart';
import type { CountryData, BotScoreData, AsnData, TlsData, Ja3Data, Ja4Data } from '../../../hooks/useAnalytics';

interface ChartsSectionProps {
	timeSeriesData: any[];
	countries: CountryData[];
	botScores: BotScoreData[];
	asnData: AsnData[];
	tlsData: TlsData[];
	ja3Data: Ja3Data[];
	ja4Data: Ja4Data[];
}

export function ChartsSection({
	timeSeriesData,
	countries,
	botScores,
	asnData,
	tlsData,
	ja3Data,
	ja4Data,
}: ChartsSectionProps) {
	return (
		<>
			{/* Submissions Time Series */}
			<Card>
				<CardHeader>
					<CardTitle>Submissions Over Time</CardTitle>
					<CardDescription>Daily submission volume (last 30 days)</CardDescription>
				</CardHeader>
				<CardContent>
					{timeSeriesData.length > 0 ? (
						<TimeSeriesChart
							data={timeSeriesData}
							type="area"
							height={250}
							yAxisLabel="Submissions"
							formatTooltip={(value) => `${value.toFixed(0)} submissions`}
						/>
					) : (
						<div className="flex items-center justify-center h-[250px]">
							<p className="text-muted-foreground text-sm">No time-series data available</p>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Country Distribution and Bot Scores */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Submissions by Country</CardTitle>
						<CardDescription>Top 10 countries</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
							{countries.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								countries.slice(0, 10).map((item, index) => {
									const maxCount = countries[0]?.count || 1;
									const percentage = (item.count / maxCount) * 100;
									return (
										<div key={index} className="space-y-1">
											<div className="flex justify-between items-center text-sm">
												<span className="font-medium truncate" title={item.country}>{item.country}</span>
												<span className="font-semibold text-foreground ml-2">{item.count}</span>
											</div>
											<div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
												<div
													className="h-full bg-[hsl(213,32%,52%)] dark:bg-[hsl(213,32%,65%)] rounded-full transition-all"
													style={{ width: `${percentage}%` }}
												/>
											</div>
										</div>
									);
								})
							)}
						</div>
						{countries.length > 10 && (
							<div className="mt-3 text-center text-xs text-muted-foreground">
								+{countries.length - 10} more countries
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>Bot Score Distribution</CardTitle>
						<CardDescription>Score ranges</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{botScores.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								botScores.map((item, index) => {
									const total = botScores.reduce((sum, s) => sum + s.count, 0);
									const percentage = (item.count / total) * 100;
									return (
										<div key={index} className="space-y-1">
											<div className="flex justify-between items-center text-sm">
												<span className="font-medium">{item.score_range}</span>
												<div className="flex items-center gap-2">
													<span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
													<span className="font-semibold text-foreground">{item.count}</span>
												</div>
											</div>
											<div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
												<div
													className="h-full bg-[hsl(213,32%,52%)] dark:bg-[hsl(213,32%,65%)] rounded-full transition-all"
													style={{ width: `${percentage}%` }}
												/>
											</div>
										</div>
									);
								})
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Network & Fingerprint Analytics */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>ASN Distribution</CardTitle>
						<CardDescription>Top autonomous systems</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
							{asnData.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								asnData.slice(0, 20).map((item, index) => (
									<div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
										<div className="flex-1 min-w-0 pr-4">
											<p className="text-sm font-mono truncate" title={item.asn}>AS{item.asn}</p>
											<p className="text-xs text-muted-foreground truncate" title={item.as_organization || 'Unknown'}>
												{item.as_organization || 'Unknown'}
											</p>
										</div>
										<span className="text-sm font-semibold flex-shrink-0">{item.count}</span>
									</div>
								))
							)}
						</div>
						{asnData.length > 20 && (
							<div className="mt-3 text-center text-xs text-muted-foreground">
								+{asnData.length - 20} more
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>TLS Versions</CardTitle>
						<CardDescription>Encryption protocols</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
							{tlsData.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								tlsData.slice(0, 20).map((item, index) => (
									<div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
										<div className="flex-1 min-w-0 pr-4">
											<p className="text-sm font-medium">{item.tls_version}</p>
											{item.tls_cipher && (
												<p className="text-xs text-muted-foreground truncate" title={item.tls_cipher}>
													{item.tls_cipher}
												</p>
											)}
										</div>
										<span className="text-sm font-semibold flex-shrink-0">{item.count}</span>
									</div>
								))
							)}
						</div>
						{tlsData.length > 20 && (
							<div className="mt-3 text-center text-xs text-muted-foreground">
								+{tlsData.length - 20} more
							</div>
						)}
					</CardContent>
				</Card>

				<Card className="min-w-0">
					<CardHeader>
						<CardTitle>JA3 Fingerprints</CardTitle>
						<CardDescription>Client fingerprints</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
							{ja3Data.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								ja3Data.slice(0, 20).map((item, index) => (
									<div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
										<p className="text-xs font-mono truncate flex-1 pr-4" title={item.ja3_hash}>
											{item.ja3_hash}
										</p>
										<span className="text-sm font-semibold flex-shrink-0">{item.count}</span>
									</div>
								))
							)}
						</div>
						{ja3Data.length > 20 && (
							<div className="mt-3 text-center text-xs text-muted-foreground">
								+{ja3Data.length - 20} more
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* JA4 Fingerprints */}
			<Card>
				<CardHeader>
					<CardTitle>JA4 Fingerprints</CardTitle>
					<CardDescription>Advanced client fingerprints</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
						{ja4Data.length === 0 ? (
							<div className="flex items-center justify-center h-[200px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							ja4Data.slice(0, 20).map((item, index) => (
								<div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
									<p className="text-xs font-mono truncate flex-1 pr-4" title={item.ja4}>
										{item.ja4}
									</p>
									<span className="text-sm font-semibold flex-shrink-0">{item.count}</span>
								</div>
							))
						)}
					</div>
					{ja4Data.length > 20 && (
						<div className="mt-3 text-center text-xs text-muted-foreground">
							+{ja4Data.length - 20} more
						</div>
					)}
				</CardContent>
			</Card>
		</>
	);
}
