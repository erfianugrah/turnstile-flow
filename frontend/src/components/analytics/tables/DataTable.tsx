import { useState } from 'react';
import {
	useReactTable,
	getCoreRowModel,
	getSortedRowModel,
	getPaginationRowModel,
	type ColumnDef,
	type SortingState,
	type PaginationState,
	flexRender,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface DataTableProps<TData> {
	data: TData[];
	columns: ColumnDef<TData, any>[];
	totalCount?: number;
	manualPagination?: boolean;
	manualSorting?: boolean;
	pagination?: PaginationState;
	sorting?: SortingState;
	onPaginationChange?: (pagination: PaginationState) => void;
	onSortingChange?: (sorting: SortingState) => void;
	className?: string;
}

/**
 * DataTable component using TanStack Table
 * Supports sorting, pagination, and custom column definitions
 */
export function DataTable<TData>({
	data,
	columns,
	totalCount,
	manualPagination = false,
	manualSorting = false,
	pagination: controlledPagination,
	sorting: controlledSorting,
	onPaginationChange,
	onSortingChange,
	className = '',
}: DataTableProps<TData>) {
	const [internalSorting, setInternalSorting] = useState<SortingState>([]);
	const [internalPagination, setInternalPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 10,
	});

	// Use controlled state if provided (manual mode), otherwise use internal state
	const sorting = manualSorting && controlledSorting ? controlledSorting : internalSorting;
	const pagination = manualPagination && controlledPagination ? controlledPagination : internalPagination;

	const table = useReactTable({
		data,
		columns,
		state: {
			sorting,
			pagination,
		},
		pageCount: totalCount ? Math.ceil(totalCount / pagination.pageSize) : undefined,
		onSortingChange: (updater) => {
			const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
			if (manualSorting && onSortingChange) {
				onSortingChange(newSorting);
			} else {
				setInternalSorting(newSorting);
			}
		},
		onPaginationChange: (updater) => {
			const newPagination = typeof updater === 'function' ? updater(pagination) : updater;
			if (manualPagination && onPaginationChange) {
				onPaginationChange(newPagination);
			} else {
				setInternalPagination(newPagination);
			}
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
		getPaginationRowModel: manualPagination ? undefined : getPaginationRowModel(),
		manualPagination,
		manualSorting,
	});

	return (
		<div className={`space-y-6 ${className}`}>
			<div className="border border-border rounded-lg overflow-hidden">
				<div className="overflow-x-auto">
					<table className="w-full min-w-full">
						<thead className="bg-muted/50 border-b border-border">
							{table.getHeaderGroups().map((headerGroup) => (
								<tr key={headerGroup.id}>
									{headerGroup.headers.map((header) => (
										<th
											key={header.id}
											className={`px-3 py-3.5 text-left text-sm font-semibold text-foreground`}
										>
											{header.isPlaceholder ? null : (
												<div
													className={
														header.column.getCanSort()
															? 'flex items-center gap-2 cursor-pointer select-none hover:text-primary'
															: ''
													}
													onClick={header.column.getToggleSortingHandler()}
												>
													{flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
													{header.column.getCanSort() && (
														<span className="flex items-center">
															{header.column.getIsSorted() ===
															'asc' ? (
																<ChevronUp size={16} />
															) : header.column.getIsSorted() ===
															  'desc' ? (
																<ChevronDown size={16} />
															) : (
																<ChevronsUpDown
																	size={16}
																	className="opacity-50"
																/>
															)}
														</span>
													)}
												</div>
											)}
										</th>
									))}
								</tr>
							))}
						</thead>
						<tbody>
							{table.getRowModel().rows.length === 0 ? (
								<tr>
									<td
										colSpan={columns.length}
										className="px-4 py-8 text-center text-muted-foreground"
									>
										No data available
									</td>
								</tr>
							) : (
								table.getRowModel().rows.map((row) => (
									<tr
										key={row.id}
										className="border-t border-border hover:bg-muted/40 transition-colors"
									>
										{row.getVisibleCells().map((cell) => (
											<td key={cell.id} className={`px-3 py-3.5 text-sm`}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</td>
										))}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Pagination Controls */}
			<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
				<div className="text-sm text-muted-foreground">
					{(() => {
						const total = totalCount || data.length;
						const start = Math.min(
							pagination.pageIndex * pagination.pageSize + 1,
							total
						);
						const end = Math.min(
							(pagination.pageIndex + 1) * pagination.pageSize,
							total
						);

						if (total === 0) return 'No results';
						if (total === 1) return 'Showing 1 result';
						return `Showing ${start} to ${end} of ${total} results`;
					})()}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						className="p-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Previous page"
					>
						<ChevronLeft size={18} />
					</button>
					<span className="text-sm text-muted-foreground px-2">
						Page {pagination.pageIndex + 1} of {table.getPageCount() || 1}
					</span>
					<button
						onClick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						className="p-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						aria-label="Next page"
					>
						<ChevronRight size={18} />
					</button>
				</div>
			</div>
		</div>
	);
}
