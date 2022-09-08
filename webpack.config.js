import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import webpack from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import TerserPlugin from 'terser-webpack-plugin';
import ZipPlugin from 'zip-webpack-plugin';
import chromeManifest from './src/manifest.chrome.json' assert { type: 'json' };
import firefoxManifest from './src/manifest.firefox.json' assert { type: 'json' };

const __DEV__ = process.env.NODE_ENV !== 'production';
const mode = __DEV__ ? 'development' : 'production';

const buildTarget = String(process.env.BUILD_TARGET || 'chrome').toLowerCase();
const buildDate = Date.now();

// __dirname is not available in ESModules lmao
if (typeof __dirname !== 'string') {
  global.__dirname = path.dirname(fileURLToPath(import.meta.url));
}

const env = Object.entries({
  ...dotenv.config({ path: path.join(__dirname, '.env') }).parsed,
  NODE_ENV: mode,
  BUILD_TARGET: buildTarget,
  BUILD_DATE: buildDate,
  PACKAGE_NAME: process.env.npm_package_name,
  PACKAGE_VERSION: process.env.npm_package_version,
  PACKAGE_URL: process.env.npm_package_homepage,
}).reduce((prev, [key, value]) => {
  if (key) {
    prev[`process.env.${key}`] = JSON.stringify(value || '');
  }

  return prev;
}, {
  __DEV__,
});

const entry = {
  main: path.join(__dirname, 'src/main.ts'),
  content: path.join(__dirname, 'src/content.ts'),
  background: path.join(__dirname, 'src/background.ts'),
  // devtools: path.join(__dirname, 'src/devtools.js'),
  // panel: path.join(__dirname, 'src/panel.js'),
};

const output = {
  path: path.join(__dirname, __DEV__ ? 'build' : 'dist', buildTarget),
  filename: '[name].js',
  clean: true, // clean output.path dir before emitting files
  publicPath: '/',
};

const moduleRules = [{
  test: /\.s?css$/i,
  use: [
    'style-loader',
    {
      loader: 'css-loader',
      options: {
        sourceMap: true,
        modules: {
          auto: true, // only files ending in .module.s?css will be treated as CSS modules
          localIdentName: '[name]-[local]--[hash:base64:5]', // e.g., 'Caldex-module-content--mvN2w'
        },
      },
    },
    {
      loader: 'postcss-loader',
      options: {
        sourceMap: true,
        postcssOptions: {
          // autoprefixer so we don't ever need to specify CSS prefixes like `-moz-` and `-webkit-`
          path: path.join(__dirname, 'postcss.config.cjs'),
        },
      },
    },
    {
      loader: 'sass-loader',
      options: {
        sourceMap: true,
        sassOptions: {
          // allows for `@use 'mixins/flex';` instead of `@use '../../../styles/mixins/flex';`
          includePaths: [path.join(__dirname, 'src/styles')],
        },
      },
    },
  ],
}, {
  test: /\.(?:jpe?g|jpf|png|gifv?|webp|svg|eot|otf|ttf|woff2?)$/i,
  loader: 'file-loader',
  options: { name: '[name].[ext]' },
  exclude: /node_modules/,
}, {
  test: /\.html$/i,
  loader: 'html-loader',
  exclude: /node_modules/,
}, {
  test: /\.(?:jsx?|tsx?)$/i,
  use: [
    'babel-loader',
    'source-map-loader',
  ],
  exclude: /node_modules/,
}];

const resolve = {
  alias: {
    // 'react-dom': '@hot-loader/react-dom',
    '@showdex': path.join(__dirname, 'src'),
  },

  extensions: [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.json',
  ],
};

const copyPatterns = [{
  // replace version and description in manifest.json w/ those of package.json
  from: `src/manifest.${buildTarget}.json`,
  to: 'manifest.json',

  // transform: (content) => Buffer.from(JSON.stringify({
  //   ...JSON.parse(content.toString()),
  //   version: process.env.npm_package_version,
  //   description: process.env.npm_package_description,
  //   ...(process.env.BUILD_TARGET === 'firefox' ? {
  //     background: {
  //     }
  //   } : null),
  // })),

  transform: (content) => {
    const parsed = JSON.parse(content.toString());

    parsed.version = process.env.npm_package_version;
    parsed.description = process.env.npm_package_description;
    parsed.author = process.env.npm_package_author;
    parsed.homepage_url = process.env.npm_package_homepage;

    // switch (String(process.env.BUILD_TARGET).toLowerCase()) {
    //   // case 'chrome': {
    //   //   delete parsed.browser_specific_settings;
    //   //
    //   //   break;
    //   // }
    //
    //   case 'firefox': {
    //     break;
    //   }
    //
    //   default: {
    //     break;
    //   }
    // }

    return Buffer.from(JSON.stringify(parsed));
  },
}, {
  from: 'src/assets/**/*',
  to: '[name][ext]',
  // filter: (path) => moduleRules[1].test.test(path),
  filter: (path) => moduleRules[1].test.test(path) && [
    ...(buildTarget !== 'firefox' ? chromeManifest.web_accessible_resources.flatMap((r) => r.resources) : []),
    ...(buildTarget === 'firefox' ? firefoxManifest.web_accessible_resources : []),
    ...Object.values((buildTarget === 'firefox' ? firefoxManifest : chromeManifest).icons),
  ].some((name) => path.includes(name)),
}];

const plugins = [
  new webpack.ProgressPlugin(),
  new webpack.DefinePlugin(env),
  new CopyWebpackPlugin({ patterns: copyPatterns }),
];

if (!__DEV__ || buildTarget === 'firefox') {
  const ext = buildTarget === 'firefox' ? 'xpi' : 'zip';

  plugins.push(new ZipPlugin({
    // spit out the file in either `build` or `dist`
    path: '..',

    // extension will be appended to the end of the filename
    filename: [
      process.env.npm_package_name,
      !!process.env.npm_package_version && `-v${process.env.npm_package_version}`,
      !!buildDate && `-b${buildDate}`,
      __DEV__ ? '-dev' : '',
      `.${buildTarget}`,
    ].filter(Boolean).join(''),

    extension: ext,
  }));
}

export const config = {
  mode,
  entry,
  output,
  module: { rules: moduleRules },
  resolve,
  plugins,

  // chromeExtension: {
  //   hmrExclude: [
  //     'content',
  //     'background',
  //     // 'devtools',
  //   ],
  // },
};

if (__DEV__) {
  config.devtool = 'cheap-module-source-map';
} else {
  config.optimization = {
    minimize: true,
    minimizer: [new TerserPlugin({ extractComments: true })],
  };
}

export default config;
