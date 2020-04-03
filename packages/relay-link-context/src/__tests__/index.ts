import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { execute, OperationKind, RelayLink } from 'relay-link'
import { Observable, RequestParameters } from 'relay-runtime'

import { setContext } from '../index'

const sleep = ms => new Promise(s => setTimeout(s, ms))
const query = gql`
  query Test {
    foo {
      bar
    }
  }
`

const data = {
  foo: { bar: true },
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

describe('setContext', () => {
  it('can be used to set the context with a simple function', done => {
    const withContext = setContext(() => ({ dynamicallySet: true }))

    const mockLink = new RelayLink(operation => {
      expect(operation.getContext().dynamicallySet).toBe(true)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        done()
      },
    })
  })

  it('can be used to set the context with a function returning a promise', done => {
    const withContext = setContext(() => Promise.resolve({ dynamicallySet: true }))

    const mockLink = new RelayLink(operation => {
      expect(operation.getContext().dynamicallySet).toBe(true)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        done()
      },
    })
  })

  it('can be used to set the context with a function returning a promise that is delayed', done => {
    const withContext = setContext(() => sleep(25).then(() => ({ dynamicallySet: true })))

    const mockLink = new RelayLink(operation => {
      expect(operation.getContext().dynamicallySet).toBe(true)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        done()
      },
    })
  })

  it('handles errors in the lookup correclty', done => {
    const withContext = setContext(() =>
      sleep(5).then(() => {
        throw new Error('dang')
      }),
    )

    const mockLink = new RelayLink(operation => {
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: () => done.fail('next'),
      error: e => {
        expect(e.message).toBe('dang')
        done()
      },
    })
  })

  it('handles errors in the lookup correclty with a normal function', done => {
    const withContext = setContext(() => {
      throw new Error('dang')
    })

    const mockLink = new RelayLink(operation => {
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: () => done.fail('next'),
      error: e => {
        expect(e.message).toBe('dang')
        done()
      },
    })
  })

  it('has access to the request information', done => {
    // tslint:disable-next-line:no-shadowed-variable
    const withContext = setContext(({ query, variables }) =>
      sleep(1).then(() =>
        Promise.resolve({
          variables: !!variables,
          operation: !!query,
        }),
      ),
    )

    const mockLink = new RelayLink(op => {
      const { variables, operation } = op.getContext()
      expect(variables).toBe(true)
      expect(operation).toBe(true)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), { id: 1 }, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        done()
      },
    })
  })

  it('has access to the context at execution time', done => {
    const withContext = setContext((_, { count = 1 }) => sleep(1).then(() => ({ count: count + 1 })))

    const mockLink = new RelayLink(operation => {
      const { count } = operation.getContext()
      expect(count).toEqual(2)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        done()
      },
    })
  })

  it('unsubscribes correctly', done => {
    const withContext = setContext((_, { count = 1 }) => sleep(1).then(() => ({ count: count + 1 })))

    const mockLink = new RelayLink(operation => {
      const { count } = operation.getContext()
      expect(count).toEqual(2)
      return Observable.from({ data })
    })

    const link = withContext.concat(mockLink)

    let handle = execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        expect(result.data).toEqual(data)
        handle.unsubscribe()
        done()
      },
    })
  })

  it('unsubscribes without throwing before data', done => {
    let called
    const withContext = setContext((_, { count = 1 }) => {
      called = true
      return sleep(1).then(() => ({ count: count + 1 }))
    })

    const mockLink = new RelayLink(operation => {
      const { count } = operation.getContext()
      expect(count).toEqual(2)
      return Observable.create(sink => {
        setTimeout(() => {
          sink.next({ data })
          sink.complete()
        }, 25)
      })
    })

    const link = withContext.concat(mockLink)

    let handle = execute(link, createRequest(query), {}, {}).subscribe({
      next: result => {
        done.fail('should have unsubscribed')
      },
    })

    setTimeout(() => {
      handle.unsubscribe()
      expect(called).toBe(true)
      done()
    }, 10)
  })
})
