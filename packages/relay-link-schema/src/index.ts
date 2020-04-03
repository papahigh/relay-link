import { execute } from 'graphql/execution/execute'
import { parse } from 'graphql/language'
import { GraphQLSchema } from 'graphql/type/schema'
import { Operation, OperationResponse, RelayLink } from 'relay-link'
import { Observable } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

export type ResolverContextFunction = (operation: Operation) => Record<string, any>

export interface Options {
  /**
   * The schema to generate responses from.
   */
  schema: GraphQLSchema

  /**
   * The root value to use when generating responses.
   */
  rootValue?: any

  /**
   * A context to provide to resolvers declared within the schema.
   */
  context?: ResolverContextFunction | Record<string, any>
}

export class SchemaLink extends RelayLink {
  private readonly schema: GraphQLSchema
  private readonly rootValue: any
  private readonly context?: ResolverContextFunction | Record<string, any>

  constructor({ schema, rootValue, context }: Options) {
    super()
    this.schema = schema
    this.rootValue = rootValue
    this.context = context
  }

  public request(operation: Operation): RelayObservable<OperationResponse> {
    return Observable.create<OperationResponse>(sink => {
      Promise.resolve(
        execute(
          this.schema,
          typeof operation.query === 'string' ? parse(operation.query) : operation.query!,
          this.rootValue,
          typeof this.context === 'function' ? this.context(operation) : this.context,
          operation.variables,
          operation.operationName,
        ) as Partial<OperationResponse>,
      )
        .then(data => {
          if (!sink.closed) {
            sink.next(data as OperationResponse)
            sink.complete()
          }
        })
        .catch(error => {
          if (!sink.closed) sink.error(error)
        })
    })
  }
}
