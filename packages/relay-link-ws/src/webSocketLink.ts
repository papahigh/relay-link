import { Operation, OperationResponse, RelayDisposableLink } from 'relay-link'
import { Observable } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

import { ClientOptions, SubscriptionClient, OperationOptions } from 'relay-transport-ws'

/**
 * Configuration to use when constructing the subscription client (subscriptions-transport-ws).
 */
export interface Configuration {
  /**
   * The endpoint to connect to.
   */
  uri: string

  /**
   * Options to pass when constructing the subscription client.
   */
  options?: ClientOptions

  /**
   * A custom WebSocket implementation to use.
   */
  webSocketImpl?: any
}

export class WebSocketLink extends RelayDisposableLink {
  private subscriptionClient: SubscriptionClient

  constructor(paramsOrClient: Configuration | SubscriptionClient) {
    super()
    if (paramsOrClient instanceof SubscriptionClient) {
      this.subscriptionClient = paramsOrClient
    } else {
      this.subscriptionClient = new SubscriptionClient(
        paramsOrClient.uri,
        paramsOrClient.options,
        paramsOrClient.webSocketImpl,
      )
    }
  }

  public dispose() {
    this.subscriptionClient.close()
  }

  public request(operation: Operation): RelayObservable<OperationResponse> {
    return Observable.create<OperationResponse>(sink => {
      const request: OperationOptions = {}

      if (operation.operationId) request.operationId = operation.operationId
      else if (operation.operationName) request.operationName = operation.operationName
      if (operation.query) request.query = operation.query
      if (operation.variables) request.variables = operation.variables

      const { unsubscribe } = this.subscriptionClient.request(request).subscribe({
        next: (value: any) => {
          if (!sink.closed) {
            sink.next(value)
          }
        },
        complete: () => {
          if (!sink.closed) sink.complete()
        },
        error: error => {
          if (!sink.closed) sink.error(error)
        },
      })
      return unsubscribe
    })
  }
}
