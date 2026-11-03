import { useEffect, useState } from 'react'

import { CheckIcon, CopyIcon, LoginIcon } from '@solar-icons/react/linear'

import { buttonVariants } from '@/frontend/components/ui/button'
import { cn } from '@/frontend/utils/cn'

type DeviceLoginStepsProps = {
  code: string
  url: string
}

export function DeviceLoginSteps({ code, url }: DeviceLoginStepsProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 3000)
    return () => clearTimeout(timer)
  }, [copied])

  const copyCode = () => {
    navigator.clipboard
      ?.writeText(code)
      .then(() => setCopied(true))
      .catch(() => {})
  }

  return (
    <ol className="mx-auto grid w-full max-w-64 gap-6 text-left text-sm lg:max-w-3xl lg:grid-cols-2 lg:text-center">
      <li className="flex flex-col items-start gap-3 lg:items-center">
        <CopyIcon size={24} strokeWidth={1.5} className="shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-3 lg:items-center">
          <p>Copy the one-time device code provided below</p>
          <div className="flex h-8 items-center gap-2 rounded-lg border border-input bg-accent pr-2 pl-3">
            <code className="cursor-text text-sm font-medium select-text">{code}</code>
            <button
              type="button"
              className="relative size-4 cursor-pointer text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
              aria-label={copied ? 'Code copied' : 'Copy code'}
              onClick={copyCode}
            >
              <CopyIcon
                className={cn(
                  'absolute inset-0 transition-[opacity,filter] duration-200 motion-reduce:transition-none',
                  copied && 'opacity-0 blur-[2px]'
                )}
                strokeWidth={1.75}
                size={16}
              />
              <CheckIcon
                className={cn(
                  'absolute inset-0 transition-[opacity,filter] duration-200 motion-reduce:transition-none',
                  !copied && 'opacity-0 blur-[2px]'
                )}
                strokeWidth={1.75}
                size={16}
              />
            </button>
          </div>
        </div>
      </li>
      <li className="flex flex-col items-start gap-3 lg:items-center">
        <LoginIcon size={24} strokeWidth={1.5} className="shrink-0" />
        <div className="flex min-w-0 flex-col items-start gap-3 lg:items-center">
          <p>Sign in to ChatGPT, paste the code, and then come back to Quint</p>
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
            Open ChatGPT
          </a>
        </div>
      </li>
    </ol>
  )
}
