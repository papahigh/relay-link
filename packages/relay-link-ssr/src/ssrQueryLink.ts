import { DocumentNode } from 'graphql/language/ast'
import { parse } from 'graphql/language/parser'
import { NextLink, Operation, OperationResponse, RelayLink } from 'relay-link'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export class SsrQueryLink extends RelayLink {
  constructor(private queryMap: Record<string, string | DocumentNode>) {
    super()
  }

  public request(operation: Operation, forward: NextLink): RelayObservable<OperationResponse> {
    if (operation.operationId) {
      const query = this.queryMap[operation.operationId]
      ;(operation as any).query = typeof query === 'string' ? parse(query) : query
    }
    return forward(operation)
  }
}
