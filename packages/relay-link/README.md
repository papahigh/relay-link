# relay-link

## Purpose

`relay-link` is a standard interface for modifying control flow of GraphQL requests and fetching GraphQL results, designed to provide a simple GraphQL client that is capable of extensions.
The targeted use cases of `relay-link` are highlighted below:

* fetch queries directly without normalized cache
* network interface for Relay Modern
* fetcher for

Relay Link is the interface for creating new links in your application.

The client sends a request as a method call to a link and can recieve one or more (in the case of subscriptions) responses from the server. The responses are returned using the Observer pattern.

Results from the server can be provided by calling `next(result)` on the observer. In the case of a network/transport error (not a GraphQL Error) the `error(err)` method can be used to indicate a response will not be recieved. If multiple responses are not supported by the link, `complete()` should be called to inform the client no further data will be provided.

In the case of an intermediate link, a second argument to `request(operation, forward)` is the link to `forward(operation)` to. `forward` returns an observable and it can be returned directly or subscribed to.

```js
forward(operation).subscribe({
  next: result => {
    handleTheResult(result)
  },
  error: error => {
    handleTheNetworkError(error)
  },
});
```


## Installation

`npm install relay-link --save`

