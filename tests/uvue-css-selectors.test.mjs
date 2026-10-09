import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

async function collectUvueFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (['node_modules', 'unpackage', 'uni_modules'].includes(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await collectUvueFiles(target))
    else if (target.endsWith('.uvue')) files.push(target)
  }
  return files
}

function unsupportedSelectors(source) {
  const failures = []
  for (const block of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '')
    if (/@keyframes\b/.test(css)) failures.push('@keyframes')
    let depth = 0
    let token = ''
    for (const character of css) {
      if (character === '{') {
        const selector = token.trim()
        if (depth === 0 && selector && !selector.startsWith('@')) {
          const valid = selector.split(',').every((item) => /^\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(item.trim()))
          if (!valid) failures.push(selector)
        }
        depth += 1
        token = ''
      } else if (character === '}') {
        depth -= 1
        token = ''
      } else if (depth === 0) token += character
    }
  }
  return failures
}

test('application uvue styles avoid unsupported relation selectors and keyframes', async () => {
  const failures = []
  for (const file of await collectUvueFiles('.')) {
    const selectors = unsupportedSelectors(await readFile(file, 'utf8'))
    if (selectors.length > 0) failures.push(`${file}: ${selectors.join(' | ')}`)
  }
  assert.deepEqual(failures, [])
})
