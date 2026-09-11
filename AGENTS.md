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
5. **Body collection** into `req.body_string`; exceeding `max_body_size` marks the request
   damaged and answers `400`
6. **`auto_handle_OPTIONS`** → bare `200`. Note this is *after* routing
7. **`req.full_url`** is built, from the `Host` header when it passes `hostname_re`, else
   from the listening address
8. **`do()`** is called. With `catch_to_500` a thrown error *or* a rejected promise becomes
   a `500`

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
- **`req.full_url` does not exist during routing** — it is built after body collection, so
  route selection can only ever look at the raw `req.url` string
- `json_response(code, data)` takes the **code first**. A `.status()`-style call chained
  after the body does not exist here
- The `indexer` is wrapped in a synthetic action with `prefix: '<<INDEXER>>>'`, so
  `req.action.prefix` looks odd inside it
- `simple_response` / `json_response` return `write()`'s backpressure boolean, **not** a
  success flag. Real send errors are routed to `error_catcher` as `ERR_REASON_SEND_ERROR`
  (or logged), never thrown
- `http_action_cb` returns `void | Promise<any>`, so `return resp.json_response(...)` from a
  non-async handler is a type error — call it, then `return`
