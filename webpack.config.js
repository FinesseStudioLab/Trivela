const path = require('path');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].[contenthash].js',
    chunkFilename: '[name].[contenthash].chunk.js',
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // Vendor chunks (node_modules)
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
        },
        // Heavy libraries
        stellar: {
          test: /[\\/]node_modules[\\/]@stellar[\\/]/,
          name: 'stellar-sdk',
          priority: 20,
        },
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react-vendor',
          priority: 20,
        },
      },
    },
  },
  performance: {
    // Bundle size budget
    maxEntrypointSize: 400000, // 400 KB
    maxAssetSize: 300000, // 300 KB
    hints: 'error', // Fail build if exceeded
  },
  plugins: [
    // Analyze bundle composition
    process.env.ANALYZE && new BundleAnalyzerPlugin(),
  ].filter(Boolean),
};
