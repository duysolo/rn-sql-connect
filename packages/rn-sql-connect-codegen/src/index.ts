import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { emitIndex, emitTypes } from './emit'
import { CodegenError, extractTypes, parseEsm, type ParsedSdk } from './parse'

export * from './parse'
export * from './emit'

export type GenerateOptions = {
  /** Directory of the Firebase-generated JavaScript SDK. */
  input: string
  /** Directory to write `index.ts` and `types.ts` into. */
  output: string
}

export type GenerateResult = {
  sdk: ParsedSdk
  files: string[]
}

const readSdk = (input: string): ParsedSdk => {
  const esmPath = join(input, 'esm', 'index.esm.js')
  const declarationPath = join(input, 'index.d.ts')

  for (const path of [esmPath, declarationPath]) {
    if (!existsSync(path)) {
      throw new CodegenError(
        `Expected to find ${path}. Point --in at the directory produced by ` +
          '`firebase dataconnect:sdk:generate` for the javascriptSdk target.',
      )
    }
  }

  const parsed = parseEsm(readFileSync(esmPath, 'utf8'))
  const types = extractTypes(readFileSync(declarationPath, 'utf8'))
  return { ...parsed, types }
}

export const generate = ({ input, output }: GenerateOptions): GenerateResult => {
  const sdk = readSdk(input)
  mkdirSync(output, { recursive: true })

  const files = [join(output, 'types.ts'), join(output, 'index.ts')]
  writeFileSync(files[0], emitTypes(sdk.types), 'utf8')
  writeFileSync(files[1], emitIndex(sdk), 'utf8')

  return { sdk, files }
}
