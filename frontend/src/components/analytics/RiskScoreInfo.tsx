import type { ComponentType, SVGProps } from 'react';
import {
	AlertCircle,
	Shield,
	Mail,
	Fingerprint,
	Clock,
	Network,
	Info,
	Layers,
	Lock,
	Smartphone,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../ui/card';
import { useConfig } from '../../hooks/useConfig';
import type { FraudDetectionConfig } from '../../hooks/useConfig';

type WeightKey = keyof FraudDetectionConfig['risk']['weights'];
type IconType = ComponentType<SVGProps<SVGSVGElement>>;

const componentDetails: Array<{
	key: WeightKey;
	label: string;
	description: string;
	icon: IconType;
	color: string;
}> = [
	{
		key: 'emailFraud',
		label: 'Email Fraud',
		description: 'Markov-Mail score (0-100). Can block alone in defensive mode when pattern is high risk.',
		icon: Mail,
		color: 'text-yellow-500',
	},
	{
		key: 'ephemeralId',
		label: 'Device Tracking',
		description: 'Counts submissions per ephemeral_id (24h window). ≥2 drives risk; paired with validation/IP diversity for blocks.',
		icon: Fingerprint,
		color: 'text-orange-500',
	},
	{
		key: 'validationFrequency',
		label: 'Validation Frequency',
		description: 'Turnstile attempts per device (1h). 2 = warning, 3+ = 100 score; deterministic in defensive mode.',
		icon: Clock,
		color: 'text-blue-500',
	},
	{
		key: 'ipDiversity',
		label: 'IP Diversity',
		description: 'Unique IPs per device (24h). 2 IPs = 50 score, 3+ = 100. Weighted-only to avoid overblocking shared IPs.',
		icon: Network,
		color: 'text-purple-500',
	},
	{
		key: 'ja4SessionHopping',
		label: 'Session Hopping',
		description: 'JA4 clustering + velocity. Flags same-browser session hopping; deterministic in defensive mode.',
		icon: AlertCircle,
		color: 'text-pink-500',
	},
	{
		key: 'ipRateLimit',
		label: 'IP Rate Limit',
		description: 'Behavioral velocity per IP (1h curve 1→0, 5+→100). Never blocks alone; just adds weight.',
		icon: Shield,
		color: 'text-cyan-500',
	},
	{
		key: 'headerFingerprint',
		label: 'Header Fingerprint',
		description: 'Shared header stack across IPs/JA4s (60m, min 3 reqs/2 IPs/2 JA4). Attribution trigger; needs total ≥ threshold.',
		icon: Layers,
		color: 'text-rose-500',
	},
	{
		key: 'tlsAnomaly',
		label: 'TLS Anomaly',
		description: 'Unknown TLS ClientHello for this JA4 (24h baseline, ≥5 samples). Attribution trigger; needs total ≥ threshold.',
		icon: Lock,
		color: 'text-indigo-500',
	},
	{
		key: 'latencyMismatch',
		label: 'Latency Mismatch',
		description: 'Claimed mobile with impossible RTT (<6ms) or datacenter ASN. Attribution trigger; needs total ≥ threshold.',
		icon: Smartphone,
		color: 'text-lime-500',
	},
];

export function RiskScoreInfo() {
	const { config } = useConfig();
	const weights = config.risk.weights;

	const formatWeight = (key: WeightKey) => `${Number((weights[key] * 100).toFixed(0))}%`;
	const tokenWeight = `${Number((weights.tokenReplay * 100).toFixed(0))}%`;
	const nonTokenPercent = `${Number(((1 - weights.tokenReplay) * 100).toFixed(0))}%`;

	return (
		<Card className="bg-muted/30">
			<CardHeader>
				<div className="flex items-start gap-2">
					<Shield className="h-5 w-5 text-primary mt-0.5" />
					<div>
						<h3 className="font-semibold text-sm">Behavioral Risk Scoring</h3>
						<p className="text-xs text-muted-foreground mt-1">
							Signals collected, weighted, and combined (block at ≥70/100) • Progressive timeouts (1h → 24h)
						</p>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
					{componentDetails.map(({ key, label, description, icon: Icon, color }) => (
						<div key={key} className="flex items-start gap-2">
							<Icon className={`h-4 w-4 ${color} mt-0.5 flex-shrink-0`} />
							<div>
								<p className="font-medium">
									{label} ({formatWeight(key)})
								</p>
								<p className="text-muted-foreground">{description}</p>
							</div>
						</div>
					))}
				</div>

				<div className="pt-2 border-t border-border space-y-2">
					<div className="flex items-start gap-1.5 text-xs text-muted-foreground">
						<Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
						<p>
							Token replay ({tokenWeight}) still triggers instantly via validation logs; submissions reflect the remaining nine
							behavioral/fingerprint components ({nonTokenPercent} total).
						</p>
					</div>
					<div className="flex items-center gap-4 text-xs flex-wrap">
						<div className="flex items-center gap-1.5">
							<div className="w-3 h-3 rounded-full bg-green-500/20 border-2 border-green-500" />
							<span className="text-muted-foreground">0-39: Low Risk</span>
						</div>
						<div className="flex items-center gap-1.5">
							<div className="w-3 h-3 rounded-full bg-yellow-500/20 border-2 border-yellow-500" />
							<span className="text-muted-foreground">40-69: Medium Risk</span>
						</div>
						<div className="flex items-center gap-1.5">
							<div className="w-3 h-3 rounded-full bg-red-500/20 border-2 border-red-500" />
							<span className="text-muted-foreground">70-100: High Risk (Blocked)</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
