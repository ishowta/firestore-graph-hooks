module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^lodash-es$': 'lodash',
  },
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
};
