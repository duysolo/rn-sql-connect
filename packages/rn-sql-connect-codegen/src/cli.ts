#!/usr/bin/env node
import { generate } from './index'
import { CodegenError } from './parse'

const USAGE = `rn-sql-connect-codegen

Generates typed rn-sql-connect wrappers from a Firebase-generated Data Connect
JavaScript SDK.

Usage:
  rn-sql-connect-codegen --in <generated-sdk-dir> --out <output-dir>

Example:
  rn-sql-connect-codegen --in vendor/dataconnect-generated/tramev --out src/dataconnect/tramev
`

const parseArgs = (argv: string[]): { input?: string; output?: string; help: boolean } => {
  const result: { input?: string; output?: string; help: boolean } = { help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') {
      result.help = true
    } else if (arg === '--in' || arg === '--input') {
      result.input = argv[index + 1]
      index += 1
    } else if (arg === '--out' || arg === '--output') {
      result.output = argv[index + 1]
      index += 1
    }
  }
  return result
}

const main = (): void => {
  const { input, output, help } = parseArgs(process.argv.slice(2))
  if (help || !input || !output) {
    process.stdout.write(USAGE)
    process.exit(help ? 0 : 1)
  }

  try {
    const { sdk, files } = generate({ input, output })
    const queries = sdk.operations.filter(operation => operation.kind === 'query').length
    const mutations = sdk.operations.length - queries
    process.stdout.write(
      `rn-sql-connect-codegen: ${sdk.operations.length} operations ` +
        `(${queries} queries, ${mutations} mutations) from connector "${sdk.connectorConfig.connector}"\n`,
    )
    files.forEach(file => process.stdout.write(`  wrote ${file}\n`))
  } catch (error) {
    if (error instanceof CodegenError) {
      process.stderr.write(`rn-sql-connect-codegen: ${error.message}\n`)
      process.exit(1)
    }
    throw error
  }
}

main()
