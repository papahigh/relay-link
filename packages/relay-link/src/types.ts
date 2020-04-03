import { DocumentNode } from 'graphql/language/ast'
import { CacheConfig, Variables } from 'relay-runtime'
import {
  GraphQLResponseWithData,
  GraphQLResponseWithoutData,
  UploadableMap,
} from 'relay-runtime/lib/network/RelayNetworkTypes'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export enum OperationKind {
  QUERY = 'query',
  MUTATION = 'mutation',
  SUBSCRIPTION = 'subscription',
}

export interface Operation<TContext = Record<string, any>> {
  readonly operationId?: null | string
  readonly operationName?: null | string
  readonly operationKind: OperationKind
  readonly query?: null | string | DocumentNode
  readonly variables: Variables
  readonly metadata?: Record<string, any>
  readonly cacheConfig: CacheConfig
  readonly uploadables?: UploadableMap | null

  getKey(): string

  getUniqueKey(): string

  setContext(context: TContext): TContext

  getContext(): TContext
}

export interface OperationResponseWithData extends GraphQLResponseWithData {
  context?: Record<string, any>
  response?: Response
}

export interface OperationResponseWithoutData extends GraphQLResponseWithoutData {
  context?: Record<string, any>
  response?: Response
}

export type OperationResponse = OperationResponseWithData | OperationResponseWithoutData

export type NextLink = (operation: Operation) => RelayObservable<OperationResponse>

export type RequestHandler = (operation: Operation, forward?: NextLink) => RelayObservable<OperationResponse> | null
