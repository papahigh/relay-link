import { NextLink, Operation, OperationResponse, RelayLink } from 'relay-link'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'
import { notifyListeners } from './progress'

export interface Options {
  contentLengthHeader?: string
}

const EMPTY = ''

export class ProgressLink extends RelayLink {
  private readonly contentLengthHeader: string

  constructor(options?: Options) {
    super()
    this.contentLengthHeader = options?.contentLengthHeader || 'Content-Length'
  }

  public request(operation: Operation, forward: NextLink): RelayObservable<OperationResponse> {
    operation.setContext({ bodyParser: this.parseResponseBody })
    return forward(operation)
  }

  private parseResponseBody = async (response: Response) => {
    const contentLengthHeader = response.headers.get(this.contentLengthHeader)
    let totalLength = 0
    if (contentLengthHeader != null) totalLength = parseInt(contentLengthHeader, 10)
    const isSupported = typeof response.body?.getReader === 'function'
    if (isSupported) {
      const reader = response.body?.getReader()
      const chunks: Uint8Array[] = []
      if (reader) {
        let progress = 0
        let completed = false
        do {
          const { value, done } = await reader.read()
          if (value) {
            chunks.push(value)
            progress += value.length
            notifyListeners(progress, totalLength)
          }
          completed = done
        } while (!completed)
        let result = ''
        const decoder = new TextDecoder('utf-8')
        for (const chunk of chunks) {
          result += decoder.decode(chunk, { stream: true })
        }
        result += decoder.decode()
        return result
      }
    } else {
      notifyListeners(0, totalLength)
      return await response.text().finally(() => notifyListeners(totalLength, totalLength))
    }
    return EMPTY
  }
}
