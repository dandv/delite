/** @module delite/KeyNav */
define([
	"dcl/dcl",
	"dojo/keys", // keys.END keys.HOME, keys.LEFT_ARROW etc.
	"dojo/on",
	"./Widget",
	"./focus"
], function (dcl, keys, on, Widget) {

	/**
	 * Return true if node is an `<input>` or similar that responds to keyboard input.
	 * @param {Element} node
	 * @returns {boolean}
	 */
	function takesInput(node) {
		var tag = node.nodeName.toLowerCase();

		return !node.readOnly && (tag === "textarea" || (tag === "input" &&
			/^(color|email|number|password|search|tel|text|url|range)$/.test(node.type)));
	}

	/**
	  * A mixin to allow arrow key and letter key navigation of child Elements.
	  * It can be used by delite/Container based widgets with a flat list of children,
	  * or more complex widgets like a Tree.
	  * 
	  * To use this mixin, the subclass must:
	  * 
	  * - Implement `_getNext()`, `_getFirst()`, `_getLast()`, `_onLeftArrow()`, `_onRightArrow()`
	  * `_onDownArrow()`, `_onUpArrow()` methods to handle home/end/left/right/up/down keystrokes.
	  * Next and previous in this context refer to a linear ordering of the descendants used
	  * by letter key search.
	  * - Set all navigable descendants' initial tabIndex to "-1"; both initial descendants and any
	  * descendants added later, by for example `addChild()`.
	  * - Define `childSelector` AS a function or string that identifies focusable child Elements.
	  * 
	  * Note the word "child" in this class is used loosely, to refer to any descendant Element.
	  * If the child elements contain text though, they should have a label attribute.  KeyNav uses the label
	  * attribute for letter key navigation.
	  *
	  * @mixin module:delite/KeyNav
	  * @augments module:delite/Widget
	  */
	return dcl(Widget, /** @lends module:delite/KeyNav# */ {

		// TODO: due to apparent bugs in jsdoc3, these aren't getting shown.

		/**
		 * The currently focused descendant, or null if there isn't one
		 * @member {Element}
		 * @readonly
		 * @protected
		 */
		focusedChild: null,

		/**
		 * Hash mapping key code (arrow keys and home/end key) to functions to handle those keys.
		 * Usually not used directly, as subclasses can instead override _onLeftArrow() etc.
		 * Must be set before postCreate().
		 * @member {Object}
		 * @protected
		 */
		_keyNavCodes: null,

		/**
		 * Selector (passed to on.selector()) to identify what to treat as a navigable descendant.  Used to
		 * monitor focus events and set `this.focusedChild`.  Must be set by implementing class.  If this is
		 * a string (ex: "> *"), then the implementing class must require() `dojo/query`.
		 * @member {string|Function}
		 * @protected
		 * @abstract
		 */
		childSelector: null,

		postCreate: function () {
			// If the user hasn't specified a tabindex declaratively, then set to default value.
			if (!this.hasAttribute("tabindex")) {
				this.tabIndex = "0";
			}

			var self = this,
				childSelector = typeof this.childSelector === "string"
					? this.childSelector
					: this.childSelector.bind(this);

			if (!this._keyNavCodes) {
				var keyCodes = this._keyNavCodes = {};
				keyCodes[keys.HOME] = function () {
					self.focusFirstChild();
				};
				keyCodes[keys.END] = function () {
					self.focusLastChild();
				};
				keyCodes[this.isLeftToRight() ? keys.LEFT_ARROW : keys.RIGHT_ARROW] = this._onLeftArrow.bind(this);
				keyCodes[this.isLeftToRight() ? keys.RIGHT_ARROW : keys.LEFT_ARROW] = this._onRightArrow.bind(this);
				keyCodes[keys.UP_ARROW] = this._onUpArrow.bind(this);
				keyCodes[keys.DOWN_ARROW] = this._onDownArrow.bind(this);
			}

			this.own(
				on(this, "keypress", this._onContainerKeypress.bind(this)),
				on(this, "keydown", this._onContainerKeydown.bind(this)),
				on(this, "focus", this._onContainerFocus.bind(this)),
				on(this.containerNode || this, on.selector(childSelector, "focusin"), function (evt) {
					// "this" refers to the Element that matched the selector
					self._onChildFocus(this, evt);
				})
			);
		},

		/**
		 * Called on left arrow key, or right arrow key if widget is in RTL mode.
		 * Should go back to the previous child in horizontal container widgets like Toolbar.
		 * @protected
		 * @abstract
		 */
		_onLeftArrow: function () {
		},

		/**
		 * Called on right arrow key, or left arrow key if widget is in RTL mode.
		 * Should go to the next child in horizontal container widgets like Toolbar.
		 * @protected
		 * @abstract
		 */
		_onRightArrow: function () {
		},

		/**
		 * Called on up arrow key.  Should go to the previous child in vertical container widgets like Menu.
		 * @protected
		 * @abstract
		 */
		_onUpArrow: function () {
		},

		/**
		 * Called on down arrow key.  Should go to the next child in vertical container widgets like Menu.
		 * @protected
		 * @abstract
		 */
		_onDownArrow: function () {
		},

		/**
		 * Default focus() implementation: focus the first child.
		 */
		focus: function () {
			this.focusFirstChild();
		},

		/**
		 * Returns first child that can be focused.
		 * @returns {Element}
		 * @protected
		 */
		_getFirstFocusableChild: function () {
			// Leverage _getNextFocusableChild() to skip disabled children
			return this._getNextFocusableChild(null, 1);
		},

		/**
		 * Returns last child that can be focused.
		 * @returns {Element}
		 * @protected
		 */
		_getLastFocusableChild: function () {
			// Leverage _getNextFocusableChild() to skip disabled children
			return this._getNextFocusableChild(null, -1);
		},

		/**
		 * Focus the first focusable child in the container.
		 * @protected
		 */
		focusFirstChild: function () {
			this.focusChild(this._getFirstFocusableChild());
		},

		/**
		 * Focus the last focusable child in the container.
		 * @protected
		 */
		focusLastChild: function () {
			this.focusChild(this._getLastFocusableChild());
		},

		/**
		 * Focus specified child Element.
		 * @param {Element} child - Reference to container's child.
		 * @param {boolean} last - If true and if child has multiple focusable nodes, focus the
		 *     last one instead of the first one.
		 * @protected
		 */
		focusChild: function (child, last) {
			// For IE focus outline to appear, must set tabIndex before focus.
			// If this._savedTabIndex is set, use it instead of this.tabIndex, because it means
			// the container's tabIndex has already been changed to -1.
			child.tabIndex = "_savedTabIndex" in this ? this._savedTabIndex : this.tabIndex;
			child.focus(last ? "end" : "start");

			// Don't set focusedChild here, because the focus event should trigger a call to _onChildFocus(), which will
			// set it.   More importantly, _onChildFocus(), which may be executed asynchronously (after this function
			// returns) needs to know the old focusedChild to set its tabIndex to -1.
		},

		/**
		 * Handler for when the container itself gets focus.
		 * 
		 * Initially the container itself has a tabIndex, but when it gets focus, switch focus to first child.
		 * 
		 * @param {Event} evt
		 * @private
		 */
		_onContainerFocus: function (evt) {
			// Note that we can't use _onFocus() because switching focus from the
			// _onFocus() handler confuses the focus.js code
			// (because it causes _onFocusNode() to be called recursively).
			// Also, _onFocus() would fire when focus went directly to a child widget due to mouse click.

			// Ignore spurious focus events:
			//	1. focus on a child widget bubbles on FF
			//	2. on IE, clicking the scrollbar of a select dropdown moves focus from the focused child item to me
			if (evt.target !== this || this.focusedChild) {
				return;
			}

			// When the container gets focus by being tabbed into, or a descendant gets focus by being clicked,
			// set the container's tabIndex to -1 (don't remove as that breaks Safari 4) so that tab or shift-tab
			// will go to the fields after/before the container, rather than the container itself
			this._savedTabIndex = this.tabIndex;
			this.setAttribute("tabindex", "-1");

			this.focus();
		},

		_onBlur: dcl.after(function () {
			// When focus is moved away the container, and its descendant (popup) widgets,
			// then restore the container's tabIndex so that user can tab to it again.
			// Note that using _onBlur() so that this doesn't happen when focus is shifted
			// to one of my child widgets (typically a popup)

			// TODO: for 2.0 consider changing this to blur whenever the container blurs, to be truthful that there is
			// no focused child at that time.
			this.setAttribute("tabindex", this._savedTabIndex);
			delete this._savedTabIndex;
			if (this.focusedChild) {
				this.focusedChild.tabIndex = "-1";
				this.focusedChild = null;
			}
		}),

		/**
		 * Called when a child gets focus, either by user clicking it, or programatically by arrow key handling code.
		 * It marks that the current node is the selected one, and the previously selected node no longer is.
		 * @param {Element} child
		 * @private
		 */
		_onChildFocus: function (child) {
			if (child && child !== this.focusedChild) {
				if (this.focusedChild && !this.focusedChild._destroyed) {
					// mark that the previously focusable node is no longer focusable
					this.focusedChild.tabIndex = "-1";
				}

				// If container still has tabIndex setting then remove it; instead we'll set tabIndex on child
				if (!("_savedTabIndex" in this)) {
					this._savedTabIndex = this.tabIndex;
					this.setAttribute("tabindex", "-1");
				}

				// mark that the new node is the currently selected one
				child.tabIndex = this._savedTabIndex;
				this.focusedChild = child;
			}
		},

		_searchString: "",

		/**
		 * If multiple characters are typed where each keystroke happens within
		 * multiCharSearchDuration of the previous keystroke,
		 * search for nodes matching all the keystrokes.
		 * 
		 * For example, typing "ab" will search for entries starting with
		 * "ab" unless the delay between "a" and "b" is greater than `multiCharSearchDuration`.
		 * 
		 * @member {number} KeyNav#multiCharSearchDuration
		 * @default 1000
		 */
		multiCharSearchDuration: 1000,

		/**
		 * When a key is pressed that matches a child item,
		 * this method is called so that a widget can take appropriate action is necessary.
		 * 
		 * @param {Element} item
		 * @param {Event} evt
		 * @param {string} searchString
		 * @param {number} numMatches
		 * @private
		 */
		onKeyboardSearch: function (item, /*jshint unused: vars */ evt, searchString, numMatches) {
			if (item) {
				this.focusChild(item);
			}
		},

		/**
		 * Compares the searchString to the Element's text label, returning:
		 *
		 * - -1: a high priority match  and stop searching
		 * - 0: not a match
		 * - 1: a match but keep looking for a higher priority match
		 * 
		 * @param {Element} item
		 * @param {string} searchString
		 * @returns {number}
		 * @private
		 */
		_keyboardSearchCompare: function (item, searchString) {
			var element = item,
				text = item.label || (element.focusNode ? element.focusNode.label : "") || element.textContent || "",
				currentString = text.replace(/^\s+/, "").substr(0, searchString.length).toLowerCase();

			// stop searching after first match by default
			return (!!searchString.length && currentString === searchString) ? -1 : 0;
		},

		/**
		 * When a key is pressed, if it's an arrow key etc. then it's handled here.
		 * @param {Event} evt
		 * @private
		 */
		_onContainerKeydown: function (evt) {
			// Ignore left, right, home, and end on <input> controls
			if (takesInput(evt.target) &&
				(evt.keyCode === keys.LEFT_ARROW || evt.keyCode === keys.RIGHT_ARROW ||
					evt.keyCode === keys.HOME || evt.keyCode === keys.END)) {
				return;
			}
				
			var func = this._keyNavCodes[evt.keyCode];
			if (func) {
				func(evt, this.focusedChild);
				evt.stopPropagation();
				evt.preventDefault();
				this._searchString = ""; // so a DOWN_ARROW b doesn't search for ab
			} else if (evt.keyCode === keys.SPACE && this._searchTimer && !(evt.ctrlKey || evt.altKey || evt.metaKey)) {
				// stop a11yclick and _HasDropdown from seeing SPACE if we're doing keyboard searching
				evt.stopImmediatePropagation();

				// stop IE from scrolling, and most browsers (except FF) from sending keypress
				evt.preventDefault();

				this._keyboardSearch(evt, " ");
			}
		},

		/**
		 * When a printable key is pressed, it's handled here, searching by letter.
		 * @param {Event} evt
		 * @private
		 */
		_onContainerKeypress: function (evt) {
			// Ignore:
			//		- keystrokes on <input> and <textarea>
			// 		- duplicate events on firefox (ex: arrow key that will be handled by keydown handler)
			//		- control sequences like CMD-Q.
			//		- the SPACE key (only occurs on FF)
			//
			// Note: if there's no search in progress, then SPACE should be ignored.   If there is a search
			// in progress, then SPACE is handled in _onContainerKeyDown.
			if (takesInput(evt.target) || evt.charCode <= keys.SPACE || evt.ctrlKey || evt.altKey || evt.metaKey) {
				return;
			}

			if (/^(checkbox|radio)$/.test(evt.target.type) &&
				(evt.charCode === keys.SPACE || evt.charCode === keys.ENTER)) {
				// Ignore keyboard clicks on checkbox controls
				return;
			}

			evt.preventDefault();
			evt.stopPropagation();

			this._keyboardSearch(evt, String.fromCharCode(evt.charCode).toLowerCase());
		},

		/**
		 * Perform a search of the widget's options based on the user's keyboard activity.
		 *
		 * Called on keypress (and sometimes keydown), searches through this widget's children
		 * looking for items that match the user's typed search string.  Multiple characters
		 * typed within `multiCharSearchDuration` of each other are combined for multi-character searching.
		 * @param {Event} evt
		 * @param {string} keyChar
		 * @private
		 */
		_keyboardSearch: function (evt, keyChar) {
			var
				matchedItem = null,
				searchString,
				numMatches = 0;

			if (this._searchTimer) {
				this._searchTimer.remove();
			}
			this._searchString += keyChar;
			var allSameLetter = /^(.)\1*$/.test(this._searchString);
			var searchLen = allSameLetter ? 1 : this._searchString.length;
			searchString = this._searchString.substr(0, searchLen);
			this._searchTimer = this.defer(function () { // this is the "success" timeout
				this._searchTimer = null;
				this._searchString = "";
			}, this.multiCharSearchDuration);
			var currentItem = this.focusedChild || null;
			if (searchLen === 1 || !currentItem) {
				currentItem = this._getNextFocusableChild(currentItem, 1); // skip current
				if (!currentItem) {
					return;
				} // no items
			}
			var stop = currentItem;
			do {
				var rc = this._keyboardSearchCompare(currentItem, searchString);
				if (!!rc && numMatches++ === 0) {
					matchedItem = currentItem;
				}
				if (rc === -1) { // priority match
					numMatches = -1;
					break;
				}
				currentItem = this._getNextFocusableChild(currentItem, 1);
			} while (currentItem !== stop);

			this.onKeyboardSearch(matchedItem, evt, searchString, numMatches);
		},

		/**
		 * Returns the next or previous focusable child, relative to "child".
		 * @param {Element} child
		 * @param {number} dir - 1 for after, -1 for before
		 * @returns {Element}
		 * @protected
		 */
		_getNextFocusableChild: function (child, dir) {
			var wrappedValue = child;
			do {
				if (!child) {
					child = this[dir > 0 ? "_getFirst" : "_getLast"]();
					if (!child) {
						break;
					}
				} else {
					child = this._getNext(child, dir);
				}
				if (child && child !== wrappedValue && this.isFocusable.call(child)) {
					return child;
				}
			} while (child !== wrappedValue);
			// no focusable child found
			return null;
		},

		/**
		 * Returns the first child.
		 * Subclasses should override this method with a more efficient implementation.
		 * @returns {Element}
		 * @protected
		 * @abstract
		 */
		_getFirst: function () {
			return this._getNavigableChildren()[0];
		},

		/**
		 * Returns the last descendant.
		 * Subclasses should override this method with a more efficient implementation.
		 * @returns {Element}
		 * @protected
		 * @abstract
		 */
		_getLast: function () {
			var children = this._getNavigableChildren();
			return children[children.length - 1];
		},


		/**
		 * Returns the next or previous navigable child, relative to "child".
		 * Subclasses should override this method with a more efficient implementation.
		 * @param {Element} child - The current child Element.
		 * @param {number} dir - 1 = after, -1 = before
		 * @returns {Element}
		 * @private
		 * @abstract
		 */
		_getNext: function (child, dir) {
			var children = this._getNavigableChildren(),
				index = children.indexOf(child);
			return children[(index + children.length + dir) % children.length];
		},

		/**
		 * Helper method to get list of navigable children (navigable via arrow keys and letter keys).
		 */
		_getNavigableChildren: function () {
			if (typeof this.childSelector === "function") {
				return Array.prototype.filter.call(this.querySelectorAll("*"), this.childSelector);
			} else {
				return Array.prototype.slice.call(this.querySelectorAll(this.childSelector));	// convert to array
			}
		}
	});
});
