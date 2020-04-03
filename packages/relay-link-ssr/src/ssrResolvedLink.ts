import { NextLink, Operation, OperationResponse, RelayLink } from 'relay-link'
import { Observable } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export class SsrResolvedLink extends RelayLink {
  constructor(private promiseMap: { [key: string]: Promise<OperationResponse> }) {
    super()
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    const key = operation.getUniqueKey()
    const promise = this.promiseMap[key]
    if (promise) {
      return Observable.from(promise)
    } else if (forward) {
      return forward(operation)
    }
    return Observable.create(() => {})
  }
}
