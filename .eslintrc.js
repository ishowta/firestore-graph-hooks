module.exports = {
  extends: [
    'I:\\project\\firestore-graph-hooks\\node_modules\\dts-cli\\conf\\eslint-config-react-app\\index.js',
    'prettier',
    'plugin:prettier/recommended',
  ],
  rules: {
    'array-callback-return': 'off', // false positive
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
};
