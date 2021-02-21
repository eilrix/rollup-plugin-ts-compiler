import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    preset: 'ts-jest',
    testEnvironment: "node",
    moduleNameMapper: {
        '@App/(.*)': '<rootDir>/src/$1',
    },
    testRegex: "/(tests|src)/.*\\.(test|spec)\\.[jt]sx?$",
    transform: {
        "^.+\\.ts$": "ts-jest"
    },
    moduleFileExtensions: ["ts", "js", "json", "node"],
};

export default config;
