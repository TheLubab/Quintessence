import { afterEach, expect, mock, test } from 'bun:test'
import { HiddenPanel } from './hidden-panel'
import { renderTestUi } from '@/frontend/test/render'

let cleanup = async () => {}
afterEach(() => cleanup())

test('an empty hidden panel still lets the user create a widget and close the panel', async () => {
  const create = mock(() => {})
  const close = mock(() => {})
  const ui = await renderTestUi(
    <HiddenPanel items={[]} onCreateWidget={create} onClose={close} onRestore={() => {}} />
  )
  cleanup = ui.cleanup
  expect(ui.button('New widget').disabled).toBe(false)
  await ui.click(ui.button('New widget'))
  await ui.click(ui.button('Close panel'))
  expect(create).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
})

test('restoring a hidden widget sends that widget ID', async () => {
  const restore = mock((_id: string) => {})
  const ui = await renderTestUi(
    <HiddenPanel
      items={[{ id: 'weather', w: 2, h: 1 }]}
      onCreateWidget={() => {}}
      onClose={() => {}}
      onRestore={restore}
    />
  )
  cleanup = ui.cleanup
  await ui.click(ui.button('Show'))
  expect(restore).toHaveBeenCalledWith('weather')
})
