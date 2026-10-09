#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = '/Users/cengxianwei/Desktop/letright/qcm-inspection-android'
const IGNORED = ['node_modules', 'unpackage', 'uni_modules', '.hbuilderx', 'tests', 'docs', '.git']

async function collect(directory, extensions, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (IGNORED.includes(entry.name)) continue
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) await collect(target, extensions, files)
    else if (extensions.some((ext) => target.endsWith(ext))) files.push(target)
  }
  return files
}

const CHAIN_PATTERN = /\|\|(\s*)(?=(?:[\w$]+(?:\?(\.[\w$]+))+|[\w$]+(?:\.[\w$]+)*|(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?))(?:\s*(?:\?\?|\|\|)\s*)*[\w$]?.*\))/g

const WRAP_PATTERN = /(\b(?:String|Number)\()([^()\n]*?)\)/g

const files = await collect(ROOT, ['.uts', '.uvue'])
const report = []
let total = 0
for (const file of files) {
  const source = await readFile(file, 'utf8')
  let count = 0
  const next = source.replace(WRAP_PATTERN, (full, opener, inner) => {
    if (!inner.includes('||')) return full
    if (/[=<>!]==?|[?!]=/.test(inner)) return full
    const replacedInner = inner.replace(/\|\|/g, () => {
      count += 1
      return '??'
    })
    return `${opener}${replacedInner})`
  })
  if (count > 0) {
    await writeFile(file, next, 'utf8')
    report.push(`${path.relative(ROOT, file)}: ${count}`)
    total += count
  }
}
console.log(report.join('\n'))
console.log(`total files: ${report.length}, total replacements: ${total}`)
