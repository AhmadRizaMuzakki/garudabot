const defaultsDeep = require('lodash.defaultsdeep');
const {defineMessages} = require('react-intl');

const {
    blockColors: darkModeBlockColors,
    extensions: darkModeExtensions
} = require('./dark');

const {
    blockColors: highContrastBlockColors,
    extensions: highContrastExtensions
} = require('./high-contrast');

const {blockColors: defaultColors} = require('./default');

const defaultIcon = require('./default/icon.svg');
const highContrastIcon = require('./high-contrast/icon.svg');

const DEFAULT_THEME = 'default';
const HIGH_CONTRAST_THEME = 'high-contrast';
const DARK_THEME = 'dark';

const mergeWithDefaults = colors => defaultsDeep({}, colors, defaultColors);

const messages = defineMessages({
    [DEFAULT_THEME]: {
        id: 'gui.theme.default',
        defaultMessage: 'Original',
        description: 'label for original theme'
    },
    [DARK_THEME]: {
        id: 'gui.theme.dark',
        defaultMessage: 'Dark',
        description: 'label for dark mode theme'
    },
    [HIGH_CONTRAST_THEME]: {
        id: 'gui.theme.highContrast',
        defaultMessage: 'High Contrast',
        description: 'label for high theme'
    }
});

const themeMap = {
    [DEFAULT_THEME]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: defaultColors,
        extensions: {},
        label: messages[DEFAULT_THEME],
        icon: defaultIcon
    },
    [DARK_THEME]: {
        blocksMediaFolder: 'blocks-media/default',
        colors: mergeWithDefaults(darkModeBlockColors),
        extensions: darkModeExtensions,
        label: messages[DARK_THEME]
    },
    [HIGH_CONTRAST_THEME]: {
        blocksMediaFolder: 'blocks-media/high-contrast',
        colors: mergeWithDefaults(highContrastBlockColors),
        extensions: highContrastExtensions,
        label: messages[HIGH_CONTRAST_THEME],
        icon: highContrastIcon
    }
};

const getColorsForTheme = theme => {
    const themeInfo = themeMap[theme];

    if (!themeInfo) {
        throw new Error(`Undefined theme ${theme}`);
    }

    return themeInfo.colors;
};

module.exports = {
    DEFAULT_THEME,
    DARK_THEME,
    HIGH_CONTRAST_THEME,
    defaultColors,
    getColorsForTheme,
    themeMap
};
