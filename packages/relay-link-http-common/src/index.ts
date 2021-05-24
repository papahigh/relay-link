import { Operation } from 'relay-link'
import { print } from 'graphql/language/printer'
import { GraphQLResponse } from 'relay-runtime'
import { InvariantError } from 'ts-invariant'

/*
 * Http Utilities: shared across links that make http requests
 */

// XXX replace with actual typings when available
declare var AbortController: any

//Used for any Error for data from the server
//on a request with a Status >= 300
//response contains no data or errors
export type ServerError = Error & {
  response: Response
  result: Record<string, any>
  statusCode: number
}

//Thrown when server's response is cannot be parsed
export type ServerParseError = Error & {
  response: Response
  statusCode: number
  bodyText: string
}

export type ClientParseError = InvariantError & {
  parseError: Error
}

export interface HttpConfig {
  options?: any
  headers?: any //overrides headers in options
  credentials?: any
}

export interface UriFunction {
  (operation: Operation): string
}

// The body of a GraphQL-over-HTTP-POST request.
export interface Body {
  query?: string
  operationName?: string
  operationId?: string
  variables?: Record<string, any>
}

export interface HttpOptions {
  /**
   * The URI to use when fetching operations.
   *
   * Defaults to '/graphql'.
   */
  uri?: string | UriFunction

  /**
   * A `fetch`-compatible API to use when making requests.
   */
  fetch?: WindowOrWorkerGlobalScope['fetch']

  /**
   * An object representing values to be sent as headers on the request.
   */
  headers?: any

  /**
   * The credentials policy you want to use for the fetch call.
   */
  credentials?: string

  /**
   * Any overrides of the fetch options argument to pass to the fetch call.
   */
  fetchOptions?: any
}

const defaultHeaders = {
  // headers are case insensitive (https://stackoverflow.com/a/5259004)
  accept: '*/*',
  'content-type': 'application/json',
}

const defaultOptions = {
  method: 'POST',
}

export const fallbackHttpConfig = {
  headers: defaultHeaders,
  options: defaultOptions,
}

export const throwServerError = (response, result, message) => {
  const error = new Error(message) as ServerError

  error.name = 'ServerError'
  error.response = response
  error.statusCode = response.status
  error.result = result

  throw error
}

export const readResponseBody = (response: Response) => response.text()

export type HttpResponseBody<TOperation extends Operation | Operation[]> = TOperation extends Operation
  ? GraphQLResponse
  : GraphQLResponse[]

export const parseAndCheckHttpResponse =
  <TOperation extends Operation | Operation[]>(
    operations: TOperation,
    responseBodyParser: (response: Response) => Promise<string> = readResponseBody,
  ) =>
  (response: Response): Promise<HttpResponseBody<TOperation>> => {
    return responseBodyParser(response)
      .then(bodyText => {
        try {
          return JSON.parse(bodyText) as HttpResponseBody<TOperation>
        } catch (err) {
          const parseError = err as ServerParseError
          parseError.name = 'ServerParseError'
          parseError.response = response
          parseError.statusCode = response.status
          parseError.bodyText = bodyText
          return Promise.reject(parseError)
        }
      })
      .then((result: any) => {
        if (response.status >= 300) {
          //Network error
          throwServerError(response, result, `Response not successful: Received status code ${response.status}`)
        }
        if (!Array.isArray(result) && !result.hasOwnProperty('data') && !result.hasOwnProperty('errors')) {
          //Data error
          throwServerError(
            response,
            result,
            `Server response was missing for query '${
              Array.isArray(operations)
                ? (operations as Operation[]).map(op => op.operationName)
                : (operations as Operation).operationName
            }'.`,
          )
        }
        return result
      })
  }

export const checkFetcher = (fetcher: WindowOrWorkerGlobalScope['fetch']) => {
  if (!fetcher && typeof fetch === 'undefined') {
    let library: string = 'unfetch'
    if (typeof window === 'undefined') library = 'node-fetch'
    throw new InvariantError(`
fetch is not found globally and no fetcher passed, to fix pass a fetch for
your environment like https://www.npmjs.com/package/${library}.

For example:
import fetch from '${library}';
import { createHttpLink } from 'relay-link-http';

const link = createHttpLink({ uri: '/graphql', fetch: fetch });`)
  }
}

export const createSignalIfSupported = () => {
  if (typeof AbortController === 'undefined') return { controller: false, signal: false }

  const controller = new AbortController()
  const signal = controller.signal
  return { controller, signal }
}

export const selectHttpOptionsAndBody = (
  operation: Operation,
  fallbackConfig: HttpConfig,
  ...configs: Array<HttpConfig>
) => {
  let options: HttpConfig & Record<string, any> = {
    ...fallbackConfig.options,
    headers: fallbackConfig.headers,
    credentials: fallbackConfig.credentials,
  }

  /*
   * use the rest of the configs to populate the options
   * configs later in the list will overwrite earlier fields
   */
  configs.forEach(config => {
    options = { ...options, ...config.options, headers: { ...options.headers, ...config.headers } }
    if (config.credentials) options.credentials = config.credentials
  })

  //The body depends on the http options
  const { operationId, operationName, variables, query } = operation

  const body: Body = {}

  if (operationId) body.operationId = operationId
  else if (operationName) body.operationName = operationName
  if (query) body.query = typeof query === 'string' ? query : print(query)
  if (variables) body.variables = variables

  return { options, body }
}

export const serializeFetchParameter = (p, label) => {
  let serialized
  try {
    serialized = JSON.stringify(p)
  } catch (e) {
    const parseError = new InvariantError(
      `Network request failed. ${label} is not serializable: ${e.message}`,
    ) as ClientParseError
    parseError.parseError = e
    throw parseError
  }
  return serialized
}

//selects "/graphql" by default
export const selectURI = (operation, fallbackURI?: string | ((operation: Operation) => string)) => {
  const context = operation.getContext()
  const contextURI = context.uri

  if (contextURI) {
    return contextURI
  } else if (typeof fallbackURI === 'function') {
    return fallbackURI(operation)
  } else {
    return fallbackURI || '/graphql'
  }
}
