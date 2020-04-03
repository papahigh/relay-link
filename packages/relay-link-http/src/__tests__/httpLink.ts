import fetchMock from 'fetch-mock'
import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { execute, OperationKind, RelayLink } from 'relay-link'
import { RequestParameters } from 'relay-runtime'
import { createHttpLink, HttpLink } from '../httpLink'

import { sharedHttpTest } from './sharedHttpTests'

const sampleQuery = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`

const sampleMutation = gql`
  mutation SampleMutation {
    stub {
      id
    }
  }
`

const makeCallback = (done, body) => {
  return (...args) => {
    try {
      body(...args)
      done()
    } catch (error) {
      done.fail(error)
    }
  }
}

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

describe('HttpLink', () => {
  describe('HttpLink-specific tests', () => {
    it('does not need any constructor arguments', () => {
      expect(() => new HttpLink()).not.toThrow()
    })

    const makePromise = res => new Promise((resolve, reject) => setTimeout(() => resolve(res)))
    const data = { data: { hello: 'world' } }

    beforeEach(() => {
      fetchMock.restore()
      fetchMock.post('begin:http://data/', makePromise(data))
      fetchMock.get('begin:http://data', makePromise(data))
    })

    afterEach(() => {
      fetchMock.restore()
    })

    it('constructor creates link that can call next and then complete', done => {
      const next = jest.fn()
      const link = new HttpLink({ uri: 'http://data/' })
      const observable = execute(link, createRequest(sampleQuery), {}, {})
      observable.subscribe({
        next,
        error: error => done.fail('error'),
        complete: () => {
          expect(next).toHaveBeenCalledTimes(1)
          done()
        },
      })
    })

    it('supports using a GET request', done => {
      const variables = { params: 'stub' }

      const link = createHttpLink({
        uri: 'http://data/',
        fetchOptions: { method: 'GET' },
      })

      execute(link, createRequest(sampleQuery), variables, {}).subscribe({
        next: makeCallback(done, result => {
          const [uri, options] = fetchMock.lastCall()
          const { method, body } = options
          expect(body).toBeUndefined()
          expect(method).toBe('GET')
          expect(uri).toBe(
            'http://data/?query=query%20SampleQuery%20%7B%0A%20%20stub%20%7B%0A%20%20%20%20id%0A%20%20%7D%0A%7D%0A&variables=%7B%22params%22%3A%22stub%22%7D',
          )
        }),
        error: error => done.fail(error),
      })
    })

    it('supports using a GET request with search and fragment', done => {
      const variables = { params: 'stub' }

      const link = createHttpLink({
        uri: 'http://data/?foo=bar#frag',
        fetchOptions: { method: 'GET' },
      })

      execute(link, createRequest(sampleQuery), variables, {}).subscribe({
        next: makeCallback(done, result => {
          const [uri, options] = fetchMock.lastCall()
          const { method, body } = options
          expect(body).toBeUndefined()
          expect(method).toBe('GET')
          expect(uri).toBe(
            'http://data/?foo=bar&query=query%20SampleQuery%20%7B%0A%20%20stub%20%7B%0A%20%20%20%20id%0A%20%20%7D%0A%7D%0A&variables=%7B%22params%22%3A%22stub%22%7D#frag',
          )
        }),
        error: error => done.fail(error),
      })
    })

    it('supports using a GET request on the context', done => {
      const variables = { params: 'stub' }
      const setContext = new RelayLink((operation, forward) => {
        operation.setContext({ fetchOptions: { method: 'GET' } })
        return forward(operation)
      })
      const link = setContext.concat(
        createHttpLink({
          uri: 'http://data/',
        }),
      )

      execute(link, createRequest(sampleQuery), variables, {}).subscribe({
        next: makeCallback(done, result => {
          const [uri, options] = fetchMock.lastCall()
          const { method, body } = options
          expect(body).toBeUndefined()
          expect(method).toBe('GET')
          expect(uri).toBe(
            'http://data/?query=query%20SampleQuery%20%7B%0A%20%20stub%20%7B%0A%20%20%20%20id%0A%20%20%7D%0A%7D%0A&variables=%7B%22params%22%3A%22stub%22%7D',
          )
        }),
      })
    })

    it('uses GET with useGETForQueries', done => {
      const variables = { params: 'stub' }
      const link = createHttpLink({
        uri: 'http://data/',
        useGETForQueries: true,
      })

      execute(link, createRequest(sampleQuery), variables, {}).subscribe({
        next: makeCallback(done, result => {
          const [uri, options] = fetchMock.lastCall()
          const { method, body } = options
          expect(body).toBeUndefined()
          expect(method).toBe('GET')
          expect(uri).toBe(
            'http://data/?query=query%20SampleQuery%20%7B%0A%20%20stub%20%7B%0A%20%20%20%20id%0A%20%20%7D%0A%7D%0A&variables=%7B%22params%22%3A%22stub%22%7D',
          )
        }),
      })
    })

    it('uses POST for mutations with useGETForQueries', done => {
      const variables = { params: 'stub' }
      const link = createHttpLink({
        uri: 'http://data/',
        useGETForQueries: true,
      })

      execute(link, createRequest(sampleMutation, OperationKind.MUTATION), variables, {}).subscribe({
        next: makeCallback(done, result => {
          const [uri, options] = fetchMock.lastCall()
          const { method, body } = options
          expect(body).toBeDefined()
          expect(method).toBe('POST')
          expect(uri).toBe('http://data/')
        }),
      })
    })

    it("throws for GET if the variables can't be stringified", done => {
      const link = createHttpLink({
        uri: 'http://data/',
        useGETForQueries: true,
      })

      let b
      const a = { b }
      b = { a }
      a.b = b
      const variables = {
        a,
        b,
      }
      execute(link, createRequest(sampleQuery), variables, {}).subscribe({
        next: result => {
          done.fail('next should have been thrown from the link')
        },
        error: makeCallback(done, e => {
          expect(e.message).toMatch(/Variables map is not serializable/)
          expect(e.parseError.message).toMatch(/Converting circular structure to JSON/)
        }),
      })
    })

    sharedHttpTest('HttpLink', createHttpLink)
  })
})
