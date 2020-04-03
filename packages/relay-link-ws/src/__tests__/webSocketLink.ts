import { DocumentNode } from 'graphql'
import { execute, OperationKind } from 'relay-link'
import { Observable, RequestParameters } from 'relay-runtime'
import { SubscriptionClient } from 'relay-transport-ws'

import { WebSocketLink } from '../webSocketLink'

const query = `
  query SampleQuery {
    stub {
      id
    }
  }
`

const mutation = `
  mutation SampleMutation {
    stub {
      id
    }
  }
`

const subscription = `
  subscription SampleSubscription {
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

describe('WebSocketLink', () => {
  it('should construct', () => {
    const client: any = {}
    client.__proto__ = SubscriptionClient.prototype
    expect(() => new WebSocketLink(client)).not.toThrow()
  })

  it('should call request on the client for a query', done => {
    const result = { data: { data: 'result' } }
    const client: any = {}
    const observable = Observable.from(result)
    client.__proto__ = SubscriptionClient.prototype
    client.request = jest.fn()
    client.request.mockReturnValueOnce(observable)

    const link = new WebSocketLink(client)
    execute(link, createRequest(query), {}, {}).subscribe({
      next: data => {
        expect(data).toEqual(result)
        expect(client.request).toHaveBeenCalledTimes(1)
        done()
      },
    })
  })

  it('should call query on the client for a mutation', done => {
    const result = { data: { data: 'result' } }
    const client: any = {}
    const observable = Observable.from(result)
    client.__proto__ = SubscriptionClient.prototype
    client.request = jest.fn()
    client.request.mockReturnValueOnce(observable)

    const link = new WebSocketLink(client)
    execute(link, createRequest(mutation, OperationKind.MUTATION), {}, {}).subscribe({
      next: data => {
        expect(data).toEqual(result)
        expect(client.request).toHaveBeenCalledTimes(1)
        done()
      },
    })
  })

  it('should call next with multiple results for subscription', done => {
    const results = [{ data: { data: 'result1' } }, { data: { data: 'result2' } }]
    const client: any = {}
    client.__proto__ = SubscriptionClient.prototype
    client.request = jest.fn(() => {
      const copy = [...results]
      return Observable.create(sink => {
        sink.next(copy[0])
        sink.next(copy[1])
      })
    })

    const link = new WebSocketLink(client)
    execute(link, createRequest(subscription, OperationKind.SUBSCRIPTION), {}, {}).subscribe({
      next: data => {
        expect(client.request).toHaveBeenCalledTimes(1)
        expect(data).toEqual(results.shift())
        if (results.length === 0) done()
      },
    })
  })
})
