import { CacheConfig, RequestParameters, UploadableMap, Variables } from 'relay-runtime'
import stableStringify from 'json-stable-stringify'
import merge from 'lodash.merge'
import { RelayLink } from './link'
import { Operation, OperationKind } from './types'

export class LinkError extends Error {
  public link: RelayLink

  constructor(message?: string, link?: RelayLink) {
    super(message)
    this.link = link
  }
}

export function isTerminating(link: RelayLink): boolean {
  return link.request.length <= 1
}

function getKey(request: RequestParameters) {
  const { id, name, text } = request
  return JSON.stringify([id, name, text])
}

function getUniqueKey(request: RequestParameters, variables: Variables) {
  const { id, name, text } = request
  return JSON.stringify([id, name, text, stableStringify(variables)])
}

const operationSymbol = Symbol.for('relay-link.operation')

export function isOperation(val: any): val is Operation {
  return val && typeof val === 'object' && val[operationSymbol] === true
}

export function createOperation(
  request: RequestParameters,
  variables: Variables,
  cacheConfig: CacheConfig,
  uploadables?: UploadableMap | null,
) {
  const operation: Partial<Operation> & { [operationSymbol]: true } = {
    query: request.text,
    variables: variables,
    cacheConfig,
    uploadables,
    metadata: request.metadata,
    operationId: request.id,
    operationName: request.name,
    operationKind: request.operationKind as OperationKind,
    [operationSymbol]: true,
  }

  let context: Record<string, any> = { ...cacheConfig.metadata }

  const setContext = (next: Record<string, any> | ((current: Record<string, any>) => Record<string, any>)) => {
    if (typeof next === 'function') {
      context = merge({}, context, next(context))
    } else {
      context = merge({}, context, next)
    }
  }

  const getContext = () => ({ ...context })

  Object.defineProperty(operation, 'setContext', {
    enumerable: false,
    value: setContext,
  })

  Object.defineProperty(operation, 'getContext', {
    enumerable: false,
    value: getContext,
  })

  Object.defineProperty(operation, 'getKey', {
    enumerable: false,
    value: () => getKey(request),
  })

  Object.defineProperty(operation, 'getUniqueKey', {
    enumerable: false,
    value: () => getUniqueKey(request, variables),
  })

  return operation as Operation
}
