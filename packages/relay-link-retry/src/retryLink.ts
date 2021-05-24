import { NextLink, Operation, RelayLink } from 'relay-link'
import { OperationResponse } from 'relay-link/lib'
import { Observable } from 'relay-runtime'
import { Sink, Subscription } from 'relay-runtime/lib/network/RelayObservable'

import { buildDelayFunction, DelayFunction, DelayFunctionOptions } from './delayFunction'
import { buildRetryFunction, RetryFunction, RetryFunctionOptions } from './retryFunction'

export interface Options {
  /**
   * Configuration for the delay strategy to use, or a custom delay strategy.
   */
  delay?: DelayFunctionOptions | DelayFunction

  /**
   * Configuration for the retry strategy to use, or a custom retry strategy.
   */
  attempts?: RetryFunctionOptions | RetryFunction
}

/**
 * Tracking and management of operations that may be (or currently are) retried.
 */
class RetryableOperation<TValue = any> {
  private retryCount = 0
  private values: any[] = []
  private error: any
  private complete = false
  private canceled = false
  private observers: (Sink<TValue> | null)[] = []
  private currentSubscription: Subscription | null = null
  private timerId: NodeJS.Timeout | null

  constructor(
    private operation: Operation,
    private nextLink: NextLink,
    private delayFor: DelayFunction,
    private retryIf: RetryFunction,
  ) {}

  /**
   * Register a new observer for this operation.
   *
   * If the operation has previously emitted other events, they will be
   * immediately triggered for the observer.
   */
  public subscribe(observer: Sink<TValue>) {
    if (this.canceled) {
      throw new Error(`Subscribing to a retryable link that was canceled is not supported`)
    }
    this.observers.push(observer)

    // If we've already begun, catch this observer up.
    for (const value of this.values) {
      observer.next(value)
    }

    if (this.complete) {
      observer.complete()
    } else if (this.error) {
      observer.error(this.error)
    }
  }

  /**
   * Remove a previously registered observer from this operation.
   *
   * If no observers remain, the operation will stop retrying, and unsubscribe
   * from its downstream link.
   */
  public unsubscribe(observer: Sink<TValue>) {
    const index = this.observers.indexOf(observer)
    if (index < 0) {
      throw new Error(`RetryLink BUG! Attempting to unsubscribe unknown observer!`)
    }
    // Note that we are careful not to change the order of length of the array,
    // as we are often mid-iteration when calling this method.
    this.observers[index] = null

    // If this is the last observer, we're done.
    if (this.observers.every(o => o === null)) {
      this.cancel()
    }
  }

  /**
   * Start the initial request.
   */
  public start() {
    if (this.currentSubscription) return // Already started.

    this.try()
  }

  /**
   * Stop retrying for the operation, and cancel any in-progress requests.
   */
  public cancel() {
    if (this.currentSubscription) this.currentSubscription.unsubscribe()
    if (this.timerId) clearTimeout(this.timerId)
    this.timerId = null
    this.currentSubscription = null
    this.canceled = true
  }

  private try() {
    this.currentSubscription = this.nextLink(this.operation).subscribe({
      next: this.onNext,
      error: this.onError,
      complete: this.onComplete,
    })
  }

  private onNext = (value: any) => {
    this.values.push(value)
    for (const observer of this.observers) {
      if (!observer) continue
      observer.next(value)
    }
  }

  private onComplete = () => {
    this.complete = true
    for (const observer of this.observers) {
      if (!observer) continue
      observer.complete()
    }
  }

  private onError = async (error: Error) => {
    this.retryCount += 1

    // Should we retry?
    const shouldRetry = await this.retryIf(this.retryCount, this.operation, error)
    if (shouldRetry) {
      this.scheduleRetry(this.delayFor(this.retryCount, this.operation, error))
      return
    }

    this.error = error
    for (const observer of this.observers) {
      if (!observer) continue
      observer.error(error)
    }
  }

  private scheduleRetry(delay: number) {
    if (this.timerId) {
      throw new Error(`RetryLink BUG! Encountered overlapping retries`)
    }

    this.timerId = setTimeout(() => {
      this.timerId = null
      this.try()
    }, delay)
  }
}

export class RetryLink extends RelayLink {
  private readonly delayFor: DelayFunction
  private readonly retryIf: RetryFunction

  constructor(options?: Options) {
    super()
    const { attempts, delay } = options || ({} as Options)
    this.delayFor = typeof delay === 'function' ? delay : buildDelayFunction(delay)
    this.retryIf = typeof attempts === 'function' ? attempts : buildRetryFunction(attempts)
  }

  public request(operation: Operation, nextLink: NextLink) {
    const retryable = new RetryableOperation<OperationResponse>(operation, nextLink, this.delayFor, this.retryIf)
    retryable.start()

    return Observable.create<OperationResponse>(sink => {
      retryable.subscribe(sink)
      return () => retryable.unsubscribe(sink)
    })
  }
}