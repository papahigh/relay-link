import { RelayLink, Operation, NextLink, OperationResponse } from 'relay-link'
import { RelayObservable, Sink, Subscription } from 'relay-runtime/lib/network/RelayObservable'
import { Observable } from 'relay-runtime'

/*
 * Expects cacheConfig to contain the force field if no dedup
 */
export class DedupLink extends RelayLink {
  private inFlightRequestObservables: Map<string, RelayObservable<OperationResponse>> = new Map()
  private subscribers: Map<string, Set<Sink<OperationResponse>>> = new Map()

  public request(operation: Operation, forward: NextLink): RelayObservable<OperationResponse> {
    if (operation.cacheConfig.force) {
      return forward(operation)
    }
    const key = operation.getUniqueKey()
    if (!this.inFlightRequestObservables.has(key)) {
      // this is a new request, i.e. we haven't deduplicated it yet
      // call the next link
      const singleObserver = forward(operation)
      let subscription: Subscription

      const sharedObservable = Observable.create<OperationResponse>(sink => {
        // this will still be called by each subscriber regardless of
        // deduplication status
        if (!this.subscribers.has(key)) this.subscribers.set(key, new Set())
        this.subscribers.get(key)!.add(sink)

        if (!subscription) {
          subscription = singleObserver.subscribe({
            next: result => {
              const subscribers = this.subscribers.get(key)
              this.subscribers.delete(key)
              this.inFlightRequestObservables.delete(key)
              if (subscribers) {
                subscribers.forEach(s => s.next(result))
                subscribers.forEach(s => s.complete())
              }
            },
            error: (error: Error) => {
              const subscribers = this.subscribers.get(key)
              this.subscribers.delete(key)
              this.inFlightRequestObservables.delete(key)
              if (subscribers) subscribers.forEach(s => s.error(error))
            },
          })
        }

        return () => {
          if (this.subscribers.has(key)) {
            this.subscribers.get(key)?.delete(sink)
            if (this.subscribers.get(key)?.size === 0) {
              this.inFlightRequestObservables.delete(key)
              if (subscription) subscription.unsubscribe()
            }
          }
        }
      })

      this.inFlightRequestObservables.set(key, sharedObservable)
    }

    // return shared Observable
    return this.inFlightRequestObservables.get(key)!
  }
}
