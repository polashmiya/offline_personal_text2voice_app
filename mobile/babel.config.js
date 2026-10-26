module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // zod v4 uses `export * as ns from`, which Metro's preset does not transform.
  plugins: ['@babel/plugin-transform-export-namespace-from'],
};
