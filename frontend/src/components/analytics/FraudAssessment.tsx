import { Card, CardHeader, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Calculator, Info } from 'lucide-react';
import type { FraudDetectionConfig } from '../../hooks/useConfig';

interface RiskComponent {
	score: number;
	weight: number;
	contribution: number;
	reason: string;
}

interface RiskBreakdown {
	total: number;
	components: {
		tokenReplay?: RiskComponent;
		emailFraud?: RiskComponent;
		ephemeralId?: RiskComponent;
		validationFrequency?: RiskComponent;
		ipDiversity?: RiskComponent;
		ja4SessionHopping?: RiskComponent;
		ipRateLimit?: RiskComponent;
	};
}

interface FraudAssessmentProps {
	breakdown: RiskBreakdown;
	config?: FraudDetectionConfig;
}

export function FraudAssessment({ breakdown, config }: FraudAssessmentProps) {
	const { total, components } = breakdown;

	// Use config thresholds or defaults
	const blockThreshold = config?.risk.blockThreshold ?? 70;
	const mediumThreshold = config?.risk.levels.medium.min ?? 40;

	const severity = total >= blockThreshold ? 'destructive' : total >= mediumThreshold ? 'default' : 'secondary';
	const severityColor =
		total >= blockThreshold
			? 'border-red-500 dark:border-red-400'
			: total >= mediumThreshold
			? 'border-yellow-500 dark:border-yellow-400'
			: 'border-green-500 dark:border-green-400';

	const severityText = total >= blockThreshold ? 'HIGH RISK (Blocked)' : total >= mediumThreshold ? 'MEDIUM RISK' : 'LOW RISK';

	return (
		<Card className={`border-l-4 ${severityColor}`}>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Calculator className="h-5 w-5" />
							Risk Score Calculation
						</h3>
						<p className="text-xs text-muted-foreground mt-1">
							{severityText} • Threshold: {blockThreshold}/100
						</p>
					</div>
					<Badge variant={severity} className="text-lg font-mono">
						{total}/100
					</Badge>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Overall progress bar */}
				<div>
					<div className="flex justify-between text-sm mb-2">
						<span>Final Risk Score</span>
						<span className="font-mono font-semibold">{total}/100</span>
					</div>
					<Progress value={total} className="h-3" />
				</div>

				{/* Calculation Formula */}
				<div className="space-y-3">
					<div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
						<Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
						<div>
							<p className="font-medium mb-1">How risk scores are calculated:</p>
							<p>Each component contributes: <span className="font-mono">Score × Weight = Contribution</span></p>
							<p className="mt-1">Final score = Sum of all contributions (max 100)</p>
						</div>
					</div>

					<h4 className="font-semibold text-sm">Component Breakdown:</h4>

					{/* Show ALL components in order, including zeros */}
					{getOrderedComponents(components).map(([key, component]) =>
						component ? (
							<ComponentCard
								key={key}
								name={formatComponentName(key)}
								component={component}
							/>
						) : null
					)}

					{/* Total calculation */}
					<div className="border-t-2 border-gray-300 dark:border-gray-700 pt-3 mt-3">
						<div className="flex items-center justify-between font-semibold">
							<span className="text-sm">Total Risk Score:</span>
							<span className="font-mono text-lg">{total}/100</span>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function ComponentCard({ name, component }: { name: string; component: RiskComponent }) {
	const hasScore = component.score > 0;

	const color = hasScore
		? component.score >= 70
			? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
			: component.score >= 40
			? 'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950'
			: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950'
		: 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/50';

	return (
		<div className={`border rounded-lg p-3 ${color} ${!hasScore && 'opacity-60'}`}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<span className="font-medium text-sm">{name}</span>
						{!hasScore && <Badge variant="secondary" className="text-xs">Not Triggered</Badge>}
					</div>
					<div className="text-xs text-muted-foreground mb-2">
						{component.reason}
					</div>

					{/* Calculation formula */}
					<div className="font-mono text-xs bg-white/50 dark:bg-black/20 rounded px-2 py-1 border border-gray-200 dark:border-gray-700">
						<span className={hasScore ? 'font-semibold' : ''}>{component.score}</span>
						{' × '}
						<span>{(component.weight * 100).toFixed(0)}%</span>
						{' = '}
						<span className={hasScore ? 'font-semibold text-base' : ''}>
							{component.contribution.toFixed(2)} pts
						</span>
					</div>
				</div>

				<Badge variant={hasScore ? "default" : "outline"} className="font-mono flex-shrink-0">
					{component.score}/100
				</Badge>
			</div>
		</div>
	);
}

function getOrderedComponents(components: RiskBreakdown['components']): [string, RiskComponent | undefined][] {
	// Return components in a fixed order for consistency
	const order = [
		'tokenReplay',
		'emailFraud',
		'ephemeralId',
		'validationFrequency',
		'ipDiversity',
		'ja4SessionHopping',
		'ipRateLimit',
	];

	return order.map(key => [key, components[key as keyof typeof components]] as [string, RiskComponent | undefined]);
}

function formatComponentName(key: string): string {
	const names: Record<string, string> = {
		tokenReplay: 'Token Replay (32%)',
		emailFraud: 'Email Fraud (16%)',
		ephemeralId: 'Device Tracking (17%)',
		validationFrequency: 'Validation Frequency (12%)',
		ipDiversity: 'IP Diversity (8%)',
		ja4SessionHopping: 'Session Hopping (7%)',
		ipRateLimit: 'IP Rate Limit (8%)',
	};
	return names[key] || key;
}
