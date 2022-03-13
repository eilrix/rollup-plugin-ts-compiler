import { isAbsolute, resolve } from 'path';
import colorsdef from 'colors/safe';
import normalizePathLib from 'normalize-path';

const colors: any = colorsdef;

export const pluginName = 'rollup-plugin-ts-compiler';

// Appears if condition below wasn't met.
const disclaimerWarning = `(!) Warning: ${pluginName} : Implementation of this plugin only works when it placed 
as first item in plugin array of Rollup options. It can be okay for non-typescript files
but if other plugins will try to modify .(ts|tsx|js|jsx) files before this plugin, their modifications won't
be applied. This plugin reads files directly from file system, ignoring Rollup's preceding pipeline.
That is usually acceptable since you need only one plugin to compile .ts files and you can't have other plugins
working with typescript code.
`;
let hasWarned = false;

export const warnDisclaimer = () => {
    if (!hasWarned) {
        hasWarned = true;
        console.log(colors.brightYellow(disclaimerWarning));
    }
}

export const normalizePath = (fileName: string) => normalizePathLib(!isAbsolute(fileName) ? resolve(process.cwd(), fileName) : fileName);

export const isExternalForm = id => !id.startsWith('\0') && !id.startsWith('.') && !id.startsWith('/') && !isAbsolute(id) && !id.startsWith('$$')
    || normalizePath(id).includes('/node_modules/') || normalizePath(id).startsWith('node_modules/');