import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'bun:test'

import * as HostSlider from './slider'
import * as HostSpinner from './spinner'
import * as HostTabs from './tabs'

test('shared Tabs forwards vertical orientation to Base UI', () => {
  const html = renderToStaticMarkup(
    <HostTabs.Tabs defaultValue="dashboard" orientation="vertical">
      <HostTabs.TabsList>
        <HostTabs.TabsTrigger value="dashboard">Dashboard</HostTabs.TabsTrigger>
        <HostTabs.TabsTrigger value="activity">Activity</HostTabs.TabsTrigger>
      </HostTabs.TabsList>
      <HostTabs.TabsContent value="dashboard">Dashboard content</HostTabs.TabsContent>
    </HostTabs.Tabs>
  )

  expect(html).toContain('data-orientation="vertical"')
  expect(html).not.toContain('data-orientation="horizontal"')
})

test('shared Slider preserves custom content inside the control', () => {
  const html = renderToStaticMarkup(
    <HostSlider.Slider value={[2]} max={5}>
      <span data-slot="slider-marks">Effort marks</span>
    </HostSlider.Slider>
  )

  expect(html).toContain('data-slot="slider-marks"')
  expect(html).toContain('Effort marks')
  expect(html.indexOf('data-slot="slider-marks"')).toBeGreaterThan(
    html.indexOf('data-slot="slider-track"')
  )
  expect(html.indexOf('data-slot="slider-marks"')).toBeLessThan(
    html.indexOf('data-slot="slider-thumb"')
  )
})

test('shared Slider uses array values for thumb count and otherwise renders one thumb', () => {
  for (const props of [
    { value: 2 },
    { defaultValue: 65 },
    { min: 10 },
    {},
    { value: [2] },
    { defaultValue: [2] },
    { value: [2], defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(1)
  }

  for (const props of [
    { value: [1, 3] },
    { defaultValue: [1, 3] },
    { value: 0, defaultValue: [1, 3] }
  ]) {
    const html = renderToStaticMarkup(<HostSlider.Slider {...props} />)
    expect(html.match(/data-slot="slider-thumb"/g)).toHaveLength(2)
  }
})

test('shared Spinner keeps its accessible label and accepts icon props', () => {
  const html = renderToStaticMarkup(<HostSpinner.Spinner aria-label="Saving" strokeWidth={1.5} />)

  expect(html).toContain('role="status"')
  expect(html).toContain('aria-label="Saving"')
  expect(html).toContain('stroke-width:1.5')
})

test('keepMounted retains closed popover content while the default unmounts it', async () => {
  const { renderTestUi } = await import('@/frontend/test/render')
  const { Popover, PopoverTrigger, PopoverContent, PopoverTitle } = await import('./popover')
  const content = (keepMounted: boolean) => (
    <Popover>
      <PopoverTrigger>Details</PopoverTrigger>
      <PopoverContent keepMounted={keepMounted}>
        <PopoverTitle>Saved details</PopoverTitle>
        <p id="saved-popover-details">Available without opening</p>
      </PopoverContent>
    </Popover>
  )
  const ui = await renderTestUi(content(true))
  try {
    expect(ui.document.getElementById('saved-popover-details')).not.toBeNull()
    await ui.render(content(false))
    expect(ui.document.getElementById('saved-popover-details')).toBeNull()
  } finally {
    await ui.cleanup()
  }
})
