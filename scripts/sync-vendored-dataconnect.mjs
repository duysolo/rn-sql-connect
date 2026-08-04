#!/usr/bin/env node
/**
 * Refreshes the vendored Apple Data Connect SDK.
 *
 * The sources live in the package rather than coming from Swift Package Manager
 * because SwiftPM links a private copy of FirebaseCore into every framework
 * that depends on it, and Data Connect has to share the instance
 * react-native-firebase configures. See docs/ios-spm.md.
 *
 * Vendoring means the copy can drift from upstream, so this script exists to
 * make refreshing it a single command, and `--check` exists so CI can fail when
 * the checked-in copy no longer matches the pinned tag.
 *
 *   node scripts/sync-vendored-dataconnect.mjs            # refresh to the pinned tag
 *   node scripts/sync-vendored-dataconnect.mjs --check    # verify, change nothing
 *   node scripts/sync-vendored-dataconnect.mjs --tag 11.13.0
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageDir = join(root, 'packages', 'rn-sql-connect')
const vendorDir = join(packageDir, 'ios', 'vendor', 'FirebaseDataConnect')
const packageJsonPath = join(packageDir, 'package.json')

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const tagIndex = args.indexOf('--tag')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
const tag = tagIndex === -1 ? packageJson.sdkVersions.ios.dataConnect : args[tagIndex + 1]
const repository = packageJson.sdkVersions.ios.dataConnectVendoredFrom

/**
 * Patches applied on top of upstream. Each one is asserted, so an upstream
 * change that makes a patch stop applying fails loudly here instead of turning
 * into a confusing compile error later.
 */
const PATCHES = [
  {
    file: 'Internal/Version.swift',
    find: 'import GoogleUtilities_Environment',
    replace: `// VENDOR PATCH. Swift Package Manager exposes this as GoogleUtilities_Environment,
// CocoaPods ships the same code inside the GoogleUtilities module. Both spellings
// are kept so this file builds either way.
#if canImport(GoogleUtilities_Environment)
  import GoogleUtilities_Environment
#else
  import GoogleUtilities
#endif`,
  },
]

const listSwiftFiles = dir => {
  const out = []
  const walk = current => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.swift')) {
        out.push(full)
      }
    }
  }
  walk(dir)
  return out.sort()
}

const fingerprint = dir => {
  const hash = createHash('sha256')
  for (const file of listSwiftFiles(dir)) {
    hash.update(relative(dir, file))
    hash.update(readFileSync(file))
  }
  return hash.digest('hex')
}

const download = () => {
  const workDir = mkdtempSync(join(tmpdir(), 'dc-ios-'))
  const url = `${repository}/archive/refs/tags/${tag}.tar.gz`
  execFileSync('sh', ['-c', `curl -fsSL "${url}" | tar -xz -C "${workDir}" --strip-components=1`], {
    stdio: 'inherit',
  })
  return workDir
}

const applyPatches = dir => {
  for (const patch of PATCHES) {
    const file = join(dir, patch.file)
    const contents = readFileSync(file, 'utf8')
    if (!contents.includes(patch.find)) {
      throw new Error(
        `Patch for ${patch.file} no longer applies: "${patch.find}" was not found. ` +
          'Upstream changed; review the patch before syncing.',
      )
    }
    writeFileSync(file, contents.replace(patch.find, patch.replace), 'utf8')
  }
}

const workDir = download()
const stagedDir = join(workDir, 'Sources')
cpSync(join(workDir, 'LICENSE'), join(stagedDir, 'LICENSE'))
applyPatches(stagedDir)

const expected = fingerprint(stagedDir)
const actual = fingerprint(vendorDir)

if (checkOnly) {
  rmSync(workDir, { recursive: true, force: true })
  if (expected !== actual) {
    console.error(
      `Vendored Data Connect sources do not match ${tag}.\n` +
        'Run: node scripts/sync-vendored-dataconnect.mjs',
    )
    process.exit(1)
  }
  console.log(`Vendored Data Connect sources match ${tag}`)
  process.exit(0)
}

if (expected === actual) {
  rmSync(workDir, { recursive: true, force: true })
  console.log(`Already up to date with ${tag}`)
  process.exit(0)
}

rmSync(vendorDir, { recursive: true, force: true })
cpSync(stagedDir, vendorDir, { recursive: true })
rmSync(workDir, { recursive: true, force: true })

if (tagIndex !== -1) {
  packageJson.sdkVersions.ios.dataConnect = tag
  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
}

console.log(`Vendored Data Connect ${tag} into ${relative(root, vendorDir)}`)
console.log('Rebuild the example app on iOS before committing.')
