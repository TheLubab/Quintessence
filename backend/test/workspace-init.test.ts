import { describe, expect, test } from 'bun:test'
import { join } from 'path'

import { skillsDirFor, validateWorkspaceFolderName } from '../workspaces/init'

// Pure helpers only — `provisionWorkspace` composes `installBundledSkills` and
// `scaffoldQuintDir` (covered by their own tests) and would hit the network via
// `bun install`.

describe('skillsDirFor', () => {
  test('meta (and untyped) workspaces load skills from .agents/skills', () => {
    expect(skillsDirFor('/ws', 'meta')).toBe(join('/ws', '.agents', 'skills'))
    expect(skillsDirFor('/ws')).toBe(join('/ws', '.agents', 'skills'))
  })
})

describe('validateWorkspaceFolderName', () => {
  test('accepts plain folder names', () => {
    expect(validateWorkspaceFolderName('my-workspace')).toBeNull()
    expect(validateWorkspaceFolderName('Notes 2026')).toBeNull()
    expect(validateWorkspaceFolderName('a')).toBeNull()
    expect(validateWorkspaceFolderName('v1.2_final')).toBeNull()
  })

  test('rejects empty and oversized names', () => {
    expect(validateWorkspaceFolderName('')).not.toBeNull()
    expect(validateWorkspaceFolderName('x'.repeat(65))).not.toBeNull()
  })

  test('rejects path separators and traversal', () => {
    expect(validateWorkspaceFolderName('a/b')).not.toBeNull()
    expect(validateWorkspaceFolderName('a\\b')).not.toBeNull()
    expect(validateWorkspaceFolderName('..')).not.toBeNull()
    expect(validateWorkspaceFolderName('../escape')).not.toBeNull()
  })

  test('rejects hidden names so `.quint`/`.agents` can never collide', () => {
    expect(validateWorkspaceFolderName('.quint')).not.toBeNull()
    expect(validateWorkspaceFolderName('.agents')).not.toBeNull()
    expect(validateWorkspaceFolderName('.hidden')).not.toBeNull()
  })

  test('rejects trailing dots and spaces', () => {
    expect(validateWorkspaceFolderName('name.')).not.toBeNull()
    expect(validateWorkspaceFolderName('name ')).not.toBeNull()
  })
})
