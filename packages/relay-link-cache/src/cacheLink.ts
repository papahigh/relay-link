import { NextLink, Operation, OperationKind, OperationResponse, RelayLink } from 'relay-link'
import { Observable, QueryResponseCache } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export interface Options {
  size?: number
  ttl?: number
  allowMutations?: boolean
  allowFormData?: boolean
  clearOnMutation?: boolean
  cacheErrors?: boolean
}

export class CacheLink extends RelayLink {
  private readonly cache: QueryResponseCache
  private readonly allowMutations?: boolean
  private readonly allowFormData?: boolean
  private readonly clearOnMutation?: boolean
  private readonly cacheErrors?: boolean

  constructor(options?: Options) {
    super()
    this.cache = new QueryResponseCache({
      size: options?.size || 100, // 100 requests
      ttl: options?.ttl || 15 * 60 * 1000, // 15 minutes
    })
    this.allowMutations = options?.allowMutations || false
    this.allowFormData = options?.allowFormData
    this.clearOnMutation = options?.clearOnMutation || true
    this.cacheErrors = options?.cacheErrors || false
  }

  public request(operation: Operation, forward: NextLink): RelayObservable<OperationResponse> {
    if (operation.operationKind === OperationKind.MUTATION) {
      if (this.clearOnMutation) {
        this.cache.clear()
      }
      if (!this.allowMutations) {
        return forward(operation)
      }
    }

    if (operation.uploadables && !this.allowFormData) {
      return forward(operation)
    }

    const key = operation.getKey()

    if (operation.cacheConfig.force)
      return forward(operation).do({
        next: result => {
          if (!result.errors || (result.errors && this.cacheErrors)) {
            this.cache.set(key, operation.variables, result)
          }
        },
      })

    const cached = this.cache.get(key, operation.variables)
    if (cached) return Observable.from(cached)

    return forward(operation).do({
      next: result => {
        if (!result.errors || (result.errors && this.cacheErrors)) {
          this.cache.set(key, operation.variables, result)
        }
      },
    })
  }
}
