import { NextLink, Operation, OperationKind, OperationResponse, RelayLink } from 'relay-link'

export class SsrPendingLink extends RelayLink {
  private promiseMap: { [key: string]: Promise<OperationResponse> } = {}

  public request(operation: Operation, forward: NextLink) {
    const key = operation.getUniqueKey()
    const observable = forward(operation)
    if (!this.promiseMap[key] && operation.operationKind === OperationKind.QUERY) {
      this.promiseMap[key] = observable.toPromise() as Promise<OperationResponse>
    }
    return observable
  }

  public asMap() {
    return this.promiseMap
  }

  public getPending() {
    return Promise.all(Object.values(this.promiseMap))
  }
}
