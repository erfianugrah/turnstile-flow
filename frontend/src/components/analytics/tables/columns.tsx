import type { ColumnDef } from '@tanstack/react-table';
import type { Submission } from '../../../hooks/useSubmissions';

export function createSubmissionColumns(
	loadSubmissionDetail: (id: number) => void
): ColumnDef<Submission, any>[] {
	return [
		{
			accessorKey: 'id',
			header: 'ID',
			cell: ({ row }) => (
				<span className="text-xs font-mono text-muted-foreground">#{row.original.id}</span>
			),
		},
		{
			accessorKey: 'first_name',
			header: 'Name',
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.first_name} {row.original.last_name}
				</span>
			),
		},
		{
			accessorKey: 'email',
			header: 'Email',
			cell: ({ row }) => <span className="text-xs">{row.original.email}</span>,
		},
		{
			accessorKey: 'country',
			header: 'Country',
			cell: ({ row }) => <span>{row.original.country || 'N/A'}</span>,
		},
		{
			accessorKey: 'remote_ip',
			header: 'IP',
			cell: ({ row }) => (
				<span className="font-mono text-xs">{row.original.remote_ip || 'N/A'}</span>
			),
		},
		{
			accessorKey: 'bot_score',
			header: 'Bot Score',
			cell: ({ row }) => {
				const score = row.original.bot_score;
				return (
					<span
						className={`font-semibold ${
							score && score < 30
								? 'text-destructive'
								: score && score >= 70
								? 'text-green-600 dark:text-green-400'
								: 'text-yellow-600 dark:text-yellow-400'
						}`}
					>
						{score !== null ? score : 'N/A'}
					</span>
				);
			},
		},
		{
			accessorKey: 'created_at',
			header: 'Date',
			cell: ({ row }) => (
				<span className="text-xs">{new Date(row.original.created_at).toLocaleString()}</span>
			),
		},
		{
			id: 'actions',
			header: 'Actions',
			cell: ({ row }) => (
				<button
					onClick={() => loadSubmissionDetail(row.original.id)}
					className="text-xs text-primary hover:underline"
				>
					View Details
				</button>
			),
		},
	];
}
