/**
 * These constants are copied from racero-blocks/core/constants.js
 * @TODO find a way to require() these straight from racero-blocks... maybe make a racero-blocks/dist/constants.js?
 * @readonly
 * @enum {int}
 */
const RaceroBlocksConstants = {
    /**
     * ENUM for output shape: hexagonal (booleans/predicates).
     * @const
     */
    OUTPUT_SHAPE_HEXAGONAL: 1,

    /**
     * ENUM for output shape: rounded (numbers).
     * @const
     */
    OUTPUT_SHAPE_ROUND: 2,

    /**
     * ENUM for output shape: squared (any/all values; strings).
     * @const
     */
    OUTPUT_SHAPE_SQUARE: 3
};

module.exports = RaceroBlocksConstants;
