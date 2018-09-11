const yamljs = require( "yamljs" ),
	config = yamljs.load( "config.yml" ),
	fs = require( "fs" ),
	fetch = require( "node-fetch" );

module.exports = ( ) => {
	return {
		upload : ( req, res, next ) => {
			// Upload images, responds with SDRs
			if( typeof req.files === 'undefined' ) {
				return res.send( 400, { error: 'Bad request', details: 'Missing files' } );
			}
			// Keep track of files (to be deleted at end)
			let deleteList = [];
			
			// Compile a list of Clarifai API calls
			let clarifaiPromises = [];
			let keys = Object.keys( req.files );
			for( let f = 0; f < keys.length; f++ ) {
				if( Object.prototype.hasOwnProperty.call( req.files, keys[f] ) ) {
					deleteList.push( req.files[keys[f]].path );
					clarifaiPromises.push( _clarifai(
						req.files[keys[f]].path,
						config.clarifai.model
					) );
				}
			}
			// Wait for the Clarifai API calls to finish
			Promise.all( clarifaiPromises ).then( ( results ) => {
				// Delete the uploaded files now that we are done with them
				_unlink( deleteList );
				
				// Compile a list of Cortical.io API calls
				let r, c;
				let corticalIoPromises = [];
				for( r = 0; r < results.length; r++ ) {
					for( c = 0; c < results[r].length; c++ ) {
						// Exclude any concepts that have more than one word (for example "hard hat")
						// TODO: Handle multi-word concepts.  Negative concepts will be a challenge (for example "no people")
						if( !results[r][c].name.trim().includes( " " ) ) {
							// Trim any whitespaces and convert concept name to lowercase before sending to cortical.io
							corticalIoPromises.push( _corticalIo( results[r][c].name.trim().toLowerCase(), results[r][c].value ) );
						}
					}
					// Below logic interfacing with cortical.io only supports one image file
					// TODO: Refactor so multiple images can be processed at once & results grouped
					break;  // TODO: Remove this break when processing multiple images implemented
				}
				// Wait for all Cortical.io API calls to finish
				Promise.all( corticalIoPromises ).then( ( weightedSdrs ) => {
					// Generate and return the SDR for this image
					// TODO: Return array of SDRs when processing multiple images is implemented
					return res.send( 200, { sdr: _mergeWeightedSdrs(
						weightedSdrs,
						config.cortical_io.sdr_size,
						config.sparsity
					) } );
				} );
			} );
		}
	};
	
	/**
	 * Accesses Cortical.io to retrieve an SDR for the specified term, and include the specified weight in the response
	 */
	function _corticalIo( term, weight ) {
		return new Promise( ( resolve, reject ) => {
			fetch( config.cortical_io.url + "terms?retina_name=" + encodeURI( config.cortical_io.retina )
					+ "&term=" + encodeURI( term ) + "&start_index=0&max_results=1&get_fingerprint=true",
				{
					method: "GET",
					// agent: new HttpsProxyAgent( config.proxy ),
					headers: new fetch.Headers( { "api-key" : config.cortical_io.api_key } )
				}
			).then( ( result ) => {
				// Only parse response if success
				if( result.status !== 200 ) {
					// Not successful, return empty SDR
					return resolve( [] );
				}
				// Parse the response
				return result.json();
			} ).then( ( response ) => {
				if( ( response.length == 0 ) ||
					( typeof response[0].fingerprint === 'undefined' ) ||
					( typeof response[0].fingerprint.positions === 'undefined' )
				) {
					// No fingerprint, return empty SDR
					return resolve( [] );
				}
				// Return the fingerprint SDR
				return resolve( { sdr: response[0].fingerprint.positions, weight: weight } );
			} );
		} );
	}
	
	/**
	 * Accesses Clarifai to classify an image file using the specified model
	 */
	function _clarifai( filepath, model ) {
		return new Promise( ( resolve, reject ) => {
			// Start with an empty array (no concepts)
			let concepts = [];
			let concept;
			fs.readFile( filepath, ( err, data ) => {
				if ( err ){
					if( config.environment !== "Production" ) {
						console.log( err );
					}
					// Error, return empty array
					return resolve( concepts );
				}
				fetch( config.clarifai.url + "models/" + model + "/outputs", {
					method: "POST",
					// agent: new HttpsProxyAgent( config.proxy ),
					headers: new fetch.Headers( {
						'Authorization': 'Key ' + config.clarifai.api_key,
						'Content-Type': 'application/json'
					} ),
					body: '{"inputs":[{"data":{"image":{"base64": "' + data.toString( 'base64' ) + '"}}}]}'
				} ).then( ( result ) => {
					// Only parse response if success
					if( result.status !== 200 ) {
						// Not successful, return empty array
						return resolve( concepts );
					}
					// Parse the response
					return result.json();
				} ).then( ( response ) => {
					if(
						( typeof response.outputs === 'undefined' ) ||
						( response.outputs.length == 0 ) ||
						( typeof response.outputs[0].data === 'undefined' ) ||
						( typeof response.outputs[0].data.concepts === 'undefined' )
					) {
						if( config.environment !== "Production" ) {
							console.log( response );
						}
						// No results, return empty array
						return resolve( concepts );
					}
					// Add the concepts identified to the array and return them
					for( i = 0; i < response.outputs[0].data.concepts.length; i++ ) {
						concept = response.outputs[0].data.concepts[i];
						concepts.push( { "name": concept.name, "value" : concept.value } );
					}
					return resolve( concepts );
				} );
			} );
		} );
	}
	
	/**
	 * This function deletes a list of files
	 */
	function _unlink( deleteList ) {
		for( let i = 0; i < deleteList.length; i++ ) {
			fs.unlinkSync( deleteList[i] );
		}
	}
	
	/**
	 * This function correctly sorts numbers (default Javascript array sort is alphabetical)
	 */
	function _sortNumber( a, b ) {
		return a - b;
	}
	
	/**
	 * Returns an array of size "resultCount", containing unique indexes in the range (0, length - 1)
	 * If "ordered" is true, indexes will be in sequential order starting from a random position
	 * If "ordered" is false, indexes will be in random order
	 */
	function _randomIndexes( length, resultCount, ordered ) {
		let i1, i2;
		let results = [];  // Array to hold the random indexes
		let rc = resultCount;
		// Make sure not to return more results than there are available
		if( rc > length ) {
			rc = length;
		}
		if( ordered ) {
			// Start at a random index
			i1 = Math.floor( Math.random() * length );
			// Capture indexes in order from this point
			for( i2 = 0; i2 < rc; i2++ ) {
				results.push( i1 );
				i1++;
				if( i1 >= length ) {
					// End of list, loop back around to beginning
					i1 = 0;
				}
			}
		} else {
			// Create an array to hold unprocessed indexes
			let indexes = [];
			for( i1 = 0; i1 < length; i1++ ) {
				indexes.push( i1 );
			}
			// Capture random indexes out of order
			for( i2 = 0; i2 < rc; i2++ ) {
				// Pick a random element from the unprocessed list
				i1 = Math.floor( Math.random() * ( length - i2 ) );
				// Capture the index in this element
				results.push( indexes[i1] );
				// Remove it from the unprocessed list
				indexes.splice( i1, 1 );
			}
		}
		return results;
	}
	
	/**
	 * Merge a collection of weighted SDRs into a standard binary SDR with the specified sparsity
	 * weightedSdrs is an array of objects having property "sdr" (array if indexes) and "weight" (between 0 and 1) 
	 * NOTE: Setting sparsity to 1 is equivalent to disregarding the weights and forming a simple SDR union
	 */
	function _mergeWeightedSdrs( weightedSdrs, sdrSize, sparsity ) {
		let i, j;
		let union = [];
		let scoredIndexes = {};
		// Score each index, and compile a union of all indexes
		for( i = 0; i < weightedSdrs.length; i++ ) {
			for( j = 0; j < weightedSdrs[i].sdr.length; j++ ) {
				// If first time seeing this index, score is the SDR weight, otherwise increase score by the SDR weight
				scoredIndexes[weightedSdrs[i].sdr[j]] =
					( typeof scoredIndexes[weightedSdrs[i].sdr[j]] === 'undefined' ) ? weightedSdrs[i].weight
						: ( scoredIndexes[weightedSdrs[i].sdr[j]] + weightedSdrs[i].weight );
				// Include this index in the the union of all indexes
				if( !union.includes( weightedSdrs[i].sdr[j] ) ) {
					union.push( weightedSdrs[i].sdr[j] );
				}
			}
		}
		
		// Generate a random, unordered list of indexes (used as a random tie-breaker)
		let randomIndexes = _randomIndexes( union.length, union.length, false );

		// Calculate the number of bits for the return SDR
		let maxBits = Math.round( sdrSize * sparsity );
		if( maxBits > union.length ) {
			// Not enough bits to achieve the desired sparsity
			maxBits = union.length;
		}
		// Generate an SDR containing the indexes with highest scores, using a random tie-breaker
		let sdr = [];
		let randomIndex;
		for( i = 0; i < union.length; i++ ) {
			// Grab the next random index
			randomIndex = union[randomIndexes[i]];
			// Loop through the SDR
			for( j = 0; j < maxBits; j++ ) {
				// If SDR isn't full yet or if the score of this random index is higher, splice it in
				if( ( !( j in sdr ) ) || scoredIndexes[randomIndex] > scoredIndexes[sdr[j]] ) {
					sdr.splice( j, 0, randomIndex );
					// Enforce the desired sparsity
					if( sdr.length > maxBits ) {
						sdr.length = maxBits;
					}
					break;
				}
			}
		}
		
		// Return the newly complied SDR
		return sdr.sort( _sortNumber );
	}
}
