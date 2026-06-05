const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./src/config/config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
const authRoutes = require('./src/routes/authRoutes');
const complaintRoutes = require('./src/routes/complaintRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const technicianRoutes = require('./src/routes/technicianRoutes');
const customerRoutes = require('./src/routes/customerRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const reviewRoutes = require('./src/routes/reviewRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/technician', technicianRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reviews', reviewRoutes);

app.get("/test",(req,res)=>{
  res.json("Testing route working");
});

// const admin = require('firebase-admin');
// const serviceAccount = require('./serviceAccountKey.json'); 

// // Initialize Firebase Admin SDK
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });



/**
 * POST /api/send-notification
 * Sends a push notification to a specific device token.
 */
// app.get('/api/send-notification', async (req, res) => {


//   // 1. Basic validation
//   // if (!token || !title || !body) {
//   //   return res.status(400).json({
//   //     success: false,
//   //     error: 'Missing required fields: token, title, and body are required.'
//   //   });
//   // }

//   // 2. Construct the FCM payload
//   const message = {
//     notification: {
//       title: "Hello",
//       body: "Hiii"
//     },
//     // Optional custom data payload (must be strings)
//     data:  {}, 
//     token: "f1oVDCsfSjCMo2kNl1eyYY:APA91bEX8_ZXiqWBz60YGebpR0YfA6Lu7lAY_zHxAqn1vPO4S878z4lJWbwusmIfW4arVp_Y_MABanKMNA9sRURRkenLYeRk8KlT92JYd0rr9cRH3VHBLPY"
//   };

//   try {
//     // 3. Send the notification via Firebase
//     const response = await admin.messaging().send(message);
//     console.log(response);
    
//     return res.status(200).json({
//       success: true,
//       messageId: response
//     });

//   } catch (error) {
//     console.error('FCM Error:', error);

//     // 4. Handle expired or invalid client tokens
//     if (
//       error.code === 'messaging/registration-token-not-registered' ||
//       error.code === 'messaging/invalid-registration-token'
//     ) {
//       // TODO: Add code here to delete this token from your database
//       console.warn(`Token ${token} is no longer valid. Cleaning up database.`);
      
//       return res.status(410).json({
//         success: false,
//         error: 'The device token is invalid or expired. Please remove it.'
//       });
//     }

//     // Handle generic internal server/FCM errors
//     return res.status(500).json({
//       success: false,
//       error: 'Failed to send notification.',
//       details: error.message
//     });
//   }
// });




// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
