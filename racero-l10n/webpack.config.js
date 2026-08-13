const path = require('path');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: 'cheap-module-source-map',
    module: {
        rules: [{
            test: /\.js$/,
            include: path.resolve(__dirname, 'src'),
            use: {
                loader: 'esbuild-loader',
                options: {
                    loader: 'js',
                    target: 'es2015'
                }
            }
        }]
    },
    entry: {
        l10n: './src/index.js',
        supportedLocales: './src/supported-locales.js',
        localeData: './src/locale-data.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs2'
    }
};
