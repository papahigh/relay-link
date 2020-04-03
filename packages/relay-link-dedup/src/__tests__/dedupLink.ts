import { RelayLink, OperationKind, execute, OperationResponse } from 'relay-link'
import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { Observable, RequestParameters } from 'relay-runtime'

import { DedupLink } from '../dedupLink'

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

describe('DedupLink', () => {
  it('should not affect different queries', () => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Goodbye World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let called = 0
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        called += 1
        return Observable.from({ data: {} })
      }),
    ])

    execute(deduper, createRequest(request1.query), request1.variables, {})
    execute(deduper, createRequest(request2.query), request2.variables, {})
    expect(called).toBe(2)
  })
  it('should not deduplicate requests following an errored query', done => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables = { x: 'Hello World' }

    let error: Error
    const data = { data: 'some data' }

    const request = {
      query: document,
      variables: variables,
    }

    let called = 0
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        called += 1
        switch (called) {
          case 1:
            return Observable.create(sink => {
              error = new Error('some error')
              sink.error(error)
            })
          case 2:
            return Observable.create<OperationResponse>(sink => {
              sink.next(data as any)
              sink.complete()
            })
          default:
            expect(false)
            return null as any
        }
      }),
    ])

    try {
      execute(deduper, createRequest(request.query), request.variables, {}).subscribe({
        error: (actualError: Error) => {
          expect(actualError).toEqual(error)

          //second query
          execute(deduper, createRequest(request.query), request.variables, {}).subscribe({
            next: result => {
              expect(result).toEqual(data)
              expect(called).toBe(2)
              done()
            },
          })
        },
      })
    } catch (e) {
      done.fail(e)
    }
  })
  it('should deduplicate identical queries', () => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Hello World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let called = 0
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        return Observable.create(sink => {
          called += 1
          setTimeout(sink.complete.bind(sink))
        })
      }),
    ])

    execute(deduper, createRequest(request1.query), request1.variables, {}).subscribe({})
    execute(deduper, createRequest(request2.query), request2.variables, {}).subscribe({})
    expect(called).toBe(1)
  })
  it('should work for nested queries', done => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Hello World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let called = 0
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        return Observable.create(sink => {
          called += 1
          sink.next({ data: { test: 1 } })
        })
      }),
    ])

    execute(deduper, createRequest(request1.query), request1.variables, {}).subscribe({
      complete: () => {
        execute(deduper, createRequest(request2.query), request2.variables, {}).subscribe({
          complete: () => {
            expect(called).toBe(2)
            done()
          },
        })
      },
    })
  })
  it('should bypass deduplication if desired', () => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Hello World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let called = 0
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        called += 1
        return Observable.from({ data: {} })
      }),
    ])

    execute(deduper, createRequest(request1.query), request1.variables, { force: true }).subscribe({})
    execute(deduper, createRequest(request2.query), request2.variables, { force: true }).subscribe({})
    expect(called).toBe(2)
  })
  it('should unsubscribe as needed', () => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Hello World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let unsubscribed = false
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        return Observable.create(() => {
          return () => {
            unsubscribed = true
          }
        })
      }),
    ])

    const sub1 = execute(deduper, createRequest(request1.query), request1.variables, {}).subscribe({})
    const sub2 = execute(deduper, createRequest(request2.query), request2.variables, {}).subscribe({})

    sub2.unsubscribe()
    sub1.unsubscribe()

    expect(unsubscribed).toBe(true)
  })
  it('should unsubscribe only when needed', () => {
    const document: DocumentNode = gql`
      query test1($x: String) {
        test(x: $x)
      }
    `
    const variables1 = { x: 'Hello World' }
    const variables2 = { x: 'Hello World' }

    const request1 = {
      query: document,
      variables: variables1,
    }

    const request2 = {
      query: document,
      variables: variables2,
    }

    let unsubscribed = false
    const deduper = RelayLink.from([
      new DedupLink(),
      new RelayLink(() => {
        return Observable.create(() => {
          return () => {
            unsubscribed = true
          }
        })
      }),
    ])

    const sub1 = execute(deduper, createRequest(request1.query), request1.variables, {}).subscribe({})
    // @ts-ignore
    const sub2 = execute(deduper, createRequest(request2.query), request2.variables, {}).subscribe({})

    sub1.unsubscribe()

    //NOTE: sub2 is still waiting!
    expect(unsubscribed).toBe(false)
  })
})
