import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { format, subDays, subHours, startOfDay, endOfDay } from 'date-fns';

interface DateRange {
	start: Date;
	end: Date;
}

interface Preset {
	label: string;
	getValue: () => DateRange;
}

interface DateRangePickerProps {
	value: DateRange;
	onChange: (range: DateRange) => void;
	className?: string;
}

const PRESETS: Preset[] = [
	{
		label: 'Last 24 hours',
		getValue: () => ({
			start: subHours(new Date(), 24),
			end: new Date(),
		}),
	},
	{
		label: 'Last 7 days',
		getValue: () => ({
			start: startOfDay(subDays(new Date(), 7)),
			end: endOfDay(new Date()),
		}),
	},
	{
		label: 'Last 30 days',
		getValue: () => ({
			start: startOfDay(subDays(new Date(), 30)),
			end: endOfDay(new Date()),
		}),
	},
	{
		label: 'Last 90 days',
		getValue: () => ({
			start: startOfDay(subDays(new Date(), 90)),
			end: endOfDay(new Date()),
		}),
	},
];

/**
 * DateRangePicker component with preset options
 * Provides quick date range selection for analytics filtering
 */
export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handlePresetClick = (preset: Preset) => {
		const range = preset.getValue();
		onChange(range);
		setIsOpen(false);
	};

	const formatDateRange = (range: DateRange) => {
		const startStr = format(range.start, 'MMM d');
		const endStr = format(range.end, 'MMM d, yyyy');
		return `${startStr} - ${endStr}`;
	};

	return (
		<div className={`relative ${className}`} ref={dropdownRef}>
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full flex items-center gap-2 px-4 py-2 border border-border rounded-md bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<Calendar size={18} />
				<span className="text-sm flex-1 text-left">{formatDateRange(value)}</span>
				<ChevronDown
					size={16}
					className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-md shadow-lg z-50">
					<div className="p-2 bg-card">
						<div className="text-xs font-medium text-muted-foreground px-2 py-1 mb-1">
							Quick Select
						</div>
						{PRESETS.map((preset) => (
							<button
								key={preset.label}
								onClick={() => handlePresetClick(preset)}
								className="w-full text-left px-3 py-2 text-sm text-foreground rounded hover:bg-accent hover:text-accent-foreground transition-colors"
							>
								{preset.label}
							</button>
						))}
						<div className="border-t border-border my-2" />
						<div className="px-3 py-2 text-xs text-muted-foreground">
							Custom range coming soon
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
