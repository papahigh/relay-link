import { CacheConfig, Observable, RequestParameters, UploadableMap, Variables } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import { invariant, InvariantError } from 'ts-invariant'
import { createOperation, isOperation, isTerminating, LinkError } from './linkUtils'
import { NextLink, Operation, OperationResponse, RequestHandler } from './types'

function passThrough(op: Operation, forward?: RequestHandler) {
  return forward ? forward(op) : empty()
}

export function toLink(handler: RequestHandler | RelayLink) {
  return typeof handler === 'function' ? new RelayLink(handler) : handler
}

export function from(links: (RequestHandler | RelayLink)[]): RelayLink {
  if (links.length === 0) return new RelayLink(empty)
  return links.map(toLink).reduce((x, y) => x.concat(y))
}

export function fromError<TResponse = OperationResponse>(error: Error) {
  return Observable.create<TResponse>(sink => {
    sink.error(error)
  })
}

export function split(
  test: (op: Operation) => boolean,
  left: RequestHandler | RelayLink,
  right?: RequestHandler | RelayLink,
) {
  const leftLink = toLink(left)
  const rightLink = toLink(right || new RelayLink(passThrough))
  if (isTerminating(leftLink) && isTerminating(rightLink)) {
    return new RelayLink(operation =>
      test(operation) ? leftLink.request(operation) || empty() : rightLink.request(operation) || empty(),
    )
  } else {
    return new RelayLink((operation, forward) =>
      test(operation)
        ? leftLink.request(operation, forward) || empty()
        : rightLink.request(operation, forward) || empty(),
    )
  }
}

export function concat(first: RequestHandler | RelayLink, second: RequestHandler | RelayLink) {
  const firstLink = toLink(first)
  if (isTerminating(firstLink)) {
    invariant.warn(new LinkError(`You are calling concat on a terminating link, which will have no effect`, firstLink))
    return firstLink
  }
  const secondLink = toLink(second)
  if (isTerminating(secondLink)) {
    return new RelayLink(operation => firstLink.request(operation, op => secondLink.request(op)))
  } else {
    return new RelayLink((operation, forward) => firstLink.request(operation, op => secondLink.request(op, forward)))
  }
}

export function empty() {
  return Observable.create<OperationResponse>(sink => sink.complete())
}

export class RelayLink {
  public static empty() {
    return new RelayLink(empty)
  }
  public static from = from
  public static split = split
  public static execute = execute

  constructor(request?: RequestHandler) {
    if (request) this.request = request
  }

  public split(
    test: (op: Operation) => boolean,
    left: RelayLink | RequestHandler,
    right?: RelayLink | RequestHandler,
  ): RelayLink {
    return this.concat(split(test, left, right || new RelayLink(passThrough)))
  }

  public concat(next: RelayLink | RequestHandler): RelayLink {
    return concat(this, next)
  }

  public execute(operation: Operation): RelayObservable<OperationResponse>
  public execute(
    request: RequestParameters,
    variables: Variables,
    cacheConfig: CacheConfig,
    uploadables?: UploadableMap | null,
  ): RelayObservable<OperationResponse>
  public execute(
    requestOrOperation: RequestParameters | Operation,
    variables?: Variables,
    cacheConfig?: CacheConfig,
    uploadables?: UploadableMap | null,
  ): RelayObservable<OperationResponse> {
    if (isOperation(requestOrOperation)) {
      return execute(this, requestOrOperation)
    } else {
      return execute(this, requestOrOperation, variables, cacheConfig, uploadables)
    }
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    throw new InvariantError('Not implemented')
  }
}

export abstract class RelayDisposableLink extends RelayLink {
  public abstract dispose(): void
}

export interface FactoryLinkOptions {
  factory: () => RelayDisposableLink
}

export class InitializingLink extends RelayLink {
  private readonly factory: () => RelayDisposableLink
  private link?: RelayDisposableLink

  public constructor(options: FactoryLinkOptions) {
    super()
    this.factory = options.factory
  }

  public initialize() {
    if (this.link) this.link.dispose()
    this.link = this.factory()
  }

  public request(operation: Operation, forward?: NextLink): RelayObservable<OperationResponse> {
    if (!this.link) this.initialize()
    return this.link.request(operation, forward)
  }
}

export function execute(link: RelayLink, operation: Operation): RelayObservable<OperationResponse>
export function execute(
  link: RelayLink,
  request: RequestParameters,
  variables: Variables,
  cacheConfig: CacheConfig,
  uploadables?: UploadableMap | null,
): RelayObservable<OperationResponse>
export function execute(
  link: RelayLink,
  requestOrOperation: RequestParameters | Operation,
  variables?: Variables,
  cacheConfig?: CacheConfig,
  uploadables?: UploadableMap | null,
): RelayObservable<OperationResponse> {
  if (isOperation(requestOrOperation)) {
    return link.request(requestOrOperation) || empty()
  } else {
    return link.execute(createOperation(requestOrOperation, variables, cacheConfig, uploadables)) || empty()
  }
}
