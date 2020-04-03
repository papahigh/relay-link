import gql from 'graphql-tag'
import { DocumentNode } from 'graphql/language/ast'
import { execute, fromError, OperationResponse, RelayLink } from 'relay-link'
import { OperationKind } from 'relay-link/lib/types'
import { Observable, RequestParameters } from 'relay-runtime'

import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import waitFor from 'wait-for-observables'

import { RetryLink } from '../retryLink'

const query = gql`
  {
    sample {
      id
    }
  }
`

const standardError = new Error('I never work')

export function createRequest(
  queryOrNde: string | DocumentNode,
  operationKind = OperationKind.SUBSCRIPTION,
): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: queryOrNde as any,
    operationKind,
    metadata: {},
  }
}

describe('RetryLink', () => {
  it('should fail for unreachable endpoints', async () => {
    const max = 10
    const retry = new RetryLink({ delay: { initial: 1 }, attempts: { max } })
    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => fromError(standardError))

    const link = RelayLink.from([retry, stub])

    const response = (execute(link, createRequest(query), {}, {}) as RelayObservable<OperationResponse>).toPromise()

    await expect(response).rejects.toThrow(standardError)
    expect(stub).toHaveBeenCalledTimes(max)
  })

  it('should return data from the underlying link on a successful operation', async () => {
    const retry = new RetryLink()
    const data = { data: { hello: 'world' } }
    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => Observable.from(data))

    const link = RelayLink.from([retry, stub])

    const response = (execute(link, createRequest(query), {}, {}) as RelayObservable<OperationResponse>).toPromise()

    await expect(response).resolves.toEqual(data)
    expect(stub).toHaveBeenCalledTimes(1)
  })

  it('should return data from the underlying link on a successful retry', async () => {
    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: { max: 2 },
    })
    const data = { data: { hello: 'world' } }
    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>()
    stub.mockReturnValueOnce(fromError(standardError))
    stub.mockReturnValueOnce(Observable.from(data))

    const link = RelayLink.from([retry, stub])

    const response = (execute(link, createRequest(query), {}, {}) as RelayObservable<OperationResponse>).toPromise()

    await expect(response).resolves.toEqual(data)
    expect(stub).toHaveBeenCalledTimes(2)
  })

  it('should call unsubscribe on the appropriate downstream observable', async () => {
    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: { max: 2 },
    })
    const data = { data: { hello: 'world' } }
    const unsubscribeStub = jest.fn()
    const firstTry = fromError(standardError)

    let secondTry: RelayObservable<OperationResponse>
    const untilSecondTry = new Promise(resolve => {
      secondTry = Observable.create(sink => {
        resolve() // Release hold on test.

        Promise.resolve().then(() => {
          sink.next(data)
          sink.complete()
        })

        return unsubscribeStub
      })
    })

    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>()
    stub.mockReturnValueOnce(firstTry)
    stub.mockReturnValueOnce(secondTry!)

    const link = RelayLink.from([retry, stub])
    const subscription = execute(link, createRequest(query), {}, {}).subscribe({})
    await untilSecondTry
    subscription.unsubscribe()
    expect(unsubscribeStub).toHaveBeenCalledTimes(1)
  })

  it('should support multiple subscribers to the same request', async () => {
    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: { max: 5 },
    })
    const data = { data: { hello: 'world' } }
    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>()
    stub.mockReturnValueOnce(fromError(standardError))
    stub.mockReturnValueOnce(fromError(standardError))
    stub.mockReturnValueOnce(Observable.from(data))

    const link = RelayLink.from([retry, stub])

    const response = execute(link, createRequest(query), {}, {}) as RelayObservable<OperationResponse>

    const [result1, result2] = await waitFor(response, response)

    expect((result1 as any).values).toEqual([data])
    expect((result2 as any).values).toEqual([data])

    expect(stub).toHaveBeenCalledTimes(3)
  })

  it('should retry independently for concurrent requests', async () => {
    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: { max: 5 },
    })
    const stub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => fromError(standardError))

    const link = RelayLink.from([retry, stub])

    const [result1, result2] = await waitFor(
      execute(link, createRequest(query), {}, {}),
      execute(link, createRequest(query), {}, {}),
    )

    expect((result1 as any).error).toEqual(standardError)
    expect((result2 as any).error).toEqual(standardError)
    expect(stub).toHaveBeenCalledTimes(10)
  })

  it('should support custom delay functions', async () => {
    const delayStub = jest.fn<number, any[]>(() => 1)
    const retry = new RetryLink({ delay: delayStub, attempts: { max: 3 } })
    const linkStub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => fromError(standardError))
    const link = RelayLink.from([retry, linkStub])

    const [{ error }]: any = await waitFor(execute(link, createRequest(query), {}, {}))

    expect(error).toEqual(standardError)
    const operation = delayStub.mock.calls[0][1]
    expect(delayStub.mock.calls).toEqual([
      [1, operation, standardError],
      [2, operation, standardError],
    ])
  })

  it('should support custom attempt functions', async () => {
    const attemptStub = jest.fn<boolean, any[]>()
    attemptStub.mockReturnValueOnce(true)
    attemptStub.mockReturnValueOnce(true)
    attemptStub.mockReturnValueOnce(false)

    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: attemptStub,
    })
    const linkStub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => fromError(standardError))
    const link = RelayLink.from([retry, linkStub])

    const [{ error }]: any = await waitFor(execute(link, createRequest(query), {}, {}))

    expect(error).toEqual(standardError)
    const operation = attemptStub.mock.calls[0][1]
    expect(attemptStub.mock.calls).toEqual([
      [1, operation, standardError],
      [2, operation, standardError],
      [3, operation, standardError],
    ])
  })

  it('should support custom attempt functions that return either Promises or booleans', async () => {
    const attemptStub = jest.fn<boolean | Promise<boolean>, any[]>()
    attemptStub.mockReturnValueOnce(true)
    attemptStub.mockReturnValueOnce(Promise.resolve(true))
    attemptStub.mockReturnValueOnce(Promise.resolve(false))

    const retry = new RetryLink({
      delay: { initial: 1 },
      attempts: attemptStub,
    })
    const linkStub = jest.fn<RelayObservable<OperationResponse>, any[]>(() => fromError(standardError))
    const link = RelayLink.from([retry, linkStub])

    const [{ error }]: any = await waitFor(execute(link, createRequest(query), {}, {}))

    expect(error).toEqual(standardError)
    const operation = attemptStub.mock.calls[0][1]
    expect(attemptStub.mock.calls).toEqual([
      [1, operation, standardError],
      [2, operation, standardError],
      [3, operation, standardError],
    ])
  })
})
