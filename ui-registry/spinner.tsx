import { LoaderIcon } from '@solar-icons/react/linear'

import { cn } from './utils'

type SpinnerProps = React.ComponentProps<typeof LoaderIcon>

function Spinner({ className, ...props }: SpinnerProps) {
  return (
    <LoaderIcon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn('size-4 animate-spin', className)}
      strokeWidth={1.75}
      {...props}
    />
  )
}

export { Spinner }
