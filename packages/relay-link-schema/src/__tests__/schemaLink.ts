import gql from 'graphql-tag'
import { makeExecutableSchema } from 'graphql-tools'
import { DocumentNode } from 'graphql/language/ast'
import { execute, OperationKind } from 'relay-link'
import { RequestParameters } from 'relay-runtime'

import { SchemaLink } from '../'

const sampleQuery = gql`
  query SampleQuery {
    sampleQuery {
      id
    }
  }
`

const typeDefs = `
type Stub {
  id: String
}

type Query {
  sampleQuery: Stub
}
`

const schema = makeExecutableSchema({ typeDefs })

export function createRequest(
  query: string | DocumentNode,
  operationKind = OperationKind.SUBSCRIPTION,
): RequestParameters {
  return {
    id: undefined,
    name: undefined as any,
    text: query as any,
    operationKind,
    metadata: {},
  }
}

describe('SchemaLink', () => {
  const mockError = { throws: new TypeError('mock me') }

  it('should raise warning if called with concat', () => {
    const link = new SchemaLink({ schema })
    const _warn = console.warn
    console.warn = warning => expect(warning['message']).toBeDefined()
    expect(link.concat((operation, forward) => forward(operation))).toEqual(link)
    console.warn = _warn
  })

  it('should throw error if no arguments given', () => {
    expect(() => new (SchemaLink as any)()).toThrow()
  })

  it('should correctly receive the constructor arguments', () => {
    const rootValue = {}
    const link = new SchemaLink({ schema, rootValue })
    expect((link as any).rootValue).toEqual(rootValue)
    expect((link as any).schema).toEqual(schema)
  })

  it('should call next and complete', done => {
    const next = jest.fn()
    const link = new SchemaLink({ schema })
    execute(link, createRequest(sampleQuery), {}, {}).subscribe({
      next,
      error: () => expect(false).toBeTruthy(),
      complete: () => {
        expect(next).toHaveBeenCalledTimes(1)
        done()
      },
    })
  })

  it('should call error when fetch fails', done => {
    const badSchema = makeExecutableSchema({
      typeDefs,
      resolvers: {
        Query: {
          sampleQuery: () => {
            throw mockError.throws
          },
        },
      },
    })
    const link = new SchemaLink({ schema: badSchema })

    execute(link, createRequest(sampleQuery), {}, {}).subscribe({
      next: data => {
        expect(data.errors![0].message).toEqual(mockError.throws.message)
        done()
      },
      error: () => expect(false).toBeTruthy(),
    })
  })

  it('supports query which is executed synchronously', done => {
    const next = jest.fn()
    const link = new SchemaLink({ schema })
    const introspectionQuery = gql`
      query IntrospectionQuery {
        __schema {
          types {
            name
          }
        }
      }
    `

    execute(link, createRequest(introspectionQuery), {}, {}).subscribe({
      next,
      error: () => expect(false).toBeTruthy(),
      complete: () => {
        expect(next).toHaveBeenCalledTimes(1)
        done()
      },
    })
  })

  it('passes operation context into execute with context function', done => {
    const next = jest.fn()
    const contextValue = { some: 'value' }
    const contextProvider = jest.fn(() => contextValue)

    const resolvers = {
      Query: {
        // @ts-ignore
        sampleQuery: (root: any, args: any, context: any) => {
          try {
            expect(context).toEqual(contextValue)
          } catch (error) {
            done.fail('Should pass context into resolver')
          }
        },
      },
    }

    const schemaWithResolvers = makeExecutableSchema({ typeDefs, resolvers })
    const link = new SchemaLink({ schema: schemaWithResolvers, context: contextProvider })

    execute(link, createRequest(sampleQuery), {}, {}).subscribe({
      next,
      error: () => done.fail("Shouldn't call onError"),
      complete: () => {
        try {
          expect(next).toHaveBeenCalledTimes(1)
          expect(contextProvider).toHaveBeenCalledTimes(1)
          done()
        } catch (e) {
          done.fail(e)
        }
      },
    })
  })

  it('passes static context into execute', done => {
    const next = jest.fn()
    const contextValue = { some: 'value' }

    // @ts-ignore
    const resolver = jest.fn((root: any, args: any, context: any) => {
      try {
        expect(context).toEqual(contextValue)
      } catch (error) {
        done.fail('Should pass context into resolver')
      }
    })

    const resolvers = {
      Query: {
        sampleQuery: resolver,
      },
    }

    const schemaWithResolvers = makeExecutableSchema({ typeDefs, resolvers })
    const link = new SchemaLink({ schema: schemaWithResolvers, context: contextValue })

    execute(link, createRequest(sampleQuery), {}, {}).subscribe({
      next,
      error: () => done.fail("Shouldn't call onError"),
      complete: () => {
        try {
          expect(next).toHaveBeenCalledTimes(1)
          expect(resolver).toHaveBeenCalledTimes(1)
          done()
        } catch (e) {
          done.fail(e)
        }
      },
    })
  })
})
