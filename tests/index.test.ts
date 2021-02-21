import { join, resolve } from 'path';
//@ts-ignore
import typescript from '@App/index';
import fs from 'fs-extra';
import { OutputBundle, OutputOptions, Plugin, RollupOptions, rollup } from 'rollup';

const tsconfig = `
{
    "compilerOptions": {
        "module": "commonjs",
        "target": "ES2019",
        "rootDir": "./",
        "baseUrl": ".",
        "esModuleInterop": true,
        "incremental": false,
    },
    "include": [
        "src/**/*.ts",
    ],
}`;

const baseTestDirName = '.test';
const baseTestDir = resolve(process.cwd(), baseTestDirName);

describe('rollup plugin', () => {

    it("makes rollup bundle", async () => {
        const testDirName = 'test1';
        const fileName = 'src/test.ts';

        const testDir = resolve(baseTestDir, testDirName);
        const inputPath = join(testDir, fileName);
        const outPath = join(testDir, 'build/index.js');

        const spy = jest.spyOn(process, 'cwd');
        spy.mockReturnValue(testDir);

        await fs.outputFile(inputPath, `export const num: number = 1;`)
        await fs.outputFile(join(testDir, 'tsconfig.json'), tsconfig)
        await fs.outputFile(join(testDir, 'package.json'), `{ "name": "test" }`)

        const rollupOptions: RollupOptions = {
            input: inputPath,
            plugins: [
                typescript({
                    compilerOptions: {
                        rootDir: testDir
                    }
                })
            ],
            output: {
                file: outPath
            }
        }

        const bundle = await rollup(rollupOptions);
        await bundle.write(rollupOptions.output as OutputOptions);

        expect(fs.pathExistsSync(outPath)).toBeTruthy();
    });


    it("fails to compile", async () => {

        const testDirName = 'test2';
        const fileName = 'src/test.ts';

        const testDir = resolve(baseTestDir, testDirName);
        const inputPath = join(testDir, fileName);
        const outPath = join(testDir, 'build/index.js');

        const spy = jest.spyOn(process, 'cwd');
        spy.mockReturnValue(testDir);

        await fs.outputFile(inputPath, `export const num: UnexpectedType = 1;`)
        await fs.outputFile(join(testDir, 'tsconfig.json'), tsconfig)
        await fs.outputFile(join(testDir, 'package.json'), `{ "name": "test" }`)

        const rollupOptions: RollupOptions = {
            input: inputPath,
            plugins: [
                typescript({
                    compilerOptions: {
                        rootDir: testDir
                    }
                })
            ],
            output: {
                file: outPath
            }
        }

        const consoleErrorSpy = jest.spyOn(console, 'error')
        consoleErrorSpy.mockImplementation(() => { });

        try {
            const bundle = await rollup(rollupOptions);
            await bundle.write(rollupOptions.output as OutputOptions);
        } catch (e) { }

        expect(!fs.pathExistsSync(outPath)).toBeTruthy();

        consoleErrorSpy.mockRestore();
    });


    afterAll(async () => {
        await fs.remove(baseTestDir);
    });

})