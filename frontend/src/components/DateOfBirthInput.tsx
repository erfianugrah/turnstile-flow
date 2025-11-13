import { useState, useEffect } from 'react';
import { Label } from './ui/label';
import { ChevronDown } from 'lucide-react';

interface DateOfBirthInputProps {
	value?: string; // YYYY-MM-DD format
	onChange: (date: string) => void;
	disabled?: boolean;
	error?: boolean;
}

const MONTHS = [
	{ value: '01', label: 'January' },
	{ value: '02', label: 'February' },
	{ value: '03', label: 'March' },
	{ value: '04', label: 'April' },
	{ value: '05', label: 'May' },
	{ value: '06', label: 'June' },
	{ value: '07', label: 'July' },
	{ value: '08', label: 'August' },
	{ value: '09', label: 'September' },
	{ value: '10', label: 'October' },
	{ value: '11', label: 'November' },
	{ value: '12', label: 'December' },
];

// Generate years from 1900 to current year - 18 (must be 18+)
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1900 - 17 }, (_, i) => currentYear - 18 - i);

export function DateOfBirthInput({ value, onChange, disabled, error }: DateOfBirthInputProps) {
	const [month, setMonth] = useState('');
	const [day, setDay] = useState('');
	const [year, setYear] = useState('');

	// Parse initial value
	useEffect(() => {
		if (value) {
			const [y, m, d] = value.split('-');
			if (y && m && d) {
				setYear(y);
				setMonth(m);
				setDay(d);
			}
		}
	}, [value]);

	// Generate days based on selected month and year
	const getDaysInMonth = () => {
		if (!month || !year) return 31;
		const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
		return daysInMonth;
	};

	const daysInMonth = getDaysInMonth();
	const DAYS = Array.from({ length: daysInMonth }, (_, i) => {
		const dayNum = i + 1;
		return dayNum.toString().padStart(2, '0');
	});

	const handleChange = (type: 'month' | 'day' | 'year', value: string) => {
		let newMonth = month;
		let newDay = day;
		let newYear = year;

		if (type === 'month') {
			newMonth = value;
			setMonth(value);
		} else if (type === 'day') {
			newDay = value;
			setDay(value);
		} else {
			newYear = value;
			setYear(value);
		}

		// Only call onChange if all fields are filled
		if (newMonth && newDay && newYear) {
			onChange(`${newYear}-${newMonth}-${newDay}`);
		} else {
			// Reset if incomplete
			onChange('');
		}
	};

	const selectWrapperClassName = 'relative';

	const selectClassName = `
		w-full h-11 pl-3 pr-10 text-sm
		appearance-none
		rounded-lg border border-input
		bg-background
		ring-offset-background
		transition-colors
		focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
		disabled:cursor-not-allowed disabled:opacity-50
		hover:bg-accent/50
		dark:hover:bg-accent/20
		${error ? 'border-destructive focus-visible:ring-destructive' : ''}
		${disabled ? '' : 'cursor-pointer'}
	`.trim().replace(/\s+/g, ' ');

	return (
		<div className="space-y-2">
			<Label className="text-sm font-medium">
				Date of Birth <span className="text-xs text-muted-foreground">(Optional)</span>
			</Label>
			<div className="grid grid-cols-3 gap-2">
				{/* Month Select */}
				<div className="space-y-1.5">
					<Label htmlFor="month" className="text-xs text-muted-foreground font-normal">
						Month
					</Label>
					<div className={selectWrapperClassName}>
						<select
							id="month"
							value={month}
							onChange={(e) => handleChange('month', e.target.value)}
							disabled={disabled}
							className={selectClassName}
						>
							<option value="">Select</option>
							{MONTHS.map((m) => (
								<option key={m.value} value={m.value}>
									{m.label}
								</option>
							))}
						</select>
						<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					</div>
				</div>

				{/* Day Select */}
				<div className="space-y-1.5">
					<Label htmlFor="day" className="text-xs text-muted-foreground font-normal">
						Day
					</Label>
					<div className={selectWrapperClassName}>
						<select
							id="day"
							value={day}
							onChange={(e) => handleChange('day', e.target.value)}
							disabled={disabled || !month}
							className={selectClassName}
						>
							<option value="">Day</option>
							{DAYS.map((d) => (
								<option key={d} value={d}>
									{parseInt(d)}
								</option>
							))}
						</select>
						<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					</div>
				</div>

				{/* Year Select */}
				<div className="space-y-1.5">
					<Label htmlFor="year" className="text-xs text-muted-foreground font-normal">
						Year
					</Label>
					<div className={selectWrapperClassName}>
						<select
							id="year"
							value={year}
							onChange={(e) => handleChange('year', e.target.value)}
							disabled={disabled}
							className={selectClassName}
						>
							<option value="">Year</option>
							{YEARS.map((y) => (
								<option key={y} value={y}>
									{y}
								</option>
							))}
						</select>
						<ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					</div>
				</div>
			</div>
		</div>
	);
}
