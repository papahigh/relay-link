import sourcemaps from "rollup-plugin-sourcemaps";
import node from "rollup-plugin-node-resolve";
import typescript from "typescript";
import typescriptPlugin from "rollup-plugin-typescript2";
import invariantPlugin from "rollup-plugin-invariant";

export const globals = {
  // Relay Link
  "relay-link": "relayLink.core",
  "relay-link-batch": "relayLink.batch",
  "relay-link-http-common": "relayLink.httpCommon",

  "relay-transport-ws": "relay-transport-ws",

  // Relay
  "relay-runtime": "relayRuntime",
  "relay-runtime/lib/network/RelayObservable": "relayRuntime.Observable",

  // GraphQL
  "graphql/language/printer": "graphql.printer",
  "graphql/execution/execute": "graphql.execute",

  // TypeScript
  tslib: "tslib",

  // Other
  "ts-invariant": "invariant",
  "lodash.merge": "lodashMerge",
  "json-stable-stringify": "jsonStableStringify",
};

export default (name) => [
  {
    input: "src/index.ts",
    output: {
      file: "lib/bundle.umd.js",
      format: "umd",
      name: `relayLink.${name}`,
      globals,
      sourcemap: true,
      exports: "named",
    },
    external: Object.keys(globals),
    onwarn,
    plugins: [
      node({ mainFields: ['module'] }),
      typescriptPlugin({
        typescript,
        tsconfig: "./tsconfig.json",
        tsconfigOverride: {
          compilerOptions: {
            module: "es2015",
          },
        },
      }),
      invariantPlugin({
        errorCodes: true,
      }),
      sourcemaps(),
    ],
  },
  {
    input: "src/index.ts",
    output: {
      file: "lib/bundle.esm.js",
      format: "esm",
      globals,
      sourcemap: true,
    },
    external: Object.keys(globals),
    onwarn,
    plugins: [
      node({ mainFields: ['module'] }),
      typescriptPlugin({
        typescript,
        tsconfig: "./tsconfig.json",
        tsconfigOverride: {
          compilerOptions: {
            module: "es2015",
          },
        },
      }),
      invariantPlugin({
        errorCodes: true,
      }),
      sourcemaps(),
    ],
  },
  {
    input: "lib/bundle.esm.js",
    output: {
      file: "lib/bundle.cjs.js",
      format: "cjs",
      globals,
      sourcemap: true,
    },
    external: Object.keys(globals),
    onwarn,
  },
];

export function onwarn(message) {
  const suppressed = ["UNRESOLVED_IMPORT", "THIS_IS_UNDEFINED"];

  if (!suppressed.find((code) => message.code === code)) {
    return console.warn(message.message);
  }
}
