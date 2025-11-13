import { useState, useCallback, useRef, useEffect } from 'react';

interface RangeSliderProps {
	min: number;
	max: number;
	value: [number, number];
	onChange: (value: [number, number]) => void;
	label?: string;
	step?: number;
	className?: string;
}

/**
 * RangeSlider component for selecting a numeric range
 * Supports dual-thumb slider with live value display
 */
export function RangeSlider({
	min,
	max,
	value,
	onChange,
	label,
	step = 1,
	className = '',
}: RangeSliderProps) {
	const [localValue, setLocalValue] = useState(value);
	const timerRef = useRef<NodeJS.Timeout | null>(null);

	// Sync with external value changes
	useEffect(() => {
		setLocalValue(value);
	}, [value]);

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, []);

	// Debounce onChange to avoid too many updates
	const debouncedOnChange = useCallback(
		(newValue: [number, number]) => {
			setLocalValue(newValue);

			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}

			timerRef.current = setTimeout(() => {
				onChange(newValue);
			}, 300);
		},
		[onChange]
	);

	const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newMin = parseInt(e.target.value, 10);
		const newMax = Math.max(newMin, localValue[1]);
		debouncedOnChange([newMin, newMax]);
	};

	const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newMax = parseInt(e.target.value, 10);
		const newMin = Math.min(newMax, localValue[0]);
		debouncedOnChange([newMin, newMax]);
	};

	const handleReset = () => {
		onChange([min, max]);
	};

	const isFiltered = localValue[0] !== min || localValue[1] !== max;

	return (
		<div className={`space-y-2 ${className}`}>
			{label && (
				<div className="flex items-center justify-between">
					<label className="text-sm font-medium text-foreground">{label}</label>
					{isFiltered && (
						<button
							onClick={handleReset}
							className="text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Reset
						</button>
					)}
				</div>
			)}

			<div className="space-y-3">
				{/* Value Display */}
				<div className="flex items-center justify-center gap-6 text-sm">
					<span className="text-muted-foreground">
						Min: <span className="font-semibold text-foreground">{localValue[0]}</span>
					</span>
					<span className="text-muted-foreground">
						Max: <span className="font-semibold text-foreground">{localValue[1]}</span>
					</span>
				</div>

				{/* Sliders */}
				<div className="relative pt-1">
					{/* Min Slider */}
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={localValue[0]}
						onChange={handleMinChange}
						className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer range-slider-thumb"
						style={{ zIndex: localValue[0] > max - (max - min) / 4 ? 5 : 3 }}
					/>

					{/* Max Slider */}
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={localValue[1]}
						onChange={handleMaxChange}
						className="absolute w-full h-2 bg-transparent appearance-none cursor-pointer range-slider-thumb"
						style={{ zIndex: 4 }}
					/>

					{/* Track Background */}
					<div className="relative h-2 bg-secondary rounded-full">
						{/* Active Range Highlight */}
						<div
							className="absolute h-2 bg-primary rounded-full"
							style={{
								left: `${((localValue[0] - min) / (max - min)) * 100}%`,
								right: `${100 - ((localValue[1] - min) / (max - min)) * 100}%`,
							}}
						/>
					</div>
				</div>
			</div>

			<style>{`
				.range-slider-thumb::-webkit-slider-thumb {
					appearance: none;
					width: 18px;
					height: 18px;
					border-radius: 50%;
					background: hsl(var(--primary));
					border: 2px solid hsl(var(--background));
					cursor: pointer;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
					transition: all 0.15s ease;
				}

				.range-slider-thumb::-webkit-slider-thumb:hover {
					transform: scale(1.1);
					box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
				}

				.range-slider-thumb::-moz-range-thumb {
					appearance: none;
					width: 18px;
					height: 18px;
					border-radius: 50%;
					background: hsl(var(--primary));
					border: 2px solid hsl(var(--background));
					cursor: pointer;
					box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
					transition: all 0.15s ease;
				}

				.range-slider-thumb::-moz-range-thumb:hover {
					transform: scale(1.1);
					box-shadow: 0 3px 6px rgba(0, 0, 0, 0.15);
				}
			`}</style>
		</div>
	);
}
