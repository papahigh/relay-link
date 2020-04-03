import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { execute, OperationKind, RelayLink } from 'relay-link'
import { ServerError, throwServerError } from 'relay-link-http-common'
import { RequestParameters, Observable } from 'relay-runtime'
import { ErrorLink, onError } from '../'

export function createRequest(
  query: string | DocumentNode,
  operationKind = OperationKind.SUBSCRIPTION,
): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: query as any,
    operationKind,
    metadata: {},
  }
}

describe('error handling', () => {
  it('should have an easy way to handle GraphQL errors', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called: boolean | undefined
    const errorLink = onError(({ graphQLErrors, networkError }) => {
      expect(graphQLErrors[0].message).toBe('resolver blew up')
      called = true
    })

    const mockLink = new RelayLink(() => Observable.from({ errors: [{ message: 'resolver blew up' }] }))

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.errors![0].message).toBe('resolver blew up')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should have an easy way to log client side (network) errors', done => {
    const query = gql`
      query Foo {
        foo {
          bar
        }
      }
    `

    let called: boolean | undefined
    const errorLink = onError(({ operation, networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      expect(operation.query).toBe(query)
      called = true
    })

    const mockLink = new RelayLink(() => {
      throw new Error('app is crashing')
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      error: (e: Error) => {
        expect(e.message).toBe('app is crashing')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should capture errors within links', done => {
    const query = gql`
      query Foo {
        foo {
          bar
        }
      }
    `

    let called: boolean | undefined
    const errorLink = onError(({ operation, networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      expect(operation.query).toBe(query)
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.create(() => {
        throw new Error('app is crashing')
      })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      error: (e: Error) => {
        expect(e.message).toBe('app is crashing')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should capture networkError.statusCode within links', done => {
    const query = gql`
      query Foo {
        foo {
          bar
        }
      }
    `

    let called: boolean | undefined
    const errorLink = onError(({ operation, networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      expect(networkError!.name).toBe('ServerError')
      expect((networkError as ServerError).statusCode).toBe(500)
      expect((networkError as ServerError).response.ok).toBe(false)
      expect(operation.query).toBe(query)
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.create(() => {
        const response = { status: 500, ok: false } as Response
        throwServerError(response, 'ServerError', 'app is crashing')
      })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      error: (e: Error) => {
        expect(e.message).toBe('app is crashing')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should complete if no errors', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = onError(({ networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.from({ data: { foo: { id: 1 } } })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      complete: () => {
        expect(called).toBe(false)
        done()
      },
    })
  })
  it('should allow an error to be ignored', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = onError(({ graphQLErrors, response }) => {
      expect(graphQLErrors![0].message).toBe('ignore')
      // ignore errors
      response!.errors = undefined
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.from({
        data: { foo: { id: 1 } },
        errors: [{ message: 'ignore' }],
      })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.errors).toBe(undefined)
        expect(result.data).toEqual({ foo: { id: 1 } })
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should be unsubcribed', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `
    let called = false
    const errorLink = onError(({ networkError }) => {
      expect(networkError?.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.create(sink => {
        setTimeout(() => {
          sink.next({ data: { foo: { id: 1 } } })
          sink.complete()
        }, 5)
      })
    })

    const link = errorLink.concat(mockLink)

    const sub = execute(link, createRequest(query), {}, {}).subscribe({
      complete: () => {
        done.fail('completed')
      },
    })
    sub.unsubscribe()

    setTimeout(() => {
      expect(called).toBe(false)
      done()
    }, 10)
  })
  it('should include the operation and any data along with a graphql error', done => {
    const query = gql`
      query Foo {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = onError(({ graphQLErrors, response, operation }) => {
      expect(graphQLErrors![0].message).toBe('resolver blew up')
      expect(response!.data!.foo).toBe(true)
      expect(operation.query).toBe(query)
      called = true
    })

    const mockLink = new RelayLink(() =>
      Observable.from({
        data: { foo: true },
        errors: [
          {
            message: 'resolver blew up',
          },
        ],
      }),
    )

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.errors![0].message).toBe('resolver blew up')
        expect(called).toBe(true)
        done()
      },
    })
  })
})

describe('error handling with class', () => {
  it('should have an easy way to handle GraphQL errors', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = new ErrorLink(({ graphQLErrors }) => {
      expect(graphQLErrors![0].message).toBe('resolver blew up')
      called = true
    })

    const mockLink = new RelayLink(() =>
      Observable.from({
        errors: [
          {
            message: 'resolver blew up',
          },
        ],
      }),
    )

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.errors![0].message).toBe('resolver blew up')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should have an easy way to log client side (network) errors', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = new ErrorLink(({ networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      throw new Error('app is crashing')
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      error: (e: Error) => {
        expect(e.message).toBe('app is crashing')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should capture errors within links', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = new ErrorLink(({ networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.create(() => {
        throw new Error('app is crashing')
      })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      error: (e: Error) => {
        expect(e.message).toBe('app is crashing')
        expect(called).toBe(true)
        done()
      },
    })
  })
  it('should complete if no errors', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = new ErrorLink(({ networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.from({ data: { foo: { id: 1 } } })
    })

    const link = errorLink.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toStrictEqual({ foo: { id: 1 } })
        expect(called).toBe(false)
        done()
      },
    })
  })
  it('should be unsubcribed', done => {
    const query = gql`
      {
        foo {
          bar
        }
      }
    `

    let called = false
    const errorLink = new ErrorLink(({ networkError }) => {
      expect(networkError!.message).toBe('app is crashing')
      called = true
    })

    const mockLink = new RelayLink(() => {
      return Observable.create(obs => {
        setTimeout(() => {
          obs.next({ data: { foo: { id: 1 } } })
          obs.complete()
        }, 5)
      })
    })

    const link = errorLink.concat(mockLink)

    const sub = execute(link, createRequest(query), {}, {}).subscribe({
      error: () => {
        done.fail('error')
      },
      next: () => {
        done.fail('next')
      },
      complete: () => {
        done.fail('complete')
      },
    })

    sub.unsubscribe()

    setTimeout(() => {
      expect(called).toBe(false)
      done()
    }, 10)
  })
})

describe('support for request retrying', () => {
  const QUERY = gql`
    query Foo {
      foo {
        bar
      }
    }
  `
  const ERROR_RESPONSE = {
    errors: [
      {
        name: 'something bad happened',
        message: 'resolver blew up',
      },
    ],
  }
  const GOOD_RESPONSE = {
    data: { foo: true },
  }
  const NETWORK_ERROR = {
    message: 'some other error',
  }

  it('should return the retried request when forward(operation) is called', done => {
    let errorHandlerCalled = false

    let timesCalled = 0
    const mockHttpLink = new RelayLink(() => {
      if (timesCalled === 0) {
        timesCalled++
        // simulate the first request being an error
        return Observable.create(sink => {
          sink.next(ERROR_RESPONSE)
          sink.complete()
        })
      } else {
        return Observable.create(sink => {
          sink.next(GOOD_RESPONSE)
          sink.complete()
        })
      }
    })

    const errorLink = new ErrorLink(({ graphQLErrors, response, operation, forward }) => {
      try {
        if (graphQLErrors) {
          errorHandlerCalled = true
          expect(graphQLErrors).toEqual(ERROR_RESPONSE.errors)
          expect(response?.data).not.toBeDefined()
          expect(operation.query).toBe(QUERY)
          // retry operation if it resulted in an error
          return forward!(operation)
        }
      } catch (error) {
        done.fail(error)
      }
    })

    const link = errorLink.concat(mockHttpLink)

    execute(link, createRequest(QUERY), {}, {}).subscribe({
      error: () => {
        done.fail('error')
      },
      next: result => {
        try {
          expect(errorHandlerCalled).toBe(true)
          expect(result).toEqual(GOOD_RESPONSE)
        } catch (error) {
          return done.fail(error)
        }
      },
      complete: () => {
        done()
      },
    })
  })
  it('should support retrying when the initial request had networkError', done => {
    let errorHandlerCalled = false

    let timesCalled = 0
    const mockHttpLink = new RelayLink(() => {
      if (timesCalled === 0) {
        timesCalled++
        // simulate the first request being an error
        return Observable.create(sink => {
          sink.error(NETWORK_ERROR as any)
        })
      } else {
        return Observable.create(sink => {
          sink.next(GOOD_RESPONSE)
          sink.complete()
        })
      }
    })

    const errorLink = new ErrorLink(({ networkError, operation, forward }) => {
      try {
        if (networkError) {
          errorHandlerCalled = true
          expect(networkError).toEqual(NETWORK_ERROR)
          return forward!(operation)
        }
      } catch (error) {
        done.fail(error)
      }
    })

    const link = errorLink.concat(mockHttpLink)

    execute(link, createRequest(QUERY), {}, {}).subscribe({
      error: () => {
        done.fail('error')
      },
      next: result => {
        try {
          expect(errorHandlerCalled).toBe(true)
          expect(result).toEqual(GOOD_RESPONSE)
        } catch (error) {
          return done.fail(error)
        }
      },
      complete: () => {
        done()
      },
    })
  })
  it('should return errors from retried requests', done => {
    let errorHandlerCalled = false

    let timesCalled = 0
    const mockHttpLink = new RelayLink(() => {
      if (timesCalled === 0) {
        timesCalled++
        // simulate the first request being an error
        return Observable.create(sink => {
          sink.next(ERROR_RESPONSE)
          sink.complete()
        })
      } else {
        return Observable.create(sink => {
          sink.error(NETWORK_ERROR as any)
        })
      }
    })

    const errorLink = new ErrorLink(({ graphQLErrors, response, operation, forward }) => {
      try {
        if (graphQLErrors) {
          errorHandlerCalled = true
          expect(graphQLErrors).toEqual(ERROR_RESPONSE.errors)
          expect(response!.data).not.toBeDefined()
          expect(operation.query).toBe(QUERY)
          // retry operation if it resulted in an error
          return forward!(operation)
        }
      } catch (error) {
        done.fail(error)
      }
    })

    const link = errorLink.concat(mockHttpLink)

    execute(link, createRequest(QUERY), {}, {}).subscribe({
      error: (error: any) => {
        // note that complete will not be after an error
        // therefore we should end the test here with done()
        expect(errorHandlerCalled).toBe(true)
        expect(error).toEqual(NETWORK_ERROR)
        done()
      },
      next: () => {
        done.fail('next')
      },
      complete: () => {
        done.fail('complete')
      },
    })
  })
})
