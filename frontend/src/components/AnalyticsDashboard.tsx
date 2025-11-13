import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';

interface ValidationStats {
	total: number;
	successful: number;
	allowed: number;
	avg_risk_score: number;
	unique_ephemeral_ids: number;
}

interface Submission {
	id: number;
	first_name: string;
	last_name: string;
	email: string;
	country: string | null;
	city: string | null;
	bot_score: number | null;
	created_at: string;
	// Expanded fields for table
	remote_ip?: string | null;
	user_agent?: string | null;
	tls_version?: string | null;
	asn?: string | null;
	ja3_hash?: string | null;
	ephemeral_id?: string | null;
}

interface SubmissionDetail {
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

interface CountryData {
	country: string;
	count: number;
}

interface BotScoreData {
	score_range: string;
	count: number;
}

interface AsnData {
	asn: string;
	as_organization: string | null;
	count: number;
}

interface TlsData {
	tls_version: string;
	tls_cipher: string | null;
	count: number;
}

interface Ja3Data {
	ja3_hash: string;
	count: number;
}

interface Ja4Data {
	ja4: string;
	count: number;
}

export default function AnalyticsDashboard() {
	const [stats, setStats] = useState<ValidationStats | null>(null);
	const [submissions, setSubmissions] = useState<Submission[]>([]);
	const [countries, setCountries] = useState<CountryData[]>([]);
	const [botScores, setBotScores] = useState<BotScoreData[]>([]);
	const [asnData, setAsnData] = useState<AsnData[]>([]);
	const [tlsData, setTlsData] = useState<TlsData[]>([]);
	const [ja3Data, setJa3Data] = useState<Ja3Data[]>([]);
	const [ja4Data, setJa4Data] = useState<Ja4Data[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// API Key state
	const [apiKey, setApiKey] = useState<string>('');
	const [showApiKeyDialog, setShowApiKeyDialog] = useState(false);
	const [apiKeyInput, setApiKeyInput] = useState('');
	const [apiKeyError, setApiKeyError] = useState<string | null>(null);

	// Modal state
	const [selectedSubmission, setSelectedSubmission] = useState<SubmissionDetail | null>(null);
	const [modalLoading, setModalLoading] = useState(false);

	useEffect(() => {
		// Check for saved API key in localStorage
		const savedApiKey = localStorage.getItem('analytics-api-key');
		if (savedApiKey) {
			setApiKey(savedApiKey);
			loadAnalytics(savedApiKey);
		} else {
			setShowApiKeyDialog(true);
			setLoading(false);
		}
	}, []);

	const loadAnalytics = async (key: string) => {
		setLoading(true);
		setError(null);

		const headers = key ? { 'X-API-KEY': key } : {};

		try {
			const [
				statsRes,
				submissionsRes,
				countriesRes,
				botScoresRes,
				asnRes,
				tlsRes,
				ja3Res,
				ja4Res,
			] = await Promise.all([
				fetch('/api/analytics/stats', { headers }),
				fetch('/api/analytics/submissions?limit=10', { headers }),
				fetch('/api/analytics/countries', { headers }),
				fetch('/api/analytics/bot-scores', { headers }),
				fetch('/api/analytics/asn', { headers }),
				fetch('/api/analytics/tls', { headers }),
				fetch('/api/analytics/ja3', { headers }),
				fetch('/api/analytics/ja4', { headers }),
			]);

			// Check for 401 errors (unauthorized)
			if (statsRes.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				setLoading(false);
				return;
			}

			if (
				!statsRes.ok ||
				!submissionsRes.ok ||
				!countriesRes.ok ||
				!botScoresRes.ok ||
				!asnRes.ok ||
				!tlsRes.ok ||
				!ja3Res.ok ||
				!ja4Res.ok
			) {
				throw new Error('Failed to fetch analytics');
			}

			const [statsData, submissionsData, countriesData, botScoresData, asnData, tlsData, ja3DataRes, ja4DataRes] =
				await Promise.all([
					statsRes.json(),
					submissionsRes.json(),
					countriesRes.json(),
					botScoresRes.json(),
					asnRes.json(),
					tlsRes.json(),
					ja3Res.json(),
					ja4Res.json(),
				]);

			setStats(statsData.data);
			setSubmissions(submissionsData.data);
			setCountries(countriesData.data);
			setBotScores(botScoresData.data);
			setAsnData(asnData.data);
			setTlsData(tlsData.data);
			setJa3Data(ja3DataRes.data);
			setJa4Data(ja4DataRes.data);
		} catch (err) {
			console.error('Error loading analytics:', err);
			setError('Failed to load analytics data');
		} finally {
			setLoading(false);
		}
	};

	const loadSubmissionDetail = async (id: number) => {
		setModalLoading(true);
		const headers = apiKey ? { 'X-API-KEY': apiKey } : {};
		try {
			const res = await fetch(`/api/analytics/submissions/${id}`, { headers });
			if (res.status === 401) {
				localStorage.removeItem('analytics-api-key');
				setApiKey('');
				setShowApiKeyDialog(true);
				setApiKeyError('Invalid or missing API key. Please enter a valid key.');
				return;
			}
			if (!res.ok) {
				throw new Error('Failed to fetch submission details');
			}
			const data = await res.json();
			setSelectedSubmission(data.data);
		} catch (err) {
			console.error('Error loading submission details:', err);
			alert('Failed to load submission details');
		} finally {
			setModalLoading(false);
		}
	};

	const handleApiKeySubmit = () => {
		if (!apiKeyInput.trim()) {
			setApiKeyError('Please enter an API key');
			return;
		}

		setApiKeyError(null);
		const trimmedKey = apiKeyInput.trim();
		localStorage.setItem('analytics-api-key', trimmedKey);
		setApiKey(trimmedKey);
		setShowApiKeyDialog(false);
		setApiKeyInput('');
		loadAnalytics(trimmedKey);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-[400px]">
				<p className="text-muted-foreground">Loading analytics...</p>
			</div>
		);
	}

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription>{error}</AlertDescription>
			</Alert>
		);
	}

	return (
		<>
			{/* API Key Dialog - Required, cannot close without entering key */}
			<Dialog open={showApiKeyDialog}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Enter Analytics API Key</DialogTitle>
						<DialogDescription>
							Please enter your API key to access the analytics dashboard. This key matches the X-API-KEY secret configured in your Cloudflare Workers.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<input
								type="password"
								placeholder="Enter API key"
								value={apiKeyInput}
								onChange={(e) => setApiKeyInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										handleApiKeySubmit();
									}
								}}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
								autoFocus
							/>
							{apiKeyError && (
								<p className="text-sm text-destructive">{apiKeyError}</p>
							)}
						</div>
						<div className="flex justify-end gap-3">
							<button
								onClick={handleApiKeySubmit}
								className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md h-10 px-4 py-2"
							>
								Submit
							</button>
						</div>
					</div>
				</DialogContent>
			</Dialog>

			<div className="space-y-6">
				{/* Stats Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Total Validations
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">{stats?.total || 0}</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Success Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats && stats.total > 0
								? ((stats.successful / stats.total) * 100).toFixed(1)
								: 0}
							%
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Allowed Rate
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats && stats.total > 0
								? ((stats.allowed / stats.total) * 100).toFixed(1)
								: 0}
							%
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium text-muted-foreground">
							Avg Risk Score
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-3xl font-bold">
							{stats?.avg_risk_score ? stats.avg_risk_score.toFixed(1) : '0.0'}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Recent Submissions - Expanded View */}
			<Card>
				<CardHeader>
					<CardTitle>Recent Submissions</CardTitle>
					<CardDescription>
						Latest form submissions (click row for full details)
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="text-left py-2 px-3">ID</th>
									<th className="text-left py-2 px-3">Name</th>
									<th className="text-left py-2 px-3">Email</th>
									<th className="text-left py-2 px-3">Country</th>
									<th className="text-left py-2 px-3">IP</th>
									<th className="text-left py-2 px-3">Bot Score</th>
									<th className="text-left py-2 px-3">ASN</th>
									<th className="text-left py-2 px-3">TLS Ver</th>
									<th className="text-left py-2 px-3">JA3 Hash</th>
									<th className="text-left py-2 px-3">Date</th>
								</tr>
							</thead>
							<tbody>
								{submissions.length === 0 ? (
									<tr>
										<td colSpan={10} className="text-center py-4 text-muted-foreground">
											No submissions yet
										</td>
									</tr>
								) : (
									submissions.map((sub) => (
										<tr
											key={sub.id}
											className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
											onClick={() => loadSubmissionDetail(sub.id)}
										>
											<td className="py-2 px-3 font-mono text-xs">{sub.id}</td>
											<td className="py-2 px-3">
												{sub.first_name} {sub.last_name}
											</td>
											<td className="py-2 px-3 text-xs">{sub.email}</td>
											<td className="py-2 px-3">{sub.country || 'N/A'}</td>
											<td className="py-2 px-3 font-mono text-xs">
												{sub.remote_ip || 'N/A'}
											</td>
											<td className="py-2 px-3">
												<span
													className={`font-semibold ${
														sub.bot_score && sub.bot_score < 30
															? 'text-destructive'
															: sub.bot_score && sub.bot_score >= 70
															? 'text-green-600 dark:text-green-400'
															: 'text-yellow-600 dark:text-yellow-400'
													}`}
												>
													{sub.bot_score !== null ? sub.bot_score : 'N/A'}
												</span>
											</td>
											<td className="py-2 px-3 font-mono text-xs">
												{sub.asn || 'N/A'}
											</td>
											<td className="py-2 px-3 font-mono text-xs">
												{sub.tls_version || 'N/A'}
											</td>
											<td className="py-2 px-3 font-mono text-xs truncate max-w-[100px]">
												{sub.ja3_hash
													? `${sub.ja3_hash.substring(0, 12)}...`
													: 'N/A'}
											</td>
											<td className="py-2 px-3 text-xs">
												{new Date(sub.created_at).toLocaleString()}
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
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
						<div className="space-y-2">
							{countries.length === 0 ? (
								<p className="text-muted-foreground">No data available</p>
							) : (
								countries.slice(0, 10).map((item) => (
									<div
										key={item.country}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-medium">{item.country}</span>
										<span className="text-muted-foreground">{item.count}</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Bot Score Distribution</CardTitle>
						<CardDescription>Score ranges</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{botScores.length === 0 ? (
								<p className="text-muted-foreground">No data available</p>
							) : (
								botScores.map((item) => (
									<div
										key={item.score_range}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-medium">{item.score_range}</span>
										<span className="text-muted-foreground">{item.count}</span>
									</div>
								))
							)}
						</div>
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
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								asnData.map((item) => (
									<div
										key={item.asn}
										className="flex flex-col py-2 border-b last:border-0"
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm font-medium">
												AS{item.asn}
											</span>
											<span className="text-muted-foreground text-sm">
												{item.count}
											</span>
										</div>
										{item.as_organization && (
											<span className="text-xs text-muted-foreground truncate">
												{item.as_organization}
											</span>
										)}
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>TLS Versions</CardTitle>
						<CardDescription>TLS versions & ciphers</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{tlsData.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								tlsData.map((item, idx) => (
									<div
										key={`${item.tls_version}-${item.tls_cipher}-${idx}`}
										className="flex flex-col py-2 border-b last:border-0"
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm font-medium">
												{item.tls_version}
											</span>
											<span className="text-muted-foreground text-sm">
												{item.count}
											</span>
										</div>
										{item.tls_cipher && (
											<span className="text-xs text-muted-foreground font-mono truncate">
												{item.tls_cipher}
											</span>
										)}
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>JA3 Fingerprints</CardTitle>
						<CardDescription>Top JA3 hashes</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{ja3Data.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								ja3Data.map((item) => (
									<div
										key={item.ja3_hash}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-mono text-xs truncate flex-1 mr-2">
											{item.ja3_hash}
										</span>
										<span className="text-muted-foreground text-sm">
											{item.count}
										</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>JA4 Fingerprints</CardTitle>
						<CardDescription>Top JA4 hashes</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{ja4Data.length === 0 ? (
								<p className="text-muted-foreground text-sm">No data available</p>
							) : (
								ja4Data.map((item) => (
									<div
										key={item.ja4}
										className="flex items-center justify-between py-2 border-b last:border-0"
									>
										<span className="font-mono text-xs truncate flex-1 mr-2">
											{item.ja4}
										</span>
										<span className="text-muted-foreground text-sm">
											{item.count}
										</span>
									</div>
								))
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Submission Detail Modal */}
			<Dialog
				open={selectedSubmission !== null}
				onClose={() => setSelectedSubmission(null)}
			>
				<DialogContent className="p-0">
					{modalLoading ? (
						<div className="flex items-center justify-center py-12">
							<p className="text-muted-foreground">Loading details...</p>
						</div>
					) : selectedSubmission ? (
						<>
							<DialogHeader>
								<DialogTitle>
									Submission Details - ID #{selectedSubmission.id}
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
												{selectedSubmission.first_name}{' '}
												{selectedSubmission.last_name}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Email:</span>
											<p className="font-medium">{selectedSubmission.email}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Phone:</span>
											<p className="font-medium">{selectedSubmission.phone}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Date of Birth:</span>
											<p className="font-medium">
												{selectedSubmission.date_of_birth}
											</p>
										</div>
										<div className="col-span-2">
											<span className="text-muted-foreground">Address:</span>
											<p className="font-medium">{selectedSubmission.address}</p>
										</div>
										<div>
											<span className="text-muted-foreground">Submitted:</span>
											<p className="font-medium">
												{new Date(
													selectedSubmission.created_at
												).toLocaleString()}
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
											<p className="font-mono text-xs">
												{selectedSubmission.remote_ip}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Country:</span>
											<p className="font-medium">
												{selectedSubmission.country || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Region:</span>
											<p className="font-medium">
												{selectedSubmission.region || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">City:</span>
											<p className="font-medium">
												{selectedSubmission.city || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Postal Code:</span>
											<p className="font-medium">
												{selectedSubmission.postal_code || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Timezone:</span>
											<p className="font-medium">
												{selectedSubmission.timezone || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Coordinates:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.latitude &&
												selectedSubmission.longitude
													? `${selectedSubmission.latitude}, ${selectedSubmission.longitude}`
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Continent:</span>
											<p className="font-medium">
												{selectedSubmission.continent || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">EU Country:</span>
											<p className="font-medium">
												{selectedSubmission.is_eu_country ? 'Yes' : 'No'}
											</p>
										</div>
									</div>
								</div>

								{/* Network Data */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Network Data</h3>
									<div className="grid grid-cols-2 gap-4 text-sm">
										<div className="col-span-2">
											<span className="text-muted-foreground">User Agent:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.user_agent}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">ASN:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.asn
													? `AS${selectedSubmission.asn}`
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">
												AS Organization:
											</span>
											<p className="font-medium text-xs">
												{selectedSubmission.as_organization || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Colo:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.colo || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">HTTP Protocol:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.http_protocol || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">TLS Version:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.tls_version || 'N/A'}
											</p>
										</div>
										<div className="col-span-2">
											<span className="text-muted-foreground">TLS Cipher:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.tls_cipher || 'N/A'}
											</p>
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
													selectedSubmission.bot_score &&
													selectedSubmission.bot_score < 30
														? 'text-destructive'
														: selectedSubmission.bot_score &&
														  selectedSubmission.bot_score >= 70
														? 'text-green-600 dark:text-green-400'
														: 'text-yellow-600 dark:text-yellow-400'
												}`}
											>
												{selectedSubmission.bot_score !== null
													? selectedSubmission.bot_score
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">
												Client Trust Score:
											</span>
											<p className="font-medium">
												{selectedSubmission.client_trust_score !== null
													? selectedSubmission.client_trust_score
													: 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Verified Bot:</span>
											<p className="font-medium">
												{selectedSubmission.verified_bot ? 'Yes' : 'No'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">Detection IDs:</span>
											<p className="font-mono text-xs">
												{selectedSubmission.detection_ids || 'N/A'}
											</p>
										</div>
									</div>
								</div>

								{/* Fingerprints */}
								<div>
									<h3 className="text-lg font-semibold mb-3">Fingerprints</h3>
									<div className="grid grid-cols-1 gap-4 text-sm">
										<div>
											<span className="text-muted-foreground">
												Ephemeral ID:
											</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ephemeral_id || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA3 Hash:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja3_hash || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA4:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja4 || 'N/A'}
											</p>
										</div>
										<div>
											<span className="text-muted-foreground">JA4 Signals:</span>
											<p className="font-mono text-xs break-all">
												{selectedSubmission.ja4_signals || 'N/A'}
											</p>
										</div>
									</div>
								</div>
							</div>
						</>
					) : null}
				</DialogContent>
			</Dialog>
			</div>
		</>
	);
}
