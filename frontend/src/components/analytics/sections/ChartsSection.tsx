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
						<div className="space-y-2">
							{asnData.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								asnData.slice(0, 10).map((item, index) => (
									<div key={index} className="flex justify-between items-center">
										<div className="flex-1 min-w-0">
											<p className="text-sm font-mono truncate">{item.asn}</p>
											<p className="text-xs text-muted-foreground truncate">
												{item.as_organization || 'Unknown'}
											</p>
										</div>
										<span className="ml-2 text-sm font-semibold">{item.count}</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>TLS Versions</CardTitle>
						<CardDescription>Encryption protocols</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{tlsData.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								tlsData.slice(0, 10).map((item, index) => (
									<div key={index} className="flex justify-between items-center">
										<div className="flex-1">
											<p className="text-sm font-medium">{item.tls_version}</p>
											{item.tls_cipher && (
												<p className="text-xs text-muted-foreground truncate">
													{item.tls_cipher}
												</p>
											)}
										</div>
										<span className="ml-2 text-sm font-semibold">{item.count}</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>JA3 Fingerprints</CardTitle>
						<CardDescription>Client fingerprints</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{ja3Data.length === 0 ? (
								<div className="flex items-center justify-center h-[200px]">
									<p className="text-muted-foreground text-sm">No data available</p>
								</div>
							) : (
								ja3Data.slice(0, 10).map((item, index) => (
									<div key={index} className="flex justify-between items-center">
										<p className="text-xs font-mono truncate flex-1">{item.ja3_hash}</p>
										<span className="ml-2 text-sm font-semibold">{item.count}</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
