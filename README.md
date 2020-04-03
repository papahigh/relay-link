# relay-link

`relay-link` is a standard interface for modifying control flow of GraphQL requests and fetching GraphQL results, designed to provide a simple GraphQL client that is capable of extensions.
The high level use cases of `relay-link` are highlighted below:

* fetch queries directly without normalized cache
* network interface for Relay Modern
* fetcher for GraphiQL

The relay link interface is designed to make links composable and easy to share, each with a single purpose. In addition to the core, this repository contains links for the most common fetch methods—http, local schema, websocket—and common control flow manipulations, such as retrying and polling. For a more detailed view of extended use cases, please see this [list](http://www.apollographql.com/docs/link/links/community.html) of community created links.

## Installation

`npm install relay-link --save`

To use relay-link in a web browser or mobile app, you'll need a build system capable of loading NPM packages on the client.
Some common choices include Browserify, Webpack, and Meteor +1.3.



