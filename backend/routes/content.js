const express = require('express');
const router = express.Router();
const contentController = require('../controllers/contentController');

router.get('/blog-posts', contentController.listPublicBlogPosts);
router.get('/docs', contentController.listPublicDocs);

module.exports = router;
