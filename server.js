var path = require( 'path' );
var express = require( 'express' );

var app = express( );

app.listen( 3000, function ( ) {
	console.log( 'Express server listening' );
} );

app.use( express.static( path.join( __dirname, 'public' ) ) );
