var express = require('express');
var router = express.Router();
var got = require('got');
require('dotenv').config();
var fs = require('fs');
var [serialize, add_query_params] = require("../utils/string_parsing"); 

router.get('/', (req, res, next) => {
  res.render('index', { title: 'Express', content: process.env.CLIENT_ID });
});

router.get('/auth', (req, res) => {
  // redirects user to spotify login page

  const params = {
    client_id: process.env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: 'http://localhost:3000/get_tokens',
    scope: 'user-top-read'
  }

  const authURL = add_query_params('https://accounts.spotify.com/en/authorize', params);

  res.redirect(authURL)

});

router.get('/get_tokens', (req, res, next) => {
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

    (async () => {

      try {

        const response = await got('https://accounts.spotify.com/api/token', {
          method: 'POST',
          body: serialize(body),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

        // res.render('index', { title: 'Express', content: response.body });
        // next('route');

        const responseBody = JSON.parse(response.body);

        res.cookie('access_token', responseBody['access_token'], { httpOnly: true });
        res.cookie('refresh_token', responseBody['refresh_token'], { httpOnly: true });
        res.redirect('/top_tracks');

      } catch (e) {

        console.log(e.response.body);
        res.render('index', { title: 'Express', content: "oops all errors" });

      }

    })();

  } else if (req.query.hasOwnProperty('access_token')) {

  }

});

router.get('/top_tracks', (req, res) => {

  const content = req.cookies;
  res.clearCookie('access_token', { httpOnly: true });
  res.clearCookie('refresh_token', { httpOnly: true });
  console.log(JSON.stringify(content));

  // res.render('index', { title: 'Express', content: JSON.stringify(content) });

  const body = {
      time_range: 'long_term',
      limit: 50,
  };

  (async () => {

    try {

      const trackURL = add_query_params('https://api.spotify.com/v1/me/top/tracks', body);
      const response = await got(trackURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Bearer ' + content['access_token']
        }
      });

      const responseBody = JSON.parse(response.body);
      res.render('index', { title: 'Express', content: JSON.stringify(responseBody, null, '\t') });

    } catch (e) {

      console.log(e.response);
      res.render('index', { title: 'Express', content: "oops all errors" });

    }

  })();

})

module.exports = router;
