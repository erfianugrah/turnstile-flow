import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PhoneInput } from './phone';
import { DateOfBirthInput } from './DateOfBirthInput';
import { AddressInput } from './AddressInput';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import TurnstileWidget, { type TurnstileWidgetHandle } from './TurnstileWidget';
import { SubmissionFlow, type FlowStep } from './SubmissionFlow';
import { formSchema, type FormData } from '../lib/validation';

/**
 * Format seconds into human-readable countdown
 * Examples: "2:30", "45:00", "1d 3:45"
 */
function formatCountdown(seconds: number): string {
	if (seconds <= 0) return '0:00';

	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	if (days > 0) {
		return `${days}d ${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	} else if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
	} else {
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}
}

export default function SubmissionForm() {
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
	const [submitResult, setSubmitResult] = useState<{
		type: 'success' | 'error';
		message: string;
	} | null>(null);
	const [defaultCountry, setDefaultCountry] = useState<string>('us');
	const [flowStep, setFlowStep] = useState<FlowStep>('idle');
	const [flowError, setFlowError] = useState<string | undefined>();
	const [rateLimitInfo, setRateLimitInfo] = useState<{
		retryAfter: number; // seconds
		expiresAt: string; // ISO timestamp
		timeRemaining: number; // seconds (for countdown)
	} | null>(null);

	const turnstileRef = useRef<TurnstileWidgetHandle>(null);
	const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const hasSubmittedRef = useRef(false);
	const pendingFormDataRef = useRef<FormData | null>(null);

	// Detect user's country on mount
	useEffect(() => {
		const detectCountry = async () => {
			try {
				const response = await fetch('/api/geo');
				const data = await response.json();
				if ((data as any).success && (data as any).countryCode) {
					setDefaultCountry((data as any).countryCode.toLowerCase());
				}
			} catch (error) {
				console.error('Failed to detect country:', error);
				// Keep default 'us' if detection fails
			}
		};

		detectCountry();
	}, []);

	// Countdown timer for rate limiting
	useEffect(() => {
		if (!rateLimitInfo) return;

		// Update countdown every second
		const interval = setInterval(() => {
			const now = new Date().getTime();
			const expiresAt = new Date(rateLimitInfo.expiresAt).getTime();
			const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));

			if (remaining <= 0) {
				// Rate limit expired, clear it
				setRateLimitInfo(null);
				setSubmitResult(null);
			} else {
				// Update time remaining
				setRateLimitInfo(prev => prev ? { ...prev, timeRemaining: remaining } : null);
			}
		}, 1000);

		return () => clearInterval(interval);
	}, [rateLimitInfo]);

	const {
		register,
		handleSubmit: handleFormSubmit,
		formState: { errors, isSubmitting },
		reset,
		setValue,
		watch,
	} = useForm<FormData>({
		resolver: zodResolver(formSchema),
		mode: 'onBlur', // Validate on blur
	});

	const phoneValue = watch('phone');
	const dateOfBirthValue = watch('dateOfBirth');
	const addressValue = watch('address');

	const submitWithToken = async (data: FormData, token: string) => {
		setSubmitResult(null);
		setFlowError(undefined);
		setFlowStep('server-validation');

		// Submit form with token
		try {
			const response = await fetch('/api/submissions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...data,
					turnstileToken: token,
				}),
			});

			const result = await response.json() as any;

			if (response.ok) {
				setFlowStep('success');
				setFlowError(undefined); // Clear any previous errors
				setSubmitResult({
					type: 'success',
					message: result.message || 'Form submitted successfully!',
				});
				// Reset form after a delay
				setTimeout(() => {
					reset();
					setTurnstileToken(null);
					hasSubmittedRef.current = false;
					setFlowStep('idle');
					// Reset Turnstile
					if (turnstileRef.current) {
						turnstileRef.current.reset();
					}
				}, 3000);
			} else {
				// Log full error response for debugging
				console.error('Server error response:', {
					status: response.status,
					result,
				});

				// Handle different error types with appropriate messaging
				let userFriendlyMessage = result.message || 'Submission failed. Please try again.';

				// Fraud detection / Rate limiting (429, 403)
				if (response.status === 429) {
					// Extract rate limit information from response
					const retryAfter = result.retryAfter || 3600; // Default to 1 hour
					const expiresAt = result.expiresAt || new Date(Date.now() + retryAfter * 1000).toISOString();

					// Use server message if available, otherwise use default
					userFriendlyMessage = result.message || 'You have made too many submission attempts. Please wait before trying again.';

					// Set rate limit info for countdown timer
					setRateLimitInfo({
						retryAfter,
						expiresAt,
						timeRemaining: retryAfter,
					});
				} else if (response.status === 403) {
					userFriendlyMessage = 'Your submission has been blocked for security reasons. If you believe this is an error, please contact support.';
				} else if (response.status === 409) {
					// Duplicate email
					userFriendlyMessage = result.message || 'This email address has already been registered.';
				} else if (response.status === 400) {
					// Validation error - use server message
					userFriendlyMessage = result.message || 'Please check your information and try again.';
				} else if (response.status >= 500) {
					// Server error - use server message if available
					userFriendlyMessage = result.message || 'A server error occurred. Please try again in a few moments.';
				}

				setFlowStep('error');
				setFlowError(undefined); // Don't show in flow, only in Alert
				setSubmitResult({
					type: 'error',
					message: userFriendlyMessage,
				});
				setTurnstileToken(null);
				hasSubmittedRef.current = false;
				// Reset Turnstile
				if (turnstileRef.current) {
					turnstileRef.current.reset();
				}
			}
		} catch (error) {
			console.error('Submission error:', error);
			setFlowStep('error');
			setFlowError(undefined); // Don't show in flow, only in Alert
			setSubmitResult({
				type: 'error',
				message: 'A network error occurred. Please check your connection and try again.',
			});
			setTurnstileToken(null);
			hasSubmittedRef.current = false;
			// Reset Turnstile
			if (turnstileRef.current) {
				turnstileRef.current.reset();
			}
		}
	};

	const onSubmit = async (data: FormData) => {
		setSubmitResult(null);
		setFlowError(undefined);
		setFlowStep('validating');

		// Check if we already have a token
		if (turnstileToken) {
			// Already have token, submit directly
			await submitWithToken(data, turnstileToken);
			return;
		}

		// No token yet, trigger Turnstile
		pendingFormDataRef.current = data;
		if (turnstileRef.current) {
			setFlowStep('turnstile-challenge');
			turnstileRef.current.execute();
		}
	};

	const handleTurnstileValidated = (token: string) => {
		// Prevent duplicate submissions
		if (hasSubmittedRef.current) {
			return;
		}

		// Clear any pending submission timeout
		if (submitTimeoutRef.current) {
			clearTimeout(submitTimeoutRef.current);
		}

		setFlowStep('turnstile-success');
		setTurnstileToken(token);
		hasSubmittedRef.current = true;

		// Automatically submit stored form data after Turnstile validation
		// Pass token directly to avoid state update timing issues
		submitTimeoutRef.current = setTimeout(() => {
			const formData = pendingFormDataRef.current;
			if (formData) {
				pendingFormDataRef.current = null; // Clear after use
				submitWithToken(formData, token); // Call submit with token directly
			}
		}, 100);
	};

	const handleTurnstileError = (error?: string) => {
		console.error('Turnstile error:', error);
		setFlowStep('error');
		setFlowError(undefined); // Don't show in flow, only in Alert
		setSubmitResult({
			type: 'error',
			message: 'Security verification failed. Please refresh the page and try again.',
		});
		hasSubmittedRef.current = false;
	};

	const handleBeforeInteractive = () => {
		console.log('Before interactive mode');
		setFlowStep('turnstile-interactive');
	};

	const handleAfterInteractive = () => {
		console.log('After interactive mode');
		setFlowStep('turnstile-challenge');
	};

	const handleExpired = () => {
		console.log('Token expired');
		setFlowStep('error');
		setFlowError(undefined); // Don't show in flow, only in Alert
		setSubmitResult({
			type: 'error',
			message: 'Security verification expired. Please try again.',
		});
		setTurnstileToken(null);
		hasSubmittedRef.current = false;
	};

	const handleTimeout = () => {
		console.log('Challenge timeout');
		setFlowStep('error');
		setFlowError(undefined); // Don't show in flow, only in Alert
		setSubmitResult({
			type: 'error',
			message: 'Security verification timed out. Please try again.',
		});
		setTurnstileToken(null);
		hasSubmittedRef.current = false;
	};

	const handleUnsupported = () => {
		console.log('Browser unsupported');
		setFlowStep('error');
		setFlowError(undefined); // Don't show in flow, only in Alert
		setSubmitResult({
			type: 'error',
			message: 'Your browser does not support security verification. Please try a different browser.',
		});
		hasSubmittedRef.current = false;
	};

	return (
		<Card className="w-full max-w-2xl mx-auto shadow-xl border-border/50">
			<CardHeader className="space-y-2 pb-8">
				<CardTitle className="text-3xl font-bold tracking-tight">User Registration</CardTitle>
				<CardDescription className="text-base text-muted-foreground">
					Please fill in your details to complete the registration process
				</CardDescription>
			</CardHeader>
			<CardContent className="pb-8">
				<form
					id="submission-form"
					onSubmit={handleFormSubmit(onSubmit)}
					className="space-y-8"
				>
					{/* Personal Information Section */}
					<div className="space-y-5">
						<h3 className="text-lg font-semibold text-foreground border-b pb-2">
							Personal Information
						</h3>
						<div className="bg-muted/30 rounded-lg p-5 space-y-5">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
								<div className="space-y-2">
									<Label htmlFor="firstName" className="text-sm font-medium">
										First Name <span className="text-destructive">*</span>
									</Label>
									<Input
										id="firstName"
										{...register('firstName')}
										placeholder="John"
										disabled={isSubmitting}
										className={errors.firstName ? 'border-destructive' : ''}
										aria-invalid={!!errors.firstName}
										aria-describedby={errors.firstName ? 'firstName-error' : undefined}
									/>
									{errors.firstName && (
										<p id="firstName-error" className="text-sm text-destructive mt-1">
											{errors.firstName.message}
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="lastName" className="text-sm font-medium">
										Last Name <span className="text-destructive">*</span>
									</Label>
									<Input
										id="lastName"
										{...register('lastName')}
										placeholder="Doe"
										disabled={isSubmitting}
										className={errors.lastName ? 'border-destructive' : ''}
										aria-invalid={!!errors.lastName}
										aria-describedby={errors.lastName ? 'lastName-error' : undefined}
									/>
									{errors.lastName && (
										<p id="lastName-error" className="text-sm text-destructive mt-1">
											{errors.lastName.message}
										</p>
									)}
								</div>
							</div>
						</div>
					</div>

					{/* Contact Information Section */}
					<div className="space-y-5">
						<h3 className="text-lg font-semibold text-foreground border-b pb-2">
							Contact Information
						</h3>
						<div className="bg-muted/30 rounded-lg p-5 space-y-5">
							<div className="space-y-2">
								<Label htmlFor="email" className="text-sm font-medium">
									Email Address <span className="text-destructive">*</span>
								</Label>
								<Input
									id="email"
									type="email"
									{...register('email')}
									placeholder="john.doe@example.com"
									disabled={isSubmitting}
									className={errors.email ? 'border-destructive' : ''}
									aria-invalid={!!errors.email}
									aria-describedby={errors.email ? 'email-error' : undefined}
								/>
								{errors.email && (
									<p id="email-error" className="text-sm text-destructive mt-1">
										{errors.email.message}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="phone" className="text-sm font-medium">
									Phone Number{' '}
									<span className="text-xs text-muted-foreground font-normal">(Optional)</span>
								</Label>
								<PhoneInput
									defaultCountry={defaultCountry}
									value={phoneValue || ''}
									onChange={(phone) => setValue('phone', phone, { shouldValidate: true })}
									disabled={isSubmitting}
									error={!!errors.phone}
									placeholder="Phone number"
								/>
								{errors.phone && (
									<p id="phone-error" className="text-sm text-destructive mt-1">
										{errors.phone.message}
									</p>
								)}
							</div>

							<AddressInput
								value={addressValue}
								onChange={(address) => setValue('address', address, { shouldValidate: true })}
								disabled={isSubmitting}
								error={!!errors.address}
								defaultCountry={defaultCountry}
							/>
							{errors.address && (
								<p id="address-error" className="text-sm text-destructive mt-1">
									{errors.address.message as string}
								</p>
							)}
						</div>
					</div>

					{/* Additional Information Section */}
					<div className="space-y-5">
						<h3 className="text-lg font-semibold text-foreground border-b pb-2">
							Additional Information
						</h3>
						<div className="bg-muted/30 rounded-lg p-5">
							<DateOfBirthInput
								value={dateOfBirthValue || ''}
								onChange={(date) => setValue('dateOfBirth', date, { shouldValidate: true })}
								disabled={isSubmitting}
								error={!!errors.dateOfBirth}
							/>
							{errors.dateOfBirth && (
								<p id="dateOfBirth-error" className="text-sm text-destructive mt-1">
									{errors.dateOfBirth.message}
								</p>
							)}
						</div>
					</div>

					{/* Verification Section */}
					<div className="space-y-5">
						<h3 className="text-lg font-semibold text-foreground border-b pb-2">
							Security Verification
						</h3>

						{/* Visual submission flow */}
						<SubmissionFlow currentStep={flowStep} errorMessage={flowError} />

						{/* Turnstile widget */}
						<div className="bg-muted/30 rounded-lg p-5">
							<TurnstileWidget
								ref={turnstileRef}
								onValidated={handleTurnstileValidated}
								onError={handleTurnstileError}
								onBeforeInteractive={handleBeforeInteractive}
								onAfterInteractive={handleAfterInteractive}
								onExpired={handleExpired}
								onTimeout={handleTimeout}
								onUnsupported={handleUnsupported}
								action="registration-form"
							/>
						</div>
					</div>

					{/* Validation error summary */}
					{Object.keys(errors).length > 0 && (
						<Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
							<AlertTitle className="font-semibold">✗ Please fix the following errors:</AlertTitle>
							<AlertDescription>
								<ul className="list-disc list-inside space-y-1 mt-2">
									{errors.firstName && <li>{errors.firstName.message}</li>}
									{errors.lastName && <li>{errors.lastName.message}</li>}
									{errors.email && <li>{errors.email.message}</li>}
									{errors.phone && <li>{errors.phone.message}</li>}
									{errors.address && <li>Address: {typeof errors.address.message === 'string' ? errors.address.message : 'Invalid address'}</li>}
									{errors.dateOfBirth && <li>{errors.dateOfBirth.message}</li>}
								</ul>
							</AlertDescription>
						</Alert>
					)}

					{submitResult && (
						<Alert
							variant={submitResult.type === 'success' ? 'success' : 'destructive'}
							className="animate-in fade-in slide-in-from-top-2"
						>
							<AlertTitle className="font-semibold">
								{submitResult.type === 'success' ? '✓ Success!' : '✗ Error'}
							</AlertTitle>
							<AlertDescription>
								{submitResult.message}
								{rateLimitInfo && submitResult.type === 'error' && (
									<div className="mt-3 pt-3 border-t border-destructive/20">
										<div className="flex items-center gap-2">
											<svg className="w-5 h-5 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
											<span className="font-semibold">
												Time remaining: {formatCountdown(rateLimitInfo.timeRemaining)}
											</span>
										</div>
									</div>
								)}
							</AlertDescription>
						</Alert>
					)}

					<div className="border-t pt-8 mt-8 space-y-4">
						<Button
							type="submit"
							variant="default"
							className="w-full h-12 text-base font-semibold hover:shadow-lg active:shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
							disabled={isSubmitting || !!rateLimitInfo}
						>
							{isSubmitting ? (
								<span className="flex items-center justify-center gap-2 text-inherit">
									<svg
										className="animate-spin h-5 w-5 text-inherit"
										xmlns="http://www.w3.org/2000/svg"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
										></circle>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
									Processing...
								</span>
							) : (
								<span className="flex items-center justify-center gap-2 text-inherit">
									<svg className="w-5 h-5 text-inherit" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									Submit
								</span>
							)}
						</Button>
						<p className="text-xs text-center text-muted-foreground">
							By submitting, you agree to our data collection practices
						</p>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
