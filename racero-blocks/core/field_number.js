/**
 * @fileoverview Number field with optional range slider (min/max).
 * When both min and max are set, editing shows "Range a - b" + slider
 * like MakeCode / educational Scratch forks.
 */
'use strict';

goog.provide('Blockly.FieldNumber');

goog.require('Blockly.DropDownDiv');
goog.require('Blockly.FieldTextInput');
goog.require('Blockly.Touch');
goog.require('goog.math');
goog.require('goog.userAgent');

/**
 * Class for an editable number field.
 * @param {(string|number)=} opt_value The initial content of the field.
 * @param {(string|number)=} opt_min Minimum value.
 * @param {(string|number)=} opt_max Maximum value.
 * @param {(string|number)=} opt_precision Precision for value.
 * @param {Function=} opt_validator Optional validator.
 * @extends {Blockly.FieldTextInput}
 * @constructor
 */
Blockly.FieldNumber = function(opt_value, opt_min, opt_max, opt_precision,
    opt_validator) {
  var numRestrictor = this.getNumRestrictor(opt_min, opt_max, opt_precision);
  opt_value = (opt_value && !isNaN(opt_value)) ? String(opt_value) : '0';
  Blockly.FieldNumber.superClass_.constructor.call(
      this, opt_value, opt_validator, numRestrictor);
  this.addArgType('number');

  // Keep for slider + clamping (Scratch originally only used these for restrictor).
  this.min_ = (typeof opt_min === 'number' || (typeof opt_min === 'string' && opt_min !== '')) ?
      Number(opt_min) : -Infinity;
  this.max_ = (typeof opt_max === 'number' || (typeof opt_max === 'string' && opt_max !== '')) ?
      Number(opt_max) : Infinity;
  this.precision_ = (typeof opt_precision === 'number' ||
      (typeof opt_precision === 'string' && opt_precision !== '')) ?
      Number(opt_precision) : 0;
  if (isNaN(this.min_)) this.min_ = -Infinity;
  if (isNaN(this.max_)) this.max_ = Infinity;
  if (isNaN(this.precision_)) this.precision_ = 0;
};
goog.inherits(Blockly.FieldNumber, Blockly.FieldTextInput);

/**
 * Construct a FieldNumber from a JSON arg object.
 * @param {!Object} options A JSON object with options (value, min, max, precision).
 * @returns {!Blockly.FieldNumber} The new field instance.
 */
Blockly.FieldNumber.fromJson = function(options) {
  return new Blockly.FieldNumber(options['value'],
      options['min'], options['max'], options['precision']);
};

/** @type {number} */
Blockly.FieldNumber.DROPDOWN_WIDTH = 168;

/** @type {Array.<string>} */
Blockly.FieldNumber.NUMPAD_BUTTONS =
    ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '-', ' '];

/** @type {string} */
Blockly.FieldNumber.NUMPAD_DELETE_ICON = 'data:image/svg+xml;utf8,' +
  '<svg ' +
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
  '<path d="M28.89,11.45H16.79a2.86,2.86,0,0,0-2,.84L9.09,1' +
  '8a2.85,2.85,0,0,0,0,4l5.69,5.69a2.86,2.86,0,0,0,2,.84h12' +
  '.1a2.86,2.86,0,0,0,2.86-2.86V14.31A2.86,2.86,0,0,0,28.89' +
  ',11.45ZM27.15,22.73a1,1,0,0,1,0,1.41,1,1,0,0,1-.71.3,1,1' +
  ',0,0,1-.71-0.3L23,21.41l-2.73,2.73a1,1,0,0,1-1.41,0,1,1,' +
  '0,0,1,0-1.41L21.59,20l-2.73-2.73a1,1,0,0,1,0-1.41,1,1,0,' +
  '0,1,1.41,0L23,18.59l2.73-2.73a1,1,0,1,1,1.42,1.41L24.42,20Z" fill="' +
  Blockly.Colours.numPadText + '"/></svg>';

/** @type {?FieldNumber} */
Blockly.FieldNumber.activeField_ = null;

/**
 * @param {number|string|undefined} opt_min Minimum value.
 * @param {number|string|undefined} opt_max Maximum value.
 * @param {number|string|undefined} opt_precision Precision for value.
 * @return {!RegExp} Regular expression for this FieldNumber's restrictor.
 */
Blockly.FieldNumber.prototype.getNumRestrictor = function(opt_min, opt_max,
    opt_precision) {
  this.setConstraints_(opt_min, opt_max, opt_precision);
  var pattern = "[\\d]";
  if (this.decimalAllowed_) {
    pattern += "|[\\.]";
  }
  if (this.negativeAllowed_) {
    pattern += "|[-]";
  }
  if (this.exponentialAllowed_) {
    pattern += "|[eE]";
  }
  return new RegExp(pattern);
};

/**
 * @param {number=} opt_min Minimum number allowed.
 * @param {number=} opt_max Maximum number allowed.
 * @param {number=} opt_precision Step allowed between numbers
 */
Blockly.FieldNumber.prototype.setConstraints_ = function(opt_min, opt_max,
    opt_precision) {
  this.decimalAllowed_ = (typeof opt_precision == 'undefined') ||
      isNaN(opt_precision) || (opt_precision == 0) ||
      (Math.floor(opt_precision) != opt_precision);
  this.negativeAllowed_ = (typeof opt_min == 'undefined') || isNaN(opt_min) ||
      opt_min < 0;
  this.exponentialAllowed_ = this.decimalAllowed_;

  if (typeof opt_min === 'number' || (typeof opt_min === 'string' && opt_min !== '')) {
    this.min_ = Number(opt_min);
  }
  if (typeof opt_max === 'number' || (typeof opt_max === 'string' && opt_max !== '')) {
    this.max_ = Number(opt_max);
  }
  if (typeof opt_precision === 'number' ||
      (typeof opt_precision === 'string' && opt_precision !== '')) {
    this.precision_ = Number(opt_precision);
  }
};

/** @return {boolean} */
Blockly.FieldNumber.prototype.hasSliderRange_ = function() {
  return isFinite(this.min_) && isFinite(this.max_) && this.min_ < this.max_;
};

/**
 * Show the inline free-text editor and optional range slider / num-pad.
 * @private
 */
Blockly.FieldNumber.prototype.showEditor_ = function() {
  Blockly.FieldNumber.activeField_ = this;
  // Always allow typing in the inline editor; num-pad is extra on touch.
  var showNumPad = this.useTouchInteraction_;
  Blockly.FieldNumber.superClass_.showEditor_.call(this, false, false);

  if (showNumPad) {
    this.showNumPad_();
  } else if (this.hasSliderRange_()) {
    this.showSlider_();
  }
};

/**
 * Drop-down: white panel with Range label + slider (same white as the
 * on-block text editor). Typing and slider stay in sync.
 * @private
 */
Blockly.FieldNumber.prototype.showSlider_ = function() {
  Blockly.DropDownDiv.hideWithoutAnimation();
  Blockly.DropDownDiv.clearContent();

  var contentDiv = Blockly.DropDownDiv.getContentDiv();
  contentDiv.setAttribute('role', 'menu');
  contentDiv.setAttribute('aria-haspopup', 'true');

  var label = document.createElement('div');
  label.setAttribute('class', 'blocklyNumberSliderLabel');
  label.appendChild(document.createTextNode(
      'Range ' + this.min_ + ' - ' + this.max_));
  contentDiv.appendChild(label);

  var slider = document.createElement('input');
  slider.setAttribute('type', 'range');
  slider.setAttribute('class', 'blocklyNumberSlider');
  slider.setAttribute('min', String(this.min_));
  slider.setAttribute('max', String(this.max_));
  var step = (this.precision_ && this.precision_ > 0) ? this.precision_ : 1;
  slider.setAttribute('step', String(step));
  var current = parseFloat(this.getValue());
  if (isNaN(current)) {
    current = this.min_;
  }
  current = Math.min(this.max_, Math.max(this.min_, current));
  slider.value = String(current);
  contentDiv.appendChild(slider);

  var field = this;
  var clampValue = function(v) {
    if (isNaN(v)) {
      return null;
    }
    if (field.precision_ > 0) {
      v = Math.round(v / field.precision_) * field.precision_;
    }
    return Math.min(field.max_, Math.max(field.min_, v));
  };
  var syncEditors = function(v) {
    field.setValue(String(v));
    var htmlInput = Blockly.FieldTextInput.htmlInput_;
    if (htmlInput) {
      htmlInput.value = String(v);
    }
  };
  var onSliderInput = function() {
    var v = clampValue(parseFloat(slider.value));
    if (v === null) {
      return;
    }
    syncEditors(v);
  };
  Blockly.bindEvent_(slider, 'input', this, onSliderInput);
  Blockly.bindEvent_(slider, 'change', this, onSliderInput);

  // Keep on-block text editor white (same as this panel).
  var widgetDiv = Blockly.WidgetDiv.DIV;
  if (widgetDiv) {
    widgetDiv.style.backgroundColor = '#FFFFFF';
    widgetDiv.style.borderColor = '#CFCFCF';
  }
  var htmlInput = Blockly.FieldTextInput.htmlInput_;
  if (htmlInput) {
    htmlInput.style.backgroundColor = '#FFFFFF';
    htmlInput.style.color = '#575E75';
    var onTextInput = function() {
      var v = clampValue(parseFloat(htmlInput.value));
      if (v === null) {
        return;
      }
      slider.value = String(v);
      field.setValue(String(v));
    };
    Blockly.bindEvent_(htmlInput, 'input', this, onTextInput);
    Blockly.bindEvent_(htmlInput, 'keyup', this, onTextInput);
  }

  // One white colour for panel + arrow (not parent block blue).
  Blockly.DropDownDiv.setColour('#FFFFFF', '#CFCFCF');
  contentDiv.style.width = Blockly.FieldNumber.DROPDOWN_WIDTH + 'px';

  this.position_();
};

/**
 * Show the number pad.
 * @private
 */
Blockly.FieldNumber.prototype.showNumPad_ = function() {
  Blockly.DropDownDiv.hideWithoutAnimation();
  Blockly.DropDownDiv.clearContent();

  var contentDiv = Blockly.DropDownDiv.getContentDiv();

  contentDiv.setAttribute('role', 'menu');
  contentDiv.setAttribute('aria-haspopup', 'true');

  this.addButtons_(contentDiv);

  Blockly.DropDownDiv.setColour(this.sourceBlock_.parentBlock_.getColour(),
      this.sourceBlock_.getColourTertiary());
  contentDiv.style.width = Blockly.FieldNumber.DROPDOWN_WIDTH + 'px';

  this.position_();
};

/**
 * @private
 */
Blockly.FieldNumber.prototype.position_ = function() {
  var scale = this.sourceBlock_.workspace.scale;
  var bBox = this.sourceBlock_.getHeightWidth();
  bBox.width *= scale;
  bBox.height *= scale;
  var position = this.getAbsoluteXY_();
  var primaryX = position.x + bBox.width / 2;
  var primaryY = position.y + bBox.height;
  var secondaryX = primaryX;
  var secondaryY = position.y;

  Blockly.DropDownDiv.setBoundsElement(
      this.sourceBlock_.workspace.getParentSvg().parentNode);
  Blockly.DropDownDiv.show(this, primaryX, primaryY, secondaryX, secondaryY,
      this.onHide_.bind(this));
};

/**
 * @param {Element} contentDiv The div for the numeric keypad.
 * @private
 */
Blockly.FieldNumber.prototype.addButtons_ = function(contentDiv) {
  var buttonColour = this.sourceBlock_.parentBlock_.getColour();
  var buttonBorderColour = this.sourceBlock_.parentBlock_.getColourTertiary();

  var buttons = Blockly.FieldNumber.NUMPAD_BUTTONS;
  for (var i = 0, buttonText; buttonText = buttons[i]; i++) {
    var button = document.createElement('button');
    button.setAttribute('role', 'menuitem');
    button.setAttribute('class', 'blocklyNumPadButton');
    button.setAttribute('style',
        'background:' + buttonColour + ';' +
        'border: 1px solid ' + buttonBorderColour + ';');
    button.appendChild(document.createTextNode(buttonText));
    contentDiv.appendChild(button);
    Blockly.bindEvent_(button, 'mousedown', this,
        Blockly.FieldNumber.numPadButtonTouch);
  }
  var eraseButton = document.createElement('button');
  eraseButton.setAttribute('role', 'menuitem');
  eraseButton.setAttribute('class', 'blocklyNumPadButton');
  eraseButton.setAttribute('style',
      'background:' + buttonColour + ';' +
      'border: 1px solid ' + buttonBorderColour + ';');
  var eraseImage = document.createElement('img');
  eraseImage.src = Blockly.FieldNumber.NUMPAD_DELETE_ICON;
  eraseButton.appendChild(eraseImage);
  contentDiv.appendChild(eraseButton);
  Blockly.bindEvent_(eraseButton, 'mousedown', this,
      Blockly.FieldNumber.numPadEraseButtonTouch);
};

/**
 * Callback for when a num-pad button is touched.
 */
Blockly.FieldNumber.numPadButtonTouch = function(e) {
  // String of the button (e.g., '7')
  var spliceValue = this.innerHTML;
  // Old value of the text field
  var oldValue = Blockly.FieldTextInput.htmlInput_.value;
  // Determine the selected portion of the text field
  var selectionStart = Blockly.FieldTextInput.htmlInput_.selectionStart;
  var selectionEnd = Blockly.FieldTextInput.htmlInput_.selectionEnd;

  // Splice in the new value
  var newValue = oldValue.slice(0, selectionStart) + spliceValue +
      oldValue.slice(selectionEnd);

  // Set new value and advance the cursor
  Blockly.FieldNumber.updateDisplay_(newValue, selectionStart + spliceValue.length);

  // This is just a click.
  Blockly.Touch.clearTouchIdentifier();

  // Prevent default to not lose input focus
  e.preventDefault();
};

/**
 * Callback for when the num-pad erase button is touched.
 */
Blockly.FieldNumber.numPadEraseButtonTouch = function(e) {
  // Old value of the text field
  var oldValue = Blockly.FieldTextInput.htmlInput_.value;
  // Determine what is selected to erase (if anything)
  var selectionStart = Blockly.FieldTextInput.htmlInput_.selectionStart;
  var selectionEnd = Blockly.FieldTextInput.htmlInput_.selectionEnd;

  // If selection is zero-length, shift start to the left 1 character
  if (selectionStart == selectionEnd) {
    selectionStart = Math.max(0, selectionStart - 1);
  }

  // Cut out selected range
  var newValue = oldValue.slice(0, selectionStart) +
      oldValue.slice(selectionEnd);

  Blockly.FieldNumber.updateDisplay_(newValue, selectionStart);

  // This is just a click.
  Blockly.Touch.clearTouchIdentifier();

  // Prevent default to not lose input focus which resets cursors in Chrome
  e.preventDefault();
};

/**
 * Update the displayed value and resize/scroll the text field as needed.
 */
Blockly.FieldNumber.updateDisplay_ = function(newValue, newSelection) {
  var htmlInput = Blockly.FieldTextInput.htmlInput_;
  // Updates the display. The actual setValue occurs when editing ends.
  htmlInput.value = newValue;
  // Resize and scroll the text field appropriately
  Blockly.FieldNumber.superClass_.resizeEditor_.call(
      Blockly.FieldNumber.activeField_);
  htmlInput.setSelectionRange(newSelection, newSelection);
  htmlInput.scrollLeft = htmlInput.scrollWidth;
  Blockly.FieldNumber.activeField_.validate_();
};

/**
 * Keep text editor white when this field uses the range slider panel.
 * @private
 */
Blockly.FieldNumber.prototype.resizeEditor_ = function() {
  Blockly.FieldNumber.superClass_.resizeEditor_.call(this);
  if (!this.hasSliderRange_()) {
    return;
  }
  var div = Blockly.WidgetDiv.DIV;
  if (div) {
    div.style.backgroundColor = '#FFFFFF';
    div.style.borderColor = '#CFCFCF';
  }
  var htmlInput = Blockly.FieldTextInput.htmlInput_;
  if (htmlInput) {
    htmlInput.style.backgroundColor = '#FFFFFF';
    htmlInput.style.color = '#575E75';
  }
};

/**
 * Callback for when the drop-down is hidden.
 */
Blockly.FieldNumber.prototype.onHide_ = function() {
  // Clear accessibility properties
  if (Blockly.DropDownDiv.content_) {
    Blockly.DropDownDiv.content_.removeAttribute('role');
    Blockly.DropDownDiv.content_.removeAttribute('aria-haspopup');
  }
};

Blockly.Field.register('field_number', Blockly.FieldNumber);
