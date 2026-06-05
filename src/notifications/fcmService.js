const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let isInitialized = false;

// Attempt to initialize Firebase Admin SDK
try {
  const serviceAccountPath = path.join(__dirname, '../../../manus_backend/serviceAccountKey.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    isInitialized = true;
    console.log('Firebase Admin SDK initialized successfully.');
  } else {
    console.warn('Firebase Admin SDK not initialized: serviceAccountKey.json not found in root directory.');
  }
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error);
}

const sendPushNotification = async (token, title, body, data = {}) => {
  if (!isInitialized) {
    console.warn(`[Mock Push] Would send notification to ${token}: ${title} - ${body}`);
    return;
  }

  const message = {
    notification: {
      title,
      body,
    },
    data: {
      ...data,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
    },
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Successfully sent message:', response);
    return response;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

module.exports = {
  isInitialized,
  sendPushNotification
};
