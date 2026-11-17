# AGENTS.md — danmaru

A no-dependency convenience wrapper around `node:http` / `node:https`. You hand `compose()`
a server and an array of route descriptions; it handles method filtering, route selection,
body collection, URL parsing and error responses, then calls your handler. Published to npm
as `danmaru`, LGPL-3.0.

## Hard Rules

- **Never add a runtime dependency.** "No dependency" is the whole selling point and is
  literally the package description. devDependencies are fine and should stay minimal
- **Never add `"type": "module"` to `package.json`.** The published artifact is CommonJS and
  consumers `require()` it; switching is a breaking change for every user
- Never auto-commit, auto-push or publish
- `src/index.ts` is the only source of truth. `index.js` and `index.d.ts` at the repo root
  are build output — gitignored, and rewritten on every build
- Any change to the public interfaces means a version bump in `package.json` and a matching
  README update. Keep additive where you can: consumers pin with `^`

## Rules

- Indentation is tabs. The existing style is deliberately compact (`a==undefined`, no space
  around `=`); match it rather than reformatting
- Keep `README.md`'s interface listings byte-accurate against `src/index.ts` — they are
  hand-maintained copies, not generated
- New behaviour needs a test in `src/tests/`. Verify the test actually fails without the
  change before trusting it

---

## Layout

| Path | Description |
|------|-------------|
| `src/index.ts` | **The entire library.** Interfaces, `compose()`, the response helpers, the loggers |
| `src/tests/*.test.ts` | `node:test` suites, one server per file on a random port |
| `src/tests/_server.ts` | `start()` / `stop()` helper. Not a test file — the glob only picks up `*.test.js` |
| `tsconfig.json` | Build config. `outDir` is the repo root, emits `index.js` + `index.d.ts` |
| `tsconfig.test.json` | Test build. Extends the above, redirects `outDir` to `test-build/` |
| `index.js`, `index.d.ts` | Build output. Gitignored; `.npmignore` keeps `src/` out of the tarball so these are what ships |

## Build, test, publish

```sh
npm run build   # tsc -> index.js + index.d.ts
npm test        # tsc -p tsconfig.test.json -> test-build/, then node --test
npm publish     # prepublishOnly rebuilds and minifies index.js through jsmin
```

`npm test` compiles first and runs the **emitted CommonJS**, deliberately: that is the same
module format the package ships, so the tests exercise what consumers actually load.

The compiler is TypeScript 7 (the native one). Four things it needs that TS5 did not, all in
`tsconfig.json`: `module`/`moduleResolution` are `node16` (`node` resolution was removed, and
TS7 insists the two match — emit is still CommonJS because `package.json` has no `"type"`),
`rootDir` must be explicit or the output lands in `src/`, and `types:["node"]` is required
because `@types/*` is no longer picked up automatically.

Node's native TypeScript type stripping (`node --test src/tests/*.ts`) does *not* work on
this source — it rejects the angle-bracket type assertions (`<SimpleServerResponse>resp_`)
and would reinterpret the typeless `.ts` as ESM. Converting those assertions to `as` syntax
is what it would take to drop the build step.

---

## Request lifecycle

The order is the thing worth knowing — several surprises come from *when* a step runs:

1. **HTTP/2 is rejected.** `httpVersionMajor>1` destroys the socket
2. **Global `allowed_methods` filter** → `405`. This is *before* routing, so it applies to
   every URL including unknown ones
3. **Action selection.** First match in array order handles the request completely. A
   per-action `m` that does not list the method simply skips that action and keeps looking
4. **No match** → the `indexer` callback if set, otherwise `404`
5. **`req.full_url`** is built, from the `Host` header when it passes `hostname_re`, else
   from the listening address
6. **`bodyguard`** → the `options_t` one, then the action's. Fail-closed: anything but `true`
   (or a promise of `true`) rejects, answering `401` unless the guard answered for itself.
   A throw or rejection here is *always* caught → `500`, `catch_to_500` or not
7. **Body collection** into `req.body_string`; exceeding `max_body_size` marks the request
   damaged and answers `400`
8. **`auto_handle_OPTIONS`** → bare `200`. Note this is *after* routing
9. **`do()`** is called. With `catch_to_500` a thrown error *or* a rejected promise becomes
   a `500`

Steps 5 and 6 are the 2.2.0 change. `full_url` moved up from after body collection so a
bodyguard can use it, which means a `400` for an unparsable url now beats a `400` for an
oversized body, and an auto-handled `OPTIONS` with an unparsable url now gets `400` rather
than `200`.

## Matching modes

| Mode | Compares | `/api` matches |
|------|----------|----------------|
| default (prefix) | `url.startsWith(prefix)` on the raw url | `/api`, `/api/sub`, `/api?x=1`, `/apifoo` |
| `exact_match: true` | whole raw url, `==` | `/api` only — *not* `/api/` or `/api?x=1` |
| `path_match: true` | url path, query ignored, one optional trailing slash | `/api`, `/api/`, `/api?x=1`, `/api/?x=1` — not `/apifoo` or `/api/sub` |

`exact_match` wins if both are set. The classic idiom for the default mode is to put the
`?` in the prefix itself (`prefix:"/hello?"`) so a query string still matches.

## Gotchas

- **`allowed_methods` runs before routing**, so `OPTIONS` must be in that list for
  `auto_handle_OPTIONS` to ever fire. That is exactly why `sane_options` includes it
- **`req.full_url` does not exist during routing** — it is built just after the action is
  picked, so route selection can only ever look at the raw `req.url` string. A `bodyguard`,
  which runs after that, does get it
- **The bodyguard is skipped for `OPTIONS`** when `auto_handle_OPTIONS` is on. A CORS
  preflight carries no credentials, so guarding it would break preflight for every browser
  client. Same family of surprise as the `allowed_methods` note above
- **A rejecting bodyguard does not close the socket.** Node dumps the unread body itself, so
  the client gets a clean `401` and danmaru simply never buffers the body. Deliberate: the
  alternative is an RST the client may see instead of the response
- `json_response(code, data)` takes the **code first**. A `.status()`-style call chained
  after the body does not exist here
- The `indexer` is wrapped in a synthetic action with `prefix: '<<INDEXER>>>'`, so
  `req.action.prefix` looks odd inside it
- `simple_response` / `json_response` return `write()`'s backpressure boolean, **not** a
  success flag. Real send errors are routed to `error_catcher` as `ERR_REASON_SEND_ERROR`
  (or logged), never thrown. A send refused by `safe_send` also returns `false`, so it is
  indistinguishable from backpressure — `error_catcher` is the honest signal
- **A double send throws `ERR_HTTP_HEADERS_SENT` out of the handler** and, without
  `catch_to_500`, kills the consumer's process. `safe_send:true` refuses the second send
  instead. Off by default, because flipping it turns a throw into a silent no-op for anyone
  relying on the old behaviour; worth proposing as the default in the next major
- `http_action_cb` returns `void | Promise<any>`, so `return resp.json_response(...)` from a
  non-async handler is a type error — call it, then `return`
