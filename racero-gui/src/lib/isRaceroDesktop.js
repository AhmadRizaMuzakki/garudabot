/**
 * Internal stored state. Not valid until after at least one call to `setIsRaceroDesktop()`.
 * @type {boolean}
 */
let _isRaceroDesktop; // undefined = not ready yet

/**
 * Tell the `isRaceroDesktop()` whether or not the GUI is running under Racero Desktop.
 * @param {boolean} value - the new value which `isRaceroDesktop()` should return in the future.
 */
const setIsRaceroDesktop = function (value) {
    _isRaceroDesktop = value;
};

/**
 * @returns {boolean} - true if it seems like the GUI is running under Racero Desktop; false otherwise.
 * If `setIsRaceroDesktop()` has not yet been called, this can return `undefined`.
 */
const isRaceroDesktop = function () {
    return _isRaceroDesktop;
};

/**
 * @returns {boolean} - false if it seems like the GUI is running under Racero Desktop; true otherwise.
 */
const notRaceroDesktop = function () {
    return !isRaceroDesktop();
};

export default isRaceroDesktop;
export {
    isRaceroDesktop,
    notRaceroDesktop,
    setIsRaceroDesktop
};
