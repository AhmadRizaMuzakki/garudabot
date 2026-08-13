const CopyWebpackPlugin = require('copy-webpack-plugin');
const defaultsDeep = require('lodash.defaultsdeep');
const path = require('path');
const { EsbuildPlugin } = require('esbuild-loader');

const base = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: 'cheap-module-source-map',
    output: {
        library: 'VirtualMachine',
        libraryTarget: 'umd',
        filename: '[name].js'
    },
    resolve: {
        // --- FIX: Tell Webpack to ignore native Node modules when compiling for browsers ---
        fallback: {
            "fs": false,
            "path": false,
            "crypto": false
        }
    },
    module: {
        rules: [{
            test: /\.js$/,
            loader: 'esbuild-loader',
            include: path.resolve(__dirname, 'src'),
            options: {
                loader: 'js',
                target: 'es2015'
            }
        },
        {
            test: /\.mp3$/,
            loader: 'file-loader'
        }]
    },
    optimization: {
        minimizer: [
            new EsbuildPlugin({
                target: 'es2015'
            }
        )]
    },
    plugins: []
};

module.exports = [
    // Web-compatible
    defaultsDeep({}, base, {
        target: 'web',
        entry: {
            'racero-vm': './src/index.js',
            'racero-vm.min': './src/index.js'
        },
        output: {
            path: path.resolve('dist', 'web')
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: require.resolve('./src/index.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'VirtualMachine'
                    }
                }
            ])
        }
    }),
    // Node-compatible
    defaultsDeep({}, base, {
        target: 'node',
        entry: {
            'racero-vm': './src/index.js'
        },
        output: {
            path: path.resolve('dist', 'node')
        },
        externals: {
            'decode-html': true,
            'format-message': true,
            'htmlparser2': true,
            'immutable': true,
            'jszip': true,
            'minilog': true,
            'scratch-parser': true,
            'socket.io-client': true,
            'text-encoding': true
        }
    }),
    // Playground
    defaultsDeep({}, base, {
        target: 'web',
        devServer: {
            contentBase: false,
            host: '0.0.0.0',
            port: process.env.PORT || 8073
        },
        entry: {
            'benchmark': './src/playground/benchmark',
            'video-sensing-extension-debug': './src/extensions/scratch3_video_sensing/debug'
        },
        output: {
            path: path.resolve(__dirname, 'playground'),
            filename: '[name].js'
        },
        module: {
            rules: base.module.rules.concat([
                {
                    test: require.resolve('./src/index.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'VirtualMachine'
                    }
                },
                {
                    test: require.resolve('./src/extensions/scratch3_video_sensing/debug.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'Racero3VideoSensingDebug'
                    }
                },
                {
                    test: require.resolve('stats.js/build/stats.min.js'),
                    loader: 'script-loader'
                },
                {
                    test: require.resolve('racero-blocks/dist/vertical.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'Blockly'
                    }
                },
                {
                    test: require.resolve('racero-audio/src/index.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'AudioEngine'
                    }
                },
                {
                    test: require.resolve('scratch-storage/src/index.js'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'RaceroStorage'
                    }
                },
                {
                    test: require.resolve('scratch-render'),
                    loader: 'expose-loader',
                    options: {
                        exposes: 'RaceroRender'
                    }
                }
            ])
        },
        performance: {
            hints: false
        },
        plugins: base.plugins.concat([
            new CopyWebpackPlugin([{
                from: 'node_modules/racero-blocks/media',
                to: 'media'
            }, {
                from: 'node_modules/scratch-storage/dist/web'
            }, {
                from: 'node_modules/scratch-render/dist/web'
            }, {
                from: 'node_modules/scratch-svg-renderer/dist/web'
            }, {
                from: 'src/playground'
            }])
        ])
    })
];
