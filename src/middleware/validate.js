/**
 * Lightweight input validation helpers.
 * Usage: validate.body(['email', 'password']) as middleware.
 */

const validateBody = (fields) => (req, res, next) => {
  const missing = fields.filter(
    (f) => req.body[f] === undefined || req.body[f] === null || req.body[f] === ''
  );
  if (missing.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missing.join(', ')}`,
    });
  }
  next();
};

const validatePasswordStrength = (req, res, next) => {
  const { password, newPassword } = req.body;
  const pwd = password || newPassword;
  if (pwd && pwd.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
  }
  next();
};

module.exports = { validateBody, validatePasswordStrength };
