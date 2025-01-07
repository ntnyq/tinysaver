# tinysaver

[![CI](https://github.com/ntnyq/tinysaver/workflows/CI/badge.svg)](https://github.com/ntnyq/tinysaver/actions)
[![NPM VERSION](https://img.shields.io/npm/v/tinysaver.svg)](https://www.npmjs.com/package/tinysaver)
[![NPM DOWNLOADS](https://img.shields.io/npm/dy/tinysaver.svg)](https://www.npmjs.com/package/tinysaver)
[![LICENSE](https://img.shields.io/github/license/ntnyq/tinysaver.svg)](https://github.com/ntnyq/tinysaver/blob/main/LICENSE)

Modern replacement of file-saver.js.

## Install

```shell
npm install tinysaver
```

```shell
yarn add tinysaver
```

```shell
pnpm add tinysaver
```

## Usage

```ts
import { saveAs } from 'tinysaver'

saveAs(new Blob(['hello world'], { type: 'text/plain' }), 'hello-world.txt')
```

## Credits

- [eligrey/FileSaver.js](https://github.com/eligrey/FileSaver.js)

## License

[MIT](./LICENSE) License © 2025-PRESENT [ntnyq](https://github.com/ntnyq)
