import gql from 'graphql-tag'
import { print } from 'graphql/language/printer'
import { execute, RelayLink } from '../link'
import { OperationKind } from '../types'

const sampleQuery = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`

export function checkCalls<T>(calls: any[] = [], results: Array<T>) {
  expect(calls.length).toBe(results.length)
  calls.map((call, i) => expect(call.data).toEqual(results[i]))
}

export interface TestResultType {
  link: RelayLink
  results?: any[]
  query?: string
  done?: () => void
  operationId?: string
  operationName?: string
  operationKind?: OperationKind
  variables?: any
}

export function testLinkResults(params: TestResultType) {
  const { link, variables, operationId, operationName, operationKind = OperationKind.QUERY } = params
  const results = params.results || []
  const query = params.query || sampleQuery
  const done = params.done || (() => void 0)

  const spy = jest.fn()
  execute(
    link,
    {
      text: typeof query === 'string' ? query : print(query),
      id: operationId,
      name: operationName,
      operationKind,
      metadata: {},
    },
    variables,
    {},
  ).subscribe({
    next: spy,
    error: error => {
      expect(error).toEqual(results.pop())
      checkCalls(spy.mock.calls[0], results)
      if (done) {
        done()
      }
    },
    complete: () => {
      checkCalls(spy.mock.calls[0], results)
      if (done) {
        done()
      }
    },
  })
}
