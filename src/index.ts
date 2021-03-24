import colorsdef from 'colors/safe';
import normalizePath from 'normalize-path';
import { isAbsolute } from 'path';
import { OutputBundle, OutputOptions, Plugin } from 'rollup';
import ts from 'typescript';

import { isExternalForm, pluginName, warnDisclaimer } from './helpers';
import { emitFileToCache, rebuild, startCompiler } from './ts-api';
import { State, PluginSettings } from './types';

const colors: any = colorsdef;

const tsCompilerPlugin = (settings?: PluginSettings): Plugin => {

    const state: State = settings?.sharedState as State ?? {};
    state.pluginSettings = settings;
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

            return null;
        },
        options(options) {
            if (!state.rollupOptions) state.rollupOptions = options;

            let index = 0;
            if (options.plugins)
                for (let plugin of options.plugins) {
                    if (index === 0 && plugin.name !== pluginName) {
                        warnDisclaimer();
                        break;
                    }
                    if (index > 0 && plugin.name === pluginName) {
                        warnDisclaimer();
                        break;
                    }
                    index++;
                }

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
                this.error('found Typescript errors, see log above');
            }
        }
    }
}

module.exports = tsCompilerPlugin;

export default tsCompilerPlugin;