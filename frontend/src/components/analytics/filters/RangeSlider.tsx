import { useState } from 'react';
import { Slider } from '../../ui/slider';
import { Button } from '../../ui/button';
import { RotateCcw } from 'lucide-react';

interface RangeSliderProps {
	min: number;
	max: number;
	value: [number, number];
	onChange: (value: [number, number]) => void;
	label: string;
	step?: number;
}

export function RangeSlider({
	min,
	max,
	value,
	onChange,
	label,
	step = 1,
}: RangeSliderProps) {
	const isFiltered = value[0] !== min || value[1] !== max;

	const handleReset = () => {
		onChange([min, max]);
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<label className="text-sm font-medium text-foreground">
					{label}
				</label>
				{isFiltered && (
					<Button
						variant="ghost"
						size="sm"
						onClick={handleReset}
						className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
					>
						<RotateCcw className="w-3 h-3 mr-1" />
						Reset
					</Button>
				)}
			</div>

			<div className="space-y-3">
				<div className="flex items-center justify-between text-sm">
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground font-medium">Min:</span>
						<span className="font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
							{value[0]}
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground font-medium">Max:</span>
						<span className="font-semibold text-foreground bg-muted px-2 py-0.5 rounded">
							{value[1]}
						</span>
					</div>
				</div>

				<div className="px-2 py-4">
					<Slider
						min={min}
						max={max}
						step={step}
						value={value}
						onValueChange={onChange}
					/>
				</div>
			</div>
		</div>
	);
}
