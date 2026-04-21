const express = require('express');
const { signExtensionToken } = require('../lib/extensionToken');

const router = express.Router();

router.post('/token', (req, res) => {
  try {
    const internalSecret = process.env.EXTENSION_INTERNAL_SECRET;
    const providedSecret = req.get('x-extension-internal-secret');

    if (!internalSecret || providedSecret !== internalSecret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { email, name } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const token = signExtensionToken({ email, name });
    res.json(token);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
