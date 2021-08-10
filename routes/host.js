const express = require('express');
const router = express.Router();
const got = require('got');
const { ObjectID } = require('mongodb');
require('dotenv').config();
const [serialize, addQueryParams, getFields] = require("../utils/string_parsing"); 

router.get('/', (req, res, next) => {
  res.render('index', { title: 'Express', content: process.env.CLIENT_ID });
});

router.get('/auth', (req, res) => {
  // redirects user to spotify login page

  const params = {
    client_id: process.env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: 'http://localhost:3000/host/get_tokens',
    scope: 'user-top-read'
  }

  const authURL = addQueryParams('https://accounts.spotify.com/en/authorize', params);

  res.redirect(authURL);

});

router.get('/get_tokens', (req, res, next) => {
  // requests access tokens
  // TODO: what happens if the user denies access?

  const body = {
    grant_type: 'authorization_code',
    code: req.query['code'],
    redirect_uri: 'http://localhost:3000/host/get_tokens',
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
      res.redirect('/host/add_host');

    } catch (e) {

      console.log(e.response.body);
      res.render('index', { title: 'Express', content: "oops all errors" });

    }

  })();

});

router.get('/add_host', (req, res) => {

  const content = req.cookies;
  res.clearCookie('access_token', { httpOnly: true });
  res.clearCookie('refresh_token', { httpOnly: true });

  const oID = new ObjectID();
  const ID = oID.toHexString();

  const topTrackQuery = {
      time_range: 'long_term',
      limit: 50,
  };

  (async (client) => {

    try {

      await client.connect();
      const collection = client.db("our-soundtrack").collection("groups");

      const hostInfo = await (async () => {

        try {

          const userInfo = await got('https://api.spotify.com/v1/me', {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['access_token']
            }
          });

          const topTracks = await got(addQueryParams("https://api.spotify.com/v1/me/top/tracks", topTrackQuery), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['access_token']
            }
          });

          const topTrackItems = JSON.parse(topTracks.body)['items'];

          return {host: {
              userInfo: getFields(JSON.parse(userInfo.body), ['id', 'uri', 'display_name']), 
              topTracks: topTrackItems.map(x => x['uri'])
            },
            members: [],
            all_songs: topTrackItems.reduce((obj, x) => {
              obj[x['uri']] = 49 - topTrackItems.indexOf(x);
              return obj;
            }, {}),
            _id: ID
          };

        } catch (e) {

          console.log(e);
          res.render('index', { title: 'Express', content: "oops all errors" });
          return;

        }

      })();

      console.log(hostInfo);
      await collection.insertOne(hostInfo);

      // TODO: Create playlist

    } catch (e) {
      console.log(e);
      res.render('index', { title: 'Express', content: "oops all errors" });
    } finally{
      await client.close();
      res.render('index', { title: 'Express', content: "https://localhost:3000/members/add_member/" + ID });
    }
  
  })(req.mongoClient);

});

router.get('/refresh', (req, res) => {
  // TODO: refresh authentication token
});

module.exports = router;
