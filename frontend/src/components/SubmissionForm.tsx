import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PhoneInput } from './phone';
import { DateOfBirthInput } from './DateOfBirthInput';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import TurnstileWidget, { type TurnstileWidgetHandle } from './TurnstileWidget';
import { SubmissionFlow, type FlowStep } from './SubmissionFlow';
import { formSchema, type FormData } from '../lib/validation';

export default function SubmissionForm() {
	const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
	const [submitResult, setSubmitResult] = useState<{
		type: 'success' | 'error';
		message: string;
	} | null>(null);
	const [defaultCountry, setDefaultCountry] = useState<string>('us');
	const [flowStep, setFlowStep] = useState<FlowStep>('idle');
	const [flowError, setFlowError] = useState<string | undefined>();

	const turnstileRef = useRef<TurnstileWidgetHandle>(null);
	const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const hasSubmittedRef = useRef(false);

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

	const onSubmit = async (data: FormData) => {
		setSubmitResult(null);
		setFlowError(undefined);
		setFlowStep('validating');

		// Trigger Turnstile challenge if no token yet
		if (!turnstileToken) {
			if (turnstileRef.current) {
				setFlowStep('turnstile-challenge');
				turnstileRef.current.execute();
			}
			return;
		}

		// Submit form
		try {
			setFlowStep('server-validation');
			const response = await fetch('/api/submissions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...data,
					turnstileToken,
				}),
			});

			const result = await response.json() as any;

			if (response.ok) {
				setFlowStep('success');
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
				setFlowStep('error');
				setFlowError(result.message || 'Submission failed. Please try again.');
				setSubmitResult({
					type: 'error',
					message: result.message || 'Submission failed. Please try again.',
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
			setFlowError('An error occurred. Please try again.');
			setSubmitResult({
				type: 'error',
				message: 'An error occurred. Please try again.',
			});
			setTurnstileToken(null);
			hasSubmittedRef.current = false;
		}
	};

	const handleTurnstileValidated = (token: string) => {
		console.log('Turnstile validated, token received');

		// Prevent duplicate submissions
		if (hasSubmittedRef.current) {
			console.log('Already submitted, ignoring duplicate validation');
			return;
		}

		// Clear any pending submission timeout
		if (submitTimeoutRef.current) {
			clearTimeout(submitTimeoutRef.current);
		}

		setFlowStep('turnstile-success');
		setTurnstileToken(token);
		hasSubmittedRef.current = true;

		// Automatically submit form after Turnstile validation
		submitTimeoutRef.current = setTimeout(() => {
			const form = document.getElementById('submission-form') as HTMLFormElement;
			if (form) {
				form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
			}
		}, 100);
	};

	const handleTurnstileError = (error?: string) => {
		console.error('Turnstile error:', error);
		setFlowStep('error');
		setFlowError('Verification failed. Please try again.');
		setSubmitResult({
			type: 'error',
			message: 'Verification failed. Please try again.',
		});
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
		setFlowError('Verification expired. Please try again.');
	};

	const handleTimeout = () => {
		console.log('Challenge timeout');
		setFlowStep('error');
		setFlowError('Verification timed out. Please try again.');
	};

	const handleUnsupported = () => {
		console.log('Browser unsupported');
		setFlowStep('error');
		setFlowError('Your browser does not support verification.');
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
				<form id="submission-form" onSubmit={handleFormSubmit(onSubmit)} className="space-y-8">
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

							<div className="space-y-2">
								<Label htmlFor="address" className="text-sm font-medium">
									Address{' '}
									<span className="text-xs text-muted-foreground font-normal">(Optional)</span>
								</Label>
								<Input
									id="address"
									{...register('address')}
									placeholder="123 Main St, City, State, ZIP"
									disabled={isSubmitting}
									className={errors.address ? 'border-destructive' : ''}
									aria-invalid={!!errors.address}
									aria-describedby={errors.address ? 'address-error' : undefined}
								/>
								{errors.address && (
									<p id="address-error" className="text-sm text-destructive mt-1">
										{errors.address.message}
									</p>
								)}
							</div>
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

					{submitResult && (
						<Alert
							variant={submitResult.type === 'success' ? 'success' : 'destructive'}
							className="animate-in fade-in slide-in-from-top-2"
						>
							<AlertTitle className="font-semibold">
								{submitResult.type === 'success' ? '✓ Success!' : '✗ Error'}
							</AlertTitle>
							<AlertDescription>{submitResult.message}</AlertDescription>
						</Alert>
					)}

					<div className="border-t pt-8 mt-8 space-y-4">
						<Button
							type="submit"
							className="w-full h-12 text-base font-semibold shadow-md hover:shadow-lg active:shadow-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:bg-primary/90"
							disabled={isSubmitting}
						>
							{isSubmitting ? (
								<span className="flex items-center justify-center gap-2">
									<svg
										className="animate-spin h-5 w-5"
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
								<span className="flex items-center justify-center gap-2">
									<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
