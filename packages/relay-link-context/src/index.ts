import { NextLink, Operation, RelayLink } from 'relay-link'
import { Observable } from 'relay-runtime'

export type ContextSetter = (operation: Operation, prevContext: any) => Promise<any> | any

export function setContext(setter: ContextSetter): RelayLink {
  return new RelayLink((operation: Operation, forward: NextLink) => {
    const { ...request } = operation

    return Observable.create(sink => {
      let handle
      Promise.resolve(request)
        .then(req => setter(req, operation.getContext()))
        .then(operation.setContext)
        .then(() => {
          handle = forward(operation).subscribe({
            next: sink.next.bind(sink),
            error: sink.error.bind(sink),
            complete: sink.complete.bind(sink),
          })
        })
        .catch(sink.error.bind(sink))

      return () => {
        if (handle) handle.unsubscribe()
      }
    })
  })
}
