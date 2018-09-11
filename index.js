const yamljs = require( "yamljs" ),
	config = yamljs.load( "config.yml" ),
	restify = require( "restify" ),
	corsMW = require( "restify-cors-middleware" ),
	cors = corsMW( {
		preflightMaxAge: 600,
		origins: ["*"],
		methods: ["GET","PUT","DELETE","POST","OPTIONS"]
	} ),
	server = restify.createServer( {
		name : "image2sdr"
	} ),
	api = require( "./api" );

// If not running on production, log all requests
if( config.environment !== "Production" ) {
	server.use( ( req, res, next ) => {
		console.log( req.method + ": " + req.url );
		return next();
	} );
}

// Allow cross-origin resource sharing
server.pre( cors.preflight );
server.use( cors.actual );

// Restify options
server.use( restify.plugins.fullResponse() );
server.use( restify.plugins.queryParser( { mapParams: false } ) );

// Support file uploads
server.use( restify.plugins.bodyParser( { mapParams: true, mapFiles: false, uploadDir: "./uploads", keepExtensions: true } ) );

// Enable the API endpoints
api( server );

// Begin listening
server.listen( config.port, ( ) => {
	console.log( "image2sdr listening on port " + config.port );
} );
