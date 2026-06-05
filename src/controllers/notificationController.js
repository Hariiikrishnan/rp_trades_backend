const prisma = require('../prisma/client');
const notificationService = require('../services/notificationService');

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notification = await notificationService.markNotificationAsRead(id);
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Error updating notification status' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await notificationService.markAllNotificationsAsRead(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Error marking all notifications as read' });
  }
};

exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await notificationService.deleteNotification(id);
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting notification' });
  }
};
