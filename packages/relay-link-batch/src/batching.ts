import { Operation, NextLink, OperationResponse } from 'relay-link'
import { Observable } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export type BatchHandler = (
  operations: Operation[],
  forward?: (NextLink | undefined)[],
) => Observable<OperationResponse[]>

export interface BatchableRequest {
  operation: Operation
  forward?: NextLink

  // promise is created when the query fetch request is
  // added to the queue and is resolved once the result is back
  // from the server.
  observable?: Observable<OperationResponse>
  next?: Array<(result: OperationResponse) => void>
  error?: Array<(error: Error) => void>
  complete?: Array<() => void>
}

// QueryBatcher doesn't fire requests immediately. Requests that were enqueued within
// a certain amount of time (configurable through `batchInterval`) will be batched together
// into one query.
export class OperationBatcher {
  // Queue on which the QueryBatcher will operate on a per-tick basis.
  // Public only for testing
  public readonly queuedRequests: Map<string, BatchableRequest[]> = new Map()

  private readonly batchInterval?: number
  private readonly batchMax: number

  //This function is called to the queries in the queue to the server.
  private readonly batchHandler: BatchHandler
  private readonly batchKey: (operation: Operation) => string

  constructor({
    batchInterval,
    batchMax,
    batchHandler,
    batchKey,
  }: {
    batchInterval?: number
    batchMax?: number
    batchHandler: BatchHandler
    batchKey?: (operation: Operation) => string
  }) {
    this.batchInterval = batchInterval
    this.batchMax = batchMax || 0
    this.batchHandler = batchHandler
    this.batchKey = batchKey || (() => '')
  }

  public enqueueRequest(request: BatchableRequest): Observable<OperationResponse> {
    const requestCopy = { ...request }
    let queued = false

    const key = this.batchKey(request.operation)

    if (!requestCopy.observable) {
      requestCopy.observable = Observable.create(sink => {
        if (!this.queuedRequests.has(key)) {
          this.queuedRequests.set(key, [])
        }

        if (!queued) {
          this.queuedRequests.get(key)?.push(requestCopy)
          queued = true
        }

        //called for each subscriber, so need to save all listeners(next, error, complete)
        requestCopy.next = requestCopy.next || []
        if (sink.next) requestCopy.next.push(sink.next.bind(sink))

        requestCopy.error = requestCopy.error || []
        if (sink.error) requestCopy.error.push(sink.error.bind(sink))

        requestCopy.complete = requestCopy.complete || []
        if (sink.complete) requestCopy.complete.push(sink.complete.bind(sink))

        // The first enqueued request triggers the queue consumption after `batchInterval` milliseconds.
        if (this.queuedRequests.get(key)?.length === 1) {
          setTimeout(() => this.scheduleQueueConsumption(key))
        }

        // When amount of requests reaches `batchMax`, trigger the queue consumption without waiting on the `batchInterval`.
        if (this.queuedRequests.get(key)?.length === this.batchMax) {
          this.consumeQueue(key)
        }
      })
    }

    return requestCopy.observable
  }

  // Consumes the queue.
  // Returns a list of promises (one for each query).
  public consumeQueue(key?: string): (Observable<OperationResponse> | undefined)[] | undefined {
    const requestKey = key || ''
    const queuedRequests = this.queuedRequests.get(requestKey)

    if (!queuedRequests?.length) return

    this.queuedRequests.delete(requestKey)

    const requests: Operation[] = queuedRequests.map(queuedRequest => queuedRequest.operation)

    const forwards: NextLink[] = queuedRequests.map(queuedRequest => queuedRequest.forward) as NextLink[]

    const batchedObservable = this.batchHandler(requests, forwards)
    const observables: Array<RelayObservable<OperationResponse> | undefined> = []

    const nexts: Array<Array<(result: OperationResponse) => void> | undefined> = []
    const errors: Array<Array<(error: Error) => void> | undefined> = []
    const completes: Array<Array<() => void> | undefined> = []
    queuedRequests.forEach(batchableRequest => {
      observables.push(batchableRequest.observable)
      nexts.push(batchableRequest.next)
      errors.push(batchableRequest.error)
      completes.push(batchableRequest.complete)
    })

    const onError = (error: Error) => {
      //each callback list in batch
      errors.forEach(rejecters => {
        if (rejecters) {
          //each subscriber to request
          rejecters.forEach(e => e(error))
        }
      })
    }

    batchedObservable.subscribe({
      next: results => {
        if (!Array.isArray(results)) {
          results = [results]
        }

        if (nexts.length !== results.length) {
          const error = new Error(
            `server returned results with length ${results.length}, expected length of ${nexts.length}`,
          )
          ;(error as any).result = results

          return onError(error)
        }

        results.forEach((result, index) => {
          if (nexts[index]) {
            nexts[index]?.forEach(next => next(result))
          }
        })
      },
      error: onError,
      complete: () => {
        completes.forEach(complete => {
          if (complete) {
            //each subscriber to request
            complete.forEach(c => c())
          }
        })
      },
    })

    return observables
  }

  private scheduleQueueConsumption(key?: string): void {
    const requestKey = key || ''
    setTimeout(() => {
      if (this.queuedRequests.get(requestKey)?.length) {
        this.consumeQueue(requestKey)
      }
    }, this.batchInterval)
  }
}
