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
 *
 * Features:
 * - Dual-thumb slider with live value display
 * - Larger 24px thumbs for easier interaction (especially on mobile/touch)
 * - Smart z-index management - active thumb is always on top
 * - Fast 100ms debounce for responsive feel
 * - Visual feedback: grab cursor, scale on hover/active, enhanced shadows
 * - Touch and mouse support with proper event handling
 * - Accessibility: aria-labels and focus-visible outlines
 * - Minimum width of 200px to prevent unusable tiny sliders
 * - Smooth track highlight transitions
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
	const [activeThumb, setActiveThumb] = useState<'min' | 'max' | null>(null);
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

	// Debounce onChange to avoid too many updates (reduced to 100ms for better responsiveness)
	const debouncedOnChange = useCallback(
		(newValue: [number, number]) => {
			setLocalValue(newValue);

			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}

			timerRef.current = setTimeout(() => {
				onChange(newValue);
			}, 100);
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

	const handleMinMouseDown = () => setActiveThumb('min');
	const handleMaxMouseDown = () => setActiveThumb('max');
	const handleMouseUp = () => setActiveThumb(null);

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
				<div className="relative pt-2 pb-2 min-w-[200px]">
					{/* Min Slider */}
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={localValue[0]}
						onChange={handleMinChange}
						onMouseDown={handleMinMouseDown}
						onMouseUp={handleMouseUp}
						onTouchStart={handleMinMouseDown}
						onTouchEnd={handleMouseUp}
						className="absolute w-full h-3 bg-transparent appearance-none cursor-pointer range-slider-thumb"
						style={{ zIndex: activeThumb === 'min' ? 5 : 3 }}
						aria-label="Minimum value"
					/>

					{/* Max Slider */}
					<input
						type="range"
						min={min}
						max={max}
						step={step}
						value={localValue[1]}
						onChange={handleMaxChange}
						onMouseDown={handleMaxMouseDown}
						onMouseUp={handleMouseUp}
						onTouchStart={handleMaxMouseDown}
						onTouchEnd={handleMouseUp}
						className="absolute w-full h-3 bg-transparent appearance-none cursor-pointer range-slider-thumb"
						style={{ zIndex: activeThumb === 'max' ? 5 : 4 }}
						aria-label="Maximum value"
					/>

					{/* Track Background */}
					<div className="relative h-3 bg-secondary rounded-full pointer-events-none">
						{/* Active Range Highlight */}
						<div
							className="absolute h-3 bg-primary rounded-full transition-all duration-75"
							style={{
								left: `${((localValue[0] - min) / (max - min)) * 100}%`,
								right: `${100 - ((localValue[1] - min) / (max - min)) * 100}%`,
							}}
						/>
					</div>
				</div>
			</div>

			<style>{`
				/* Webkit (Chrome, Safari, Edge) */
				.range-slider-thumb::-webkit-slider-thumb {
					appearance: none;
					width: 24px;
					height: 24px;
					border-radius: 50%;
					background: hsl(var(--primary));
					border: 3px solid hsl(var(--background));
					cursor: grab;
					box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
					transition: all 0.12s ease-out;
					position: relative;
				}

				.range-slider-thumb::-webkit-slider-thumb:hover {
					transform: scale(1.15);
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15);
				}

				.range-slider-thumb::-webkit-slider-thumb:active {
					cursor: grabbing;
					transform: scale(1.25);
					box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), 0 3px 8px rgba(0, 0, 0, 0.2);
				}

				.range-slider-thumb:focus {
					outline: none;
				}

				.range-slider-thumb:focus-visible::-webkit-slider-thumb {
					outline: 2px solid hsl(var(--primary));
					outline-offset: 2px;
				}

				/* Firefox */
				.range-slider-thumb::-moz-range-thumb {
					appearance: none;
					width: 24px;
					height: 24px;
					border-radius: 50%;
					background: hsl(var(--primary));
					border: 3px solid hsl(var(--background));
					cursor: grab;
					box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
					transition: all 0.12s ease-out;
				}

				.range-slider-thumb::-moz-range-thumb:hover {
					transform: scale(1.15);
					box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15);
				}

				.range-slider-thumb::-moz-range-thumb:active {
					cursor: grabbing;
					transform: scale(1.25);
					box-shadow: 0 6px 16px rgba(0, 0, 0, 0.25), 0 3px 8px rgba(0, 0, 0, 0.2);
				}

				.range-slider-thumb:focus-visible::-moz-range-thumb {
					outline: 2px solid hsl(var(--primary));
					outline-offset: 2px;
				}

				/* Remove default track styling */
				.range-slider-thumb::-webkit-slider-runnable-track {
					background: transparent;
				}

				.range-slider-thumb::-moz-range-track {
					background: transparent;
				}
			`}</style>
		</div>
	);
}
