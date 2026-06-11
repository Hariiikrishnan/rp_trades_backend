const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const prisma = require('../prisma/client');
const config = require('../config/config');

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    config.jwtSecret,
    { expiresIn: config.tokenExpiration }
  );

  const refreshToken = jwt.sign(
    { userId },
    config.jwtRefreshSecret,
    { expiresIn: config.refreshTokenExpiration }
  );

  return { accessToken, refreshToken };
};

exports.login = async (req, res) => {
  try {
    const { username, password, role } = req.body;

    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    if (role && user.role !== role.toUpperCase()) {
      return res.status(403).json({
        message: 'Invalid role for this user'
      });
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    const { accessToken, refreshToken } =
      generateTokens(user.id);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        avatar: user.avatar
      },
      accessToken,
      refreshToken
    });

  } catch (error) {
    res.status(500).json({
      message: 'Login failed',
      error: error.message
    });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      message: 'Refresh token required'
    });
  }

  try {
    const decoded = jwt.verify(
      refreshToken,
      config.jwtRefreshSecret
    );

    const tokens = generateTokens(decoded.userId);

    res.json(tokens);

  } catch (error) {
    res.status(401).json({
      message: 'Invalid refresh token'
    });
  }
};

exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;

    await prisma.user.update({
      where: {
        id: req.user.id
      },
      data: {
        fcmToken
      }
    });

    res.json({
      message: 'FCM token updated'
    });

  } catch (error) {
    res.status(500).json({
      message: 'Failed to update FCM token',
      error: error.message
    });
  }
};