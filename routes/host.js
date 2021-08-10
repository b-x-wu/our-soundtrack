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
    scope: 'user-top-read playlist-modify-public'
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

      res.cookie('accessToken', responseBody['access_token'], { httpOnly: true });
      res.cookie('refreshToken', responseBody['refresh_token'], { httpOnly: true });
      res.redirect('/host/add_host');

    } catch (e) {

      console.log(e.response.body);
      res.render('index', { title: 'Express', content: "oops all errors" });

    }

  })();

});

router.get('/add_host', (req, res) => {

  const content = req.cookies;
  res.clearCookie('accessToken', { httpOnly: true });
  res.clearCookie('refreshToken', { httpOnly: true });

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
        // TODO: does this need to be its own try/catch?
        try {

          const userInfo = await got('https://api.spotify.com/v1/me', {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['accessToken']
            }
          });

          const topTracks = await got(addQueryParams("https://api.spotify.com/v1/me/top/tracks", topTrackQuery), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['accessToken']
            }
          });

          const topTrackItems = JSON.parse(topTracks.body)['items'];
          const userInfoObj = JSON.parse(userInfo.body);
          const userID = userInfoObj['id'];

          // Create Playlist
          const createPlaylistBody = {
            name: "Group Playlist"
          };

          const createPlaylist = await got(`https://api.spotify.com/v1/users/${userID}/playlists`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + content['accessToken']
            },
            body: JSON.stringify(createPlaylistBody)
          });

          const createPlaylistObj = JSON.parse(createPlaylist.body);

          // Add songs to playlist

          // console.log(topTrackItems.map(x => x['uri']).slice(0, 50));

          const addSongsBody = {
            uris: topTrackItems.map(x => x['uri']).slice(0, 50), // TODO: make playlist size flexible
          };

          await got(`https://api.spotify.com/v1/playlists/${createPlaylistObj['id']}/tracks`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + content['accessToken']
            },
            body: JSON.stringify(addSongsBody)
          });

          return {host: {
              userInfo: getFields(userInfoObj, ['id', 'uri', 'display_name']), 
              topTracks: topTrackItems.map(x => x['uri']),
              tokens: {
                accessToken: content['accessToken'], // TODO: Encrypt these
                refreshToken: content['refreshToken']
              }
            },
            members: [],
            allSongs: topTrackItems.reduce((obj, x) => {
              obj[x['uri']] = 49 - topTrackItems.indexOf(x);
              return obj;
            }, {}),
            playlist: {
              uri: createPlaylistObj['uri'],
              id: createPlaylistObj['id']
            },
            _id: ID
          };

        } catch (e) {

          console.log(e);
          res.render('index', { title: 'Express', content: "oops all errors" });
          return;

        }

      })();

      // console.log(hostInfo);
      await collection.insertOne(hostInfo);

    } catch (e) {
      console.log(e);
      res.render('index', { title: 'Express', content: "oops all errors" });
    } finally {
      // await client.close();
      res.render('index', { title: 'Express', content: "http://localhost:3000/members/add_member/" + ID });
    }
  
  })(req.mongoClient);

});

router.get('/refresh', (req, res) => {
  // TODO: refresh authentication token
});

module.exports = router;
