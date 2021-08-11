var express = require('express');
var router = express.Router();
const got = require('got');
require('dotenv').config();
const [serialize, addQueryParams, getFields, encrypt, decrypt] = require("../utils/string_parsing");
const crypto = require('crypto');

/* GET users listing. */
router.get('/', (req, res, next) => {
  res.send('respond with a resource');
});

router.get('/add_member/:groupId', (req, res, next) => {

  if (req.cookies['access_token']) { next(); }

  res.cookie('groupId', req.params.groupId, { httpOnly: true });

  const params = {
    client_id: process.env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: 'http://localhost:3000/members/get_tokens',
    scope: 'user-top-read'
  }

  const authURL = addQueryParams('https://accounts.spotify.com/en/authorize', params);

  res.redirect(authURL);

});

router.get('/add_member', (req, res) => {

  // TODO: Check if user is already in group

  const content = req.cookies;
  res.clearCookie('access_token', { httpOnly: true });
  res.clearCookie('groupId', { httpOnly: true });

  const topTrackQuery = {
      time_range: 'long_term',
      limit: 50,
  };

  (async (client) => {

    try {

      await client.connect();
      const collection = client.db("our-soundtrack").collection("groups");

      const memberInfo = await (async () => {

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

          return {
            userInfo: getFields(JSON.parse(userInfo.body), ['id', 'uri', 'display_name']), 
            topTracks: JSON.parse(topTracks.body)['items'].map(x => x['uri'])
          };

        } catch (e) {

          console.log(e);
          res.clearCookie('access_token', { httpOnly: true });
          res.clearCookie('groupId', { httpOnly: true });
          res.render('index', { title: 'Express', content: "oops all errors" });
          return;

        }

      })();
      
      await collection.updateOne({_id: content['groupId']}, [
          { $addFields: 
            {
              members: {
                $concatArrays: ["$members", [memberInfo]]
              }
            }
          }
        ]
      );

      const cursor = await collection.find({_id: content['groupId']});
      const groupObj = await cursor.next();

      // TODO: what if the playlist was deleted

      var allSongs = groupObj['allSongs'];
      const playlistId = groupObj['playlist']['id'];
      const accessToken = decrypt(groupObj['host']['tokens']['accessToken']);

      for (let song of memberInfo['topTracks']) {
        let pos = 49 - memberInfo['topTracks'].indexOf(song)
        if (Object.keys(allSongs).includes(song)) {
          let originalScore = allSongs[song];
          let n = (originalScore - (originalScore % 50)) / 50 + 2;
          allSongs[song] = 50 * (n - 1) + ((originalScore % 50) * (n - 1) + pos) / n; 
        } else {
          allSongs[song] = pos;
        }
      }

      const playlistItems = await got(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        headers: {
          'Authorization': 'Bearer ' + accessToken
        }
      });

      const tracksInPlaylist = JSON.parse(playlistItems.body)['items'].map(x => {return {uri: x['track']['uri']}});


      await got(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'DELETE',
        body: JSON.stringify({tracks: tracksInPlaylist}),
        headers: {
          'Authorization': 'Bearer ' + accessToken, // TODO: what if access token needs refreshing?
          'Content-Type': 'application/json'
        }
      });

      const addSongsBody = {
        uris: ((obj) => {
          let sortable = [];
          for (key in obj) {
            sortable.push([key, obj['key']]);
          }
          sortable.sort((s1, s2) => {
            return s1[1] - s2[1];
          })
          return sortable;
        })(allSongs).map(x => x[0]).slice(0, 50) // TODO: make playlist size flexible
      };

      await got(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + accessToken
        },
        body: JSON.stringify(addSongsBody)
      });

      await collection.updateOne(
        {_id: content['groupId']}, 
        {
          $set: {allSongs: allSongs}
        }
      );

    } catch(e) {

      console.log(e);
      res.clearCookie('access_token', { httpOnly: true });
      res.clearCookie('groupId', { httpOnly: true });
      res.render('index', { title: 'Express', content: "oops all errors" });

    } finally{
      // await client.close(); // TODO: after one go the client closes and doesn't reopen
      res.render('index', { title: 'Express', content: "all good, check mongodb" });
    }
  
  })(req.mongoClient);
});

router.get('/get_tokens', (req, res) => {
  // requests access tokens
  // TODO: what happens if the user denies access?

  const body = {
    grant_type: 'authorization_code',
    code: req.query['code'],
    redirect_uri: 'http://localhost:3000/members/get_tokens',
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

      const responseBody = JSON.parse(response.body);

      res.cookie('access_token', responseBody['access_token'], { httpOnly: true });
      res.redirect('/members/refresh_tokens');

    } catch (e) {

      console.log(e.response.body);
      res.render('index', { title: 'Express', content: "oops all errors" });

    }

  })();

});

router.get('/refresh_tokens', (req, res) => {
  (async (client) => {
    try {

      await client.connect();
      const collection = client.db("our-soundtrack").collection("groups");
      const cursor = await collection.find({_id: req.cookies['groupId']});
      const groupObj = await cursor.next();
      const refreshToken = decrypt(groupObj['host']['tokens']['refreshToken']);

      const refreshBody = {
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      };

      const refreshResponse = await got('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(process.env.CLIENT_ID + ':' + process.env.CLIENT_SECRET).toString('base64')
        },
        body: serialize(refreshBody)
      });

      const newAccessToken = encrypt(JSON.parse(refreshResponse.body)['access_token']);
      collection.updateOne(
        {
          _id: req.cookies['groupId']
        }, {
          $set: {'host.tokens.accessToken': newAccessToken}
        }
      );

    } catch (e) {
      res.clearCookie('access_token', { httpOnly: true });
      res.clearCookie('groupId', { httpOnly: true });
      console.log(e);
      res.render('index', {title: 'Express', content: 'oops all errors'});
    } finally {
      res.redirect('/members/add_member')
    }
  })(req.mongoClient);
});

// TODO: Comments!!!

module.exports = router;
