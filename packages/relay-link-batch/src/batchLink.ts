import { NextLink, Operation, OperationResponse, RelayLink } from 'relay-link'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import { BatchHandler, OperationBatcher } from './batching'

export { OperationBatcher, BatchableRequest, BatchHandler } from './batching'

export namespace BatchLink {
  export interface Options {
    /**
     * The interval at which to batch, in milliseconds.
     *
     * Defaults to 10.
     */
    batchInterval?: number

    /**
     * The maximum number of operations to include in one fetch.
     *
     * Defaults to 0 (infinite operations within the interval).
     */
    batchMax?: number

    /**
     * The handler that should execute a batch of operations.
     */
    batchHandler: BatchHandler

    /**
     * creates the key for a batch
     */
    batchKey?: (operation: Operation) => string
  }
}

export class BatchLink extends RelayLink {
  private readonly batcher: OperationBatcher

  constructor(options: BatchLink.Options) {
    super()
    const { batchInterval = 10, batchMax = 0, batchHandler, batchKey = () => '' } = options
    this.batcher = new OperationBatcher({
      batchInterval,
      batchMax,
      batchHandler,
      batchKey,
    })
    //make this link terminating
    if (options.batchHandler?.length <= 1) {
      this.request = operation => this.batcher.enqueueRequest({ operation })
    }
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    return this.batcher.enqueueRequest({ operation, forward })
  }
}
