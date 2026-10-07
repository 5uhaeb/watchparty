const allowedOrigins = new Set(
  String(process.env.CLIENT_URL || 'http://localhost:3000')
    .split(',').map((origin) => origin.trim()).filter(Boolean)
);

function isAllowedOrigin(origin) {
  return !origin || allowedOrigins.has(origin) || /^(chrome|moz)-extension:\/\//.test(origin);
}

module.exports = { isAllowedOrigin };
