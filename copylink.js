/*
Contains some code from
		 
https://chrome.google.com/webstore/detail/copy-link-address/kdejdkdjdoabfihpcjmgjebcpfbhepmh?hl=en
by Dhruv Vemula

The way the extension works is, once you hover a link:
If something is already selected in the page, it does nothing.
Else, it takes the URL of the link you are hovering,
copies it to an invisible div, programmatically selects the div.

When you hits Ctrl-C/Cmd-C, the hidden selection is copied to clipboard.

When you move pointer away from the link, it clears the hidden selection,
and clears the invisible div.

If at the time of hover the cursor was in a textbox (without anything selected),
it is technically a zero-length selection in Chrome. So, the extension goes
ahead and clears that selection (thus taking the cursor away from the textbox),
saving the caret position.

When you move away from the link, the caret position is restored.
*/


(function(browser) {
	'use strict'

	const promises = chrome.runtime.getURL('').startsWith('moz-extension://');

	if (browser === null) {
		// If browser === null, then the extension was loaded into Chrome.
		// Set the browser variable and other differences accordingly.
		browser = chrome;
	}

	const settings = {}; // options
	let errorAlert, printWarn, printLog, printInfo, printDebug;

	let globalCaretPosition = -1;
	let copyLinkDiv;
	let tooltipDiv;
	let tooltipTextHolder;
	let autoHoveCopyTimeout;

	function selectCopyLinkDivText(divToSelect) {
		const selection = window.getSelection();
		const range = document.createRange();
		range.selectNodeContents(divToSelect);
	
		if (selection.rangeCount > 0) {
			// Check if there is currently a text caret and save it
			// Note that this function will NOT be called if there is
			// actually a text selection (window.getSelection().toString()!=='')
			// so we only need to save the caret (i.e., start of the selection)
			globalCaretPosition = document.activeElement.selectionStart;
			printLog("globalCaretPosition: " + globalCaretPosition);
		}
		// if (selection.rangeCount > 0) {
		//    selection.removeAllRanges();
		// }
		selection.addRange(range);
		// printDebug("selectCopyLinkDivText(" + divToSelect.innerHTML + ") " +
		//		   "  selection.rangeCount(" + selection.rangeCount + ")");
	}
	
	// There is no need to worry about name collision:
	// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/
	// Content_scripts#content_script_environment
	// const COPYLINKDIVID = 'copy-href-cbdec942-d3f0-4c4f-ba03-cb071d0a7-div';
	
	function clearCopyLinkSpanText() {
		// const copyLinkDiv = document.getElementById(COPYLINKDIVID);
		if (copyLinkDiv) {
			const text = copyLinkDiv.innerHTML;
			// printDebug("clearCopyLinkSpanText: " + text);
			if (text) {
				copyLinkDiv.innerHTML = '';
				copyLinkDiv.blur();
				// window.getSelection().removeAllRanges();
			}
			if (globalCaretPosition !== -1) {
				// printDebug("Set caret: " + globalCaretPosition);
				document.activeElement.selectionStart = globalCaretPosition;
			}
		}
	}
	
	// https://stackoverflow.com/questions/26879630/
	// capturing-clicks-on-all-a-tags-using-eventlistener
	// For older browser that does not support event.target.closest('a')
	// function getParentAnchor(node) {
	//   while (node !== null) {
	// 	  let tagName = node.tagName;
	// 	  printDebug('node.tagName: ' + tagName);
	// 	  if (tagName && tagName.toUpperCase() === 'A') {
	// 		  return node;
	// 	  }
	// 	  node = node.parentNode;
	//   }
	//   return null;
	// };
	
	window.addEventListener('beforeunload', function() {
		clearCopyLinkSpanText();
	});
	
	
	function copyTextToClipboard(text, x, y) {
		printLog("copyTextToClipboard(" + x + ", " + y + "): " + text);

		if (window.location.href.startsWith('http://')) {
			// https://developer.mozilla.org/en-US/docs/Mozilla/
			// Add-ons/WebExtensions/Interact_with_the_clipboard
			//	 Using the API requires the permission "clipboardRead" or
			//	 "clipboardWrite" in your manifest.json file.
			//
			//	 As the API is only available to Secure Contexts,
			//	 it cannot be used from a content script running on
			//   http:-pages, only https:-pages.
			// const copyLinkDiv = document.getElementById(COPYLINKDIVID);
			if (!copyLinkDiv) {
				createCopyLinkDiv();
			}
			// copyLinkDiv.innerHTML = text.replaceAll('<', '&lt;').
			//	replaceAll('>', '&gt;').replaceAll('\n', '<br/>');
			copyLinkDiv.innerHTML = text.replaceAll('\n', '<br/>');
			window.getSelection().removeAllRanges();
			selectCopyLinkDivText(copyLinkDiv);
			document.execCommand('copy');
		} else {	
			// execCommand('copy') is deprecated, so try to use
			// clipboard.writeText if possible
			const promise = navigator.clipboard.writeText(text);
			if (promise) {
				promise.then(_ => printInfo("clipboard.writeText:" + text),
							 ErrorHandler("Error clipboard.writeText"));
			}
		}

		if (autoHoveCopyTimeout) {
			printInfo("0 clearTimeout(autoHoveCopyTimeout)");
			clearTimeout(autoHoveCopyTimeout);
			autoHoveCopyTimeout = null;
		}

		printDebug("show tooltip(" + x + ", " + y + ")");
		if (settings.clipboardCopyTooltip && (x > 0 || y > 0)) {
			if (!tooltipDiv) {
				printLog("createTooltip()");
				createTooltip();
			}
			let tooltipText = text;
			const lastIndex = tooltipText.lastIndexOf('\n');
			if (lastIndex > 0) {
				tooltipText = tooltipText.substring(lastIndex + 1);
			}
			const textLength = tooltipText.length;
			if (textLength > settings.maxTooltip) {
				tooltipText = tooltipText.
					substring(textLength - settings.maxTooltip);
			}
			printDebug(x + "," + y + " tooltipText:" + tooltipText);
			tooltipTextHolder.innerText = tooltipText;
			const style = tooltipDiv.style;
            style.left = x + 'px';
            style.top = (y + 10) + 'px';
			tooltipTextHolder.style.display = 'block';
		}
	}

	// bug bug bug
	// For whatever reason, shiftKey, ctrlKey and altkey
	// can be wrong when checked inside mouseover?
	// (and seems to occur under onclick as well?)
	//
	// So need to trap keydown and keyup to keep track
	// of them here manually.
	//
	// Actually, this seems to be due to the fact that I have
	// defaultPref("privacy.resistFingerprinting", true);
	// (in fact, with resistFingerprinting true there is no
	//  keyup/keydown for shift/ctrl/alt keys!)
	//
	// Well, even with privacy.resistFingerprinting false,
	// event.shiftKey can still be false inside mouseover
	// even while the shift key is being held.
	//
	// So continue to do manual tracking, which seems to work better
	let shiftKeyHold = false;
	let ctrlKeyHold = false;
	let altKeyHold = false;
	// developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
	// Warning: At least as of Firefox 48, the Windows key is no longer
	// considered the "Meta" key. KeyboardEvent.metaKey is false when
	// the Windows key is pressed.
	// let metaKeyHold = false

	let globalLinksText = '';
	let lastClickLinkCopied = '';

	function handleMouseClick(event) {
		// printDebug("handleMiddleMouseClick(" + event.button + ")");
		// With modern browsers only button 0 will get here, but check it anyway
		if (event.button === 0) {
			const anchor = event.target.closest('a'); // getParentAnchor(target)
			// printDebug("shiftKey(" + shiftKeyHold +
			//  	      ") shiftLeftClick:" + settings.shiftLeftClick);
			if (anchor &&
				settings.shiftLeftClick &&
				(shiftKeyHold || event.shiftKey)) {
				// Shift  Open link in new window    <- hijack shift because
				// Ctrl   Open link in new tab		    most people seldom open
				// Alt	  Download link					link in new window
				event.preventDefault();
				event.stopPropagation();
				if (lastClickLinkCopied !== anchor.href) {
					lastClickLinkCopied = anchor.href;
					globalLinksText += '\n' + anchor.href;
					// navigator.clipboard.writeText(globalLinksText);
				}
				copyTextToClipboard(globalLinksText, event.pageX, event.pageY);
			}
		} else {
			handleMouseAuxClick(event);
		}
	}
	
	
	function handleMouseAuxClick(event) {
		// auxclick is triggered by mouse button 1 or 2 but not 0
		if (event.button === 1) {
			const anchor = event.target.closest('a'); // getParentAnchor(target)
			if (anchor) {
				// by default, shift/ctrl/alt + middle click all just open link
				// in new tab, so only highjack shift
				printInfo("shiftKey(" + shiftKeyHold +
						 ") shiftMiddleClick:" + settings.shiftMiddleClick);
				if (settings.shiftMiddleClick &&
					(shiftKeyHold || event.shiftKey)) {
					event.preventDefault();
					event.stopPropagation();
					lastClickLinkCopied = anchor.href;
					globalLinksText = anchor.href; // copy current link only
					// navigator.clipboard.writeText(globalLinksText);
					copyTextToClipboard(globalLinksText, 
										event.pageX, event.pageY);
				}
			} else {
				const close = settings.middleClickClose;
				if (close === 'always' ||
					(close === 'shift' && event.shiftKey) ||
					(close === 'control' && event.ctrlKey) ||
					(close === 'alt' && event.altKey)) {
					printWarn("runtime.sendMessage(close)");
					browser.runtime.sendMessage({type: 'close'}, reply =>
												console.info(reply.farewell));
				}
			}
		}
	}
	
	
	function createTooltip() {
		tooltipDiv = document.createElement('div');
		tooltipDiv.classList.add('tooltip-container');
		document.body.append(tooltipDiv);
		tooltipTextHolder = document.createElement('div');
		tooltipTextHolder.classList.add('tooltip-paragraph');
		tooltipDiv.append(tooltipTextHolder);
	}

	
	function createCopyLinkDiv() {
		// console.trace();
		// const copyLinkDiv = document.createElement('span');
		copyLinkDiv = document.createElement('div');
		// copyLinkDiv.id = COPYLINKDIVID;
		// div is selectable but not visible
		copyLinkDiv.style.display = 'inline-block';
		copyLinkDiv.style.position = 'absolute';
		copyLinkDiv.style.left = '-9999em';
		document.body.append(copyLinkDiv);
	}


	function setup() {
		// https://www.codegrepper.com/code-examples/javascript/
		//       add+event+listener+to+all+anchor+tag
		// Must use mouseover rather than mouseenter because unlike mouseover,
		// mouseenter does not "bubble up" and is not sent to any descendent
		//
		// Adding just one event listener to the body is faster than adding
		// event listeners to every <a/>, if there are lots of <a/> in the page.
		//
		// The downside is that there will be more calls to the mouseover
		// handler whereas handler for mouseenter is only called when the
		// mouse is over the element
		// console.log("promises:" + promises);

		function keyUpDownHandler(event) {
			shiftKeyHold = event.shiftKey;
			ctrlKeyHold = event.ctrlKey;
			altKeyHold = event.altKey;
			// printDebug("keys shift:" + shiftKeyHold +
			//		   " ctrl:" + ctrlKeyHold + " alt:" + altKeyHold);
		}

		let globalLeftMouseDown;

		window.addEventListener('mouseup', event => {
			globalLeftMouseDown = false
		}, true);

		window.addEventListener('mousedown', event => {
			switch (event.button) {
			case 0:
				globalLeftMouseDown = true;
				break;
			case 1:
				// https://superuser.com/questions/44418/
				// how-to-disable-the-middle-button-scrolling-in-chrome
				// Works on Chrome 92 on Win11 after restarting -- Bob Stein
				event.preventDefault();
				event.stopPropagation();
				break;
			}
		}, true);
	
	
		let savedPageX = 0;
		let savedPageY = 0;

		// printDebug("document.body.addEventListener('mouseover')");
		document.body.addEventListener('mouseover', event => {
//			if (event.shiftKey || event.ctrlKey || event.altKey) {
//				printDebug("modifier keys so ignore mouseover");
//				return;
//			}

			if (tooltipTextHolder) {
				tooltipTextHolder.style.display = 'none';
			}

			if (autoHoveCopyTimeout) {
				printDebug(savedPageX + "->" + event.pageX + " " +
						   savedPageY + "->" + event.pageY);
				if (Math.abs(savedPageX - event.pageX) > 10 ||
					Math.abs(savedPageY - event.pageY) > 10) {
					// Too much movement, cancel the timer
					printDebug("1 clearTimeout(autoHoveCopyTimeout)");
					clearTimeout(autoHoveCopyTimeout);
					autoHoveCopyTimeout = null;
					// savedPageX = savedPageY = 0;
				}
		    }
			const anchor = event.target.closest('a'); //getParentAnchor(target);
			// printDebug("mouseover: " + event.target.tagName);
			if (anchor) {
				const autoCopy = settings.autoHoverCopy;
				// Call event.stopPropagation() to prevent the event from
				// bubbling up the chain once it is handle so as
				// not to trigger unnecessary call to the handler.
				event.stopPropagation();
				const isCollapsed = window.getSelection().isCollapsed;
				if (isCollapsed) {
					// printDebug("globalLeftMouseDown:" + globalLeftMouseDown);
					if (!globalLeftMouseDown) {
						// if user is holding left mouse button then selection
						// is being dragged, so don't auto hover copy the link
						if (!copyLinkDiv) {
							createCopyLinkDiv();
						}
						copyLinkDiv.innerHTML = anchor.href;
						selectCopyLinkDivText(copyLinkDiv);
					}
				} else if (autoCopy === 'never') {
					printLog("Something already selected. Skip auto select");
				} 
				printDebug("autoHoverCopy:" + autoCopy +
						   " shift:" + shiftKeyHold +
						   " ctrl: " + ctrlKeyHold +
						   " alt: " + altKeyHold);
				if (!(globalLeftMouseDown || autoHoveCopyTimeout) &&
					(autoCopy === 'always' ||
					 (autoCopy === 'shift' &&
					  (shiftKeyHold || event.shiftKey)) ||
					 (autoCopy === 'control' &&
					  (ctrlKeyHold || event.ctrlKey)) ||
					 (autoCopy === 'alt' &&
					  (altKeyHold || event.altKey)))) {
					savedPageX = event.pageX;
					savedPageY = event.pageY;
					printInfo("setTimeout(" + anchor.href + ")");
					autoHoveCopyTimeout =  setTimeout(_ => {
						autoHoveCopyTimeout = null;
						copyTextToClipboard(anchor.href,
											savedPageX, savedPageY);
					}, settings.autoHoverDelay);
				} 
			}
		}, false);
	
	
		document.body.addEventListener('mouseout', event => {
			// Must use mouseout rather than mouseleave because unlike mouseout,
			// mouseleave does not bubble up and is not sent to any descendent
			const anchor = event.target.closest('a'); //getParentAnchor(target);
			// printDebug("mouseout: " + event.target.tagName);
			if (anchor) {
				// printDebug("Leaving link.");
				event.stopPropagation();
				clearCopyLinkSpanText();
			}
		}, false);
	
	
		// https://stackoverflow.com/questions/41110264/
		// middle-button-click-event
		// For Chrome version 55+
		document.body.addEventListener('auxclick', handleMouseAuxClick);
		document.body.addEventListener('click', handleMouseClick);
		
		function copyLinksInSelectionToClipboar() {
			// https://stackoverflow.com/questions/4220478/
			// get-all-dom-block-elements-for-selected-texts
			const selection = window.getSelection();
			if (selection.isCollapsed) {
				alert("Please select some links first");
				return;
			}
	
			const rangeCount = selection.rangeCount;
			// printDebug("selection.rangeCount(" + rangeCount + ")");
			// https://developer.mozilla.org/en-US/docs/Web/API/Selection/
			// rangeCount
			// Before the user has clicked a freshly loaded page rangeCount is 0
			// After the user clicks on the page, rangeCount is 1, even if no
			// selection is visible.
			//
			// Gecko browsers allow multiple selections across table cells.
			// Firefox allows users to select multiple ranges in the document
			// by using Ctrl+click (unless the click occurs within an element
			// that has the display: table-cell CSS property assigned).
			//
			// Usually users can only have one selection
			// but a script can setup multiple selection
			// but let's not worry about that here.
			const links = [];
			for (let i = 0; i < rangeCount; i++) {
				const range = selection.getRangeAt(i);
				// Range.commonAncestorContainer() returns the deepest Node
				// that contains the startContainer and endContainer nodes.
				const container = range.commonAncestorContainer;
				if (container && container.getElementsByTagName) {
					const anchors = // not really an array, cannot use forEcah
						container.getElementsByTagName('a');
					for (let j = 0; j < anchors.length; j++) {
						const x = anchors[j];
						// The second parameter says to include the element 
						// even if it's not fully selected
						if (selection.containsNode(x, true)) {
							// printDebug(j + ": " + x.href);
							links.push(x.href);
						}
					}
				}
			}
			if (links.length) {
				printLog("copy to clipboard:" + links.join("\n"));
				navigator.clipboard.writeText(links.join("\n"));
			} else {
				alert("No link has been found in the selection");
			}
		}

		function updateSettings(items) {
			const prefix = items.debugHostPrefix?
				(new URL(window.location.href).host + " copylink c: ") :
				"copylink c: ";
			[errorAlert, printWarn, printLog, printInfo, printDebug] =
				getConsolePrints(prefix, items.debugLevel,
								 items.debugDuplicate);
			printLog("updateSettings(items)");
			// console.trace();
			for (const key in items) {
				const value = items[key];
				// getConsolePrints() not called yet
				// console.debug("update settings[" + key + "] to " + value);
				settings[key] = value;
//				if (key === 'autoHoverCopy') {
//					if (value === 'always' || value === 'never') {
//						window.removeEventListener('keyup', keyUpDownHandler);
//						window.removeEventListener('keydown', keyUpDownHandler);
//					} else {
//						window.addEventListener('keyup', keyUpDownHandler);
//						window.addEventListener('keydown', keyUpDownHandler);
//					}
//				}
				if (settings.modifierKeyTracking) {
					window.addEventListener('keyup', keyUpDownHandler);
					window.addEventListener('keydown', keyUpDownHandler);
				} else {
					shiftKeyHold = ctrlKeyHold = altKeyHold = false;
				}
			}
		}

		const contentSettingMessage = {type: 'content-settings'};
		if (promises) {
			// console.trace();
			browser.runtime.sendMessage(contentSettingMessage).
				then(reply =>
					 updateSettings(reply.settingsForContentScript),
					 ErrorHandler("Error background content-settings"));
		} else {
			// console.trace();
			console.warn("No promise sendMessage(contentSettingMessage)");
			browser.runtime.
				sendMessage(contentSettingMessage, reply =>
							updateSettings(reply.settingsForContentScript));
		}

		// Note: because of the asynchronous nature of background.js
		// (it needs to call storage.local.get(), which is asynchronous)
		// it is possible for the tab to send 'content-settings',
		// get a reply, and later get a "push" of command 'settings'
		// from background.js later when background.js finished loading
		// itself, resulting in a duplicate call to updateSettings
		// immediately after the first call.  This is necessary because
		// there is no easy way for the tab to determine if it is loaded
		// before or after background.js is done loading.  This is actually
		// correct because if content-settings was sent before background.js
		// is done reading its setting from storage.local(), the value
		// returned is just the default values, so the 2nd call to
		// updateSettings with the actual values will then fix the problem.
		browser.runtime.onMessage.
			addListener((msg, sender, callbackFunc) => {
				switch (msg.type) {
					case 'copylink': copyLinksInSelectionToClipboar();
					break;
					case 'settings':
					updateSettings(msg.settingsForContentScript);
					break;
					default:
					errorAlert("Unknown msg.type:" + msg.type);
					break;
				}
			});
	} // setup();

	setup();
})(typeof browser === 'undefined'? null : browser);
// Must check using (typeof browser === 'undefined') rather than
// use something like (browser || chrome)
// otherwise chrome will throw an error and the extension will not load
//
// Do not use (chrome || browser) because chrome is actually defined on Firefox

