import { Hono } from 'hono'

import type { WorkspaceType } from '@/shared/types'

import { harnessStore } from '../agents/auth'
import { harnessFor, isHarnessType } from '../agents/registry'

export const harnesses = new Hono<{ Variables: { harnessType: WorkspaceType } }>()

harnesses.use('/:type/auth/*', async (c, next) => {
  const type = c.req.param('type')
  if (!isHarnessType(type)) return c.text('Unknown agent', 404)
  const harness = harnessFor(type)
  if (!harness.authStatus) {
    return c.text('This agent has no readiness check', 409)
  }
  c.set('harnessType', type)
  c.header('Cache-Control', 'no-store')
  await next()
})

harnesses.get('/:type/auth', async c => {
  const context = c.get('harnessType')
  return c.json({
    availability: await harnessStore.getAvailability(context),
    login: harnessStore.getLogin(context)
  })
})

harnesses.post('/:type/auth/login', async c => {
  const harness = harnessFor(c.get('harnessType'))
  if (!harness.startLogin) return c.text('This agent requires terminal sign-in', 409)
  try {
    return c.json(await harnessStore.startLogin(c.get('harnessType')))
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not start sign-in', 500)
  }
})

harnesses.post('/:type/auth/login/:id/code', async c => {
  try {
    const body: unknown = await c.req.json()
    if (
      !body ||
      typeof body !== 'object' ||
      !('code' in body) ||
      typeof body.code !== 'string' ||
      body.code.length > 4096 ||
      !body.code.trim()
    ) {
      return c.text('Enter the authorization code', 400)
    }
    await harnessStore.submitCode(c.get('harnessType'), c.req.param('id'), body.code)
    return c.json({ ok: true })
  } catch (error) {
    return c.text(error instanceof Error ? error.message : 'Could not submit code', 400)
  }
})
