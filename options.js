// Some of code is from SSS (Swift Selection Search) settings.js/.html
// by Daniel Lobo/CanisLupus  

(function(browser) {
	'use strict'

	const promises = chrome.runtime.getURL('').startsWith('moz-extension://');
	if (browser === null) {
		browser = chrome;
	}
	
	let defaultSettings;
	let settings;
	let errorAlert, printWarning, printLog, printInfo, printDebug;

	const page = {};

	function updatePage() {
		// console.trace();
        for (const item of page.inputs) {
            loadSettingValueIntoElement(item);
        }

        if (settings.sectionsExpansionState !== undefined) {
			const sectionsState = settings.sectionsExpansionState;
            for (const sectionId in sectionsState) {
                const section = document.getElementById(sectionId);
				if (section) {
					section.classList.toggle('collapsed-section', 
											 !sectionsState[sectionId]);
				}
            }
        }
		
	}


    function loadSettingValueIntoElement(item) {
        const name = item.name;
        if (name in settings) {
			const value = settings[name];
			if (item.type === 'checkbox') {
				item.checked = value;
			} else {
				item.value = value;
			}
			updateOptionsVisiblity(name, value);
		}
    }


    function updateOptionsVisiblity(name, value) {
        const setVisiblity = (element, visible) => {
			printDebug("setVisiblity(" + name + "): " + visible);
            element.closest('.setting').classList.toggle('hidden', !visible);
		};

        switch (name) {
		case 'autoHoverCopy': {
			const visible = (value !== 'never');
			setVisiblity(page.autoHoverDelay, visible);
		} break;

		case 'clipboardCopyTooltip':
			setVisiblity(page.maxTooltip, value);
			break;

		case 'debugLevel': {
			const visible = (value !== '0');
			setVisiblity(page.debugHostPrefix, visible);
			setVisiblity(page.debugDuplicate, visible);
			} break;

		case 'shiftLeftClick':
		case 'shiftMiddleClick':
		case 'maxTooltip':
		case 'autoHoverDelay':
		case 'modifierKeyTracking':
		case 'middleClickClose':
		case 'linkFormat':
		case 'tabLinkFormat':
		case 'debugDuplicate':
		case 'debugHostPrefix':
			printDebug("updateOptionsVisiblity: nothign to do.");
			break;

		default:
			errorAlert("Bad updateOptionsVisiblity("+ name + ", " + value +")");
			break;
        }
    }
	

	let globalIntializingPage = true;

    function initializePage() {
		printLog("initializePage() debugLevel:" + settings.debugLevel);
		document.getElementById('debugLevelContainer').innerHTML =
			getDebugLevelSelectHtml('setting-input');

        page.inputs = document.querySelectorAll("input, select, textarea");
        for (const item of page.inputs) {
			const name = item.name;
			if (name) {
				printDebug("initialize page[" + item.name + "]");
				page[item.name] = item;
			}
        }

        document.getElementById('settings').onchange = ev => {
            const item = ev.target;
			const name = item.name;
			if (name in settings) {
				let value;
				if (item.type === 'checkbox') {
					value = item.checked;
				} else if (item.type === 'number') {
					value = parseInt(item.value);
				} else {
					value = item.value;
				}
				printInfo("onchange target: " + name + " -> " + value);
				updateOptionsVisiblity(name, value);
				if (!globalIntializingPage) {
					saveNewSettings({[name]: value});
				}
			}
		}

		globalIntializingPage = false;

        for (const elem of document.querySelectorAll('.setting-reset')) {
            const inputElements = elem.querySelectorAll('input');
            if (inputElements.length === 0) {
                continue;
			}
            inputElements[0].onclick = _ => {
                const parent = elem.closest('.setting');
                const formElement = parent.querySelector('.setting-input');
                const name = formElement.name;
                const value = defaultSettings[name];
				printWarning("reset setting[" + name + "]=" + value);
                saveNewSettings({[name]: value});
                loadSettingValueIntoElement(formElement);
            };
        }

        for (const sectionNameElement of
				 document.querySelectorAll('.section-name')) {
            sectionNameElement.onclick = _ => {
				if (!settings.sectionsExpansionState) {
					settings.sectionsExpansionState = {};
				}
				const sectionsExpansionState = settings.sectionsExpansionState;
				const parent = sectionNameElement.parentElement;
                const isCollapsed =parent.classList.toggle('collapsed-section');
                sectionsExpansionState[parent.id] = !isCollapsed;
                saveNewSettings({sectionsExpansionState});
            };
        }

		updatePage();
	}


    function saveNewSettings(items) {
		printDebug("saveNewSettings(" + Object.keys(items) + ")");
		for (const key in items) {
			printDebug("settings[" + key + "]=" + items[key]);
			settings[key] = items[key];
		}
		if (promises) {
			browser.storage.local.set(items).
				then(_ => {},
					 ErrorHandler("Error saving local settings."));
		} else {
			browser.storage.local.set(items);
		}

		// Print warnings when certain options are changed.
		for (const name in items) {
			const value = items[name];
			switch (name) {
			case 'middleClickClose':
				if (value !== 'never') {
					alert("You've just turned on the option to close a page " +
						  "when the middle click button is clicked anywhere " +
						  "on the page that is NOT a link.");
				}
				break;

			case 'autoHoverCopy': 
//				if (value !== 'never' && value != 'always') {
//					alert("Auto hover copy may not always gets triggered " +
//						  "because shift/ctrl/alt key detection can be " +
//						  "unreliable. Therefore it is recommended that you "+
//						  'use the "Always (On)" option.');
//				}
//			} break;
				alertAutoHoverCopyShiftLeftClickConflict();
				break;

			case 'shiftLeftClick':
				alertAutoHoverCopyShiftLeftClickConflict();
				break;
			}
		}

		function alertAutoHoverCopyShiftLeftClickConflict() {
			const autoHoverCopy = settings.autoHoverCopy;
			if (settings.shiftLeftClick) {
				const warning = "\n\n" +
					"Basically, auto hover copy may overwrite the " +
					"clipboard and replace whatever you just copied " +
					"there using shift + left click.";
				if (autoHoverCopy === 'shift') {
					alert("Using shift as Auto hover copy modifier may not " +
						  "work properly with Shift+Left click." + warning);
				} else if (autoHoverCopy === 'always') {
					alert("Auto hover copy Always (On) may not work propely " +
						  "with Shift+Left click." + warning);
				}
			}
		}
	}


    document.addEventListener("DOMContentLoaded", _ => {
        if (defaultSettings === undefined) {
			console.debug("DOMContentLoaded before content-settings");
			// hack hack hack
			// let 'content-settings' handler know that DOM has been loaded
			defaultSettings = ''; 
		} else {
            initializePage();
        }
    });


	function handleBackgroundResponse(response) {
		settings = response.settings;
		[errorAlert, printWarning, printLog, printInfo, printDebug] =
			getConsolePrints("copylink o: ", settings.debugLevel,
							 settings.debugDuplicate);
		printDebug("defaultSettings:" + defaultSettings);
		printDebug("settings:" + settings);
		const domLoaded = (defaultSettings === '');
		defaultSettings = response.defaultSettings;
		if (domLoaded) {
			// sendMessage is async, so we have to check if DOMContentLoaded
			// has ocurred and call initializePage() if (domLoaded) is true
			// Otherwise let initializePage() be called by
			// the DOMContentLoaded event handler above.
			initializePage();
		} 
	}

	const message = { command: 'all-settings' };
	if (promises) {
		browser.runtime.sendMessage(message).
			then(handleBackgroundResponse, 
				 ErrorHandler("Error requesting options from background.js"));
	} else {
		browser.runtime.sendMessage(message, handleBackgroundResponse);
	}
})(typeof browser === 'undefined'? null: browser);
// Must check using (typeof browser === 'undefined') rather than
// use something like (browser || chrome)
// otherwise chrome will throw an error and the extension will not load
//
// Do not use (chrome || browser) because chrome is actually defined on Firefox
