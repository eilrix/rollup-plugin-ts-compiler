# rollup-plugin-ts-compiler

Fast Typescript compiler plugin for Rollup. Just try it in watch mode.  
All included: compiler errors, incremental build, declarations, source maps, monorepo support and more.  

## Installation
```sh
npm install rollup-plugin-ts-compiler
```

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

* compilerOptions: {}  
Overrides compilerOptions values from tsconfig.json.  

```javascript
 typescript({
     compilerOptions: {
        "module": "commonjs",
        "target": "es5",
     }
 })
```

* monorepo: boolean  
Set to true if you are working in monorepo. By default in watch mode plugin caches and never recompiles node_modules and all files outside of your project root.
But in monorepo we want to check and recompile files outside since they can be other local packages.  

* sharedState: {}  
See below.  


## Further optimization

Plugin allows you to reuse compile results with many Rollup inputs/outputs if you have same compilerOptions for all of them.
Just pass an object to plugin instances as "sharedState" option.

For example build with multiple formats: 

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
You can use shared state even for different inputs since when Typescript Compiler starts, it compiles all files it can find by "include" and "exclude" of your tsconfig (default TSC behavior)  


## One caveat

Plugin uses [modern Typescript Compiler API](https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher) with incremental program by default which makes it way much faster than rollup-plugin-typescript2 or @rollup/plugin-typescript.  
It was implemented via fully delegating compiling to Typescript Compiler which reads files directly from file system and then gives output to Rollup. Therefore Rollup's preceding pipeline is ignored.  

That is usually acceptable since you need only one plugin to compile .ts files and you can't have other plugins
working with typescript code. Just make sure that in your plugin array inside Rollup options this plugin placed before babel or similar.  
