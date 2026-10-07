# Changelog

## [0.12.0](https://github.com/KATT/vendor-src/compare/0.11.0...0.12.0) (2026-10-07)

### Features

- list a checkout's packages in a single packages array ([#36](https://github.com/KATT/vendor-src/issues/36)) ([c8b6490](https://github.com/KATT/vendor-src/commit/c8b64903def2e39facf793eee5998cdf1ad82913))

## [0.11.0](https://github.com/KATT/vendor-src/compare/0.10.1...0.11.0) (2026-10-07)

### Features

- one checkout per repo for packages from the same monorepo ([#34](https://github.com/KATT/vendor-src/issues/34)) ([d9745e8](https://github.com/KATT/vendor-src/commit/d9745e8835ba11885059b9333db6d05393819e8e))

## [0.10.1](https://github.com/KATT/vendor-src/compare/0.10.0...0.10.1) (2026-10-07)

### Bug Fixes

- vendor the fetched commit even when FETCH_HEAD changes concurrently ([#33](https://github.com/KATT/vendor-src/issues/33)) ([5d35bcf](https://github.com/KATT/vendor-src/commit/5d35bcfb46444dfb56b57717b57a5cfe15bed5a1))

## [0.10.0](https://github.com/KATT/vendor-src/compare/0.9.1...0.10.0) (2026-10-07)

### Features

- **add:** suggest matching dependencies when a package is not installed ([#32](https://github.com/KATT/vendor-src/issues/32)) ([9f8b2f4](https://github.com/KATT/vendor-src/commit/9f8b2f47ad1caf855d50d8a177d2eb60c3272905))

## [0.9.1](https://github.com/KATT/vendor-src/compare/0.9.0...0.9.1) (2026-10-07)

### Bug Fixes

- **add:** find packages installed in workspace packages ([#30](https://github.com/KATT/vendor-src/issues/30)) ([a47c351](https://github.com/KATT/vendor-src/commit/a47c35152e024785bea446ec4d38139996d51d2d))

## [0.9.0](https://github.com/KATT/vendor-src/compare/0.8.0...0.9.0) (2026-10-07)

### Features

- add init command; add no longer bootstraps the project ([#29](https://github.com/KATT/vendor-src/issues/29)) ([d6fed8b](https://github.com/KATT/vendor-src/commit/d6fed8b99c0c075cc7d867b3618092dc8a85a5dc))

## [0.8.0](https://github.com/KATT/vendor-src/compare/0.7.0...0.8.0) (2026-10-07)

### Features

- remove the adopt command ([#28](https://github.com/KATT/vendor-src/issues/28)) ([ad44734](https://github.com/KATT/vendor-src/commit/ad447340bf4f534e66c9f9c0db9212230ecf37d6))

## [0.7.0](https://github.com/KATT/vendor-src/compare/0.6.1...0.7.0) (2026-10-07)

### Features

- add required rootAgentsMd option to vendor-src.json ([#26](https://github.com/KATT/vendor-src/issues/26)) ([5cf7035](https://github.com/KATT/vendor-src/commit/5cf70352d66d74f2805a62ff3b70f19ae8d6be83))

## [0.6.1](https://github.com/KATT/vendor-src/compare/0.6.0...0.6.1) (2026-10-06)

### Bug Fixes

- **sync:** stop depending on git subtree history ([#25](https://github.com/KATT/vendor-src/issues/25)) ([e4c1552](https://github.com/KATT/vendor-src/commit/e4c1552a0caab05ffd3f0379313511b50cd0cb61)), references [#23](https://github.com/KATT/vendor-src/issues/23)

## [0.6.0](https://github.com/KATT/vendor-src/compare/0.5.0...0.6.0) (2026-10-06)

### Features

- bootstrap vendor dir as .repos and require dir in vendor-src.json ([#22](https://github.com/KATT/vendor-src/issues/22)) ([69dc6fe](https://github.com/KATT/vendor-src/commit/69dc6fe34228905d63df58853c0f33f7f0bd62a1)), references [#23](https://github.com/KATT/vendor-src/issues/23)

## [0.5.0](https://github.com/KATT/vendor-src/compare/0.4.3...0.5.0) (2026-10-06)

### Features

- rebuild vendor-src on idiomatic Effect services ([#19](https://github.com/KATT/vendor-src/issues/19)) ([573e471](https://github.com/KATT/vendor-src/commit/573e4711aa3f9fc3be822ab9802478b09119a8f6))

## [0.4.3](https://github.com/KATT/vendor-src/compare/0.4.2...0.4.3) (2026-10-06)

### Bug Fixes

- split root vs vendor-dir AGENTS roles ([#18](https://github.com/KATT/vendor-src/issues/18)) ([fcc7e63](https://github.com/KATT/vendor-src/commit/fcc7e634b417cc6fe8dcde0ecd124c6fb94d8bee))

## [0.4.2](https://github.com/KATT/vendor-src/compare/0.4.1...0.4.2) (2026-10-06)

### Bug Fixes

- write AGENTS.md managed block through symlinks ([#17](https://github.com/KATT/vendor-src/issues/17)) ([bd32401](https://github.com/KATT/vendor-src/commit/bd32401f740506c832b775ed333270c5abd2db8b))

## [0.4.1](https://github.com/KATT/vendor-src/compare/0.4.0...0.4.1) (2026-10-06)

### Bug Fixes

- refresh AGENTS on sync; blog-style package inventory ([#15](https://github.com/KATT/vendor-src/issues/15)) ([a2adda6](https://github.com/KATT/vendor-src/commit/a2adda6d8d7ef99e02ae9a514d648528dbf29682))

## [0.4.0](https://github.com/KATT/vendor-src/compare/0.3.7...0.4.0) (2026-10-06)

### Features

- concise AGENTS.md + contextual {dir}/AGENTS.md ([#14](https://github.com/KATT/vendor-src/issues/14)) ([f5ee29b](https://github.com/KATT/vendor-src/commit/f5ee29b3f134e2963d965597e3713d30ef1071b6))

## [0.3.7](https://github.com/KATT/vendor-src/compare/0.3.6...0.3.7) (2026-10-06)

### Bug Fixes

- stop writing unused .ignore; scrub README version history ([#13](https://github.com/KATT/vendor-src/issues/13)) ([cdd93e1](https://github.com/KATT/vendor-src/commit/cdd93e17238d2a3fa3fc124d4735037e017a9cfe))

## [0.3.6](https://github.com/KATT/vendor-src/compare/0.3.5...0.3.6) (2026-10-06)

### Bug Fixes

- warn when ignore patterns look like legacy regexes ([#12](https://github.com/KATT/vendor-src/issues/12)) ([15b000d](https://github.com/KATT/vendor-src/commit/15b000d9d325e22937ccaa8b5f99342b40aad04c))

## [0.3.5](https://github.com/KATT/vendor-src/compare/0.3.4...0.3.5) (2026-10-06)

### Bug Fixes

- prune untracked safely and drop default ignores ([#11](https://github.com/KATT/vendor-src/issues/11)) ([5e15a3d](https://github.com/KATT/vendor-src/commit/5e15a3d5a23781a87dc205eeff2fa207403657bc)), references [#10](https://github.com/KATT/vendor-src/issues/10)

## [0.3.4](https://github.com/KATT/vendor-src/compare/0.3.3...0.3.4) (2026-10-06)

### Bug Fixes

- use globs for subtree ignore patterns ([#10](https://github.com/KATT/vendor-src/issues/10)) ([eaa7362](https://github.com/KATT/vendor-src/commit/eaa73621be50a398b88dd1e496fe028cda273bcd))

## [0.3.3](https://github.com/KATT/vendor-src/compare/0.3.2...0.3.3) (2026-10-06)

### Bug Fixes

- nested workspace globs, adopt, and agent install friction ([#9](https://github.com/KATT/vendor-src/issues/9)) ([35a3553](https://github.com/KATT/vendor-src/commit/35a3553b2de5de41a88ebb1c3807070c419aed1c)), closes [#000](https://github.com/KATT/vendor-src/issues/000)

## [0.3.2](https://github.com/KATT/vendor-src/compare/0.3.1...0.3.2) (2026-10-06)

### Bug Fixes

- preserve JSONC oxfmt configs and clarify add failures ([#8](https://github.com/KATT/vendor-src/issues/8)) ([089c306](https://github.com/KATT/vendor-src/commit/089c306868e6fb1f788a8185fbeb8e42cf117c85))

## [0.3.1](https://github.com/KATT/vendor-src/compare/0.3.0...0.3.1) (2026-10-06)

### Bug Fixes

- sync root README/LICENSE into npm package on pack ([#7](https://github.com/KATT/vendor-src/issues/7)) ([011db86](https://github.com/KATT/vendor-src/commit/011db8652902e05aceefd46b9c3aac35b1b89d98))

## [0.3.0](https://github.com/KATT/vendor-src/compare/0.2.0...0.3.0) (2026-10-06)

### Features

- per-repo ignore and publishable JSON schema ([#3](https://github.com/KATT/vendor-src/issues/3)) ([e01d4b4](https://github.com/KATT/vendor-src/commit/e01d4b440984b018fa28142f1567c329a1f19fbb))

### Bug Fixes

- set git identity in Release for release-it ([#4](https://github.com/KATT/vendor-src/issues/4)) ([579d93f](https://github.com/KATT/vendor-src/commit/579d93faadcb4962de5a55f058984755a39a60ef))

## 0.2.0 (2026-10-06)

### Features

- initialized repo ✨ ([f545f77](https://github.com/KATT/vendor-src/commit/f545f773aa97e128fe4898264251afcbaad99610))
- vendor-src CLI for version-synced git subtree vendoring ([#1](https://github.com/KATT/vendor-src/issues/1)) ([e989803](https://github.com/KATT/vendor-src/commit/e989803aff70775c73da9e1669fe6ea181bf469b))
