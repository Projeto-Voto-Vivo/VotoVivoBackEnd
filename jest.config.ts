module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts', '**/*.test.ts', '**/*.spec.ts'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  // O padrao de 5s e curto demais para os specs que dao `jest.resetModules()` e
  // recarregam `src/app.ts`: o require a frio recompila todo o grafo (rotas +
  // PrismaClient) sob ts-jest e passava de 5s de forma intermitente. O limite
  // aqui e para compilacao, nao para logica — nenhum teste depende de espera.
  testTimeout: 30000,
};
