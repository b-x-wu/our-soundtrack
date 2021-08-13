const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
	res.render('index', {title: "Home", content: "Welcome. This is pre-alpha build 0.0.1" });
});

module.exports = router;
