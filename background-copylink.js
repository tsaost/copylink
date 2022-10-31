(function(browser) {
	'use strict'

	const promises = chrome.runtime.getURL('').startsWith('moz-extension://');

	if (browser === null) {
		// If browser === null, then the extension was loaded into Chrome.
		// Set the browser variable and other differences accordingly.
		browser = chrome;
		// listenUrls = ['http://*/*', 'https://*/*'];
	}
	
	const defaultSettings = {
		// alwaysCopyLink modifies the selection, which is a bad idea
		// alwaysCopyLink: false,
		// developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/metaKey
		// Warning: At least as of Firefox 48, the Windows key is no longer
		// considered the "Meta" key. KeyboardEvent.metaKey is false when
		// the Windows key is pressed.
		autoHoverCopy: 'never', // never always shift control alt
		autoHoverDelay: 300,
		clipboardCopyTooltip: true,
		maxTooltip: 200,
		shiftLeftClick: true,
		shiftMiddleClick: true,
		modifierKeyTracking: false,
		middleClickClose: 'never', // never always shift control alt
		linkFormat: 'raw',      // raw, autolink, inlined, bare, mixed
		tabLinkFormat: 'mixed', // ditto
		debugLevel: 0, // 0:none, 1:error 2:warn 3:log 4:info 5:debug
		debugDuplicate: true,
		debugHostPrefix: true,
		sectionsExpansionState: {} // this is for options.js
	}
	
	let settings;
	let [errorAlert, printWarn, printLog, printInfo, printDebug] =
		getConsolePrints("copylink c: ", 3, true);

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
		modifierKeyTracking: undefined,
		middleClickClose: undefined,
		linkFormat: undefined,
		tabLinkFormat: undefined,
		debugLevel: undefined,
		debugDuplicate: undefined,
		debugHostPrefix: undefined
	}
		
	
	function sanitizeSettings(items) {
		printLog("sanitizeSettings(" + Object.keys(items) + ")");
		// Make  copy so that defaultSettings is not changed
		// when doing: settings[key] = defaultValues[key]
		const defaults = Object.assign({}, defaultSettings);
		for (const key in defaults) {
			// Fix any key that is missing
			if (!(key in items)) {
				items[key] = defaults[key];
				printDebug("copylink b: missing items[" + key + "]=" +
						   items[key]);
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
			if (!(key in defaults) && key !== 'sectionsExpansionState') {
				printWarn("delete items[" + key + "]");
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
		[errorAlert, printWarn, printLog, printInfo, printDebug] =
			getConsolePrints("copylink b: ", settings.debugLevel,
							 settings.debugDuplicate);
	}
	
	
	browser.storage.onChanged.addListener(onSettingsChanged);
	browser.runtime.onMessage.addListener(onContentScriptMessage);
	
	function onSettingsChanged(changes, area) {
		if (area !== 'local') {
			printWarn("copylink b: Not local onSettingsChanged(" +
					  area + ")");
			return;
		}
		if (defaultSettings.debugLevel > 4) {
			// getConsolePrints() not called yet
			printDebug("copylink b: onSettingsChanged(changes,"+ area +")");
		}
		if (promises) {
			browser.storage.local.get()
				.then(items => {
					updateWithSettings(items);
					updateSettingsOnAllTabs();
				}, ErrorHandler("Error reading local settings"));
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
			printLog("copylink b: from extension");
			return;
		}

		// When reloading script the tab may call sendMessage
		// before getConsolePrints is called because loading
		// settings from local storage is asynchronous.
		const command = msg.command;
		printInfo("copylink b: onContentScriptMessage(" + command + ")");
		switch (command) {
		case 'content-settings':
			sendResponse({settingsForContentScript});
			break;
	
		case 'all-settings':
			// This is for options.js
			sendResponse({defaultSettings, settings});
			break;
	
		case 'close':
			sendResponse({farewell: "goodbye: " + tab.title});
			chrome.tabs.remove(tab.id, _ => {});
			break;

//      Cannot do this:
//          Error: permissions.request may only be called from a
//				   user input handler background-copylink.js:162:5
//		case 'permission-clipboardRead':
//			browser.permissions.
//				request({ permissions: ["clipboardRead"] }).
//				then(granted => sendResponse({granted}));
//			break;

		default:
			errorAlert("Unknown command(" + command + ")");
			break;
		}
	}
	
	
	function updateSettingsOnAllTabs() {
		printInfo("updateSettingsOnAllTabs()");

		const sendSettingsToTabs = tabs => {
			for (const tab of tabs) {
				printDebug("browser.tabs.sendMessage('settings') to " +
						   tab.id);
				const message = { command: 'settings',
								  settingsForContentScript};
				const promise = browser.tabs.sendMessage(tab.id, message);
				if (promise) {
					promise.then(_ => {},
								 ErrorHandler("Error sending setting "+tab.id));
				}
			}
		};

		if (promises) {
			browser.tabs.query({}).
				then(sendSettingsToTabs,
					 ErrorHandler("Error querying tabs"));
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
		printLog("browserAction.onClicked => " + tab.id + " search");
		browser.tabs.sendMessage(tab.id, { command: 'copylink', clickData });
	});
	
	
	if (browser.contextMenus) {
		// if (defaultSettings.debugLevel > 2) {
		browser.contextMenus.create({
  		    id: 'url',
		    title: 'Copy Tab Website URL',
		    contexts: ['browser_action'] });

		browser.contextMenus.create({
            id: 'test',
			title: "CCL Demo",
			contexts: ['browser_action'] });
	
		browser.contextMenus.create({type: "separator",
									 contexts: ['browser_action'] });

		// Create the browser action menu item to open the options page.
		if (promises) {
			// Chrome base browser already have an "Options" menu item.
			browser.contextMenus.create({
			    id: 'options',
				title: "CCL Options",
				contexts: ['browser_action'] });
		}

		// Create the browser action menu item to open the about page.
		browser.contextMenus.create({
            id: 'about',
			title: 'About Click Copy Link',
			contexts: ['browser_action'] });


		/*
		 * Open the options page when the menu item was clicked.
		 */
		browser.contextMenus.onClicked.addListener((info, tab) => {
			switch (info.menuItemId) {
				case 'options': browser.runtime.openOptionsPage(); break;
				case 'about': browser.tabs.create({ url: 'about.html' }); break;
				case 'test': browser.tabs.create({ url: 'test.html' }); break;
				case 'url': browser.tabs.
				sendMessage(tab.id, {command: 'url'}); break;
				default:
				errorAlert("Unknown info.menuItemId:" + info.menuItemId);
				break;
			}
		});
	}

	console.clear();
	onSettingsChanged(undefined, 'local');
})(typeof browser === 'undefined'? null: browser);
// Must check using (typeof browser === 'undefined') rather than
// use something like (browser || chrome)
// otherwise chrome will throw an error and the extension will not load
//
// Do not use (chrome || browser) because chrome is actually defined on Firefox

