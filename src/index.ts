import colorsdef from 'colors/safe';
import fs from 'fs-extra';
import normalizePath from 'normalize-path';
import { dirname, isAbsolute, join, resolve } from 'path';
import { OutputBundle, OutputOptions, Plugin } from 'rollup';
import ts from 'typescript';

import { State } from './types';
import { startCompiler, emitFileToCache, rebuild } from './ts-api';
import { isExternalForm } from './helpers';
const colors: any = colorsdef;

const pluginName = 'rollup-plugin-ts-compiler';
// Appears if condition below wasn't met.
const disclaimerWarning = `(!) Warning: ${pluginName} : Implementation of this plugin only works when it placed 
as first item in plugin array of Rollup options. It can be okay for non-typescript files
but if other plugins will try to modify .(ts|tsx|js|jsx) files before this plugin, their modifications won't
be applied. This plugin reads files directly from file system, ignoring Rollup's preceding pipeline.
That is usually acceptable since you need only one plugin to compile .ts files and you can't have other plugins
working with typescript code.
`;

const tsCompilerPlugin = (settings?: {
    compilerOptions?: ts.CompilerOptions;
    sharedState?: Object;
}): Plugin => {

    const state: State = settings?.sharedState as State ?? {};
    state.hostFiles = new Map<string, ts.SourceFile>();
    state.builtFiles = new Map<string, string>();
    state.errorMessages = [];
    state.hasCompileError = false;

    return {
        name: pluginName,
        async resolveId(source, importer) {
            if (!importer) {
                return null;
            }
            // If it's a node_module, return null, it should be resolved by plugin-node-resolve or other plugin
            if (isExternalForm(source)) return null;

            // Use Typescript Compiler resolve
            const resolvedFileName = ts.resolveModuleName(source, importer, state.compilerOptions,
                state.host)?.resolvedModule?.resolvedFileName;

            if (resolvedFileName) return resolvedFileName;

            // File already resolved
            if (isAbsolute(source)) return { id: source };

            // If all failed, resolve manually
            source = normalizePath(source);
            const globFileName = source.split('/').pop();
            const regexp = new RegExp(globFileName + '\\.(m?jsx?|tsx?)$');
            const fileDir = normalizePath(dirname(resolve(dirname(importer), source)));
            const fileName = fs.readdirSync(fileDir).find(fileName => {
                return regexp.test(fileName);
            });

            if (!fileName) return null;

            return { id: normalizePath(join(fileDir, fileName)) };
        },
        options(options) {
            if (!state.rollupOptions) state.rollupOptions = options;

            options.plugins?.forEach((plugin, index) => {
                const message = colors.brightYellow(disclaimerWarning);
                if (index === 0 && plugin.name !== pluginName) {
                    console.log(message);
                }
                if (index > 0 && plugin.name === pluginName) {
                    console.log(message);
                }
            })
            return options;
        },
        buildStart(options) {
            startCompiler(state, settings?.compilerOptions);
        },
        watchChange(id: string) {
            id = normalizePath(id);
            state.hostFiles.delete(id);
            state.hasChanes = true;
        },
        async transform(code, id) {
            id = normalizePath(id);
            if (!/\.(m?jsx?|tsx?)$/.test(id)) return null;

            if (state.hasChanes) rebuild(state);

            if (state.errorMessages && state.errorMessages.length > 0) {
                state.errorMessages.forEach(message => {
                    console.error(message + '\n');
                });
                state.errorMessages = [];
            }

            const cached = state.builtFiles.get(id);
            if (cached) {
                return {
                    code: cached,
                    map: state.builtFiles.get(id + '.map')
                }
            }

            const sourceFile = state.program.getSourceFile(id);
            if (sourceFile) {
                // Await for file to compile and save to cache.
                await new Promise<void>(done => {
                    state.program.emit(sourceFile, emitFileToCache(state, () => {
                        done();
                    }));
                })
            }
            // Get just compiled file from cache
            const compiled = state.builtFiles.get(id);

            if (compiled) {
                return {
                    code: compiled,
                    map: state.builtFiles.get(id + '.map')
                }
            }

            return null;
        },
        generateBundle(options: OutputOptions, bundle: OutputBundle) {
            if (state.hasCompileError) {
                // Well, we throw it here since sometimes it breaks "watch" mode of Rollup if we throw it in transform function
                // @rollup/plugin-typescript has this problem with muiltiple inputs, very annoying
                this.error('found Typescript errors, see log above')
            }
        }
    }
}

module.exports = tsCompilerPlugin;
module.exports.default = tsCompilerPlugin;