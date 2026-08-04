#!/usr/bin/env node
/**
 * Stages the repository README into a package directory before packing.
 *
 * npm only shows a README that sits next to the package.json it publishes, and
 * keeping a second hand-maintained copy in the package folder guarantees the
 * two drift. So the file is generated at pack time and gitignored.
 *
 * Relative links are rewritten to absolute GitHub URLs on the way, because
 * npmjs.com renders the README outside the repository, where `docs/guides/...`
 * points at nothing.
 *
 *   node scripts/prepack-readme.mjs packages/rn-sql-connect
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]

if (!target) {
  console.error('usage: node scripts/prepack-readme.mjs <package-dir>')
  process.exit(1)
}

const BLOB = 'https://github.com/duysolo/rn-sql-connect/blob/main/'

const readme = readFileSync(join(root, 'README.md'), 'utf8')
  // [label](docs/...) and [label](CHANGELOG.md) become absolute.
  .replace(/\]\((?!https?:|#)([^)]+)\)/g, (_match, link) => `](${BLOB}${link})`)

writeFileSync(join(root, target, 'README.md'), readme, 'utf8')
// stderr, so `npm pack --json` output stays parseable.
console.error(`staged README into ${target}`)
