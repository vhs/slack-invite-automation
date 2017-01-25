var express = require('express');
var router = express.Router();
var request = require('request');
var config = require('../config');

router.use( '/', function( req, res, next ) {
	if( req.connection.remoteAddress != config.nomosIP ) {
		console.log( "Invalid connection from: " + req.connection.remoteAddress );
		res.status(401).send('Direct access not allowed. Please register through https://membership.vanhack.ca/ or ask an admin.' );
	}
	next();
});

router.get('/', function(req, res) {
  res.render('index', { community: config.community });
});

router.post('/invite', function(req, res) {
  if (req.body.email) {
    request.post({
        url: 'https://'+ config.slackUrl + '/api/users.admin.invite',
        form: {
          email: req.body.email,
          token: config.slacktoken,
          set_active: true
        }
      }, function(err, httpResponse, body) {
        // body looks like:
        //   {"ok":true}
        //       or
        //   {"ok":false,"error":"already_invited"}
        if (err) { return res.send('Error:' + err); }
        body = JSON.parse(body);
        if (body.ok) {
          if (req.body.return){
            res.redirect(req.body.return + "?res=success");
          } else {
            res.send('Success! Check "'+ req.body.email +'" for an invite from Slack.');
          }
        } else {
          res.send('Failed! ' + body.error)
        }
      });
  } else {
    res.status(400).send('email is required.');
  }
});

module.exports = router;
