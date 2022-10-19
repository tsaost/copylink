'use strict'

let ErrorHandler = function(text) {
	// This will be redefined when getConsolePrints is called later
	// once options.dbgLevel is know
	return error => {
		console.trace();
		console.error(text + ': ' + error);
	};
};


const consoleClearErrorAlert = function(text) {
	console.clear();
	console.error(text);
	alert(text);
}


function getDebugLevelSelectHtml(selectClass) {
	return 	(selectClass?
			 ('<select id="debug-level-select" class="' +
			  selectClass + '" name="debugLevel">') :
			 '<select id="debug-level-select" name="debugLevel">') +
	    '<option value="0">0 (None)</option>' +
	    '<option value="1">1 (Error)</option>' +
	    '<option value="2">2 (Warning)</option>' +
	    '<option value="3">3 (Log)</option>' +
	    '<option value="4">4 (Info)</option>' +
	    '<option value="5">5 (Debug)</option>' +
		'</select>';
}


function getConsolePrints(prefix, level, duplicate) {

	function Dup(prefix, consoleX, consolePrefix, duplicate) {
		return duplicate? text => {
			consoleX(prefix + text);
			// Send a duplicate copy to console.debug(),
			// so that one can see everything with debug alone.
			// One then restrict to just one category by unchecking debug
			// in thye Web/Browser Console and then check the category to see.
			// This is easier than having to unclick ALL other categories.
			console.debug(consolePrefix + prefix + text);
		} : text => consoleX(prefix + text);
	}

	const debug = level>4? text => console.debug(prefix + text)  : _ => {};
	const info  = level>3? Dup(prefix, console.info, 'F ', duplicate) : _ => {};
	const log   = level>2? Dup(prefix, console.log,  'L ', duplicate) : _ => {};
	const warn  = level>1? Dup(prefix, console.warn, 'W ', duplicate) : _ => {};
	const errorAlert = level > 0?
		Dup(prefix, consoleClearErrorAlert, duplicate): _ => console.trace();

	// Redefine ErrorHandler now that we know options.dbgLevel
	ErrorHandler = function(text) {
		return error => {
			const errorText = prefix + text + ': ' + error;
			if (errorText.indexOf("Could not establish connection. " +
								  "Receiving end does not exist.") > 0) {
				// Not really an error so just make a note of it.
				if (level > 4) console.debug(errorText);
			} else {
				console.trace();
				console.error(errorText);
				if (level > 1) console.warn(errorText);
				if (level > 2) console.log(errorText);
				if (level > 3) console.info(errorText);
				if (level > 4) console.debug(errorText);
				alert(errorText);
			}
		};
	};

	return [errorAlert, warn, log, info, debug];
}
