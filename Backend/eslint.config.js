// eslint.config.js
// Migrado del viejo .eslintrc.js (formato legacy) al flat config que
// requiere eslint@9+. Mismo comportamiento que antes: reglas recomendadas
// de @typescript-eslint + integración con Prettier, con las mismas 4
// reglas relajadas que ya estaban desactivadas.
const tseslintPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const prettierRecommended = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      sourceType: 'module',
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslintPlugin,
    },
    rules: {
      ...tseslintPlugin.configs.recommended.rules,
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // permite `const { campoAExcluir, ...resto } = dto` sin marcar
      // campoAExcluir como no usado — es exactamente para eso que se
      // desestructura (patrón usado en UsersService.updateUser)
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  prettierRecommended,
];
