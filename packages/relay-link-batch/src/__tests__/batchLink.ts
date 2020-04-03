import { execute, Operation, createOperation, OperationKind, OperationResponse, RelayLink, NextLink } from 'relay-link'
import gql from 'graphql-tag'
import { print } from 'graphql/language/printer'
import { Observable, RequestParameters } from 'relay-runtime'
import { RelayObservable } from 'relay-runtime/lib/network/RelayObservable'

import { BatchLink, OperationBatcher, BatchHandler, BatchableRequest } from '../batchLink'
import { DocumentNode } from 'graphql/language/ast'

interface MockedResponse {
  request: Operation
  result?: OperationResponse
  error?: Error
  delay?: number
}

const terminatingCheck = (done: jest.DoneCallback, body: (...args: any[]) => void) => {
  return {
    next: (...args: any[]) => {
      try {
        body(...args)
        done()
      } catch (error) {
        done.fail(error)
      }
    },
  }
}

function requestToKey(request: Operation): string {
  const queryString = typeof request.query === 'string' ? request.query : print(request.query!)

  return JSON.stringify({
    variables: request.variables || {},
    query: queryString,
  })
}

function createMockBatchHandler(...mockedResponses: MockedResponse[]) {
  const mockedResponsesByKey: { [key: string]: MockedResponse[] } = {}

  const mockBatchHandler: BatchHandler = (operations: Operation[]) => {
    return Observable.create<OperationResponse[]>(sink => {
      const results = operations.map(operation => {
        const key = requestToKey(operation)
        const responses = mockedResponsesByKey[key]
        if (!responses || responses.length === 0) {
          throw new Error(
            `No more mocked responses for the query: ${
              typeof operation.query === 'string' ? operation.query : print(operation.query!)
            }, variables: ${JSON.stringify(operation.variables)}`,
          )
        }

        const { result, error } = responses.shift()!

        if (!result && !error) {
          throw new Error(`Mocked response should contain either result or error: ${key}`)
        }

        if (error) {
          sink.error(error)
        }

        return result
      }) as OperationResponse[]

      sink.next(results)
    })
  }
  ;(mockBatchHandler as any).addMockedResponse = (mockedResponse: MockedResponse) => {
    const key = requestToKey(mockedResponse.request)
    let _mockedResponses = mockedResponsesByKey[key]
    if (!_mockedResponses) {
      _mockedResponses = []
      mockedResponsesByKey[key] = _mockedResponses
    }
    _mockedResponses.push(mockedResponse)
  }

  mockedResponses.map((mockBatchHandler as any).addMockedResponse)

  return mockBatchHandler
}

function createRequest(query: string | DocumentNode, operationKind = OperationKind.SUBSCRIPTION): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: query as any,
    operationKind,
    metadata: {},
  }
}

describe('OperationBatcher', () => {
  it('should construct', () => {
    expect(() => {
      const batcher = new OperationBatcher({
        batchInterval: 10,
        batchHandler: () => {
          return Observable.from([])
        },
      })
      batcher.consumeQueue('')
    }).not.toThrow()
  })

  it('should not do anything when faced with an empty queue', () => {
    const batcher = new OperationBatcher({
      batchInterval: 10,
      batchHandler: () => {
        return Observable.from([])
      },
      batchKey: () => 'yo',
    })

    expect(batcher.queuedRequests.get('')).toBeUndefined()
    expect(batcher.queuedRequests.get('yo')).toBeUndefined()
    batcher.consumeQueue()
    expect(batcher.queuedRequests.get('')).toBeUndefined()
    expect(batcher.queuedRequests.get('yo')).toBeUndefined()
  })

  it('should be able to add to the queue', done => {
    const batcher = new OperationBatcher({
      batchInterval: 10,
      batchHandler: () => {
        return Observable.from([{ data: { value: 1 } }, { data: { value: 1 } }])
      },
    })

    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `

    const request: BatchableRequest = {
      operation: createOperation(createRequest(query), {}, {}),
    }

    expect(batcher.queuedRequests.get('')).toBeUndefined()
    batcher.enqueueRequest(request).subscribe({})
    expect(batcher.queuedRequests.get('')!.length).toBe(1)
    batcher.enqueueRequest(request).subscribe({})
    expect(batcher.queuedRequests.get('')!.length).toBe(2)
    done()
  })

  describe('request queue', () => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `
    const data = {
      author: {
        firstName: 'John',
        lastName: 'Smith',
      },
    }
    const batchHandler = createMockBatchHandler(
      {
        request: createOperation(createRequest(query), {}, {}),
        result: { data },
      },
      {
        request: createOperation(createRequest(query), {}, {}),
        result: { data },
      },
    )
    const operation: Operation = createOperation(createRequest(query), {}, {})

    it('should be able to consume from a queue containing a single query', done => {
      const myBatcher = new OperationBatcher({
        batchInterval: 10,
        batchHandler,
      })

      myBatcher.enqueueRequest({ operation }).subscribe(
        terminatingCheck(done, resultObj => {
          expect(myBatcher.queuedRequests.get('')).toBeUndefined()
          expect(resultObj).toEqual({ data })
        }),
      )
      const observables: (Observable<OperationResponse> | undefined)[] = myBatcher.consumeQueue()!

      try {
        expect(observables.length).toBe(1)
      } catch (e) {
        done.fail(e)
      }
    })

    it('should be able to consume from a queue containing multiple queries', done => {
      const request2: Operation = createOperation(createRequest(query), {}, {})

      const BH = createMockBatchHandler(
        {
          request: createOperation(createRequest(query), {}, {}),
          result: { data },
        },
        {
          request: createOperation(createRequest(query), {}, {}),
          result: { data },
        },
      )

      const myBatcher = new OperationBatcher({
        batchInterval: 10,
        batchMax: 10,
        batchHandler: BH,
      })
      const observable1 = myBatcher.enqueueRequest({ operation })
      const observable2 = myBatcher.enqueueRequest({ operation: request2 })
      let notify = false
      observable1.subscribe({
        next: resultObj1 => {
          try {
            expect(resultObj1).toEqual({ data })
          } catch (e) {
            done.fail(e)
          }

          if (notify) {
            done()
          } else {
            notify = true
          }
        },
      })

      observable2.subscribe({
        next: resultObj2 => {
          try {
            expect(resultObj2).toEqual({ data })
          } catch (e) {
            done.fail(e)
          }

          if (notify) {
            done()
          } else {
            notify = true
          }
        },
      })

      try {
        expect(myBatcher.queuedRequests.get('')!.length).toBe(2)
        const observables: (Observable<OperationResponse> | undefined)[] = myBatcher.consumeQueue()!
        expect(myBatcher.queuedRequests.get('')).toBeUndefined()
        expect(observables.length).toBe(2)
      } catch (e) {
        done.fail(e)
      }
    })

    it('should return a promise when we enqueue a request and resolve it with a result', done => {
      const BH = createMockBatchHandler({
        request: createOperation(createRequest(query), {}, {}),
        result: { data },
      })
      const myBatcher = new OperationBatcher({
        batchInterval: 10,
        batchHandler: BH,
      })
      const observable = myBatcher.enqueueRequest({ operation })
      observable.subscribe(
        terminatingCheck(done, result => {
          expect(result).toEqual({ data })
        }),
      )
      myBatcher.consumeQueue()
    })
  })

  it('should work when single query', done => {
    const data = {
      lastName: 'Ever',
      firstName: 'Greatest',
    }
    const batcher = new OperationBatcher({
      batchInterval: 10,
      batchHandler: () =>
        Observable.create<OperationResponse[]>(sink => {
          setTimeout(() => {
            sink.next([{ data }])
            sink.complete()
          })
        }),
    })
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `
    const operation: Operation = createOperation(createRequest(query, OperationKind.QUERY), {}, {})

    batcher.enqueueRequest({ operation }).subscribe({})
    try {
      expect(batcher.queuedRequests.get('')!.length).toBe(1)
    } catch (e) {
      done.fail(e)
    }

    setTimeout(
      () =>
        terminatingCheck(done, () => {
          expect(batcher.queuedRequests.get('')).toBeUndefined()
        }).next(),
      20,
    )
  })

  it('should correctly batch multiple queries', done => {
    const data = {
      lastName: 'Ever',
      firstName: 'Greatest',
    }
    const data2 = {
      lastName: 'Hauser',
      firstName: 'Evans',
    }
    const batcher = new OperationBatcher({
      batchInterval: 10,
      batchHandler: () =>
        Observable.create(sink => {
          sink.next([{ data }, { data: data2 }, { data }])
          setTimeout(sink.complete.bind(sink))
        }),
    })
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `
    const operation: Operation = createOperation(createRequest(query), {}, {})
    const operation2: Operation = createOperation(createRequest(query), {}, {})
    const operation3: Operation = createOperation(createRequest(query), {}, {})

    batcher.enqueueRequest({ operation }).subscribe({})
    batcher.enqueueRequest({ operation: operation2 }).subscribe({})
    try {
      expect(batcher.queuedRequests.get('')!.length).toBe(2)
    } catch (e) {
      done.fail(e)
    }

    setTimeout(() => {
      // The batch shouldn't be fired yet, so we can add one more request.
      batcher.enqueueRequest({ operation: operation3 }).subscribe({})
      try {
        expect(batcher.queuedRequests.get('')!.length).toBe(3)
      } catch (e) {
        done.fail(e)
      }
    }, 3)

    setTimeout(
      () =>
        terminatingCheck(done, () => {
          // The batch should've been fired by now.
          expect(batcher.queuedRequests.get('')).toBeUndefined()
        }).next(),
      20,
    )
  })

  it('should reject the promise if there is a network error', done => {
    const query = gql`
      query {
        author {
          firstName
          lastName
        }
      }
    `
    const operation: Operation = createOperation(createRequest(query), {}, {})
    const error = new Error('Network error')
    const BH = createMockBatchHandler({
      request: createOperation(createRequest(query, OperationKind.SUBSCRIPTION), {}, {}),
      error,
    })
    const batcher = new OperationBatcher({
      batchInterval: 10,
      batchHandler: BH,
    })

    const observable = batcher.enqueueRequest({ operation })
    observable.subscribe({
      error: (e: Error) =>
        terminatingCheck(done, () => {
          expect(e.message).toBe('Network error')
        }).next(),
    })
    batcher.consumeQueue()
  })
})

describe('BatchLink', () => {
  const query = gql`
    {
      id
    }
  `

  it('should not need any constructor arguments', () => {
    expect(() => new BatchLink({ batchHandler: () => Observable.from([]) })).not.toThrow()
  })
  it('should pass forward on', done => {
    const link = RelayLink.from([
      new BatchLink({
        batchInterval: 0,
        batchMax: 1,
        batchHandler: (operation, forward) => {
          try {
            expect(forward!.length).toBe(1)
            expect(operation.length).toBe(1)
          } catch (e) {
            done.fail(e)
          }
          return forward![0]!(operation[0]).map(result => [result])
        },
      }),
      new RelayLink(operation => {
        terminatingCheck(done, () => {
          expect(operation.query).toEqual(query)
        }).next()
        return Observable.create(() => {})
      }),
    ])

    execute(link, createRequest(query), {}, {}).subscribe({
      next: () => done.fail('next'),
    })
  })
  it('should raise warning if terminating', () => {
    let calls = 0
    const linkFull = new BatchLink({
      batchHandler: (operation, forward) => forward![0]!(operation[0]).map(r => [r]),
    })
    const linkOneOp = new BatchLink({
      batchHandler: operation => Observable.create(() => {}),
    })
    const linkNoOp = new BatchLink({
      batchHandler: () => Observable.create(() => {}),
    })

    const _warn = console.warn
    console.warn = warning => {
      calls++
      expect(warning.message).toBeDefined()
    }
    expect(linkOneOp.concat((operation, forward) => forward(operation))).toEqual(linkOneOp)
    expect(linkNoOp.concat((operation, forward) => forward(operation))).toEqual(linkNoOp)
    console.warn = warning => {
      throw Error('non-terminating link should not throw')
    }
    expect(linkFull.concat((operation, forward) => forward(operation))).not.toEqual(linkFull)
    console.warn = _warn
    expect(calls).toBe(2)
  })
  it('should correctly use batch size', done => {
    const sizes = [1, 2, 3]
    const terminating = new RelayLink(operation => {
      try {
        expect(operation.query).toEqual(query)
      } catch (e) {
        done.fail(e)
      }
      return Observable.from(operation.variables.count)
    })

    const runBatchSize = () => {
      const size = sizes.pop()
      if (!size) done()

      const batchHandler = jest.fn<
        RelayObservable<OperationResponse[]>,
        [Operation[], (NextLink | undefined)[] | undefined]
      >((operation: Operation[], forward: (NextLink | undefined)[] | undefined) => {
        try {
          expect(operation.length).toBe(size)
          expect(forward!.length).toBe(size)
        } catch (e) {
          done.fail(e)
        }
        const observables = forward!.map((f, i) => f!(operation[i]))
        return Observable.create<OperationResponse[]>(sink => {
          const data: OperationResponse[] = []
          observables.forEach(obs =>
            obs.subscribe({
              next: (d: OperationResponse) => {
                data.push(d)
                if (data.length === observables.length) {
                  sink.next(data)
                  sink.complete()
                }
              },
            }),
          )
        })
      })

      const link = RelayLink.from([
        new BatchLink({
          batchInterval: 1000,
          batchMax: size,
          batchHandler,
        }),
        terminating,
      ])

      Array.from(new Array(size)).forEach((_, i) => {
        execute(link, createRequest(query), { count: i }, {}).subscribe({
          next: data => expect(data).toBe(i),
          complete: () => {
            try {
              expect(batchHandler.mock.calls.length).toBe(1)
            } catch (e) {
              done.fail(e)
            }
            runBatchSize()
          },
        })
      })
    }

    runBatchSize()
  })
  it('should correctly follow batch interval', done => {
    const intervals = [10, 20, 30]

    const runBatchInterval = () => {
      const mock = jest.fn()

      const batchInterval = intervals.pop()
      if (!batchInterval) return done()

      const batchHandler = jest.fn<
        RelayObservable<OperationResponse[]>,
        [Operation[], (NextLink | undefined)[] | undefined]
      >((operation, forward) => {
        try {
          expect(operation.length).toBe(1)
          expect(forward!.length).toBe(1)
        } catch (e) {
          done.fail(e)
        }

        return forward![0]!(operation[0]).map(d => [d])
      })

      const link = RelayLink.from([
        new BatchLink({
          batchInterval,
          batchMax: 0,
          batchHandler,
        }),
        () => Observable.from({ data: { value: 42 } }),
      ])

      execute(link, createRequest(query), {}, {}).subscribe({
        next: data => {
          try {
            expect(data).toStrictEqual({ data: { value: 42 } })
          } catch (e) {
            done.fail(e)
          }
        },
        complete: () => {
          mock(batchHandler.mock.calls.length)
        },
      })

      setTimeout(() => {
        const checkCalls = mock.mock.calls.slice(0, -1)
        try {
          expect(checkCalls.length).toBe(2)
          checkCalls.forEach(args => expect(args[0]).toBe(0))
          expect(mock).lastCalledWith(1)
          expect(batchHandler.mock.calls.length).toBe(1)
        } catch (e) {
          done.fail(e)
        }

        runBatchInterval()
      }, batchInterval * 2)

      setTimeout(() => mock(batchHandler.mock.calls.length), batchInterval - 5)
      setTimeout(() => mock(batchHandler.mock.calls.length), batchInterval / 2)
    }
    runBatchInterval()
  })
  it('should throw an error when more requests than results', done => {
    const result = [{ data: {} }]
    const batchHandler = jest.fn(() => Observable.from(result))

    const link = RelayLink.from([
      new BatchLink({
        batchInterval: 10,
        batchMax: 2,
        batchHandler,
      }),
    ])
    ;[1, 2].forEach(() => {
      execute(link, createRequest(query), {}, {}).subscribe({
        next: () => {
          done.fail('next should not be called')
        },
        error: (error: any) =>
          terminatingCheck(done, () => {
            expect(error).toBeDefined()
            expect(error.result).toEqual(result)
          }).next(),
        complete: () => {
          done.fail('complete should not be called')
        },
      })
    })
  })

  describe('batchKey', () => {
    it('should allow different batches to be created separately', done => {
      const data = { data: {} }
      const result = [data, data]

      const batchHandler = jest.fn(op => {
        try {
          expect(op.length).toBe(2)
        } catch (e) {
          done.fail(e)
        }
        return Observable.from(result)
      })
      let key = true
      const batchKey = () => {
        key = !key
        return '' + !key
      }

      const link = RelayLink.from([
        new BatchLink({
          batchInterval: 1,
          //if batchKey does not work, then the batch size would be 3
          batchMax: 3,
          batchHandler,
          batchKey,
        }),
      ])

      let count = 0
      ;[1, 2, 3, 4].forEach(() => {
        execute(link, createRequest(query), {}, {}).subscribe({
          next: d => {
            try {
              expect(d).toEqual(data)
            } catch (e) {
              done.fail(e)
            }
          },
          error: done.fail,
          complete: () => {
            count++
            if (count === 4) {
              try {
                expect(batchHandler.mock.calls.length).toBe(2)
                done()
              } catch (e) {
                done.fail(e)
              }
            }
          },
        })
      })
    })
  })
})
