const express = require('express');
const router = express.Router();
const got = require('got');

router.get('/', (req, res) => {
  res.render('index', {title: "Our Playlist", content: "Welcome. This is pre-alpha build 0.0.1" });
});

module.exports = router;
