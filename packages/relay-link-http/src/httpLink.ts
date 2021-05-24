import { RelayLink, fromError, OperationKind, OperationResponse } from 'relay-link'
import {
  serializeFetchParameter,
  selectURI,
  parseAndCheckHttpResponse,
  readResponseBody,
  checkFetcher,
  selectHttpOptionsAndBody,
  createSignalIfSupported,
  fallbackHttpConfig,
  Body,
  HttpOptions,
  UriFunction as _UriFunction,
} from 'relay-link-http-common'

export namespace HttpLink {
  // tslint:disable-next-line:no-shadowed-variable
  export interface UriFunction extends _UriFunction {}
  export interface Options extends HttpOptions {
    /**
     * If set to true, use the HTTP GET method for query operations. Mutations
     * will still use the method specified in fetchOptions.method (which defaults
     * to POST).
     */
    useGETForQueries?: boolean
  }
}

// For backwards compatibility.
export import FetchOptions = HttpLink.Options
export import UriFunction = HttpLink.UriFunction
import { Observable } from 'relay-runtime'

export const createHttpLink = (linkOptions: HttpLink.Options = {}) => {
  let {
    uri = '/graphql',
    // use default global fetch if nothing passed in
    fetch: fetcher,
    useGETForQueries,
    ...requestOptions
  } = linkOptions

  // dev warnings to ensure fetch is present
  checkFetcher(fetcher)

  //fetcher is set here rather than the destructuring to ensure fetch is
  //declared before referencing it. Reference in the destructuring would cause
  //a ReferenceError
  if (!fetcher) {
    fetcher = fetch
  }

  const linkConfig = {
    options: requestOptions.fetchOptions,
    credentials: requestOptions.credentials,
    headers: requestOptions.headers,
  }

  return new RelayLink(operation => {
    let chosenURI = selectURI(operation, uri)

    const context = operation.getContext()

    const contextHeaders = { ...context.headers }

    const contextConfig = {
      options: context.fetchOptions,
      credentials: context.credentials,
      headers: contextHeaders,
    }

    //uses fallback, link, and then context to build options
    const { options, body } = selectHttpOptionsAndBody(operation, fallbackHttpConfig, linkConfig, contextConfig)

    let controller
    if (!(options as any).signal) {
      const { controller: _controller, signal } = createSignalIfSupported()
      controller = _controller
      if (controller) (options as any).signal = signal
    }

    // If requested, set method to GET if there are no mutations.
    if (useGETForQueries && operation.operationKind !== OperationKind.MUTATION) {
      options.method = 'GET'
    }

    if (options.method === 'GET') {
      const { newURI, parseError } = rewriteURIForGET(chosenURI, body)
      if (parseError) {
        return fromError(parseError)
      }
      chosenURI = newURI
    } else {
      try {
        ;(options as any).body = serializeFetchParameter(body, 'Payload')
      } catch (parseError) {
        return fromError(parseError)
      }
    }

    return Observable.create(sink => {
      fetcher(chosenURI, options)
        .then(response => {
          operation.setContext({ response })
          return response
        })
        .then(parseAndCheckHttpResponse(operation, operation.getContext().bodyParser || readResponseBody))
        .then(result => {
          // we have data and can send it to back up the link chain
          sink.next(result as OperationResponse)
          sink.complete()
          return result
        })
        .catch(err => {
          // fetch was cancelled so it's already been cleaned up in the unsubscribe
          if (err.name === 'AbortError') return
          // if it is a network error, BUT there is graphql result info
          // fire the next observer before calling error
          // this gives apollo-client (and react-apollo) the `graphqlErrors` and `networErrors`
          // to pass to UI
          // this should only happen if we *also* have data as part of the response key per
          // the spec
          if (err.result && err.result.errors && err.result.data) {
            // if we don't call next, the UI can only show networkError because AC didn't
            // get any graphqlErrors
            // this is graphql execution result info (i.e errors and possibly data)
            // this is because there is no formal spec how errors should translate to
            // http status codes. So an auth error (401) could have both data
            // from a public field, errors from a private field, and a status of 401
            // {
            //  user { // this will have errors
            //    firstName
            //  }
            //  products { // this is public so will have data
            //    cost
            //  }
            // }
            //
            // the result of above *could* look like this:
            // {
            //   data: { products: [{ cost: "$10" }] },
            //   errors: [{
            //      message: 'your session has timed out',
            //      path: []
            //   }]
            // }
            // status code of above would be a 401
            // in the UI you want to show data where you can, errors as data where you can
            // and use correct http status codes
            sink.next(err.result)
          }
          sink.error(err)
        })

      return () => {
        // XXX support canceling this request
        // https://developers.google.com/web/updates/2017/09/abortable-fetch
        if (controller) controller.abort()
      }
    })
  })
}

// For GET operations, returns the given URI rewritten with parameters, or a
// parse error.
function rewriteURIForGET(chosenURI: string, body: Body) {
  // Implement the standard HTTP GET serialization, plus 'extensions'. Note
  // the extra level of JSON serialization!
  const queryParams = []
  const addQueryParam = (key: string, value: string) => {
    queryParams.push(`${key}=${encodeURIComponent(value)}`)
  }

  if (body.query) {
    addQueryParam('query', body.query)
  }
  if (body.operationId) {
    addQueryParam('operationId', body.operationId)
  }
  if (body.operationName) {
    addQueryParam('operationName', body.operationName)
  }
  if (body.variables) {
    let serializedVariables
    try {
      serializedVariables = serializeFetchParameter(body.variables, 'Variables map')
    } catch (parseError) {
      return { parseError }
    }
    addQueryParam('variables', serializedVariables)
  }

  // Reconstruct the URI with added query params.
  // XXX This assumes that the URI is well-formed and that it doesn't
  //     already contain any of these query params. We could instead use the
  //     URL API and take a polyfill (whatwg-url@6) for older browsers that
  //     don't support URLSearchParams. Note that some browsers (and
  //     versions of whatwg-url) support URL but not URLSearchParams!
  let fragment = '',
    preFragment = chosenURI
  const fragmentStart = chosenURI.indexOf('#')
  if (fragmentStart !== -1) {
    fragment = chosenURI.substr(fragmentStart)
    preFragment = chosenURI.substr(0, fragmentStart)
  }
  const queryParamsPrefix = preFragment.indexOf('?') === -1 ? '?' : '&'
  const newURI = preFragment + queryParamsPrefix + queryParams.join('&') + fragment
  return { newURI }
}

export class HttpLink extends RelayLink {
  constructor(opts?: HttpLink.Options) {
    super(createHttpLink(opts).request)
  }
}
