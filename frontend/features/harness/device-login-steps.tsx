import { buttonVariants } from '@/frontend/components/ui/button'

type DeviceLoginStepsProps = {
  code: string
  url: string
}

export function DeviceLoginSteps({ code, url }: DeviceLoginStepsProps) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4 text-center text-sm">
      <p>Check that this verification code matches the one shown on Meta before approving access</p>
      <code className="rounded-lg bg-muted px-3 py-2 font-mono text-sm">{code}</code>
      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
        Open Meta
      </a>
      <p className="text-muted-foreground">Return to Quint after approving access</p>
    </div>
  )
}
