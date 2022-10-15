'use strict'

const DEBUG = true;

const printDebug = DEBUG? text => console.debug("copylink b: "+text) : _ => {};

function getErrorHandler(text) {
	return DEBUG? error => {
		const errorText = text + ' ' + error;
		console.trace();
		console.debug(errorText);
		console.log(errorText);
	} : undefined;
}

(function(browser) {
    let promises = true; // Assume running on Firefox
	// let isEdgeBrowser = false;
	if (browser === chrome) {
		// If browser is not defined, the plugin was loaded into Google Chrome.
		// Set the browser variable and other differences accordingly.
		promises = false;
		// listenUrls = ['http://*/*', 'https://*/*'];
	} else if (browser.runtime.getBrowserInfo === undefined) {
		// If browser.runtime.getBrowserInfo is not defined, then we're on
		// Microsoft Edge. However, we can't use the function at the moment
		// as even in Firefox it doesn't return any data.
		promises = false;
		// isEdgeBrowser = true;
	}
	
	const defaultSettings = {
		// alwaysCopyLink modifies the selection, which is a bad idea
		// alwaysCopyLink: false,
		// developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
		// Warning: At least as of Firefox 48, the Windows key is no longer
		// considered the "Meta" key. KeyboardEvent.metaKey is false when
		// the Windows key is pressed.
		autoHoverCopy: 'never', // 'never', 'always', 'shift', 'control', 'alt'
		autoHoverDelay: 300,
		clipboardCopyTooltip: true,
		maxTooltip: 200,
		shiftLeftClick: true,
		shiftMiddleClick: true,
		middleClickClose: 'never',//'never', 'always', 'shift', 'control', 'alt'
		sectionsExpansionState: {} // this is for options.js
	}
	
	let settings;
	
	// At this point, settingsForContentScript has all the same attributes
	// as setting.  In the future maybe settingsForContentScript will be
	// an subset of settings
	const settingsForContentScript = {
		// alwaysCopyLink: undefined,
		autoHoverCopy: undefined,
		autoHoverDelay: undefined,
		clipboardCopyTooltip: undefined,
		maxTooltip: undefined,
		shiftLeftClick: undefined,
		shiftMiddleClick: undefined,
		middleClickClose: undefined
	}
		
	
	function sanitizeSettings(items) {
		printDebug("sanitizeSettings(" + Object.keys(items) + ")");
		// Make  copy so that defaultSettings is not changed
		// when doing: settings[key] = defaultValues[key]
		const defaults = Object.assign({}, defaultSettings);
		for (const key in defaults) {
			// Fix any key that is missing
			if (!(key in items)) {
				items[key] = defaults[key];
				printDebug("missing items[" + key + "]=" + items[key]);
			}
		}
	
		// Loop over Object.keys(items) rather than using
		// for (const key in items) because we are modifying items,
		// so that may not be safe?
		//
		// https://stackoverflow.com/questions/3463048/
		// is-it-safe-to-delete-an-object-property-while-iterating-over-them
		// So I guess it's safe after all.
		// for (key of Object.keys(items)) {
		for (const key in items) {
			// Remove any key that is no longer used
			if (!(key in defaults)) { // && key !== 'sectionsExpansionState') {
				printDebug("delete items[" + key + "]");
				delete items[key];
			}
		}
		return items;
	}
	
	
	function updateWithSettings(items) {
		settings = sanitizeSettings(items);
		for (const key in settingsForContentScript) {
			settingsForContentScript[key] = items[key];
		}
	}
	
	
	browser.storage.onChanged.addListener(onSettingsChanged);
	browser.runtime.onMessage.addListener(onContentScriptMessage);
	
	onSettingsChanged(undefined, 'local');
	
	function onSettingsChanged(changes, area) {
		if (area !=='local') {
			printDebug("onSettingsChanged(" + area + ")");
			return;
		}
		printDebug("onSettingsChanged(changes," + area + ")");
		if (promises) {
			browser.storage.local.get()
				.then(items => {
					updateWithSettings(items);
					updateSettingsOnAllTabs();
				}, getErrorHandler("Error reading local settings."));
		} else {
			browser.storage.local.get(null, items => {
				updateWithSettings(items);
				updateSettingsOnAllTabs();
			});
		}
	}
	
	
	function onContentScriptMessage(msg, sender, sendResponse) {
		const tab = sender.tab;
		if (!tab) {
			printDebug("from extension");
			return;
		}
	
		const title = tab.title;
		// printDebug("from content page" + sender.tab.url + ", " + title);
	
		printDebug("onContentScriptMessage(" + msg.type + ")");
		switch (msg.type) {
		case 'content-settings':
			sendResponse({settingsForContentScript});
			break;
	
		case 'all-settings':
			sendResponse({defaultSettings, settings});
			break;
	
		case 'close':
			sendResponse({farewell: "goodbye: " + title});
			chrome.tabs.remove(tab.id, _ => {});
			break;
	
		default:
			break;
		}
	}
	
	
	function updateSettingsOnAllTabs() {
		const sendSettingsToTabs = tabs => {
			for (const tab of tabs) {
				printDebug("browser.tabs.sendMessage('settings') to " +
						   tab.id);
				const message = { type: 'settings', settingsForContentScript};
				const promise = browser.tabs.sendMessage(tab.id, message);
				if (promise) {
					promise.then(_ => {},
								 getErrorHandler("Error sending setting:" +
												 tab.id));
				}
			}
		};

		if (promises) {
			browser.tabs.query({}).
				then(sendSettingsToTabs,
					 getErrorHandler("Error querying tabs."));
		} else {
			browser.tabs.query({}, sendSettingsToTabs);
		}
	}
	
	
	/*
	 * if user clicked with the toolbar icon, 
	 */
	browser.browserAction.onClicked.addListener((tab, clickData) => {
		// https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/
		// WebExtensions/API/tabs/sendMessage
		printDebug("browserAction.onClicked => " + tab.id + " search");
		browser.tabs.sendMessage(tab.id, { type: 'copylink', clickData });
	});
	
	
	if (browser.contextMenus) {
		// Create the browser action menu item to open the options page.
		if (browser !== chrome) {
			// Chrome base browser already have an "Options" menu item.
			browser.contextMenus.create(
			{id: 'options',
					 title: "CCL Options",
					 contexts: ['browser_action'] });
		}

		// Create the browser action menu item to open the about page.
		browser.contextMenus.create(
		{ id: 'about',
				  title: 'About Click Copy Link',
				  contexts: ['browser_action'] });
	
		/*
		 * Open the options page when the menu item was clicked.
		 */
		browser.contextMenus.onClicked.addListener((info, tab) => {
			switch (info.menuItemId) {
				case 'options':
				browser.runtime.openOptionsPage();
				break;
				case 'about':
				browser.tabs.create({ url: 'about.html' });
				break;
				default:
				break;
			}
		});
	}

	console.log("COPYLINK b DEBUG:" + DEBUG);
	console.debug("COPYLINK b DEBUG:" + DEBUG);
})(typeof browser === 'undefined'? chrome : browser);
// Must check using (typeof browser === 'undefined') rather than
// use something like (browser || chrome)
// otherwise chrome will throw an error and the extension will not load
//
// Do not use (chrome || browser) because chrome is actually defined on Firefox

