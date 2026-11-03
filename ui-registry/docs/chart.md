# Chart

Run `quint ui-components add chart --install`. The component wraps Recharts in a responsive container and provides shared tooltip and legend styling. Recharts is installed as a dependency.

```tsx
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart'

const data = [{ month: 'Jan', orders: 40 }, { month: 'Feb', orders: 65 }]
const config = { orders: { label: 'Orders', color: 'var(--chart-1)' } } satisfies ChartConfig

export function OrdersChart() {
  return (
    <ChartContainer config={config} className="h-48 w-full">
      <BarChart accessibilityLayer data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="orders" fill="var(--color-orders)" />
      </BarChart>
    </ChartContainer>
  )
}
```

Config keys correspond to data series; use `--color-<key>` to apply their colors. Give charts readable labels and provide a text or table alternative when the values matter. The installed `chart.tsx` defines tooltip, legend, and configuration props.
