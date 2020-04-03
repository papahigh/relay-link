import fetchMock from 'fetch-mock'
import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { execute, OperationKind, RelayLink } from 'relay-link'
import { Observable, RequestParameters } from 'relay-runtime'
import { BatchHttpLink } from '../batchHttpLink'

import { sharedHttpTest } from './sharedHttpTests'

const sampleQuery = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`

export function createRequest(
  queryOrDocument: string | DocumentNode,
  operationKind = OperationKind.QUERY,
): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: queryOrDocument as any,
    operationKind,
    metadata: {},
  }
}

describe('BatchHttpLink', () => {
  sharedHttpTest(
    'BatchHttpLink',
    httpArgs => {
      const args = {
        ...httpArgs,
        batchInterval: 0,
        batchMax: 1,
      }
      return new BatchHttpLink(args)
    },
    true,
  )

  beforeAll(() => {
    jest.resetModules()
  })

  const headers = { cookie: 'monster' }
  const data = { data: { hello: 'world' } }
  const data2 = { data: { hello: 'everyone' } }
  const roflData = { data: { haha: 'hehe' } }
  const lawlData = { data: { tehe: 'haaa' } }
  const makePromise = res =>
    new Promise((resolve, reject) =>
      setTimeout(() =>
        resolve({
          headers,
          body: res,
        }),
      ),
    )

  beforeEach(() => {
    fetchMock.restore()
    fetchMock.post('/batch', makePromise([data, data2]))
    fetchMock.post('/rofl', makePromise([roflData, roflData]))
    fetchMock.post('/lawl', makePromise([lawlData, lawlData]))
  })

  it('does not need any constructor arguments', () => {
    expect(() => new BatchHttpLink()).not.toThrow()
  })

  it('should pass batchInterval, batchMax, and batchKey to BatchLink', () => {
    jest.mock('relay-link-batch', () => ({
      BatchLink: jest.fn(),
    }))

    const BatchLink = require('relay-link-batch').BatchLink
    // tslint:disable-next-line:variable-name
    const LocalScopedLink = require('../batchHttpLink').BatchHttpLink

    const batchKey = () => 'hi'
    const batchHandler = operations => Observable.create(() => {})

    // @ts-ignore
    const batch = new LocalScopedLink({
      batchInterval: 20,
      batchMax: 20,
      batchKey,
      batchHandler,
    })

    const { batchInterval, batchMax, batchKey: batchKeyArg } = BatchLink.mock.calls[0][0]

    expect(batchInterval).toBe(20)
    expect(batchMax).toBe(20)
    expect(batchKeyArg()).toEqual(batchKey())
  })

  it('handles batched requests', done => {
    const link = new BatchHttpLink({
      uri: 'batch',
      batchInterval: 0,
      batchMax: 2,
    })
    const setContext = new RelayLink((op, forward) => {
      op.setContext({ credentials: 'two' })
      return forward(op)
    })

    let nextCalls = 0
    let completions = 0
    const next = expectedData => d => {
      try {
        expect(d).toEqual(expectedData)
        nextCalls++
      } catch (error) {
        done.fail(error)
      }
    }

    const complete = () => {
      try {
        const calls = fetchMock.calls('/batch')
        expect(calls.length).toBe(1)
        expect(nextCalls).toBe(2)

        const options = fetchMock.lastOptions('/batch')
        expect(options['credentials']).toEqual('two')

        completions++

        if (completions === 2) {
          done()
        }
      } catch (error) {
        done.fail(error)
      }
    }

    const error = (e: Error) => {
      done.fail(e)
    }

    execute(setContext.concat(link), createRequest(sampleQuery), {}, {}).subscribe({
      next: next(data),
      error,
      complete,
    })

    execute(setContext.concat(link), createRequest(sampleQuery), {}, {}).subscribe({
      next: next(data2),
      error,
      complete,
    })
  })

  it('errors on an incorrect number of results for a batch', done => {
    const link = new BatchHttpLink({
      uri: 'batch',
      batchInterval: 0,
      batchMax: 3,
    })

    let errors = 0
    const next = () => {
      done.fail('next should not have been called')
    }

    const complete = () => {
      done.fail('complete should not have been called')
    }

    const error = () => {
      errors++

      if (errors === 3) {
        done()
      }
    }

    execute(link, createRequest(sampleQuery), {}, {}).subscribe({ next, error, complete })
    execute(link, createRequest(sampleQuery), {}, {}).subscribe({ next, error, complete })
    execute(link, createRequest(sampleQuery), {}, {}).subscribe({ next, error, complete })
  })

  describe('batchKey', () => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `

    it('should batch queries with different options separately', done => {
      let key = true
      const batchKey = () => {
        key = !key
        return '' + !key
      }

      const link = RelayLink.from([
        new BatchHttpLink({
          uri: op => {
            return op.variables.endpoint
          },
          batchInterval: 1,
          //if batchKey does not work, then the batch size would be 3
          batchMax: 3,
          batchKey,
        }),
      ])

      let count = 0
      const next = expected => received => {
        try {
          expect(received).toEqual(expected)
        } catch (e) {
          done.fail(e)
        }
      }
      const complete = () => {
        count++
        if (count === 4) {
          try {
            const lawlCalls = fetchMock.calls('/lawl')
            expect(lawlCalls.length).toBe(1)
            const roflCalls = fetchMock.calls('/rofl')
            expect(roflCalls.length).toBe(1)
            done()
          } catch (e) {
            done.fail(e)
          }
        }
      }

      ;[1, 2].forEach(x => {
        execute(link, createRequest(query), { endpoint: 'rofl' }, {}).subscribe({
          next: next(roflData),
          error: done.fail,
          complete,
        })

        execute(link, createRequest(query), { endpoint: 'lawl' }, {}).subscribe({
          next: next(lawlData),
          error: done.fail,
          complete,
        })
      })
    })
  })
})
