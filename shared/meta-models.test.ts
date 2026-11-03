import { expect, test } from 'bun:test'
import { defaultMetaEffort, isMetaModelId, resolveMetaModel } from './meta-models'

test('Meta model eligibility is independent of the hosting provider', () => {
  for (const id of [
    'muse-spark-1.3',
    'muse-wonder-1.0',
    'muse-spark-open-1.0',
    'meta-llama/Llama-3.3-70B-Instruct',
    'host/meta/llama-4-scout'
  ]) {
    expect(isMetaModelId(id)).toBe(true)
  }
  for (const id of [
    '',
    'default',
    'unrelated-model',
    'host/other-1',
    'muse-spark-1.3/other',
    'llama',
    'muse-image-1.0'
  ]) {
    expect(isMetaModelId(id)).toBe(false)
  }
})

test('selection must belong to the eligible runtime catalog, including the default', () => {
  const catalog = [
    { value: 'default', resolvedModel: 'other-1', displayName: 'Other' },
    { value: 'host/llama-3.3-70b', displayName: 'Llama' }
  ]
  expect(resolveMetaModel(catalog)).toBe('host/llama-3.3-70b')
  expect(resolveMetaModel(catalog, 'default')).toBe('host/llama-3.3-70b')
  expect(() => resolveMetaModel(catalog, 'other-1')).toThrow('Choose an available Meta model')
  expect(() => resolveMetaModel(catalog, 'muse-spark-9.9')).toThrow()
  expect(() => resolveMetaModel([])).toThrow('No supported Meta models')
})

test('default thinking prefers a moderate supported effort over the runtime maximum', () => {
  expect(defaultMetaEffort(['low', 'medium', 'high', 'max'], 'max')).toBe('medium')
  expect(defaultMetaEffort(['low', 'high', 'max'], 'max')).toBe('low')
  expect(defaultMetaEffort(['high', 'max'], 'max')).toBe('high')
  expect(defaultMetaEffort(['max'], 'max')).toBe('max')
  expect(defaultMetaEffort([])).toBeUndefined()
})
