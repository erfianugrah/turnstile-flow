import * as React from 'react';
import { cn } from '../../lib/utils';

interface DialogProps {
	open: boolean;
	onClose?: () => void;
	onOpenChange?: (open: boolean) => void;
	children: React.ReactNode;
}

export function Dialog({ open, onClose, onOpenChange, children }: DialogProps) {
	React.useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	}, [open]);

	const handleClose = () => {
		if (onClose) onClose();
		if (onOpenChange) onOpenChange(false);
	};

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
				onClick={onClose || onOpenChange ? handleClose : undefined}
			/>
			{/* Dialog - let DialogContent control max-width */}
			<div className="relative z-50">
				{children}
			</div>
		</div>
	);
}

export function DialogContent({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				'bg-background border rounded-lg shadow-xl dark:shadow-[0_20px_40px_rgba(0,0,0,0.7)]',
				'overflow-y-auto max-h-[90vh] w-full max-w-4xl',
				className
			)}
			{...props}
		>
			{children}
		</div>
	);
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn('flex flex-col space-y-1.5 p-6 border-b', className)}
			{...props}
		/>
	);
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h2
			className={cn('text-lg font-semibold leading-none tracking-tight', className)}
			{...props}
		/>
	);
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
	return (
		<p
			className={cn('text-sm text-muted-foreground', className)}
			{...props}
		/>
	);
}
