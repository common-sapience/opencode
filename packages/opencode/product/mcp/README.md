# Managed MCP servers

`browser.json` holds the `mcp.browser` entry that is merged into `product/opencode.json`: the product
ships `chrome-devtools-mcp` (a pinned dependency of this package, so nothing is fetched at run time)
and runs it with Node against the Chrome the user already has installed. The server exposes its tools
to the model as `browser_*`, for example `browser_navigate_page` and `browser_take_snapshot`.

Three environment variables are read by the config loader's `{env:...}` substitution, so the host sets
them when it spawns the engine:

| Variable                       | Meaning                                                                                   | Unset                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `HARNESS_BROWSER_MCP_ENTRY`    | absolute path to the installed `chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js` | the server cannot start, so browser tools are absent |
| `HARNESS_BROWSER_HEADLESS`     | `true` runs Chrome without a window; only the literal `true` enables it                   | headed, which is the product default                 |
| `HARNESS_BROWSER_AUTO_CONNECT` | `true` attaches to a Chrome the user already has running instead of launching one         | a new window on the server's own persistent profile  |
