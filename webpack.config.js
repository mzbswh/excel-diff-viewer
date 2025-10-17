const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = async (_env, argv) => {
  const isDevelopment = argv.mode === "development" || !argv.mode;
  const devtool = isDevelopment ? { devtool: "inline-source-map" } : {};
  const sourceMapsLoader = isDevelopment
    ? [
        {
          test: /\.js$/,
          enforce: "pre",
          use: ["source-map-loader"],
        },
      ]
    : [];

  // 通用配置
  const commonConfig = {
    mode: isDevelopment ? "development" : "production",
    ...devtool,
    performance: {
      maxEntrypointSize: 1024 * 1024 * 2,
      maxAssetSize: 1024 * 1024 * 2,
    },
    ignoreWarnings: [/Failed to parse source map/],
    cache: isDevelopment ? {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
    } : false,
    module: {
      rules: [
        ...sourceMapsLoader,
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: "ts-loader",
              options: {
                compilerOptions: {
                  sourceMap: isDevelopment,
                },
                transpileOnly: isDevelopment,
              },
            },
          ],
        },
      ],
    },
  };

  return [
    // Extension 配置 (Node.js 环境)
    {
      ...commonConfig,
      target: "node",
      entry: "./src/extension/index.ts",
      output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "extension.js",
        libraryTarget: "commonjs2",
      },
      externals: {
        vscode: "commonjs vscode",
      },
      optimization: {
        splitChunks: false,
        runtimeChunk: false,
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js", ".jsx"],
        modules: [path.resolve("./node_modules"), path.resolve("./src")],
      },
    },
    // Webview 配置 (浏览器环境)
    {
      ...commonConfig,
      target: "web",
      entry: "./src/webview/index.ts",
      output: {
        path: path.resolve(__dirname, "./dist"),
        filename: "webview.js",
        chunkFilename: "[name].chunk.js",
        libraryTarget: "umd",
        globalObject: "this",
        publicPath: "",
      },
      optimization: {
        // 生产环境：禁用代码分割，将所有代码打包到一个文件中
        // 开发环境：保持异步分割以提升开发体验
        splitChunks: isDevelopment ? {
          chunks: 'async',
          minSize: 20000,
          cacheGroups: {
            defaultVendors: false,
            default: {
              minChunks: 2,
              priority: -20,
              reuseExistingChunk: true,
            },
          },
        } : false, // 生产环境禁用代码分割，所有代码打包到一个文件
        runtimeChunk: false,
        minimize: !isDevelopment, // 生产环境启用压缩
        minimizer: isDevelopment ? [] : [
          // JS 压缩
          new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: false, // 保留 console（扩展需要日志）
                drop_debugger: true,
                pure_funcs: [], // 可以指定要删除的函数，如 ['console.log']
              },
              format: {
                comments: false, // 移除注释
              },
            },
            extractComments: false, // 不提取注释到单独文件
          }),
          // CSS 压缩
          new CssMinimizerPlugin({
            minimizerOptions: {
              preset: [
                'default',
                {
                  discardComments: { removeAll: true }, // 移除所有注释
                  normalizeWhitespace: true, // 规范化空格
                  colormin: true, // 压缩颜色值
                  minifyFontValues: true, // 压缩字体值
                  minifyGradients: true, // 压缩渐变
                },
              ],
            },
          }),
        ],
        concatenateModules: !isDevelopment, // 启用模块串联（scope hoisting）
        usedExports: !isDevelopment, // Tree shaking
        sideEffects: !isDevelopment, // 标记无副作用的模块
      },
      plugins: [
        new MiniCssExtractPlugin({
          filename: "webview.css",
        }),
      ],
      module: {
        rules: [
          ...commonConfig.module.rules,
          {
            test: /\.css$/,
            use: [
              MiniCssExtractPlugin.loader, 
              {
                loader: "css-loader",
                options: {
                  // 生产环境压缩 CSS
                  sourceMap: isDevelopment,
                }
              }
            ],
          },
        ],
      },
      resolve: {
        extensions: [".tsx", ".ts", ".js", ".jsx"],
        modules: [path.resolve("./node_modules"), path.resolve("./src")],
        fallback: {
          path: require.resolve("path-browserify"),
          fs: false,
        },
      },
    },
  ];
};
