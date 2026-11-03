import { FileSearchIcon } from '@solar-icons/react/linear'

import { Button } from '@/frontend/components/ui/button'

type UnavailablePageProps = {
  onOpenDashboard: () => void
}

export function UnavailablePage({ onOpenDashboard }: UnavailablePageProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex flex-col items-center justify-center gap-2">
        <FileSearchIcon size={56} strokeWidth={0.5} aria-hidden />
        <p className="text-sm">There's no such page in this workspace</p>
      </div>
      <Button variant="secondary" onClick={onOpenDashboard}>
        Back to dashboard
      </Button>
    </div>
  )
}
