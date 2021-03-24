import { RollupOptions } from 'rollup';
import ts from 'typescript';

export type PluginSettings = {
    compilerOptions?: ts.CompilerOptions;
    sharedState?: Object;
    monorepo?: boolean;
}

export type State = {
    pluginSettings?: PluginSettings;
    program: ts.BuilderProgram;
    hasChanes: boolean;
    hasStarted: boolean;
    host: ts.CompilerHost;
    compilerOptions: ts.CompilerOptions;
    rootFileNames: string[];
    hostFiles: Map<string, ts.SourceFile>;
    builtFiles: Map<string, string>;
    tsBuildInfoFile?: string;
    tsBuildInfoFilePath?: string;
    errorMessages: string[];
    hasCompileError: boolean;
    rollupOptions?: RollupOptions;
}
