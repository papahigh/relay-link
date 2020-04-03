---
title: relay-link-batch-http
description: Batch multiple operations into a single HTTP request
---

`relay-link-batch-http` is a terminating link that combines multiple GraphQL
operations into a single HTTP request. This link batches together individual
operations into an array that is sent to a single GraphQL endpoint.

```js
import { BatchHttpLink } from "relay-link-batch-http";

const link = new BatchHttpLink({ uri: "/graphql" });
```

## Options

The batch http link accepts an object with some options to customize the behavior
of the link. There are two different categories of options: http and batch. The
http options follow the same structure as the
[relay-link-http](http#options):

* `uri`: the URI key is a string endpoint -- will default to "/graphql" if not
  specified
* `includeExtensions`: allow passing the extensions field to your graphql
  server, defaults to false
* `fetch`: a `fetch` compatible API for making a request
* `headers`: an object representing values to be sent as headers on the request
* `credentials`: a string representing the credentials policy you want for the
  fetch call
* `fetchOptions`: any overrides of the fetch options argument to pass to the
  fetch call. Note that you cannot use batching with the GET HTTP method.

The batching options indicate how operations are batched together, the size of
batches, and the maximum time a batch will wait before automatically being sent
over the network.

- `batchMax`: a max number of items to batch, defaults at 10
- `batchInterval`: the interval at which to batch (in ms), defaults to 10
- `batchKey`: a function that accepts an operation and returns a string key,
  which uniquely names the batch the operation belongs to, defaults to
  returning the same string

## Fetch polyfill

The batch http link relies on having `fetch` present in your runtime environment. If you are running on react-native, or modern browsers, this should be no problem. If you are targeting an environment without `fetch` such as older browsers or the server, you will need to pass your own `fetch` to the link through the options. We recommend [`unfetch`](https://github.com/developit/unfetch) for older browsers and [`node-fetch`](https://github.com/bitinn/node-fetch) for running in Node.

## Context

The Batch Http Link currently uses the context in two different ways, per batch
and per query. The context fields below are used per batch and taken from the first
operation in the batch. They are applied to the fetch options in a similar
manner as [relay-link-http](https://github.com/papahigh/relay-link/tree/master/packages/relay-link-http).

* `headers`: an object representing values to be sent as headers on the request
* `credentials`: a string representing the credentials policy you want for the
  fetch call
* `uri`: a string of the endpoint you want to fetch from
* `fetchOptions`: any overrides of the fetch options argument to pass to the
  fetch call
* `response`: this is the raw response from the fetch request after it is made.

For each query, the `http` field is used to modify each individual query in the
batch, such as persisted queries (see below)

## Errors

The batch http link handles errors on a per batch basis with the same semantics found in [relay-link-http](http#errors).

## Custom fetching

You can use the `fetch` option when creating an http-link to do a lot of custom networking. This is useful if you want to modify the request based on the calculated headers or calculate the uri based on the operation:

### Custom auth

```js
const customFetch = (uri, options) => {
  const { header } = Hawk.client.header(
    "http://example.com:8000/resource/1?b=1&a=2",
    "POST",
    { credentials: credentials, ext: "some-app-data" }
  );
  options.headers.Authorization = header;
  return fetch(uri, options);
};

const link = new BatchHttpLink({ fetch: customFetch });
```

### Dynamic URI

```js
const customFetch = (uri, options) => {
  const operationNames = JSON.parse(options.body).map(operation => operation.operationName);
  return fetch(`${uri}/graph/graphql?opname=${operationNames}`, options);
};

const link = new BatchHttpLink({ fetch: customFetch });
```
