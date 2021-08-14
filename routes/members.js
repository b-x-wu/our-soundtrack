var express = require('express');
var router = express.Router();
const got = require('got');
require('dotenv').config();
const [serialize, addQueryParams, getFields, encrypt, decrypt] = require("../utils/string_parsing");
const crypto = require('crypto');

router.get('/add_member/:groupId', (req, res, next) => {

  if (req.cookies['access_token']) { next(); }

  res.cookie('groupId', req.params.groupId, { httpOnly: true });
  

  const params = {
    client_id: process.env.CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.URL_PREFIX + '/members/get_tokens',
    scope: 'user-top-read'
  }

  console.log(params['redirect_uri']);

  const authURL = addQueryParams('https://accounts.spotify.com/en/authorize', params);

  res.redirect(authURL);

});

router.get('/add_member', (req, res) => {

  console.log(req.cookies);
  const content = req.cookies;
  res.clearCookie('access_token', { httpOnly: true });
  res.clearCookie('groupId', { httpOnly: true });
  res.clearCookie('member_id', { httpOnly: true });

  const topTrackQuery = {
      time_range: 'long_term',
      limit: 50,
  };

  (async (collection) => {

    try {

      const topTracks = await (async () => {

        try {

          const topTracksResponse = await got(addQueryParams("https://api.spotify.com/v1/me/top/tracks", topTrackQuery), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': 'Bearer ' + content['access_token']
            }
          });

          return JSON.parse(topTracksResponse.body)['items'].map(x => x['uri']);

        } catch (e) {

          console.log(e);
          res.render('index', { title: 'Our Playlist', content: "Error. Please tell Bruce about this." });
          return;

        }

      })();

      // console.log(content);
      await collection.updateOne(
        {_id: content['groupId'], "members.userInfo.id": content['member_id']},
        {$set: 
          {"members.$.topTracks": topTracks}
        }
      ); // not done yet

      const cursor = await collection.find({_id: content['groupId']});
      const groupObj = await cursor.next();

      var allSongs = groupObj['allSongs'];
      const playlistId = groupObj['playlist']['id'];
      const playlistUri = groupObj['playlist']['uri'];
      const accessToken = decrypt(groupObj['host']['tokens']['accessToken']);

      for (let song of topTracks) {
        let pos = 49 - topTracks.indexOf(song)
        if (Object.keys(allSongs).includes(song)) {
          let originalScore = allSongs[song];
          let n = (originalScore - (originalScore % 50)) / 50 + 2;
          allSongs[song] = 50 * (n - 1) + ((originalScore % 50) * (n - 1) + pos) / n; 
        } else {
          allSongs[song] = pos;
        }
      }

      console.log("accessToken: " + accessToken);
      console.log("playlistId: " + playlistId);

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
          'Authorization': 'Bearer ' + accessToken,
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

      res.render('index', { title: 'Our Playlist', content: "Copy this into your search bar: " + playlistUri });

    } catch(e) {

      console.log(e);
      res.clearCookie('access_token', { httpOnly: true });
      res.clearCookie('groupId', { httpOnly: true });
      res.clearCookie('member_id', { httpOnly: true });
      res.render('index', { title: 'Our Playlist', content: "Error. Please tell Bruce about this." });

    }
  
  })(req.collection);
});

router.get('/get_tokens', (req, res) => {
  // requests access tokens
  
  if (req.query['error']) { res.redirect('/members/access_denied'); }

  const body = {
    grant_type: 'authorization_code',
    code: req.query['code'],
    redirect_uri: process.env.URL_PREFIX + '/members/get_tokens',
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
      res.render('index', { title: 'Our Playlist', content: "Error. Tell Bruce about this" });

    }

  })();

});

router.get('/access_denied', (req, res) => {
  res.render('index', {title: 'Our Playlist'});
});

router.get('/refresh_tokens', (req, res) => {
  (async (collection) => {
    try {

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
      res.render('index', {title: 'Our Playlist', content: "Error. Tell Bruce about this." });
    } finally {
      res.redirect('/members/check_member')
    }
  })(req.collection);
});

router.get('/check_member', (req, res, next) => {
  (async (collection) => {
    try {
      const cursor = await collection.find({_id: req.cookies['groupId']});
      const groupObj = await cursor.next();

      const userIDs = groupObj['members'].map(x => x['userInfo']['id']).concat([groupObj['host']['userInfo']['id']]);

      const memberInfo = await got('https://api.spotify.com/v1/me', {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Bearer ' + req.cookies['access_token']
        }
      });
      const memberInfoObj = JSON.parse(memberInfo.body);
      res.cookie('member_id', memberInfoObj['id'], { httpOnly: true });

      if (userIDs.includes(memberInfoObj['id'])) {
        res.clearCookie('access_token', { httpOnly: true });
        res.clearCookie('groupId', { httpOnly: true });
        res.clearCookie('member_id', { httpOnly: true});
        res.render('index', {title: 'Our Playlist', content: 'User already a part of the group.'});
      } else {
        await collection.updateOne({_id: req.cookies['groupId']}, [
          { $addFields: 
            {
              members: {
                $concatArrays: ["$members", [{
                  userInfo: getFields(memberInfoObj, ['id', 'uri', 'display_name']),
                  topTracks: []
                }]]
              }
            }
          }
        ]);
        res.redirect('/members/add_member');
      }

    } catch (e) {
      res.clearCookie('access_token', { httpOnly: true });
      res.clearCookie('groupId', { httpOnly: true });
      console.log(e);
      res.render('index', {title: 'Our Playlist', content: "Error. Please tell Bruce about this."});
    } finally {

    }
  })(req.collection); 
});

// TODO: Comments!!!

module.exports = router;
