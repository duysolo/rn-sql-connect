#!/usr/bin/env node
/**
 * Generates an SDK from the checked-in fixture and compiles it against the
 * library source.
 *
 * The unit tests cover the parser in isolation. This covers the part they
 * cannot: that the emitted TypeScript actually compiles. Every bug found so far
 * in the generator was of that kind, so it is worth a job of its own.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const input = join(root, 'example', 'generated')
const output = mkdtempSync(join(tmpdir(), 'rn-sql-connect-codegen-'))

const { generate } = await import(join(root, 'packages', 'rn-sql-connect-codegen', 'dist', 'index.js'))

const { sdk } = generate({ input, output })
const queries = sdk.operations.filter(operation => operation.kind === 'query').length
console.log(
  `generated ${sdk.operations.length} operations (${queries} queries, ` +
    `${sdk.operations.length - queries} mutations) into ${output}`,
)

writeFileSync(
  join(output, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        baseUrl: '.',
        paths: {
          'rn-sql-connect': [join(root, 'packages', 'rn-sql-connect', 'src', 'index.ts')],
        },
      },
      include: ['*.ts'],
    },
    null,
    2,
  ),
)

execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['--noEmit', '-p', output], {
  stdio: 'inherit',
})

console.log('generated SDK compiles against the library')
