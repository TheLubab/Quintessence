import { AltArrowDownIcon } from '@solar-icons/react/linear'
import { Button } from '@/frontend/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from '@/frontend/components/ui/popover'
import type { RequestUsage, SessionContextUsage, SessionUsage } from '@/shared/types'

type UsageStripProps = {
  context: SessionContextUsage | null
  usage: SessionUsage | null
  request?: RequestUsage
}

function costLabel(cost: SessionUsage['cost']): string {
  if (!cost) return 'Cost unavailable'
  const value = cost.usd > 0 && cost.usd < 0.0001 ? '<$0.0001' : `$${cost.usd.toFixed(4)}`
  return `${value}${cost.partial ? ' (partial estimate)' : ' estimated'}`
}

type UsageBreakdownProps = { label: string; usage: SessionUsage }

function UsageBreakdown({ label, usage }: UsageBreakdownProps) {
  const rows = [
    ['Estimated cost', costLabel(usage.cost)],
    ['Input tokens', usage.promptTokens.toLocaleString()],
    ...(usage.cacheReadTokens !== undefined
      ? [['Cached input (included)', usage.cacheReadTokens.toLocaleString()]]
      : []),
    ...(usage.cacheWriteTokens !== undefined
      ? [['Cache writes (included)', usage.cacheWriteTokens.toLocaleString()]]
      : []),
    ['Output tokens', usage.outputTokens.toLocaleString()],
    ['Total tokens', usage.totalTokens.toLocaleString()]
  ]
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium">{label}</h3>
      <dl className="space-y-1 text-xs">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function UsageStrip({ context, usage, request }: UsageStripProps) {
  const running = request?.status === 'running'
  const label = running ? 'This request' : 'Last request'
  const summary = request?.usage?.cost
    ? `${label}: ${costLabel(request.usage.cost)}`
    : running
      ? 'This request: estimating…'
      : 'Last request: cost unavailable'

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Popover>
        <PopoverTrigger
          render={<Button variant="ghost" size="sm" />}
          className="max-w-full text-xs"
        >
          <span className="truncate tabular-nums">{summary}</span>
          <AltArrowDownIcon strokeWidth={1.75} />
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-80 max-w-[calc(100vw-2rem)]">
          <PopoverTitle>Usage details</PopoverTitle>
          {request?.usage ? (
            <UsageBreakdown label={label} usage={request.usage} />
          ) : (
            <p className="text-xs text-muted-foreground">
              {running
                ? 'Waiting for usage for this request'
                : 'A request-level estimate is not available for this earlier request'}
            </p>
          )}
          {usage && <UsageBreakdown label="Entire chat" usage={usage} />}
          {context && (
            <p className="text-xs text-muted-foreground">
              Context: {context.usedTokens.toLocaleString()} tokens
              {context.windowTokens ? ` of ${context.windowTokens.toLocaleString()} capacity` : ''}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Request totals include all main-agent model calls for your message. Cached input is
            included in input tokens. Estimates exclude background agents and may differ from
            billing.
          </p>
        </PopoverContent>
      </Popover>
      {context?.pressure === 'blocked' && <span className="text-destructive">Context full</span>}
      {context?.pressure === 'warning' && <span>Context nearly full</span>}
    </div>
  )
}
