var express = require('express');
var router = express.Router();
var got = require('got');
require('dotenv').config();
var fs = require('fs');
var serialize = require("../utils/string_parsing"); 

router.get('/', (req, res, next) => {
  res.render('index', { title: 'Express', content: process.env.CLIENT_ID });
});

router.get('/auth', (req, res) => {
  // redirects user to spotify login page

  const params = {
    client_id: process.env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: 'http://localhost:3000/get_tokens'
  }

  const authURL = 'https://accounts.spotify.com/en/authorize' + '?' + serialize(params)

  res.redirect(authURL)

});

router.get('/get_tokens', (req, res) => {
  // requests access tokens
  // TODO: what happens if the user denies access?

  if (req.query.hasOwnProperty('code')) {

    const body = {
      grant_type: 'authorization_code',
      code: req.query['code'],
      redirect_uri: 'http://localhost:3000/get_tokens',
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET
    };
    console.log(serialize(body));

    (async () => {

      try {

        const response = await got('https://accounts.spotify.com/api/token', {
          method: 'POST',
          body: serialize(body),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        console.log(response.body);
        res.render('index', { title: 'Express', content: response.body });

      } catch (e) {

        console.log(e.response.body);
        res.render('index', { title: 'Express', content: "oops all errors" });

      }

    })();

  } else if (req.query.hasOwnProperty('access_token')) {

  }

});

module.exports = router;
