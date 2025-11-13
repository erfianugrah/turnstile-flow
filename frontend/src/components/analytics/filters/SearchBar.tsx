import { useState, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
}

/**
 * SearchBar component for text search across submissions
 * Searches: email, first_name, last_name, remote_ip
 */
export function SearchBar({
	value,
	onChange,
	placeholder = 'Search by email, name, or IP...',
	className = '',
}: SearchBarProps) {
	const [localValue, setLocalValue] = useState(value);

	// Debounce search input
	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newValue = e.target.value;
			setLocalValue(newValue);

			// Debounce the onChange callback
			const timer = setTimeout(() => {
				onChange(newValue);
			}, 300);

			return () => clearTimeout(timer);
		},
		[onChange]
	);

	const handleClear = useCallback(() => {
		setLocalValue('');
		onChange('');
	}, [onChange]);

	return (
		<div className={`relative ${className}`}>
			<div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
				<Search size={18} />
			</div>
			<input
				type="text"
				value={localValue}
				onChange={handleChange}
				placeholder={placeholder}
				className="w-full pl-10 pr-10 py-2 border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
			/>
			{localValue && (
				<button
					onClick={handleClear}
					className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Clear search"
				>
					<X size={18} />
				</button>
			)}
		</div>
	);
}
