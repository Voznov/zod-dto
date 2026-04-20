import eslintPluginImportX from 'eslint-plugin-import-x';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import tsEslint from 'typescript-eslint';

export default [
  {
    ignores: ['eslint.config.{js,cjs,mjs}', '**/dist', '.git', '.gitignore', '**/node_modules', '**/*.md'],
  },
  eslintPluginImportX.flatConfigs.recommended,
  eslintPluginImportX.flatConfigs.typescript,
  eslintPluginPrettierRecommended,
  {
    files: ['**/*.{ts,cts,mts,js,mjs,cjs}'],
    languageOptions: {
      parser: tsEslint.parser,
      ecmaVersion: 'latest',
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.config.ts', 'packages/*/*.config.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint.plugin,
      prettier: eslintPluginPrettier,
    },
    rules: {
      ...tsEslint.configs.eslintRecommended.rules,
      ...tsEslint.configs.recommended.rules,
      ...eslintPluginPrettier.configs.rules,
      'prettier/prettier': [
        'warn',
        { singleQuote: true, trailingComma: 'all', printWidth: 180, tabWidth: 2, useTabs: false, endOfLine: 'lf' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-throw-literal': 'off',
      '@typescript-eslint/indent': 'off',
      '@typescript-eslint/no-namespace': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/promise-function-async': 'warn',
      '@typescript-eslint/consistent-type-exports': ['error', { fixMixedExportsWithInlineTypeSpecifier: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false }],
      'import-x/prefer-default-export': 'off',
      'import-x/first': 'warn',
      'import-x/no-mutable-exports': 'warn',
      'import-x/no-unresolved': 'error',
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/newline-after-import': ['error', { count: 1 }],
      'import-x/no-extraneous-dependencies': ['error', { peerDependencies: true, devDependencies: true, packageDir: ['./', './packages/core', './packages/nestjs'] }],
      'import-x/no-named-as-default-member': 'off',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'sibling', 'parent', 'index'],
          alphabetize: { order: 'asc' },
        },
      ],
      'sort-imports': ['error', { ignoreCase: true, ignoreDeclarationSort: true }],
      'object-curly-newline': 'off',
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-return-await': 'off',
      'no-underscore-dangle': 'off',
      'no-return-assign': 'error',
      'n/no-missing-import': 'off',
      'no-undef': 'off',
      'no-useless-escape': 'off',
      strict: 'off',
      'padding-line-between-statements': ['error', { blankLine: 'always', prev: '*', next: 'return' }],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'max-classes-per-file': 'off',
      'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],
      'prefer-const': ['error', { destructuring: 'all', ignoreReadBeforeAssign: true }],
      'no-fallthrough': 'error',
    },
  },
];
