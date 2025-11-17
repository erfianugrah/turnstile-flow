import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';

// Turnstile configuration from environment
const TURNSTILE_SITEKEY = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;

// Turnstile API types
declare global {
	interface Window {
		turnstile?: {
			ready(callback: () => void): void;
			render(
				container: string | HTMLElement,
				options: {
					sitekey: string;
					theme?: 'light' | 'dark' | 'auto';
					size?: 'normal' | 'flexible' | 'compact';
					appearance?: 'always' | 'execute' | 'interaction-only';
					execution?: 'render' | 'execute';
					retry?: 'auto' | 'never';
					'refresh-expired'?: 'auto' | 'manual' | 'never';
					'response-field'?: boolean;
					action?: string;
					cData?: string;
					callback?: (token: string) => void;
					'error-callback'?: (error?: string) => void;
					'expired-callback'?: () => void;
					'timeout-callback'?: () => void;
					'before-interactive-callback'?: () => void;
					'after-interactive-callback'?: () => void;
					'unsupported-callback'?: () => void;
					language?: string;
					tabindex?: number;
				}
			): string;
			reset(widgetId: string): void;
			remove(widgetId: string): void;
			execute(widgetId: string | HTMLElement): void;
			getResponse(widgetId: string): string | undefined;
		};
	}
}

interface TurnstileWidgetProps {
	onValidated: (token: string) => void;
	onError?: (error?: string) => void;
	onBeforeInteractive?: () => void;
	onAfterInteractive?: () => void;
	onExpired?: () => void;
	onTimeout?: () => void;
	onUnsupported?: () => void;
	action?: string;
}

export interface TurnstileWidgetHandle {
	execute: () => void;
	reset: () => void;
	isReady: () => boolean;
}

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
	({
		onValidated,
		onError,
		onBeforeInteractive,
		onAfterInteractive,
		onExpired,
		onTimeout,
		onUnsupported,
		action = 'registration-form'
	}, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const widgetIdRef = useRef<string | null>(null);
		const [isLoading, setIsLoading] = useState(true);
		const [isExecuted, setIsExecuted] = useState(false);
		const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		// Check if Turnstile script is loaded
		if (!window.turnstile) {
			setError('Turnstile script not loaded');
			setIsLoading(false);
			return;
		}

		// Get current theme
		const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

		// Prevent double-rendering in React Strict Mode (development)
		let isRendering = false;

		// Render widget when ready
		window.turnstile.ready(() => {
			if (!containerRef.current || widgetIdRef.current || isRendering) return;

			isRendering = true;

			try {
				const widgetId = window.turnstile!.render(containerRef.current, {
					sitekey: TURNSTILE_SITEKEY,
					theme: 'auto', // Auto syncs with system preference
					size: 'flexible', // Responsive
					appearance: 'execute', // Show when executed
					execution: 'execute', // Manual trigger on form submit
					retry: 'auto',
					'refresh-expired': 'auto',
					'response-field': false, // Manual token handling
					action,
					callback: (token) => {
						console.log('Turnstile validation successful', { timestamp: Date.now() });
						onValidated(token);
					},
					'error-callback': (err) => {
						console.error('Turnstile error:', err);
						setError('Verification failed. Please try again.');
						onError?.(err);
					},
					'expired-callback': () => {
						console.warn('Turnstile token expired');
						setError('Verification expired. Please try again.');
						onExpired?.();
					},
					'timeout-callback': () => {
						console.warn('Turnstile timeout');
						setError('Verification timed out. Please try again.');
						onTimeout?.();
					},
					'before-interactive-callback': () => {
						console.log('Turnstile entering interactive mode');
						onBeforeInteractive?.();
					},
					'after-interactive-callback': () => {
						console.log('Turnstile leaving interactive mode');
						onAfterInteractive?.();
					},
					'unsupported-callback': () => {
						console.error('Turnstile not supported');
						setError('Your browser does not support verification.');
						onUnsupported?.();
					},
					language: 'auto',
					tabindex: 0,
				});

				widgetIdRef.current = widgetId;
				setIsLoading(false);
				console.log('Turnstile widget rendered:', widgetId, { timestamp: Date.now() });
			} catch (err) {
				console.error('Error rendering Turnstile:', err);
				setError('Failed to load verification widget');
				setIsLoading(false);
			} finally {
				isRendering = false;
			}
		});

		// Cleanup on unmount
		return () => {
			if (widgetIdRef.current && window.turnstile) {
				try {
					console.log('Cleaning up Turnstile widget:', widgetIdRef.current);
					window.turnstile.remove(widgetIdRef.current);
					widgetIdRef.current = null;
				} catch (err) {
					console.error('Error removing Turnstile widget:', err);
				}
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []); // Only run once on mount - callbacks are captured in closure

	// Expose methods to parent component via ref
	useImperativeHandle(ref, () => ({
		execute: () => {
			console.log('Execute called, widgetId:', widgetIdRef.current);
			if (widgetIdRef.current && window.turnstile) {
				setIsExecuted(true);
				window.turnstile.execute(widgetIdRef.current);
			} else {
				console.error('Cannot execute: widgetId not available');
			}
		},
		reset: () => {
			console.log('Reset called, widgetId:', widgetIdRef.current);
			if (widgetIdRef.current && window.turnstile) {
				window.turnstile.reset(widgetIdRef.current);
				setIsExecuted(false);
				setError(null);
			}
		},
		isReady: () => {
			return widgetIdRef.current !== null && window.turnstile !== undefined;
		},
	}));

		return (
			<div className="turnstile-container" data-testid="turnstile-widget">
				{/* Turnstile widget container - hidden until executed */}
				<div ref={containerRef} className={isExecuted ? '' : 'hidden'} />

				{/* Loading state */}
				{isLoading && (
					<div className="flex items-center justify-center gap-3 py-8">
						<div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full"></div>
						<span className="text-sm text-muted-foreground">Loading verification...</span>
					</div>
				)}

				{/* Ready state - animated placeholder */}
				{!isLoading && !isExecuted && !error && (
					<div className="flex flex-col items-center justify-center py-8 gap-4">
						<div className="relative">
							{/* Pulsing background effect */}
							<div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
							{/* Shield icon */}
							<div className="relative bg-primary/10 p-4 rounded-full">
								<svg
									className="w-12 h-12 text-primary"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
									/>
								</svg>
							</div>
						</div>
						<div className="text-center space-y-1">
							<p className="text-sm font-medium text-foreground">Security Check Ready</p>
							<p className="text-xs text-muted-foreground">Verification will start when you submit</p>
						</div>
					</div>
				)}

				{/* Error state */}
				{error && (
					<div className="flex items-center justify-center gap-2 py-4 px-3 bg-destructive/10 rounded-md">
						<svg className="w-5 h-5 text-destructive flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span className="text-sm text-destructive">{error}</span>
					</div>
				)}
			</div>
		);
	}
);

TurnstileWidget.displayName = 'TurnstileWidget';

export default TurnstileWidget;
