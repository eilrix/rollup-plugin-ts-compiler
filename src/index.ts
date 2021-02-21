import colorsdef from 'colors/safe';
import fs from 'fs-extra';
import normalizePath from 'normalize-path';
import { dirname, isAbsolute, join, resolve } from 'path';
import { OutputBundle, OutputOptions, Plugin } from 'rollup';
import ts from 'typescript';

import { State } from './types';

const colors: any = colorsdef;

const pluginName = 'rollup-plugin-ts-compiler';
const disclaimerWarning = `(!) Warning: ${pluginName} : Implementation of this plugin only works when it placed 
as first item in plugin array of Rollup options. It can be okay for non-typescript files
but if other plugins will try to modify .(ts|tsx|js|jsx) files before this plugin, their modifications won't
be applied. This plugin reads files directly from file system, ignoring Rollup's preceding pipeline\n`;

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
            if (isExternalForm(source)) return null;

            const resolvedFileName = ts.resolveModuleName(source, importer, state.compilerOptions,
                state.host)?.resolvedModule?.resolvedFileName;

            // console.log('resolveId resolvedFileName', resolvedFileName)

            if (resolvedFileName) return resolvedFileName;
            if (isAbsolute(source)) return { id: source };

            source = normalizePath(source);
            const globFileName = source.split('/').pop();
            const regexp = new RegExp(globFileName + '\\.(m?jsx?|tsx?)$');
            const fileDir = normalizePath(dirname(resolve(dirname(importer), source)));
            const fileName = fs.readdirSync(fileDir).find(fileName => {
                return regexp.test(fileName);
            })

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

            // console.log('transform id:', id, code)
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
                await new Promise<void>(done => {
                    state.program.emit(sourceFile, emitFile(state, () => {
                        done();
                    }));
                })
            }
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
                this.error('found Typescript errors, see log above')
            }
        }
    }
}


const startCompiler = (state: State, compilerOptionsOverwrite?: Object) => {
    if (state.hasStarted) return;
    state.hasStarted = true;
    // console.log('startCompiler')

    const configPath = ts.findConfigFile(
        process.cwd(),
        ts.sys.fileExists,
        "tsconfig.json"
    );


    let tsConfig: any = {};
    if (configPath) {
        tsConfig = ts.readConfigFile(configPath, ts.sys.readFile).config;
    }
    const mergedCompilerOptions = Object.assign({}, tsConfig?.compilerOptions, compilerOptionsOverwrite);
    tsConfig.compilerOptions = mergedCompilerOptions;

    const { options, fileNames } = ts.parseJsonConfigFileContent(
        tsConfig,
        ts.sys,
        process.cwd(),
    );

    if (options.importHelpers === null || options.importHelpers === undefined) {
        options.importHelpers = true;
    }
    if (options.incremental === null || options.incremental === undefined) {
        options.incremental = true;
    }
    if (options.incremental && (options.tsBuildInfoFile === null || options.tsBuildInfoFile === undefined)) {
        options.tsBuildInfoFile = '.tsbuildinfo';
    }
    if (options.skipLibCheck === null || options.skipLibCheck === undefined) {
        options.skipLibCheck = true;
    }
    if (options.sourceMap === null || options.sourceMap === undefined) {
        options.sourceMap = true;
    }

    // if ((options.outDir === null || options.outDir === undefined) && state.rollupOptions?.output) {
    //     let output: OutputOptions;
    //     if (Array.isArray(state.rollupOptions.output)) {
    //         output = state.rollupOptions.output[0];
    //     } else output = state.rollupOptions.output;

    //     if (output) {
    //         if (output.dir) options.outDir = isAbsolute(output.dir) ? output.dir : resolve(process.cwd(), output.dir);
    //         if (output.file) options.outDir = isAbsolute(output.file) ? dirname(output.file) : dirname(resolve(process.cwd(), output.file));
    //     }
    // }

    state.compilerOptions = options;
    state.rootFileNames = fileNames;

    state.host = ts.createIncrementalCompilerHost(state.compilerOptions);
    const originalGetSourceFile = state.host.getSourceFile as Function;

    state.host = Object.assign(state.host, {
        getSourceFile(fileName: string, languageVersion: ts.ScriptTarget) {
            const normalizedFileName = normalizePath(!isAbsolute(fileName) ? resolve(process.cwd(), fileName) : fileName);
            const cached = state.hostFiles.get(normalizedFileName);
            if (cached) return cached;

            const newFile = originalGetSourceFile(...arguments);
            state.hostFiles.set(normalizedFileName, newFile);
            return newFile;
        }
    });

    state.program = ts.createIncrementalProgram({
        rootNames: state.rootFileNames,
        host: state.host,
        options: {
            ...(state.compilerOptions),
        }
    });

    // console.log('startCompiler end')
    compile(state);
}

const readBuildInfo = (state: State) => {
    state.tsBuildInfoFile = state.compilerOptions.tsBuildInfoFile ?? '.tsbuildinfo'
    let outDir = state.compilerOptions.outDir ?? process.cwd();
    if (!isAbsolute(outDir)) outDir = resolve(process.cwd(), outDir);
    state.tsBuildInfoFilePath = normalizePath(isAbsolute(state.tsBuildInfoFile) ?
        state.tsBuildInfoFile : resolve(outDir, state.tsBuildInfoFile));
}


const compile = (state: State) => {
    // console.log('emit start');
    readBuildInfo(state);
    state.errorMessages = [];
    state.hasCompileError = false;

    const emitResult = state.program.emit(undefined, emitFile(state));

    const allDiagnostics = ts
        .getPreEmitDiagnostics(state.program.getProgram())
        .concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        let message;
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
            message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            message = `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
        } else {
            message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        }

        if (message) {
            message = colors.brightRed(`ts-compiler error: ${message}`);
            state.errorMessages.push(message);
            state.hasCompileError = true;
        }
    });

    // console.log('emit finish');
}

const writeAsync = (path: string, data: string) => {
    path = normalizePath(path);
    setTimeout(() => {
        fs.outputFile(path, data);
    }, 300);
}

const emitFile = (state: State, callback?: () => void) => (fileName: string, data: string, writeByteOrderMark, onError, sourceFiles) => {

    let sourceFileName: string = sourceFiles?.[0]?.fileName;

    const changeExtension = (ext: string, useOrigExt?: boolean) => {
        const nameArr = sourceFileName.split('.');
        const origExt = nameArr.pop();
        sourceFileName = nameArr.join('.') + (useOrigExt ? '.' + origExt : '') + ext;
    }

    if (/\.d\.ts\.map$/.test(fileName)) {
        writeAsync(resolve(process.cwd(), fileName), data);
        changeExtension('.d.ts.map');

    } else if (/\.map$/.test(fileName)) {
        // writeAsync(resolve(process.cwd(), fileName), data);
        changeExtension('.map', true);

    } else if (/\.d\.ts$/.test(fileName)) {
        writeAsync(resolve(process.cwd(), fileName), data)
        changeExtension('.d.ts');
    }

    if (state.compilerOptions.incremental &&
        fileName === state.tsBuildInfoFile &&
        state.tsBuildInfoFilePath
    ) {
        writeAsync(state.tsBuildInfoFilePath, data)
    }

    if (sourceFileName) {
        const normalizedFileName = normalizePath(!isAbsolute(sourceFileName) ? resolve(process.cwd(), sourceFileName) : sourceFileName);
        state.builtFiles.set(normalizedFileName, data);
    }

    // console.log('emitFile', fileName, normalizedFileName)

    callback?.();
}


const rebuild = (state: State) => {
    if (!state.hasChanes) return
    state.hasChanes = false;

    const newProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram(state.rootFileNames,
        state.compilerOptions, state.host, state.program as ts.EmitAndSemanticDiagnosticsBuilderProgram);
    state.program = newProgram;

    compile(state);
}

const isExternalForm = id => !id.startsWith('\0') && !id.startsWith('.') && !id.startsWith('/') && !isAbsolute(id) && !id.startsWith('$$');

export default tsCompilerPlugin;