const path = require('path');
const { EsbuildPlugin } = require('esbuild-loader');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: 'cheap-module-source-map',
    entry: {
        dist: './src/index.js'
    },
    output: {
        path: __dirname,
        library: 'AudioEngine',
        libraryTarget: 'commonjs2',
        filename: '[name].js'
    },
    module: {
        rules: [{
            test: /\.js$/,
            include: path.resolve(__dirname, 'src'),
            loader: 'esbuild-loader',
            options: {
                loader: 'js',
                target: 'es2015'
            }
        }]
    },
    optimization: {
        minimizer: [
            new EsbuildPlugin({
                target: 'es2015'
            })
        ]
    },
    externals: {
        'audio-context': true,
        'minilog': true,
        'startaudiocontext': true
    }
};
