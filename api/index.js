const image = require( "./image" )( );

module.exports = ( server ) => {
	// Upload images, responds with SDRs
	server.post( '/', image.upload );
};
