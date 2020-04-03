import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import { RelayLink } from '../link'
import { NextLink, Operation, OperationResponse } from '../types'

export default class SetContextLink extends RelayLink {
  constructor(private setContext: Record<string, any> | ((context: Record<string, any>) => Record<string, any>)) {
    super()
  }

  public request(operation: Operation, forward: NextLink): RelayObservable<OperationResponse> {
    operation.setContext(
      typeof this.setContext === 'object' ? this.setContext : this.setContext(operation.getContext()),
    )
    return forward(operation)
  }
}
