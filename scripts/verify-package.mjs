#!/usr/bin/env node
/**
 * Packs both packages for real and inspects the resulting tarballs.
 *
 * This checks the artefact, not the intent, because they can differ. During a
 * publish attempt npm reported that it had "auto-corrected" the `bin` field and
 * removed it, which would mean no CLI for anyone installing the package. The
 * tarball turned out to be fine, but the only way to know that was to pack it,
 * install it somewhere else and run the command.
 *
 * So that is what this does. Anything that would reach a consumer is checked
 * against the built artefact rather than against what package.json claims.
 *
 *   node scripts/verify-package.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CHECKS = [
  {
    dir: 'packages/rn-sql-connect',
    files: [
      'package/README.md',
      'package/LICENSE',
      'package/RnSqlConnect.podspec',
      'package/android/build.gradle',
      // Load-bearing since 0.3.1: without these ProGuard rules every consumer's
      // minified Android build dies on its first operation, because R8 renames
      // the protobuf fields the Data Connect SDK looks up by name. A release
      // build is exactly where nobody would look for a packaging mistake.
      'package/android/consumer-rules.pro',
      'package/ios/RnSqlConnect.mm',
      'package/dist/module/index.js',
      'package/dist/typescript/index.d.ts',
    ],
    // Gradle's output directory is not source. It once accounted for 177 of the
    // 308 published files, shipping a debug classes.jar and TurboModule spec
    // Java generated against whatever React Native happened to be on the
    // machine that packed it.
    forbiddenPrefixes: ['package/android/build/', 'package/ios/build/'],
    // The vendored Apple SDK is the one thing whose absence breaks every iOS
    // consumer while leaving Android and the JavaScript tests perfectly green.
    minVendorFiles: 50,
    manifest: pkg => {
      if (!pkg.exports?.['.']) {
        throw new Error('exports["."] is missing')
      }
      if (!pkg.peerDependencies?.['@react-native-firebase/app']) {
        throw new Error('the react-native-firebase peer dependency is missing')
      }
    },
  },
  {
    dir: 'packages/rn-sql-connect-codegen',
    files: ['package/README.md', 'package/LICENSE', 'package/dist/cli.js'],
    manifest: pkg => {
      if (!pkg.bin?.['rn-sql-connect-codegen']) {
        throw new Error('the bin entry is missing, so `npx rn-sql-connect-codegen` would not exist')
      }
    },
    // Installing the tarball is the only check that proves the CLI works. npm
    // warns at publish time that it "auto-corrected" the bin field, which reads
    // alarming; this is what settles whether it matters.
    installAndRun: ['rn-sql-connect-codegen', '--help'],
  },
]

let failed = 0

for (const check of CHECKS) {
  const workDir = mkdtempSync(join(tmpdir(), 'verify-package-'))
  const packageDir = join(root, check.dir)

  const output = execFileSync('npm', ['pack', '--pack-destination', workDir], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const tarball = join(workDir, output.trim().split('\n').pop())

  const list = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).split('\n')
  const manifest = JSON.parse(
    execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], { encoding: 'utf8' }),
  )

  const problems = []
  for (const file of check.files) {
    if (!list.includes(file)) {
      problems.push(`missing ${file.replace('package/', '')}`)
    }
  }
  for (const prefix of check.forbiddenPrefixes ?? []) {
    const leaked = list.filter(f => f.startsWith(prefix)).length
    if (leaked > 0) {
      problems.push(`${leaked} files under ${prefix.replace('package/', '')} - build output must not ship`)
    }
  }
  if (check.minVendorFiles) {
    const vendored = list.filter(f => f.startsWith('package/ios/vendor/')).length
    if (vendored < check.minVendorFiles) {
      problems.push(`only ${vendored} vendored Apple SDK files, expected at least ${check.minVendorFiles}`)
    }
  }
  try {
    check.manifest(manifest)
  } catch (error) {
    problems.push(error.message)
  }

  if (check.installAndRun) {
    const appDir = mkdtempSync(join(tmpdir(), 'verify-install-'))
    try {
      writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: 'probe', version: '1.0.0' }))
      execFileSync('npm', ['install', tarball, '--no-audit', '--no-fund'], {
        cwd: appDir,
        stdio: 'ignore',
      })
      const output = execFileSync('npx', check.installAndRun, { cwd: appDir, encoding: 'utf8' })
      if (!output.trim()) {
        problems.push(`\`npx ${check.installAndRun[0]}\` produced no output`)
      }
    } catch (error) {
      problems.push(`installing the tarball and running the CLI failed: ${error.message}`)
    } finally {
      rmSync(appDir, { recursive: true, force: true })
    }
  }

  rmSync(workDir, { recursive: true, force: true })

  if (problems.length > 0) {
    failed += 1
    console.error(`FAIL ${manifest.name}@${manifest.version}`)
    problems.forEach(problem => console.error(`  - ${problem}`))
  } else {
    console.log(`ok   ${manifest.name}@${manifest.version}, ${list.length - 1} files`)
  }
}

if (failed > 0) {
  console.error('\nThe tarball is not what it should be. Do not publish.')
  process.exit(1)
}
console.log('\nBoth tarballs are publishable.')
