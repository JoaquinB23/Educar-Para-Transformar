module.exports = {
  clearMocks: true,
  collectCoverageFrom: ['API_Server.js', 'middleware/**/*.js', '!**/node_modules/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
};
