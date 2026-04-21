/* eslint-disable import/no-commonjs */
module.exports = {
	root: true,
	ignorePatterns: ['dist/**', 'coverage/**', 'node_modules/**', '**/*.spec.ts', '**/__tests__/**'],
	extends: [
		'airbnb-base',
		'plugin:import/typescript',
		'plugin:@typescript-eslint/recommended',
		'prettier',
	],
	parser: '@typescript-eslint/parser',
	parserOptions: {
		project: './tsconfig.json',
		tsconfigRootDir: __dirname,
		ecmaVersion: 2022,
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint'],
	env: {
		node: true,
		es2022: true,
	},
	settings: {
		'import/resolver': {
			typescript: {
				alwaysTryTypes: true,
				project: './tsconfig.json',
			},
		},
		'import/parsers': {
			'@typescript-eslint/parser': ['.ts'],
		},
	},
	rules: {
		'import/extensions': ['error', 'ignorePackages', { js: 'never', ts: 'never' }],
		'@typescript-eslint/explicit-function-return-type': 2,
		'import/prefer-default-export': 'off',
		'class-methods-use-this': 0,
		'no-underscore-dangle': 0,
		'no-useless-constructor': 0,
		'no-empty-function': 'off',
		'@typescript-eslint/no-empty-function': 0,
		'no-shadow': 'off',
		'@typescript-eslint/no-shadow': ['error'],
		'lines-between-class-members': 0,
		'consistent-return': 0,
		'no-restricted-syntax': 0,
		'@typescript-eslint/no-unused-vars': [
			'error',
			{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
		],
		'@typescript-eslint/no-explicit-any': 'warn',
		'@typescript-eslint/explicit-member-accessibility': [
			'error',
			{ overrides: { parameterProperties: 'off', constructors: 'off' } },
		],
		'max-lines-per-function': ['error', { max: 60, skipComments: true, skipBlankLines: true }],
		complexity: ['error', 10],
		'no-console': 'error',
		'max-len': ['error', 120],
		eqeqeq: 'warn',
	},
	overrides: [
		{
			files: ['**/*.spec.ts', '**/__tests__/**'],
			rules: {
				'func-names': 'off',
				'max-lines-per-function': 'off',
				'import/no-extraneous-dependencies': 'off',
			},
		},
		{
			// Prose content — long paragraphs in template literals shouldn't be broken
			// to fit the code width. The file is mostly exported strings for LLM context.
			files: ['src/instructions.ts'],
			rules: {
				'max-len': 'off',
			},
		},
	],
};
