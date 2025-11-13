import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

interface Option {
	value: string;
	label: string;
}

interface MultiSelectProps {
	options: Option[];
	value: string[];
	onChange: (values: string[]) => void;
	placeholder?: string;
	label?: string;
	className?: string;
}

/**
 * MultiSelect component for filtering by multiple values
 * Used for countries, ASNs, TLS versions, etc.
 */
export function MultiSelect({
	options,
	value,
	onChange,
	placeholder = 'Select...',
	label,
	className = '',
}: MultiSelectProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchTerm, setSearchTerm] = useState('');
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

	const toggleOption = (optionValue: string) => {
		if (value.includes(optionValue)) {
			onChange(value.filter((v) => v !== optionValue));
		} else {
			onChange([...value, optionValue]);
		}
	};

	const removeValue = (optionValue: string, e: React.MouseEvent) => {
		e.stopPropagation();
		onChange(value.filter((v) => v !== optionValue));
	};

	const clearAll = (e: React.MouseEvent) => {
		e.stopPropagation();
		onChange([]);
	};

	const filteredOptions = options.filter((option) =>
		option.label.toLowerCase().includes(searchTerm.toLowerCase())
	);

	const selectedLabels = value
		.map((v) => options.find((o) => o.value === v)?.label)
		.filter(Boolean);

	return (
		<div className={`relative ${className}`} ref={dropdownRef}>
			{label && (
				<label className="block text-sm font-medium text-foreground mb-1">{label}</label>
			)}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center justify-between w-full px-4 py-2 border border-border rounded-md bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<div className="flex items-center gap-2 flex-1 overflow-hidden">
					{value.length === 0 ? (
						<span className="text-muted-foreground text-sm">{placeholder}</span>
					) : (
						<div className="flex items-center gap-1 flex-wrap">
							{selectedLabels.slice(0, 2).map((label, idx) => (
								<span
									key={idx}
									className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
								>
									{label}
									<button
										onClick={(e) => removeValue(value[idx], e)}
										className="hover:text-primary/70"
									>
										<X size={12} />
									</button>
								</span>
							))}
							{value.length > 2 && (
								<span className="text-xs text-muted-foreground">
									+{value.length - 2} more
								</span>
							)}
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					{value.length > 0 && (
						<button onClick={clearAll} className="hover:text-destructive">
							<X size={16} />
						</button>
					)}
					<ChevronDown
						size={16}
						className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
					/>
				</div>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-md shadow-lg z-50 max-h-80 overflow-hidden flex flex-col">
					<div className="p-2 border-b border-border bg-card">
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search..."
							className="w-full px-3 py-2 text-sm border border-border rounded bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
					<div className="overflow-y-auto p-2 bg-card">
						{filteredOptions.length === 0 ? (
							<div className="px-3 py-2 text-sm text-muted-foreground">
								No options found
							</div>
						) : (
							filteredOptions.map((option) => {
								const isSelected = value.includes(option.value);
								return (
									<button
										key={option.value}
										onClick={() => toggleOption(option.value)}
										className="w-full flex items-center justify-between px-3 py-2 text-sm rounded text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
									>
										<span>{option.label}</span>
										{isSelected && (
											<Check size={16} className="text-primary" />
										)}
									</button>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}
