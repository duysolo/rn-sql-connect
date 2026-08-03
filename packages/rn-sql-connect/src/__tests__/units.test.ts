import { durationToSeconds } from '../core/duration'
import { SqlConnectError, errorFromPayload, errorFromRejection } from '../core/errors'
import { serializeVariables, stableKey } from '../core/serialize'

describe('durationToSeconds', () => {
  it.each([
    ['0', 0],
    ['30s', 30],
    ['5m', 300],
    ['1h30m', 5400],
    ['500ms', 0.5],
    [90, 90],
  ])('parses %p as %p seconds', (input, expected) => {
    expect(durationToSeconds(input as string | number)).toBe(expected)
  })

  it.each(['', 'soon', '5 minutes', '-1s', 'm5'])('rejects %p', input => {
    expect(() => durationToSeconds(input)).toThrow(TypeError)
  })

  it('rejects negative numbers', () => {
    expect(() => durationToSeconds(-1)).toThrow(TypeError)
  })
})

describe('serializeVariables', () => {
  it('treats undefined and an empty object the same', () => {
    expect(serializeVariables(undefined)).toBe('{}')
    expect(serializeVariables({})).toBe('{}')
  })

  it('keeps null but drops undefined, because GraphQL treats them differently', () => {
    expect(serializeVariables({ a: null, b: undefined, c: 1 })).toBe('{"a":null,"c":1}')
  })

  it('rejects non-object variables', () => {
    expect(() => serializeVariables([1, 2] as never)).toThrow(SqlConnectError)
  })

  it('reports circular structures instead of throwing a raw TypeError', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => serializeVariables(circular)).toThrow(SqlConnectError)
  })
})

describe('stableKey', () => {
  it('ignores key order', () => {
    expect(stableKey({ a: 1, b: 2 })).toBe(stableKey({ b: 2, a: 1 }))
  })

  it('separates different values', () => {
    expect(stableKey({ a: 1 })).not.toBe(stableKey({ a: 2 }))
  })

  it('handles nesting and arrays', () => {
    expect(stableKey({ a: [{ y: 1, x: 2 }] })).toBe(stableKey({ a: [{ x: 2, y: 1 }] }))
  })

  it('does not confuse undefined with a missing key', () => {
    expect(stableKey({ a: 1, b: undefined })).toBe(stableKey({ a: 1 }))
  })
})

describe('error mapping', () => {
  it('reads the structured payload', () => {
    const error = errorFromPayload(
      {
        code: 'partial-error',
        message: 'partial',
        graphQLErrors: [{ message: 'bad', path: ['a', 1] }],
        partialData: { a: 1 },
        nativeCode: 'DataConnectOperationException',
      },
      'ListNews',
    )
    expect(error).toBeInstanceOf(SqlConnectError)
    expect(error.code).toBe('partial-error')
    expect(error.graphQLErrors).toEqual([{ message: 'bad', path: ['a', 1] }])
    expect(error.partialData).toEqual({ a: 1 })
    expect(error.operationName).toBe('ListNews')
  })

  it('falls back to unknown for codes it does not recognise', () => {
    expect(errorFromPayload({ code: 'wat', message: 'x' }).code).toBe('unknown')
  })

  it('parses details out of a rejected native promise', () => {
    const rejection = Object.assign(new Error('denied'), {
      code: 'unauthorized',
      userInfo: { details: JSON.stringify({ code: 'unauthorized', message: 'denied' }) },
    })
    expect(errorFromRejection(rejection, 'GetProfile')).toMatchObject({
      code: 'unauthorized',
      operationName: 'GetProfile',
    })
  })

  it('survives a rejection with no details at all', () => {
    const error = errorFromRejection(new Error('boom'), 'GetProfile')
    expect(error.code).toBe('unknown')
    expect(error.message).toBe('boom')
  })

  it('does not double wrap', () => {
    const original = new SqlConnectError({ code: 'cancelled', message: 'stopped' })
    expect(errorFromRejection(original)).toBe(original)
  })
})
