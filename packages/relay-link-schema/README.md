---
title: relay-link-schema
description: Assists with mocking and server-side rendering
---

The schema link provides a [graphql execution environment](http://graphql.org/graphql-js/graphql/#graphql), which allows you to perform GraphQL operations on a provided schema. This type of behavior is commonly used for server-side rendering (SSR) to avoid network calls and mocking data. 

## Installation

`npm install relay-link-schema --save`

## Usage

### Server Side Rendering

When performing SSR _on the same server_ you can use this library to avoid making network calls.

### Mocking

For more detailed information about mocking, please look the [graphql-tools documentation](https://www.apollographql.com/docs/graphql-tools/mocking.html).

### Options

The `SchemaLink` constructor can be called with an object with the following properties:

* `schema`: an executable graphql schema
* `rootValue`: the root value that is passed to the resolvers (i.e. the first parameter for the [rootQuery](http://graphql.org/learn/execution/#root-fields-resolvers))
* `context`: an object passed to the resolvers, following the [graphql specification](http://graphql.org/learn/execution/#root-fields-resolvers) or a function that accepts the operation and returns the resolver context. The resolver context may contain all the data-fetching connectors for an operation.
