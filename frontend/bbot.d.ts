declare module '@bwnd/bbot' {
  export type ExpressionName =
    | 'idle'
    | 'content'
    | 'relieved'
    | 'happy'
    | 'joy'
    | 'excited'
    | 'love'
    | 'pleading'
    | 'shy'
    | 'surprised'
    | 'scared'
    | 'curious'
    | 'confused'
    | 'dizzy'
    | 'thinking'
    | 'focus'
    | 'suspicious'
    | 'unimpressed'
    | 'smug'
    | 'sly'
    | 'bored'
    | 'exasperated'
    | 'worried'
    | 'guilty'
    | 'sad'
    | 'disgusted'
    | 'annoyed'
    | 'angry'
    | 'sleepy'
    | 'sleep'

  export type ReactionName =
    | 'blink'
    | 'wink'
    | 'nod'
    | 'shake'
    | 'bounce'
    | 'pop'
    | 'boing'
    | 'spin'
    | 'jitter'

  export type FaceOptions = {
    expression?: ExpressionName
    mouth?: boolean
    pupils?: boolean
    track?: boolean
    blink?: boolean
    idle?: boolean
  }

  export type FaceHandle = {
    setExpression: (name: ExpressionName) => FaceHandle
    react: (name: ReactionName, options?: { force?: boolean }) => FaceHandle
    look: (x: number, y: number, ms?: number) => FaceHandle
    talk: (level: number, options?: { wide?: number; round?: number }) => FaceHandle
    set: (options: FaceOptions) => FaceHandle
    destroy: () => void
  }

  export const EXPRESSION_NAMES: readonly ExpressionName[]
  export const REACTION_NAMES: readonly ReactionName[]
  export function createFace(element: HTMLElement, options?: FaceOptions): FaceHandle
}

declare module '@bwnd/bbot/react' {
  import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from 'react'

  import type { FaceHandle, FaceOptions } from '@bwnd/bbot'

  export type FaceProps = FaceOptions &
    Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
      size?: number
      className?: string
    }

  export const Face: ForwardRefExoticComponent<FaceProps & RefAttributes<FaceHandle>>
}
