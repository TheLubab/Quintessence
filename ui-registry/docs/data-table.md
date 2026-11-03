# Data table

This recipe installs the Table components and `@tanstack/react-table`. It does not install a ready-made `DataTable` component. Run `quint ui-components add data-table --install` and compose the table for your data.

```tsx
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

type Order = { id: string; status: string }
const columns: ColumnDef<Order>[] = [
  { accessorKey: 'id', header: 'Order' },
  { accessorKey: 'status', header: 'Status' }
]

export function OrdersTable({ orders }: { orders: Order[] }) {
  const table = useReactTable({ data: orders, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map(group => (
          <TableRow key={group.id}>
            {group.headers.map(header => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map(row => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map(cell => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

Add an accessible empty state when there are no rows. Use TanStack's sorting, filtering, and pagination row models only when the task needs them; supply controlled state when it must persist. For simple static data, use `Table` directly without TanStack.
