const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const { EsbuildPlugin } = require('esbuild-loader');

const autoprefixer = require('autoprefixer');
const postcssSimpleVars = require('postcss-simple-vars'); // Renamed for clarity
const postcssImport = require('postcss-import');

const STATIC_PATH = process.env.STATIC_PATH || '/static';

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: 'cheap-module-source-map',
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        port: process.env.PORT || 8601
    },
    output: {
        library: 'GUI',
        filename: '[name].js',
        chunkFilename: 'chunks/[name].js'
    },
    resolve: {
        symlinks: false,
    },
	node: {
        fs: 'empty',
        path: false,
        child_process: 'empty'
    },
    module: {
        rules: [{
            test: /\.jsx?$/,
            loader: 'esbuild-loader',
            include: [
                path.resolve(__dirname, 'src'),
                /node_modules[\\/](scratch|racero)-[^\\/]+[\\/]src/,
                /node_modules[\\/]pify/,
                /node_modules[\\/]@vernier[\\/]godirect/
            ],
            options: {
                loader: 'jsx',
                target: 'es2015'
            }
        },
        {
            test: /\.css$/,
            use: [{
                loader: 'style-loader'
            }, {
                loader: 'css-loader',
                options: {
                    modules: {
                        localIdentName: '[name]_[local]_[hash:base64:5]'
                    },
                    importLoaders: 1,
                    localsConvention: 'camelCase'
                }
            }, {
                loader: 'postcss-loader',
                options: {
                    ident: 'postcss',
                    plugins: function () {
                        return [
                            postcssImport({
                                path: [path.resolve(__dirname, 'src/css')]
                            }),
                            postcssSimpleVars({
                                variables: function () {
                                    const theme = require(path.resolve(__dirname, 'src/lib/themes/default/index.js'));
                                    const variables = theme.default || theme;

                                    const processedVars = {};
                                    Object.keys(variables).forEach(key => {
                                        const kebabKey = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
                                        processedVars[kebabKey] = variables[key];
                                    });

                                    return processedVars;
                                }
                            }),
                            autoprefixer
                        ];
                    }
                }
            }]
        },
        {
            test: /\.hex$/,
            use: [{
                loader: 'url-loader',
                options: {
                    limit: 16 * 1024
                }
            }]
        }]
    },
    optimization: {
        minimizer: [
            new EsbuildPlugin({
                target: 'es2015',
                css: true // Keep CSS minification fast and safe
            })
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'node_modules/racero-blocks/media',
                    to: 'static/blocks-media/default'
                },
                {
                    from: 'node_modules/racero-blocks/media',
                    to: 'static/blocks-media/high-contrast'
                },
                {
                    from: 'src/lib/themes/high-contrast/blocks-media',
                    to: 'static/blocks-media/high-contrast',
                    force: true
                }
            ]
        }),
    ]
};

if (!process.env.CI) {
    base.plugins.push(new webpack.ProgressPlugin());
}

module.exports = [
    defaultsDeep({}, base, {
        entry: {
            'lib.min': ['react', 'react-dom'],
            'gui': './src/playground/index.jsx',
            'blocksonly': './src/playground/blocks-only.jsx',
            'compatibilitytesting': './src/playground/compatibility-testing.jsx',
            'player': './src/playground/player.jsx'
        },
        output: {
            path: path.resolve(__dirname, 'build'),
            filename: '[name].js'
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: /\.(svg|png|wav|mp3|gif|jpg)$/,
                    loader: 'url-loader',
                    options: {
                        limit: 2048,
                        outputPath: 'static/assets/'
                    }
                }
            ])
        },
        optimization: {
            splitChunks: {
                chunks: 'all',
                name: 'lib.min'
            },
            runtimeChunk: {
                name: 'lib.min'
            }
        },
        plugins: base.plugins.concat([
            new webpack.DefinePlugin({
                'process.env.NODE_ENV': `"${process.env.NODE_ENV}"`,
                'process.env.DEBUG': Boolean(process.env.DEBUG),
                'process.env.GA_ID': `"${process.env.GA_ID || 'UA-000000-01'}"`
            }),
            new HtmlWebpackPlugin({
                chunks: ['lib.min', 'gui'],
                template: 'src/playground/index.ejs',
                title: 'Racer Racero'
            }),
            new HtmlWebpackPlugin({
                chunks: ['lib.min', 'blocksonly'],
                template: 'src/playground/index.ejs',
                filename: 'blocks-only.html',
                title: 'Racer Racero: Blocks Only Example'
            }),
            new HtmlWebpackPlugin({
                chunks: ['lib.min', 'compatibilitytesting'],
                template: 'src/playground/index.ejs',
                filename: 'compatibility-testing.html',
                title: 'Racer Racero: Compatibility Testing'
            }),
            new HtmlWebpackPlugin({
                chunks: ['lib.min', 'player'],
                template: 'src/playground/index.ejs',
                filename: 'player.html',
                title: 'Racer Racero: Player Example'
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        to: 'static'
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extensions/**',
                        to: 'static',
                        context: 'src/examples'
                    }
                ]
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'extension-worker.{js,js.map}',
                        context: 'node_modules/racero-vm/dist/web',
                        noErrorOnMissing: true
                    }
                ]
            })
        ])
    })
].concat(
    process.env.NODE_ENV === 'production' || process.env.BUILD_MODE === 'dist' ? (
        defaultsDeep({}, base, {
            target: 'web',
            entry: {
                'racero-gui': './src/index.js'
            },
            output: {
                libraryTarget: 'umd',
                path: path.resolve('dist'),
                publicPath: `${STATIC_PATH}/`
            },
            externals: {
                'react': 'react',
                'react-dom': 'react-dom'
            },
            module: {
                rules: base.module.rules.concat([
                    {
                        test: /\.(svg|png|wav|mp3|gif|jpg)$/,
                        loader: 'url-loader',
                        options: {
                            limit: 2048,
                            outputPath: 'static/assets/',
                            publicPath: `${STATIC_PATH}/assets/`
                        }
                    }
                ])
            },
            plugins: base.plugins.concat([
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'extension-worker.{js,js.map}',
                            context: 'node_modules/racero-vm/dist/web',
                            noErrorOnMissing: true
                        }
                    ]
                }),
                new CopyWebpackPlugin({
                    patterns: [
                        {
                            from: 'src/lib/libraries/*.json',
                            to: 'libraries',
                            flatten: true
                        }
                    ]
                })
            ])
        })) : []
);
