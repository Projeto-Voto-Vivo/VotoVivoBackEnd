module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts', '**/*.test.ts', '**/*.spec.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
};
