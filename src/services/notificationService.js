// Note: This requires 'firebase-admin' package
// For now, providing a structured service that can be easily connected to Firebase

const prisma = require('../prisma/client');
const fcmService = require('../notifications/fcmService');
const MAX_NOTIFICATIONS_PER_USER = 50; // Example limit

class NotificationService {
  async sendPushNotification(userId, title, body, data = {}) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { fcmToken: true }
      });

      if (!user || !user.fcmToken) {
        console.log(`No FCM token for user ${userId}`);
        return;
      }

      // Save to database
      await prisma.notification.create({
        data: {
          userId,
          title,
          body,
          type: data.type || 'info',
          icon: data.icon || null,
          color: data.color || null
        }
      });

      // Clean up old notifications for the user
      await this.cleanupNotifications(userId);

      // Send push notification via FCM
      if (fcmService.isInitialized) {
        const message = {
          notification: { title, body },
          data: { ...data, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          token: user.fcmToken
        };
        await fcmService.sendPushNotification(user.fcmToken, title, body, data);
      } else {
        console.warn(`[FCM Mock] FCM not initialized. Would send to ${user.fcmToken}: ${title} - ${body}`);
      }
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  async cleanupNotifications(userId) {
    const notificationCount = await prisma.notification.count({
      where: { userId }
    });

    if (notificationCount > MAX_NOTIFICATIONS_PER_USER) {
      const notificationsToDelete = await prisma.notification.findMany({
        where: { userId, isRead: true },
        orderBy: { createdAt: 'asc' },
        take: notificationCount - MAX_NOTIFICATIONS_PER_USER
      });

      if (notificationsToDelete.length > 0) {
        await prisma.notification.deleteMany({
          where: {
            id: { in: notificationsToDelete.map(n => n.id) }
          }
        });
        console.log(`Cleaned up ${notificationsToDelete.length} old notifications for user ${userId}`);
      } else {
        // If no read notifications to delete, delete the oldest unread ones
        const oldestNotifications = await prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          take: notificationCount - MAX_NOTIFICATIONS_PER_USER
        });
        if (oldestNotifications.length > 0) {
          await prisma.notification.deleteMany({
            where: {
              id: { in: oldestNotifications.map(n => n.id) }
            }
          });
          console.log(`Cleaned up ${oldestNotifications.length} oldest unread notifications for user ${userId}`);
        }
      }
    }
  }

  async markNotificationAsRead(notificationId) {
    return prisma.notification.delete({
      where: { id: notificationId }
    });
  }

  async markAllNotificationsAsRead(userId) {
    return prisma.notification.deleteMany({
      where: { userId }
    });
  }

  async deleteNotification(notificationId) {
    return prisma.notification.delete({
      where: { id: notificationId }
    });
  }

  async notifyAdminNewComplaint(complaint) {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      await this.sendPushNotification(
        admin.id,
        'New Complaint Registered 🚨',
        `A new ${complaint.issueType} complaint ${complaint.complaintNumber} has been registered.`,
        { type: 'new_complaint', complaintId: complaint.id }
      );
    }
  }

  async notifyTechnicianAssignment(technicianId, complaint) {
    await this.sendPushNotification(
      technicianId,
      'New Task Assigned 🛠️',
      `You have been assigned to ${complaint.issueType} complaint ${complaint.complaintNumber}.`,
      { type: 'new_assignment', complaintId: complaint.id }
    );
  }

  async notifyCustomerJobCompletion(customerId, complaint) {
    await this.sendPushNotification(
      customerId,
      'Job Completed Successfully 🎉',
      `Your complaint ${complaint.complaintNumber} has been resolved. You can view the service report now.`,
      { type: 'job_completed', complaintId: complaint.id }
    );
  }
}

module.exports = new NotificationService();
