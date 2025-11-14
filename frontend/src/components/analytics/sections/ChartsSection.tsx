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
				<Card>
					<CardHeader>
						<CardTitle>Submissions by Country</CardTitle>
						<CardDescription>Top countries</CardDescription>
					</CardHeader>
					<CardContent>
						{countries.length === 0 ? (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							<BarChart
								data={countries.slice(0, 10)}
								xAxisKey="country"
								yAxisKey="count"
								layout="vertical"
								height={300}
								formatTooltip={(value) => `${value} submissions`}
							/>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Bot Score Distribution</CardTitle>
						<CardDescription>Score ranges</CardDescription>
					</CardHeader>
					<CardContent>
						{botScores.length === 0 ? (
							<div className="flex items-center justify-center h-[300px]">
								<p className="text-muted-foreground text-sm">No data available</p>
							</div>
						) : (
							<DonutChart
								data={botScores.map((item) => ({
									name: item.score_range,
									value: item.count,
								}))}
								height={300}
								centerLabel="Total"
								centerValue={botScores.reduce((sum, item) => sum + item.count, 0).toString()}
								formatTooltip={(value) => `${value} submissions`}
							/>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Network & Fingerprint Analytics */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card>
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

				<Card>
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

				<Card>
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
