const express = require('express');
const router = express.Router();
const got = require('got');
require('dotenv').config();
const fs = require('fs');
const [serialize, add_query_params] = require("../utils/string_parsing"); 

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
        res.redirect('/add_host');

      } catch (e) {

        console.log(e.response.body);
        res.render('index', { title: 'Express', content: "oops all errors" });

      }

    })();

  } else if (req.query.hasOwnProperty('access_token')) {

  }

});

router.get('/add_host', (req, res) => {

  const content = req.cookies;
  res.clearCookie('access_token', { httpOnly: true });
  res.clearCookie('refresh_token', { httpOnly: true });

  const body = {
      time_range: 'long_term',
      limit: 50,
  };
  console.log('not connected to mongodb yet');

  (async (client) => {

    try {

      await client.connect();
      const collection = client.db("our-soundtrack").collection("groups");
      console.log('connected to collection');

      const responseBody = await (async () => {

        try {

          // const trackURL = add_query_params('https://api.spotify.com/v1/me');
          const response = await got('https://api.spotify.com/v1/me', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['access_token']
            }
          });
          console.log('got response');

          return JSON.parse(response.body);

        } catch (e) {

          console.log(e);
          res.render('index', { title: 'Express', content: "oops all errors" });
          return;

        }

      })();

      console.log(JSON.stringify({host: responseBody}));
      await collection.insertOne({host: responseBody});
      console.log('posted collection');
      res.render('index', { title: 'Express', content: "all good, check mongodb" });

    } finally{
      await client.close();
    }

  })(req.mongoClient);

})

router.get('/refresh', (req, res) => {
  // TODO: refresh authentication token
})

module.exports = router;
