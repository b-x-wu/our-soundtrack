var express = require('express');
var router = express.Router();
const got = require('got');
require('dotenv').config();
const { ObjectID } = require('mongodb');
const [serialize, addQueryParams, getFields] = require("../utils/string_parsing"); 

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
  res.clearCookie('refresh_token', { httpOnly: true });
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
      const allSongsObj = await cursor.next();
      var allSongs = allSongsObj['all_songs'];

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

      // console.log(allSongs);

      await collection.updateOne(
        {_id: content['groupId']}, 
        {
          $set: {all_songs: allSongs}
        }
      );

    } catch(e) {

      console.log(e);
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
      res.cookie('refresh_token', responseBody['refresh_token'], { httpOnly: true });
      res.redirect('/members/add_member');

    } catch (e) {

      console.log(e.response.body);
      res.render('index', { title: 'Express', content: "oops all errors" });

    }

  })();

});

// TODO: Clear cookies

module.exports = router;
