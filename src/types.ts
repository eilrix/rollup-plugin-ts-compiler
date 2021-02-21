import { RollupOptions } from 'rollup';
import ts from 'typescript';

export type State = {
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
