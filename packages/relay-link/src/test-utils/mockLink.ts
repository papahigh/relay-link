import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import { RelayLink } from '../link'
import { NextLink, Operation, OperationResponse, RequestHandler } from '../types'

export default class MockLink extends RelayLink {
  constructor(handleRequest: RequestHandler = () => null) {
    super()
    this.request = handleRequest
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    throw Error('should be overridden')
  }
}
