import { useState, useEffect } from 'react';
import { Label } from './ui/label';
import { Input } from './ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './ui/select';

interface AddressData {
	street?: string;
	street2?: string;
	city?: string;
	state?: string;
	postalCode?: string;
	country?: string;
}

interface AddressInputProps {
	value?: AddressData;
	onChange: (address: AddressData) => void;
	disabled?: boolean;
	error?: boolean;
	defaultCountry?: string;
}

const COUNTRIES = [
	{ code: 'US', name: 'United States', postalLabel: 'ZIP Code', stateLabel: 'State' },
	{ code: 'GB', name: 'United Kingdom', postalLabel: 'Postcode', stateLabel: 'County' },
	{ code: 'CA', name: 'Canada', postalLabel: 'Postal Code', stateLabel: 'Province' },
	{ code: 'AU', name: 'Australia', postalLabel: 'Postcode', stateLabel: 'State' },
	{ code: 'DE', name: 'Germany', postalLabel: 'Postleitzahl', stateLabel: 'State' },
	{ code: 'FR', name: 'France', postalLabel: 'Code Postal', stateLabel: 'Region' },
	{ code: 'JP', name: 'Japan', postalLabel: 'Postal Code', stateLabel: 'Prefecture' },
	{ code: 'IN', name: 'India', postalLabel: 'PIN Code', stateLabel: 'State' },
	{ code: 'BR', name: 'Brazil', postalLabel: 'CEP', stateLabel: 'State' },
	{ code: 'MX', name: 'Mexico', postalLabel: 'Código Postal', stateLabel: 'State' },
];

export function AddressInput({ value, onChange, disabled, error, defaultCountry = '' }: AddressInputProps) {
	const [address, setAddress] = useState<AddressData>(
		value || {
			street: '',
			street2: '',
			city: '',
			state: '',
			postalCode: '',
			country: defaultCountry.toUpperCase(),
		}
	);

	useEffect(() => {
		if (value) {
			setAddress(value);
		}
	}, [value]);

	// Update country when defaultCountry prop changes (from geo API)
	useEffect(() => {
		if (!value) {
			setAddress((prev) => ({
				...prev,
				country: defaultCountry.toUpperCase(),
			}));
		}
	}, [defaultCountry, value]);

	const selectedCountry = COUNTRIES.find((c) => c.code === address.country) || COUNTRIES[0];

	const handleChange = (field: keyof AddressData, val: string) => {
		const updated = { ...address, [field]: val };
		setAddress(updated);

		// Only call onChange if user has filled any field
		const hasContent = updated.street || updated.street2 || updated.city || updated.state || updated.postalCode;
		if (hasContent || field === 'country') {
			onChange(updated);
		}
	};

	const inputClassName = `h-11 ${error ? 'border-destructive' : ''}`;

	return (
		<div className="space-y-4">
			<div className="flex items-baseline justify-between">
				<Label className="text-sm font-medium">
					Address <span className="text-xs text-muted-foreground font-normal">(Optional)</span>
				</Label>
			</div>

			{/* Country Selection */}
			<div className="space-y-2">
				<Label htmlFor="country" className="text-xs text-muted-foreground font-normal">
					Country
				</Label>
				<Select
					value={address.country}
					onValueChange={(value) => handleChange('country', value)}
					disabled={disabled}
				>
					<SelectTrigger className={error ? 'border-destructive' : ''}>
						<SelectValue placeholder="Select country..." />
					</SelectTrigger>
					<SelectContent>
						{COUNTRIES.map((country) => (
							<SelectItem key={country.code} value={country.code}>
								{country.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Street Address */}
			<div className="space-y-2">
				<Label htmlFor="street" className="text-xs text-muted-foreground font-normal">
					Street Address
				</Label>
				<Input
					id="street"
					value={address.street || ''}
					onChange={(e) => handleChange('street', e.target.value)}
					disabled={disabled}
					placeholder="123 Main Street"
					className={inputClassName}
				/>
			</div>

			{/* Apartment/Unit (Optional) */}
			<div className="space-y-2">
				<Label htmlFor="street2" className="text-xs text-muted-foreground font-normal">
					Apartment, Suite, Unit (Optional)
				</Label>
				<Input
					id="street2"
					value={address.street2 || ''}
					onChange={(e) => handleChange('street2', e.target.value)}
					disabled={disabled}
					placeholder="Apt 4B"
					className={inputClassName}
				/>
			</div>

			{/* City / State / Postal Code Grid */}
			<div className="grid grid-cols-2 gap-4">
				{/* City */}
				<div className="space-y-2 col-span-2 sm:col-span-1">
					<Label htmlFor="city" className="text-xs text-muted-foreground font-normal">
						City
					</Label>
					<Input
						id="city"
						value={address.city || ''}
						onChange={(e) => handleChange('city', e.target.value)}
						disabled={disabled}
						placeholder="New York"
						className={inputClassName}
					/>
				</div>

				{/* State/Province */}
				<div className="space-y-2">
					<Label htmlFor="state" className="text-xs text-muted-foreground font-normal">
						{selectedCountry.stateLabel}
					</Label>
					<Input
						id="state"
						value={address.state || ''}
						onChange={(e) => handleChange('state', e.target.value)}
						disabled={disabled}
						placeholder="NY"
						className={inputClassName}
					/>
				</div>
			</div>

			{/* Postal Code */}
			<div className="space-y-2 max-w-[50%]">
				<Label htmlFor="postalCode" className="text-xs text-muted-foreground font-normal">
					{selectedCountry.postalLabel}
				</Label>
				<Input
					id="postalCode"
					value={address.postalCode || ''}
					onChange={(e) => handleChange('postalCode', e.target.value)}
					disabled={disabled}
					placeholder="10001"
					className={inputClassName}
				/>
			</div>
		</div>
	);
}
