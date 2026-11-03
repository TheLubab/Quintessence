import { type Editor, useValue } from 'tldraw'

type CanvasGuideProps = {
  editor: Editor
}

export function CanvasGuide({ editor }: CanvasGuideProps) {
  const isEmpty = useValue(
    'canvas guide visibility',
    () => editor.getCurrentPageShapeIds().size === 0,
    [editor]
  )

  if (!isEmpty) return null

  return (
    <section
      aria-label="Canvas guide"
      className="pointer-events-none absolute inset-0 flex items-center justify-center py-16 pr-6 pl-20"
    >
      <div className="max-w-sm space-y-3 text-sm">
        <h2 className="font-medium text-foreground">A whiteboard for your ideas</h2>
        <p className="text-muted-foreground">Think visually with your agent:</p>
        <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
          <li>Sketch a flow or connect ideas with shapes and arrows</li>
          <li>Drop in images and add notes to collect references</li>
          <li>Ask your agent in chat to draw or refine a diagram</li>
        </ul>
        <p className="text-muted-foreground">Your canvas saves automatically in this workspace</p>
      </div>
    </section>
  )
}
