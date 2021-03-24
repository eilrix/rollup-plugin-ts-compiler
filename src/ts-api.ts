import colorsdef from 'colors/safe';
import fs from 'fs-extra';
import { isAbsolute, resolve } from 'path';
import ts from 'typescript';

import { normalizePath } from './helpers';
import { State } from './types';

const colors: any = colorsdef;


export const startCompiler = (state: State, compilerOptionsOverwrite?: Object) => {
    if (state.hasStarted) return;
    state.hasStarted = true;

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

    // Adjust unset options for Rollup bundle
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

    // Force some options
    options.noEmit = false;


    state.compilerOptions = options;
    state.rootFileNames = fileNames.map(fileName => normalizePath(fileName));

    state.host = ts.createIncrementalCompilerHost(state.compilerOptions);
    const originalGetSourceFile = state.host.getSourceFile as Function;

    // Override getSourceFile which will return our cached files to TC, so TC won't transpile file to AST
    // each time it requested
    state.host = Object.assign(state.host, {
        getSourceFile(fileName: string, languageVersion: ts.ScriptTarget) {
            const normalizedFileName = normalizePath(fileName);
            const cached = state.hostFiles.get(normalizedFileName);

            if (state.pluginSettings?.monorepo) {
                // In monorepo we want to cache only node_modules and root source files. Other files
                // can belong to other local packages and we want to check them for changes
                if (cached) {
                    if (/node_modules/.test(normalizedFileName)) return cached;
                    if (state.rootFileNames.includes(normalizedFileName)) return cached;
                }
            } else {
                if (cached) return cached;
            }

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

    compile(state);
}

const readBuildInfo = (state: State) => {
    // Check for compilerOptions change, to get tsBuildInfoFilePath always correct
    state.tsBuildInfoFile = state.compilerOptions.tsBuildInfoFile ?? '.tsbuildinfo'
    let outDir = state.compilerOptions.outDir ?? process.cwd();
    if (!isAbsolute(outDir)) outDir = resolve(process.cwd(), outDir);
    state.tsBuildInfoFilePath = normalizePath(isAbsolute(state.tsBuildInfoFile) ?
        state.tsBuildInfoFile : resolve(outDir, state.tsBuildInfoFile));
}


const compile = (state: State) => {
    readBuildInfo(state);
    state.errorMessages = [];
    state.hasCompileError = false;

    const emitResult = state.program.emit(undefined, emitFileToCache(state));

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
}

const writeAsync = (path: string, data: string) => {
    path = normalizePath(path);
    setTimeout(() => {
        fs.outputFile(path, data);
    }, 300);
}

export const emitFileToCache = (state: State, callback?: () => void) => (fileName: string, data: string, writeByteOrderMark, onError, sourceFiles) => {

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
        // // Don't write, source map will be emitted by Rollup. 
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
        const normalizedFileName = normalizePath(sourceFileName);
        state.builtFiles.set(normalizedFileName, data);
    }

    callback?.();
}

export const rebuild = (state: State) => {
    if (!state.hasChanes) return
    state.hasChanes = false;

    const newProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram(state.rootFileNames,
        state.compilerOptions, state.host, state.program as ts.EmitAndSemanticDiagnosticsBuilderProgram);
    state.program = newProgram;

    compile(state);
}