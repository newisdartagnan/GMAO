import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/**
 * Règles de l'interface.
 *
 * Le jeu retenu est celui qui attrape des fautes, pas celui qui impose un
 * style : les règles de mise en forme sont laissées à l'éditeur. Les deux
 * plugins React sont là pour ce que le compilateur ne voit pas — un tableau
 * de dépendances incomplet dans un `useEffect` produit un écran figé qui ne
 * se remarque qu'à l'usage.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Un paramètre préfixé d'un souligné est intentionnellement ignoré.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
