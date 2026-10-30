export default {
  ignoreFiles: ['node_modules/**', '.wxt/**', '.output/**', '.browser-test/**', 'coverage/**'],
  overrides: [{ files: ['**/*.vue'], customSyntax: 'postcss-html' }],
  rules: {
    'at-rule-no-unknown': [true, { ignoreAtRules: ['theme'] }],
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-properties': [
      true,
      { ignore: ['consecutive-duplicates-with-different-syntaxes'] },
    ],
    'declaration-block-no-shorthand-property-overrides': true,
    'property-no-unknown': true,
    'selector-pseudo-class-no-unknown': [
      true,
      { ignorePseudoClasses: ['deep', 'global', 'slotted'] },
    ],
    'selector-pseudo-element-no-unknown': true,
    'string-no-newline': true,
    'unit-no-unknown': true,
  },
};
