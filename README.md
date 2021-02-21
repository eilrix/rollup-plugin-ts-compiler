# rollup-plugin-ts-compiler

Rollup plugin for typescript with compiler errors and incremental build.

It uses [modern Typescript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher) with incremental program by default which makes it way more faster than rollup-plugin-typescript2 or @rollup/plugin-typescript

## Installation 
npm install rollup-plugin-ts-compiler

## Usage

```javascript
import typescript from 'rollup-plugin-ts-compiler';

export default {
	input: './main.ts',
	plugins: [
		typescript(/*{ plugin options }*/)
	]
}
```

The plugin inherits all compiler options and file lists from your tsconfig.json file. 

### Options

#### - compilerOptions
Overrides compilerOptions values from tsconfig.json.

```javascript
 typescript({
     compilerOptions: {
        "module": "commonjs",
        "target": "es5",
     }
 })
```

#### - sharedState
See below.


## Further optimization

Plugin allows you to reuse compile results with many Rollup inputs/outputs if you have same compilerOptions for all of them.

For example: 

```javascript
import typescript from 'rollup-plugin-ts-compiler';
import pkg from './package.json';

const sharedState = {};

export default [
    {
        input: './main.ts',
        output: { 
            file: resolve(__dirname, pkg.main), 
            format: 'cjs'
        },
        plugins: [
             typescript({
                sharedState
            })
        ],
    },
    {
        input: './main.ts',
        output: { 
            file: resolve(__dirname, pkg.module), 
            format: 'esm'
        },
        plugins: [
             typescript({
                sharedState
            })
        ],
    },
];
```

Plugin will compile files only for the first input, second one will be emitted almost instantly.
You can use shared state even for different inputs since when Typescript Compiler starts, it compiles all files it can find by "include" and "exclude" of your tsconfig (default behavior)


### Other

Plugin supports declarations and source maps.