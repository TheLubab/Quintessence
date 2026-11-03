import { defineCommand } from 'citty'
import { resolve } from 'node:path'

import { dirArg } from '../args'
import { sendControl } from '../control'

const promptArg = {
  type: 'positional',
  required: true,
  description: 'Image description or editing instruction'
} as const

const generate = defineCommand({
  meta: {
    name: 'generate',
    description: 'Generate an image with Muse Image and save it in the workspace'
  },
  args: { prompt: promptArg, dir: dirArg },
  run({ args }) {
    const path = resolve(args.dir)
    sendControl(path, { type: 'image:generate', path, prompt: args.prompt }, result => {
      console.log(JSON.stringify(result, null, 2))
    })
  }
})

const edit = defineCommand({
  meta: { name: 'edit', description: 'Edit a workspace image with Muse Image, saving a new image' },
  args: {
    prompt: promptArg,
    image: {
      type: 'string',
      required: true,
      description: 'PNG, JPEG, or WebP path relative to the workspace root'
    },
    dir: dirArg
  },
  run({ args }) {
    const path = resolve(args.dir)
    sendControl(
      path,
      { type: 'image:generate', path, prompt: args.prompt, image: args.image },
      result => {
        console.log(JSON.stringify(result, null, 2))
      }
    )
  }
})

export const image = defineCommand({
  meta: { name: 'image', description: 'Generate or edit images with Meta Muse Image' },
  subCommands: { generate, edit }
})
