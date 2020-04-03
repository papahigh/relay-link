import { NextLink, Operation, OperationResponse, RelayLink } from 'relay-link'
import { ServerError, ServerParseError } from 'relay-link-http-common'
import { Observable, PayloadError } from 'relay-runtime'
import { RelayObservable, Subscription } from 'relay-runtime/lib/network/RelayObservable'

export interface ErrorResponse {
  graphQLErrors?: ReadonlyArray<PayloadError>
  networkError?: Error | ServerError | ServerParseError
  response?: OperationResponse
  operation: Operation
  forward?: NextLink
}

/**
 * Callback to be triggered when an error occurs within the link stack.
 */
export interface ErrorHandler {
  (error: ErrorResponse): RelayObservable<OperationResponse> | void
}

export function onError(errorHandler: ErrorHandler): RelayLink {
  return new RelayLink((operation, forward) => {
    return Observable.create(sink => {
      let sub: Subscription
      let retriedSub: Subscription
      let retriedResult: Observable<OperationResponse> | void

      try {
        sub = forward(operation).subscribe({
          next: result => {
            if (result.errors) {
              retriedResult = errorHandler({
                graphQLErrors: result.errors,
                response: result,
                operation,
                forward,
              })

              if (retriedResult) {
                retriedSub = retriedResult.subscribe({
                  next: sink.next.bind(sink),
                  error: sink.error.bind(sink),
                  complete: sink.complete.bind(sink),
                })
                return
              }
            }
            sink.next(result)
          },
          error: (networkError: Error) => {
            retriedResult = errorHandler({
              operation,
              networkError,
              //Network errors can return GraphQL errors on for example a 403
              graphQLErrors: networkError && (networkError as any).result && (networkError as any).result.errors,
              forward,
            })
            if (retriedResult) {
              retriedSub = retriedResult.subscribe({
                next: sink.next.bind(sink),
                error: sink.error.bind(sink),
                complete: sink.complete.bind(sink),
              })
              return
            }
            sink.error(networkError)
          },
          complete: () => {
            // disable the previous sub from calling complete on observable
            // if retry is in flight.
            if (!retriedResult) {
              sink.complete()
            }
          },
        })
      } catch (e) {
        errorHandler({ networkError: e, operation, forward })
        sink.error(e)
      }

      return () => {
        if (sub) sub.unsubscribe()
        if (retriedSub) sub.unsubscribe()
      }
    })
  })
}

export class ErrorLink extends RelayLink {
  private readonly link: RelayLink

  constructor(errorHandler: ErrorHandler) {
    super()
    this.link = onError(errorHandler)
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    return this.link.request(operation, forward)
  }
}
