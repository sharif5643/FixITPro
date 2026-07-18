import type { Config } from 'jest';

const TEST_DB_URL =
  'postgresql://postgres:123456@localhost:5432/fixitpro_test';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
  moduleNameMapper: { '^src/(.*)$': '<rootDir>/src/$1' },
  globalSetup:    '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',

  globals: {
    'ts-jest': { tsconfig: '<rootDir>/tsconfig.json' },
  },
  testTimeout: 30000,
};

export default config;
