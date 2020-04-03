import fetchMock from 'fetch-mock'
import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { createOperation, Operation, OperationKind } from 'relay-link'
import { RequestParameters } from 'relay-runtime'

import {
  checkFetcher,
  fallbackHttpConfig,
  parseAndCheckHttpResponse,
  selectHttpOptionsAndBody,
  selectURI,
  serializeFetchParameter,
} from '../index'

const query = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`

export function createRequest(
  queryOrDocument: string | DocumentNode,
  operationKind = OperationKind.SUBSCRIPTION,
): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: queryOrDocument as any,
    operationKind,
    metadata: {},
  }
}

describe('Common Http functions', () => {
  describe('parseAndCheckResponse', () => {
    beforeEach(() => {
      fetchMock.restore()
    })

    const operations = [createOperation(createRequest(query), {}, {})]

    it('throws a parse error with a status code on unparsable response', done => {
      const status = 400
      fetchMock.get('/error', status)
      fetch('error')
        .then(parseAndCheckHttpResponse(operations))
        .then(() => done.fail('then'))
        .catch(e => {
          expect(e.statusCode).toBe(status)
          expect(e.name).toBe('ServerParseError')
          expect(e).toHaveProperty('response')
          expect(e).toHaveProperty('bodyText')
          done()
        })
        .catch(done.fail)
    })

    it('throws a network error with a status code and result', done => {
      const status = 403
      const body = { data: 'fail' } //does not contain data or errors
      fetchMock.get('/error', {
        body,
        status,
      })
      fetch('error')
        .then(parseAndCheckHttpResponse(operations))
        .then(() => done.fail('then'))
        .catch(e => {
          expect(e.statusCode).toBe(status)
          expect(e.name).toBe('ServerError')
          expect(e).toHaveProperty('response')
          expect(e).toHaveProperty('result')
          done()
        })
        .catch(done.fail)
    })

    it('throws a server error on incorrect data', done => {
      const data = { hello: 'world' } //does not contain data or erros
      fetchMock.get('/incorrect', data)
      fetch('incorrect')
        .then(parseAndCheckHttpResponse(operations))
        .then(() => done.fail('then'))
        .catch(e => {
          expect(e.statusCode).toBe(200)
          expect(e.name).toBe('ServerError')
          expect(e).toHaveProperty('response')
          expect(e.result).toEqual(data)
          done()
        })
        .catch(done.fail)
    })

    it('is able to return a correct GraphQL result', done => {
      const errors = ['', '' + new Error('hi')]
      const data = [{ data: { hello: 'world' }, errors }]

      fetchMock.get('/data', { body: data })
      fetch('data')
        .then(parseAndCheckHttpResponse<Operation[]>(operations))
        .then(([{ data: d, errors: e }]) => {
          expect(d).toEqual({ hello: 'world' })
          expect(e.length).toEqual(errors.length)
          expect(e).toEqual(errors)
          done()
        })
        .catch(done.fail)
    })
  })

  describe('selectHttpOptionsAndBody', () => {
    it('allows the query to be ignored', () => {
      const { body } = selectHttpOptionsAndBody(
        createOperation(
          {
            id: 'query',
            operationKind: OperationKind.QUERY,
            text: undefined,
            metadata: {},
            name: undefined,
          },
          {},
          {},
        ),
        {},
      )
      expect(body).not.toHaveProperty('query')
      expect(body).toHaveProperty('operationId')
      expect(body.operationId).toBe('query')
    })

    it('allows headers, credentials, and setting of method to function correctly', () => {
      const headers = {
        accept: 'application/json',
        'content-type': 'application/graphql',
      }

      const credentials = {
        'X-Secret': 'djmashko',
      }

      const opts = {
        opt: 'hi',
      }

      const config = { headers, credentials, options: opts }

      const { options, body } = selectHttpOptionsAndBody(
        createOperation(createRequest(query), {}, {}),
        fallbackHttpConfig,
        config,
      )

      expect(body).toHaveProperty('query')

      expect(options.headers).toEqual(headers)
      expect(options.credentials).toEqual(credentials)
      expect(options.opt).toEqual('hi')
      expect(options.method).toEqual('POST') //from default
    })
  })

  describe('selectURI', () => {
    it('returns a passed in string', () => {
      const uri = '/somewhere'
      const operation = createOperation(createRequest(query), {}, { metadata: { uri } })
      expect(selectURI(operation)).toEqual(uri)
    })

    it('returns a fallback of /graphql', () => {
      const uri = '/graphql'
      const operation = createOperation(createRequest(query), {}, {})
      expect(selectURI(operation)).toEqual(uri)
    })

    it('returns the result of a UriFunction', () => {
      const uri = '/somewhere'
      const operation = createOperation(createRequest(query), {}, {})
      expect(selectURI(operation, () => uri)).toEqual(uri)
    })
  })

  describe('serializeFetchParameter', () => {
    it('throws a parse error on an unparsable body', () => {
      const b = {}
      const a = { b }
      ;(b as any).a = a

      expect(() => serializeFetchParameter(b, 'Label')).toThrow(/Label/)
    })

    it('returns a correctly parsed body', () => {
      const body = { no: 'thing' }

      expect(serializeFetchParameter(body, 'Label')).toEqual('{"no":"thing"}')
    })
  })

  describe('checkFetcher', () => {
    let oldFetch
    beforeEach(() => {
      oldFetch = window.fetch
      delete window.fetch
    })

    afterEach(() => {
      window.fetch = oldFetch
    })

    it('throws if no fetch is present', () => {
      expect(() => checkFetcher(undefined)).toThrow(/fetch is not found globally/)
    })

    it('does not throws if no fetch is present but a fetch is passed', () => {
      // @ts-ignore
      expect(() => checkFetcher(() => {})).not.toThrow()
    })
  })
})
