/**
 * @license
 * Visual Blocks Editor
 *
 * Copyright 2018 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Racero Messages singleton, with function to override Blockly.Msg values.
 * @author chrisg@media.mit.edu (Chris Garrity)
 */
'use strict';

/**
 * Name space for the RaceroMsgs singleton.
 * Msg gets populated in the message files.
 */
goog.provide('Blockly.RaceroMsgs');

goog.require('Blockly.Msg');


/**
 * The object containing messages for all locales - loaded from msg/scratch_msgs.
 * @type {Object}
 */
Blockly.RaceroMsgs.locales = {};

/**
 * The current locale.
 * @type {String}
 * @private
 */
Blockly.RaceroMsgs.currentLocale_ = 'en';

/**
 * Change the Blockly.Msg strings to a new Locale
 * Does not exist in Blockly, but needed in racero-blocks
 * @param {string} locale E.g., 'de', or 'zh-tw'
 * @package
 */
Blockly.RaceroMsgs.setLocale = function(locale) {
  if (Object.keys(Blockly.RaceroMsgs.locales).includes(locale)) {
    Blockly.RaceroMsgs.currentLocale_ = locale;
    Blockly.Msg = Object.assign({}, Blockly.Msg, Blockly.RaceroMsgs.locales[locale]);
  } else {
    // keep current locale
    console.warn('Ignoring unrecognized locale: ' + locale);
  }
};

/**
 * Gets a localized message, for use in the Racero VM with json init.
 * Does not interpolate placeholders. Provided to allow default values in
 * dynamic menus, for example, 'next backdrop', or 'random position'
 * @param {string} msgId id for the message, key in Msg table.
 * @param {string} defaultMsg string to use if the id isn't found.
 * @param {string} useLocale optional locale to use in place of currentLocale_.
 * @return {string} message with placeholders filled.
 * @package
 */
Blockly.RaceroMsgs.translate = function(msgId, defaultMsg, useLocale) {
  var locale = useLocale || Blockly.RaceroMsgs.currentLocale_;

  if (Object.keys(Blockly.RaceroMsgs.locales).includes(locale)) {
    var messages = Blockly.RaceroMsgs.locales[locale];
    if (Object.keys(messages).includes(msgId)) {
      return messages[msgId];
    }
  }
  return defaultMsg;
};
