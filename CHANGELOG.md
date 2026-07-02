# Changelog

## [1.4.0](https://github.com/studiographene/pulse-mcp-server/compare/v1.3.0...v1.4.0) (2026-07-02)


### Features

* **devex:** add pulse_get_devex_response_rates tool ([#39](https://github.com/studiographene/pulse-mcp-server/issues/39)) ([708daea](https://github.com/studiographene/pulse-mcp-server/commit/708daea8471a1765d80c549d55a008646738b8a7))
* **PX-3537:** enrich individual + QA responses with self-describing metadata ([#40](https://github.com/studiographene/pulse-mcp-server/issues/40)) ([d844f9d](https://github.com/studiographene/pulse-mcp-server/commit/d844f9d8ce5ceba6ee6ec86e7a10a230e3648347))
* **PX-3685:** declare tool annotations for permission grouping ([#33](https://github.com/studiographene/pulse-mcp-server/issues/33)) ([0ccb574](https://github.com/studiographene/pulse-mcp-server/commit/0ccb574f1934de1802026616ecf51c875801f03b))
* **PX-3685:** install from public git repo (no npm publish needed) ([f90f775](https://github.com/studiographene/pulse-mcp-server/commit/f90f77599fd2f5372a1cf66409f1a6849a88d5de))
* **PX-3685:** install from public git repo (no npm publish needed) ([#23](https://github.com/studiographene/pulse-mcp-server/issues/23)) ([a0a9ff1](https://github.com/studiographene/pulse-mcp-server/commit/a0a9ff11cdc9b4f9bf86eabbd25761530d176da8))
* **PX-3685:** one-line install script + simpler INSTALL.md ([15399af](https://github.com/studiographene/pulse-mcp-server/commit/15399afaa6ac1bbd6f34bc8efeff90b916feb625))
* **PX-3685:** one-line install script + simpler INSTALL.md ([#18](https://github.com/studiographene/pulse-mcp-server/issues/18)) ([23433bc](https://github.com/studiographene/pulse-mcp-server/commit/23433bc20416d24c850510e273da131f0da1880c))


### Bug Fixes

* **PX-3537:** align version-upgrades rag enum with v2 BE accepted values ([#38](https://github.com/studiographene/pulse-mcp-server/issues/38)) ([7c34ebb](https://github.com/studiographene/pulse-mcp-server/commit/7c34ebbb20f2fe845f1967fa4d0d82c2acff15e0))
* **PX-3537:** pass date range to /activity/profile and /activity ([#37](https://github.com/studiographene/pulse-mcp-server/issues/37)) ([3e0e711](https://github.com/studiographene/pulse-mcp-server/commit/3e0e711174e26174e448878608c64f7ed11a4a63))
* **PX-3685:** batch of 10 fixes from Cowork v1.3 smoke-test feedback ([#29](https://github.com/studiographene/pulse-mcp-server/issues/29)) ([32bf65f](https://github.com/studiographene/pulse-mcp-server/commit/32bf65fdcf7fede2db9143af1e5d5d4e96718c3d))
* **PX-3685:** correct curl|bash tty handling (per-read redirect, not global exec) ([#27](https://github.com/studiographene/pulse-mcp-server/issues/27)) ([095c599](https://github.com/studiographene/pulse-mcp-server/commit/095c599efbdb7c00141bd3c597a572a75338b378))
* **PX-3685:** default dev-process branch to ['main'] for every category ([8eb1a52](https://github.com/studiographene/pulse-mcp-server/commit/8eb1a52785324f0f51999b3c15021fcbed028531))
* **PX-3685:** default dev-process branch to ['main'] for every category ([#19](https://github.com/studiographene/pulse-mcp-server/issues/19)) ([2da5075](https://github.com/studiographene/pulse-mcp-server/commit/2da50752d6808574d10a87ff451b9714203d6416))
* **PX-3685:** give Homebrew installer a TTY so it can prompt for sudo ([#31](https://github.com/studiographene/pulse-mcp-server/issues/31)) ([bfe8a2c](https://github.com/studiographene/pulse-mcp-server/commit/bfe8a2ce3d36f575133cc64df88d92095f2995e8))
* **PX-3685:** install.sh offers to install Homebrew if missing ([#30](https://github.com/studiographene/pulse-mcp-server/issues/30)) ([cfc9e07](https://github.com/studiographene/pulse-mcp-server/commit/cfc9e0719fa8f66dcb4bfc714c5aea3de062cf68))
* **PX-3685:** make install.sh prompts work via curl | bash ([#25](https://github.com/studiographene/pulse-mcp-server/issues/25)) ([5dbb002](https://github.com/studiographene/pulse-mcp-server/commit/5dbb002325d9a34e1b4d15459bb7ce5d46b4327c))
* **PX-3685:** make the token-paste prompt impossible to miss ([#26](https://github.com/studiographene/pulse-mcp-server/issues/26)) ([e7f3a8c](https://github.com/studiographene/pulse-mcp-server/commit/e7f3a8ca9db6480fee3f641e28393941eabff5db))
* **PX-3685:** mitigate BE cross-pollination on concurrent member metrics ([#34](https://github.com/studiographene/pulse-mcp-server/issues/34)) ([0bf35b2](https://github.com/studiographene/pulse-mcp-server/commit/0bf35b2ef0c671db148cec6a9e94a7ed873b3d10))
* **PX-3685:** pre-public-release fix-ups ([1926b04](https://github.com/studiographene/pulse-mcp-server/commit/1926b04ae65efd8a91d1fc39ea7d8855a11f0d4b))
* **PX-3685:** pre-public-release fix-ups (F-003, F-007, F-008, F-012) ([#22](https://github.com/studiographene/pulse-mcp-server/issues/22)) ([6b17d79](https://github.com/studiographene/pulse-mcp-server/commit/6b17d79e72fa89f02eebdd67a86ddd640382627a))
* **PX-3685:** prevent brew subprocesses from eating script stdin ([#32](https://github.com/studiographene/pulse-mcp-server/issues/32)) ([86c9df8](https://github.com/studiographene/pulse-mcp-server/commit/86c9df853e5734881eeb73e6b258663b384526b3))
* **PX-3685:** remove BE-bug mitigations now the root cause is fixed ([#35](https://github.com/studiographene/pulse-mcp-server/issues/35)) ([f158a82](https://github.com/studiographene/pulse-mcp-server/commit/f158a82794e588e1ed99fdf931cb287686412207))
* **PX-3685:** translate DevEx range enum to Pulse API form + drop unsupported 7 days ([#28](https://github.com/studiographene/pulse-mcp-server/issues/28)) ([7dfe040](https://github.com/studiographene/pulse-mcp-server/commit/7dfe0402c3bb64ce5eb402ebc0916dcce41765e0))
* **PX-3685:** version-upgrades tool ergonomics (releasedDaysAgo + view enum) ([#36](https://github.com/studiographene/pulse-mcp-server/issues/36)) ([f1b9e9f](https://github.com/studiographene/pulse-mcp-server/commit/f1b9e9f4154b978cf36571f8209c4793b39d2434))

## [1.3.0](https://github.com/studiographene/pulse-mcp-server/compare/v1.2.0...v1.3.0) (2026-04-30)


### Features

* **PX-3685:** add per-member activity tools (FTP, RCA, commit, PR, etc.) ([5f00e8e](https://github.com/studiographene/pulse-mcp-server/commit/5f00e8e0aeea03ae27f75e82abcd184068ca3cc0))
* **PX-3685:** per-member activity tools (FTP, RCA, commits, PRs, etc.) ([#12](https://github.com/studiographene/pulse-mcp-server/issues/12)) ([e479294](https://github.com/studiographene/pulse-mcp-server/commit/e479294d66cc9d5ba64adbff265fea05c012c78f))
* **PX-3685:** support opaque pulse_mcp_ tokens for telemetry user_id ([c85e712](https://github.com/studiographene/pulse-mcp-server/commit/c85e7129e032263ba480542eff33fcac7259fe88))
* **PX-3685:** support opaque pulse_mcp_ tokens for telemetry user_id ([#11](https://github.com/studiographene/pulse-mcp-server/issues/11)) ([b4055bb](https://github.com/studiographene/pulse-mcp-server/commit/b4055bbacb094c77f389d37d0d7e0718150b2897))
* **PX-3685:** v1.3 polish pass (Cowork smoke findings) ([#10](https://github.com/studiographene/pulse-mcp-server/issues/10)) ([5ff0be5](https://github.com/studiographene/pulse-mcp-server/commit/5ff0be5918bbb0212d52c9b82b5efe820d706f59))
* **PX-3685:** v1.3 polish pass from Cowork smoke report ([2da88e0](https://github.com/studiographene/pulse-mcp-server/commit/2da88e036534ddc4ca677a3e6492d4c6daf82da7))


### Bug Fixes

* **PX-3685:** auto-fetch repoIds for repo-scoped per-member metrics ([165ec51](https://github.com/studiographene/pulse-mcp-server/commit/165ec51035a6bc90cbe8a318ce8efc9def36f652))
* **PX-3685:** auto-fetch repoIds for repo-scoped per-member metrics ([#13](https://github.com/studiographene/pulse-mcp-server/issues/13)) ([7c87843](https://github.com/studiographene/pulse-mcp-server/commit/7c87843493f8685d20e87e36f20468434a8ffdb6))
* **PX-3685:** auto-fetch sprints for sprint-scoped project metrics ([14c5935](https://github.com/studiographene/pulse-mcp-server/commit/14c5935163799a8d3a59c6ac11bc5afabb50a9a5))
* **PX-3685:** auto-fetch sprints for sprint-scoped project metrics ([#14](https://github.com/studiographene/pulse-mcp-server/issues/14)) ([e408d02](https://github.com/studiographene/pulse-mcp-server/commit/e408d023cd0d7be89bc1186697345e4382ad23df))

## [1.2.0](https://github.com/studiographene/pulse-mcp-server/compare/v1.1.0...v1.2.0) (2026-04-24)


### Features

* **PX-3685:** Amplitude telemetry for MCP tool usage ([f2bcf88](https://github.com/studiographene/pulse-mcp-server/commit/f2bcf8813beffd288bf484a907c4964e5c9134bb))
* **PX-3685:** Amplitude telemetry for MCP tool usage ([#7](https://github.com/studiographene/pulse-mcp-server/issues/7)) ([3675f9b](https://github.com/studiographene/pulse-mcp-server/commit/3675f9b7591f26eab6f3ffd6a5eff808e81e369e))


### Bug Fixes

* **PX-3685:** client-side sort on cycle_time details (BE sortKey broken) ([8db4723](https://github.com/studiographene/pulse-mcp-server/commit/8db4723346f2fabbb84b5374ff886a4f767c495a))
* **PX-3685:** second-pass review findings ([fe35cb3](https://github.com/studiographene/pulse-mcp-server/commit/fe35cb3b336019421d99e303d4419552205b432e))
* **PX-3685:** second-pass review findings ([#6](https://github.com/studiographene/pulse-mcp-server/issues/6)) ([84a7c1e](https://github.com/studiographene/pulse-mcp-server/commit/84a7c1e790c326208206d28cdf5ff67ef540815b))
* **PX-3685:** third-pass polish (cycle_time unit, feedback dedup, ISO dates) ([2f78163](https://github.com/studiographene/pulse-mcp-server/commit/2f78163d978b7bc666861d5525ecdf38ee4813bd))

## [1.1.0](https://github.com/studiographene/pulse-mcp-server/compare/v1.0.0...v1.1.0) (2026-04-23)


### Features

* **PX-3685:** add DevEx summary tool + fix survey/comments range ([7fdb780](https://github.com/studiographene/pulse-mcp-server/commit/7fdb780b0a222e24e9274c4d525377b3ee66ee5c))
* **PX-3685:** add DevEx summary tool + fix survey/comments range ([#4](https://github.com/studiographene/pulse-mcp-server/issues/4)) ([2444ca9](https://github.com/studiographene/pulse-mcp-server/commit/2444ca9944c3e965e39de3ddfb29b680d8bb7d58))

## 1.0.0 (2026-04-22)


### Features

* **PX-3685:** add sprint + release listing tools for QA/PM metric chaining ([2b89d28](https://github.com/studiographene/pulse-mcp-server/commit/2b89d287a609205d2bcbd44256c6b381de16dc80))
* **PX-3685:** implement full read-only surface + member update ([df96a72](https://github.com/studiographene/pulse-mcp-server/commit/df96a723fd14ea74ec1f40f0105f0d3cf7c766e4))
* **PX-3685:** initial pulse-mcp-server scaffold + 32 tools ([#1](https://github.com/studiographene/pulse-mcp-server/issues/1)) ([2aeedc9](https://github.com/studiographene/pulse-mcp-server/commit/2aeedc992513ccb0103caa8b3bdef8115d412a77))
* **PX-3685:** wire server instructions + centralised tool descriptions ([fdee7b3](https://github.com/studiographene/pulse-mcp-server/commit/fdee7b3a635048cdc92358f6c557645a04308406))


### Bug Fixes

* **PX-3685:** auto-fetch project context for metric endpoints ([3752bf1](https://github.com/studiographene/pulse-mcp-server/commit/3752bf1a53f0eb48b002e64a110bddc04ebed7c3))
* **PX-3685:** restore broken tools after Cowork review ([4496314](https://github.com/studiographene/pulse-mcp-server/commit/449631413dffe8504dfe0f2678b8bab55922910f))
* **PX-3685:** restore broken tools after Cowork review ([#3](https://github.com/studiographene/pulse-mcp-server/issues/3)) ([1b4f428](https://github.com/studiographene/pulse-mcp-server/commit/1b4f428882e6eacd73fd530b0518a5c5063b360a))
