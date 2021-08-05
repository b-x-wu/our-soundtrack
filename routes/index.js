var express = require('express');
var router = express.Router();
var https = require('https');

var fs = require('fs');
var [parseINIString, serialize] = require("../utils/string_parsing"); 

router.get('/', (req, res, next) => {

  fs.readFile('config.ini', 'utf-8', (err, data) => {

    if (err) {
      console.error(err);
      res.render('index', { title: 'Express', content: 'err' });
      return;
    }

    var config = parseINIString(data);
    config['query'] = req.query

    res.render('index', { title: 'Express', content: JSON.stringify(config) });

  });

});

router.get('/auth', (req, res) => {

  fs.readFile('config.ini', 'utf-8', (err, data) => {
    if (err) {
      console.error(err);
      res.render('index', { title: 'Express', content: 'err' });
      return;
    }

    var config = parseINIString(data);

    const params = {
      client_id: config['CLIENT_ID'],
      response_type: 'code',
      redirect_uri: 'http://localhost:3000'
    }

    const authURL = 'https://accounts.spotify.com/en/authorize' + '?' + serialize(params)

    res.redirect(authURL)

  });

  // bunch of nonsense I didn't need

  /*
  const options = {
    method: "GET"
    // path: serialize(params)
    // headers: {
    //   'Access-Control-Allow-Origin': '*'
    // }
  }

  const request = https.request(authURL, options, (response) => {
    console.log(`STATUS: ${response.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(response.headers)}`);
    response.setEncoding('utf8');
    response.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
      res.render('index', { title: 'Express', content: chunk });
    });
    response.on('end', () => {
      console.log('No more data in response.');
    });
  });

  request.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  request.end();

  res.redirect(authURL)
  */

});

module.exports = router;
