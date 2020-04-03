import gql from 'graphql-tag'
import { print } from 'graphql/language/printer'
import { Observable } from 'relay-runtime'
import { concat, execute, from, RelayLink, split } from '../link'
import { createOperation } from '../linkUtils'
import { MockLink, SetContextLink, testLinkResults } from '../test-utils'
import { NextLink, Operation, OperationKind, OperationResponse } from '../types'

const sampleQuery = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`

const setContext = () => ({ add: 1 })

describe('RelayLink(abstract class)', () => {
  describe('concat', () => {
    it('should concat a function', done => {
      const returnOne = new SetContextLink(setContext)
      const link = returnOne.concat((operation, forward) => {
        return Observable.from({ data: { count: operation.getContext().add } })
      })

      testLinkResults({
        link,
        results: [{ count: 1 }],
        done,
      })
    })

    it('should concat a Link', done => {
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink(op => Observable.from({ data: op.getContext().add }))
      const link = returnOne.concat(mock)

      testLinkResults({
        link,
        results: [1],
        done,
      })
    })

    it("should pass error to observable's error", done => {
      const error = new Error('thrown')
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink(op =>
        Observable.create(sink => {
          sink.next({ data: op.getContext().add })
          sink.error(error)
        }),
      )
      const link = returnOne.concat(mock)

      testLinkResults({
        link,
        results: [1, error],
        done,
      })
    })

    it('should concat a Link and function', done => {
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink((op, forward) => {
        op.setContext(({ add }) => ({ add: add + 2 }))
        return forward(op)
      })
      const link = returnOne.concat(mock).concat(op => {
        return Observable.from({ data: op.getContext().add })
      })

      testLinkResults({
        link,
        results: [3],
        done,
      })
    })

    it('should concat a function and Link', done => {
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink((op, forward) => Observable.from({ data: op.getContext().add }))

      const link = returnOne
        .concat((operation, forward) => {
          operation.setContext({
            add: operation.getContext().add + 2,
          })
          return forward(operation)
        })
        .concat(mock)
      testLinkResults({
        link,
        results: [3],
        done,
      })
    })

    it('should concat two functions', done => {
      const returnOne = new SetContextLink(setContext)
      const link = returnOne
        .concat((operation, forward) => {
          operation.setContext({
            add: operation.getContext().add + 2,
          })
          return forward(operation)
        })
        .concat((op, forward) => Observable.from({ data: op.getContext().add }))
      testLinkResults({
        link,
        results: [3],
        done,
      })
    })

    it('should concat two Links', done => {
      const returnOne = new SetContextLink(setContext)
      const mock1 = new MockLink((operation, forward) => {
        operation.setContext({
          add: operation.getContext().add + 2,
        })
        return forward(operation)
      })
      const mock2 = new MockLink((op, forward) => Observable.from({ data: op.getContext().add }))

      const link = returnOne.concat(mock1).concat(mock2)
      testLinkResults({
        link,
        results: [3],
        done,
      })
    })

    it("should return an link that can be concat'd multiple times", done => {
      const returnOne = new SetContextLink(setContext)
      const mock1 = new MockLink((operation, forward) => {
        operation.setContext({
          add: operation.getContext().add + 2,
        })
        return forward(operation)
      })
      const mock2 = new MockLink((op, forward) => Observable.from({ data: op.getContext().add + 2 }))
      const mock3 = new MockLink((op, forward) => Observable.from({ data: op.getContext().add + 3 }))
      const link = returnOne.concat(mock1)

      testLinkResults({
        link: link.concat(mock2),
        results: [5],
      })
      testLinkResults({
        link: link.concat(mock3),
        results: [6],
        done,
      })
    })
  })

  describe('split', () => {
    it('should split two functions', done => {
      const context = { add: 1 }
      const returnOne = new SetContextLink(() => context)
      const link1 = returnOne.concat((operation, forward) => Observable.from({ data: operation.getContext().add + 1 }))
      const link2 = returnOne.concat((operation, forward) => Observable.from({ data: operation.getContext().add + 2 }))
      const link = returnOne.split(operation => operation.getContext().add === 1, link1, link2)

      testLinkResults({
        link,
        results: [2],
      })

      context.add = 2

      testLinkResults({
        link,
        results: [4],
        done,
      })
    })

    it('should split two Links', done => {
      const context = { add: 1 }
      const returnOne = new SetContextLink(() => context)
      const link1 = returnOne.concat(
        new MockLink((operation, forward) => Observable.from({ data: operation.getContext().add + 1 })),
      )
      const link2 = returnOne.concat(
        new MockLink((operation, forward) => Observable.from({ data: operation.getContext().add + 2 })),
      )
      const link = returnOne.split(operation => operation.getContext().add === 1, link1, link2)

      testLinkResults({
        link,
        results: [2],
      })

      context.add = 2

      testLinkResults({
        link,
        results: [4],
        done,
      })
    })

    it('should split a link and a function', done => {
      const context = { add: 1 }
      const returnOne = new SetContextLink(() => context)
      const link1 = returnOne.concat((operation, forward) => Observable.from({ data: operation.getContext().add + 1 }))
      const link2 = returnOne.concat(
        new MockLink((operation, forward) => Observable.from({ data: operation.getContext().add + 2 })),
      )
      const link = returnOne.split(operation => operation.getContext().add === 1, link1, link2)

      testLinkResults({
        link,
        results: [2],
      })

      context.add = 2

      testLinkResults({
        link,
        results: [4],
        done,
      })
    })

    it('should allow concat after split to be join', done => {
      const context = { test: true, add: 1 }
      const start = new SetContextLink(() => ({ ...context }))
      const link = start
        .split(
          operation => operation.getContext().test,
          (operation, forward) => {
            operation.setContext(({ add }) => ({ add: add + 1 }))
            return forward(operation)
          },
          (operation, forward) => {
            operation.setContext(({ add }) => ({ add: add + 2 }))
            return forward(operation)
          },
        )
        .concat(operation => Observable.from({ data: operation.getContext().add }))

      testLinkResults({
        link,
        results: [2],
      })

      context.test = false

      testLinkResults({
        link,
        results: [3],
        done,
      })
    })

    it('should allow default right to be empty or passThrough when forward available', done => {
      let context = { test: true }
      const start = new SetContextLink(() => context)
      const link = start.split(
        operation => operation.getContext().test,
        operation =>
          Observable.from({
            data: {
              count: 1,
            },
          }),
      )
      const concatLink = link.concat(operation =>
        Observable.from({
          data: {
            count: 2,
          },
        }),
      )

      testLinkResults({
        link,
        results: [{ count: 1 }],
      })

      context.test = false

      testLinkResults({
        link,
        results: [],
      })

      testLinkResults({
        link: concatLink,
        results: [{ count: 2 }],
        done,
      })
    })
  })

  describe('empty', () => {
    it('should returns an immediately completed Observable', done => {
      testLinkResults({
        link: RelayLink.empty(),
        done,
      })
    })
  })

  describe('context', () => {
    it('should merge context when using a function', done => {
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink((op, forward) => {
        op.setContext(({ add }) => ({ add: add + 2 }))
        op.setContext(() => ({ substract: 1 }))

        return forward(op)
      })
      const link = returnOne.concat(mock).concat(op => {
        expect(op.getContext()).toEqual({
          add: 3,
          substract: 1,
        })
        return Observable.from({ data: op.getContext().add })
      })

      testLinkResults({
        link,
        results: [3],
        done,
      })
    })
    it('should merge context when not using a function', done => {
      const returnOne = new SetContextLink(setContext)
      const mock = new MockLink((op, forward) => {
        op.setContext({ add: 3 })
        op.setContext({ substract: 1 })

        return forward(op)
      })
      const link = returnOne.concat(mock).concat(op => {
        expect(op.getContext()).toEqual({
          add: 3,
          substract: 1,
        })
        return Observable.from({ data: op.getContext().add })
      })

      testLinkResults({
        link,
        results: [3],
        done,
      })
    })
  })

  describe('Link static library', () => {
    describe('from', () => {
      const sampleRequest = {
        text: print(sampleQuery),
        metadata: {},
        name: 'SampleQuery',
        operationKind: OperationKind.QUERY,
        id: undefined,
      }
      const uniqueOperation: Operation = createOperation(sampleRequest, {}, {}, null)

      it('should create an observable that completes when passed an empty array', done => {
        const observable = execute(from([]), uniqueOperation)
        observable.subscribe({
          next: () => done.fail('next'),
          error: () => done.fail('error'),
          complete: done,
        })
      })

      it('can create chain of one', () => {
        expect(() => RelayLink.from([new MockLink()])).not.toThrow()
      })

      it('can create chain of two', () => {
        expect(() =>
          RelayLink.from([new MockLink((operation, forward) => forward(operation)), new MockLink()]),
        ).not.toThrow()
      })

      it('should receive result of one link', done => {
        const data = {
          data: {
            hello: 'world',
          },
        }
        const chain = RelayLink.from([new MockLink(() => Observable.from(data))])
        // Smoke tests execute as a static method
        const observable = chain.execute(sampleRequest, uniqueOperation.variables, uniqueOperation.cacheConfig)
        observable.subscribe({
          next: actualData => {
            expect(data).toEqual(actualData)
          },
          error: () => done.fail('error'),
          complete: () => done(),
        })
      })

      it('should accept request params and pass them to link', () => {
        const stub = jest.fn()

        const chain = RelayLink.from([new MockLink(stub)])
        RelayLink.execute(chain, sampleRequest, uniqueOperation.variables, uniqueOperation.cacheConfig, null)

        expect(stub).toBeCalledWith(uniqueOperation)
      })

      it('should pass operation from one link to next with modifications', done => {
        const chain = RelayLink.from([
          new MockLink((op, forward) =>
            forward({
              ...op,
              variables: { add: 100 },
              query: sampleQuery,
            }),
          ),
          new MockLink(op => {
            expect({
              ...uniqueOperation,
              variables: { add: 100 },
              query: sampleQuery,
            }).toMatchObject(op)
            return done()
          }),
        ])
        chain.execute(uniqueOperation)
      })

      it('should pass result of one link to another with forward', done => {
        const data = {
          data: {
            hello: 'world',
          },
        }

        const chain = RelayLink.from([
          new MockLink((op, forward) => {
            const observable = forward(op)

            observable.subscribe({
              next: actualData => {
                expect(data).toEqual(actualData)
              },
              error: () => done.fail('error'),
              complete: done,
            })

            return observable
          }),
          new MockLink(() => Observable.from(data)),
        ])
        execute(chain, uniqueOperation)
      })

      it('should receive final result of two link chain', done => {
        const data = {
          data: {
            hello: 'world',
          },
        }

        const chain = RelayLink.from([
          new MockLink((op, forward) => {
            const observable = forward(op)

            return Observable.create(sink => {
              observable.subscribe({
                next: actualData => {
                  expect(data).toEqual(actualData)
                  sink.next({
                    data: {
                      ...actualData.data,
                      modification: 'unique',
                    },
                  })
                },
                error: error => sink.error(error),
                complete: () => sink.complete(),
              })
            })
          }),
          new MockLink(() => Observable.from(data)),
        ])

        const result = execute(chain, uniqueOperation)

        result.subscribe({
          next: modifiedData => {
            expect({
              data: {
                ...data.data,
                modification: 'unique',
              },
            }).toEqual(modifiedData)
          },
          error: () => done.fail('error'),
          complete: done,
        })
      })

      it('should chain together a function with links', done => {
        const add1 = new RelayLink((operation: Operation, forward: NextLink) => {
          operation.setContext(({ num }) => ({ num: num + 1 }))
          return forward(operation)
        })
        const add1Link = new MockLink((operation, forward) => {
          operation.setContext(({ num }) => ({ num: num + 1 }))
          return forward(operation)
        })

        const link = RelayLink.from([
          new SetContextLink(() => ({ num: 0 })),
          add1,
          add1,
          add1Link,
          add1,
          add1Link,
          new RelayLink(operation => Observable.from({ data: operation.getContext() })),
        ])
        testLinkResults({
          link,
          results: [{ num: 5 }],
          done,
        })
      })
    })

    describe('split', () => {
      it('should create filter when single link passed in', done => {
        const context = { test: true }

        const startLink = new SetContextLink(() => context)

        const link = startLink.concat(
          split(
            operation => operation.getContext().test,
            (operation, forward) => Observable.from({ data: { count: 1 } }),
          ),
        )

        testLinkResults({
          link,
          results: [{ count: 1 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [],
          done,
        })
      })

      it('should split two functions', done => {
        const context = { test: true }

        const startLink = new SetContextLink(() => context)

        const link = startLink.concat(
          RelayLink.split(
            operation => operation.getContext().test,
            (operation, forward) => Observable.from({ data: { count: 1 } }),
            (operation, forward) => Observable.from({ data: { count: 2 } }),
          ),
        )

        testLinkResults({
          link,
          results: [{ count: 1 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [{ count: 2 }],
          done,
        })
      })

      it('should split two Links', done => {
        const context = { test: true }
        const startLink = new SetContextLink(() => context)

        const link = startLink.concat(
          RelayLink.split(
            operation => operation.getContext().test,
            (operation, forward) => Observable.from({ data: { count: 1 } }),
            new MockLink((operation, forward) => Observable.from({ data: { count: 2 } })),
          ),
        )

        testLinkResults({
          link,
          results: [{ count: 1 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [{ count: 2 }],
          done,
        })
      })

      it('should split a link and a function', done => {
        const context = { test: true }
        const startLink = new SetContextLink(() => context)

        const link = startLink.concat(
          RelayLink.split(
            operation => operation.getContext().test,
            (operation, forward) => Observable.from({ data: { count: 1 } }),
            new MockLink((operation, forward) => Observable.from({ data: { count: 2 } })),
          ),
        )

        testLinkResults({
          link,
          results: [{ count: 1 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [{ count: 2 }],
          done,
        })
      })

      it('should allow concat after split to be join', done => {
        const context = { test: true }
        const startLink = new SetContextLink(() => context)

        const link = startLink
          .concat(
            RelayLink.split(
              operation => operation.getContext().test,
              (operation, forward) =>
                forward(operation).map(data => ({
                  data: { count: data.data.count + 1 },
                })),
            ),
          )
          .concat(() => Observable.from({ data: { count: 1 } }))

        testLinkResults({
          link,
          results: [{ count: 2 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [{ count: 1 }],
          done,
        })
      })

      it('should allow default right to be passThrough', done => {
        const context = { test: true }
        const startLink = new SetContextLink(() => context)

        const link = startLink
          .concat(
            RelayLink.split(
              operation => operation.getContext().test,
              operation => Observable.from({ data: { count: 2 } }),
            ),
          )
          .concat(operation => Observable.from({ data: { count: 1 } }))

        testLinkResults({
          link,
          results: [{ count: 2 }],
        })

        context.test = false

        testLinkResults({
          link,
          results: [{ count: 1 }],
          done,
        })
      })
    })

    describe('execute', () => {
      let _warn: (message?: any, ...originalParams: any[]) => void

      beforeEach(() => {
        _warn = console.warn
        console.warn = jest.fn(warning => {
          expect(warning).toBe(`query should either be a string or GraphQL AST`)
        })
      })

      afterEach(() => {
        console.warn = _warn
      })

      it('should return an empty observable when a link returns null', done => {
        testLinkResults({
          link: new MockLink(),
          results: [],
          done,
        })
      })

      it('should return an empty observable when a link is empty', done => {
        testLinkResults({
          link: RelayLink.empty(),
          results: [],
          done,
        })
      })

      it("should return an empty observable when a concat'd link returns null", done => {
        const link = new MockLink((operation, forward) => {
          return forward(operation)
        }).concat(() => null)
        testLinkResults({
          link,
          results: [],
          done,
        })
      })

      it('should return an empty observable when a split link returns null', done => {
        let context = { test: true }
        const link = new SetContextLink(() => context).split(
          op => op.getContext().test,
          () => Observable.create(() => {}),
          () => null,
        )
        testLinkResults({
          link,
          results: [],
        })
        context.test = false
        testLinkResults({
          link,
          results: [],
          done,
        })
      })

      it('should set a default context, variable, query and operationName on operation', done => {
        const sampleRequest = {
          text: print(sampleQuery),
          metadata: {},
          name: 'SampleQuery',
          operationKind: OperationKind.QUERY,
          id: undefined,
        }
        const operation = createOperation(sampleRequest, {}, {}, null)

        const link = new RelayLink(op => {
          expect(operation['query']).toBe(op['query'])
          expect(operation['variables']).toBe(op['variables'])
          expect(operation['cacheConfig']).toBe(op['cacheConfig'])
          expect(operation['uploadables']).toBe(op['uploadables'])
          expect(operation['metadata']).toBe(op['metadata'])
          expect(operation['operationId']).toBe(op['operationId'])
          expect(operation['operationName']).toBe(op['operationName'])
          expect(operation['operationKind']).toBe(op['operationKind'])
          expect(op.getKey()).toBeDefined()
          expect(op.getUniqueKey()).toBeDefined()
          expect(op.setContext).toBeDefined()
          expect(op.getContext).toBeDefined()
          return Observable.create<OperationResponse>(sink => sink.complete())
        })

        execute(link, operation).subscribe({ complete: done })
      })
    })
  })

  describe('Terminating links', () => {
    const _warn = console.warn
    const warningStub = jest.fn(warning => {
      expect(warning.message).toBe(`You are calling concat on a terminating link, which will have no effect`)
    })
    const data = {
      stub: 'data',
    }

    beforeAll(() => {
      console.warn = warningStub
    })

    beforeEach(() => {
      warningStub.mockClear()
    })

    afterAll(() => {
      console.warn = _warn
    })

    describe('concat', () => {
      it('should warn if attempting to concat to a terminating Link from function', () => {
        const link = new RelayLink(operation => Observable.from({ data }))
        expect(concat(link, (operation, forward) => forward(operation))).toEqual(link)
        expect(warningStub).toHaveBeenCalledTimes(1)
        expect(warningStub.mock.calls[0][0].link).toEqual(link)
      })

      it('should warn if attempting to concat to a terminating Link', () => {
        const link = new MockLink(operation => Observable.create(() => {}))
        expect(link.concat((operation, forward) => forward(operation))).toEqual(link)
        expect(warningStub).toHaveBeenCalledTimes(1)
        expect(warningStub.mock.calls[0][0].link).toEqual(link)
      })

      it('should not warn if attempting concat a terminating Link at end', () => {
        const link = new MockLink((operation, forward) => forward(operation))
        link.concat(operation => Observable.create(() => {}))
        expect(warningStub).not.toBeCalled()
      })
    })

    describe('split', () => {
      it('should not warn if attempting to split a terminating and non-terminating Link', () => {
        const splitLink = RelayLink.split(
          () => true,
          operation => Observable.from({ data }),
          (operation, forward) => forward(operation),
        )
        splitLink.concat((operation, forward) => forward(operation))
        expect(warningStub).not.toBeCalled()
      })

      it('should warn if attempting to concat to split two terminating links', () => {
        const splitLink = RelayLink.split(
          () => true,
          operation => Observable.from({ data }),
          operation => Observable.from({ data }),
        )
        expect(splitLink.concat((operation, forward) => forward(operation))).toEqual(splitLink)
        expect(warningStub).toHaveBeenCalledTimes(1)
      })

      it('should warn if attempting to split to split two terminating links', () => {
        const splitLink = RelayLink.split(
          () => true,
          operation => Observable.from({ data }),
          operation => Observable.from({ data }),
        )
        expect(
          splitLink.split(
            () => true,
            (operation, forward) => forward(operation),
            (operation, forward) => forward(operation),
          ),
        ).toEqual(splitLink)
        expect(warningStub).toHaveBeenCalledTimes(1)
      })
    })

    describe('from', () => {
      it('should not warn if attempting to form a terminating then non-terminating Link', () => {
        RelayLink.from([(operation, forward) => forward(operation), operation => Observable.from({ data })])
        expect(warningStub).not.toBeCalled()
      })

      it('should warn if attempting to add handler after termination', () => {
        RelayLink.from([
          (operation, forward) => forward(operation),
          operation => Observable.from({ data }),
          (operation, forward) => forward(operation),
        ])
        expect(warningStub).toHaveBeenCalledTimes(1)
      })

      it('should warn if attempting to add link after termination', () => {
        RelayLink.from([
          new RelayLink((operation, forward) => forward(operation)),
          new RelayLink(operation => Observable.from({ data })),
          new RelayLink((operation, forward) => forward(operation)),
        ])
        expect(warningStub).toHaveBeenCalledTimes(1)
      })
    })

    describe('warning', () => {
      it('should include link that terminates', () => {
        const terminatingLink = new MockLink(operation => Observable.from({ data }))
        RelayLink.from([
          new RelayLink((operation, forward) => forward(operation)),
          new RelayLink((operation, forward) => forward(operation)),
          terminatingLink,
          new RelayLink((operation, forward) => forward(operation)),
          new RelayLink((operation, forward) => forward(operation)),
          new RelayLink(operation => Observable.from({ data })),
          new RelayLink((operation, forward) => forward(operation)),
        ])
        expect(warningStub).toHaveBeenCalledTimes(4)
      })
    })
  })

  describe('execute', () => {
    it('transforms an operation with context into something serializable', done => {
      const sampleRequest = {
        text: print(sampleQuery),
        metadata: {},
        name: 'SampleQuery',
        operationKind: OperationKind.QUERY,
        id: undefined,
      }
      const operation = createOperation(sampleRequest, {}, {}, null)

      const link = new RelayLink(op => {
        const str = JSON.stringify({
          ...op,
          query: typeof op.query === 'string' ? op.query : print(op.query),
        })

        expect(str).toBe(
          JSON.stringify({
            ...operation,
            query: typeof op.query === 'string' ? op.query : print(op.query),
          }),
        )
        return Observable.create(sink => sink.complete())
      })
      execute(link, operation).subscribe({
        complete: done,
      })
    })
  })
})
