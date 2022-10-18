'use strict'

let ErrorHandler = function(text) {
	// This will be redefined when getConsolePrintList is called later
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

function getConsolePrintList(prefix, level) {
	const debug = level > 4? text => console.debug(prefix + text) : _ => {};
	const info = level > 3? text => console.info(prefix + text) : _ => {};
	const log = level > 2? text => console.log(prefix + text) : _ => {};
	const warn = level > 1? text => console.warn(prefix + text) : _ => {};
	const errorAlert = level > 0?
		text => consoleClearErrorAlert(prefix + text) : _ => console.trace();

	// Redefine ErrorHandler now that we know options.dbgLevel
	ErrorHandler = function(text) {
		return error => {
			const errorText = text + ': ' + error;
			if (errorText.indexOf("Could not establish connection. " +
								  "Receiving end does not exist.") > 0) {
				// Not really an error so just make a note of it.
				console.debug(errorText);
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
