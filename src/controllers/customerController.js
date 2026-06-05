const prisma = require('../prisma/client');
const notificationService = require("../services/notificationService");

const fs = require('fs');
const path = require('path');

exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        addresses: true,
        acUnits: true
      }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile' });
  }
};

exports.raiseComplaint = async (req, res) => {
  try {
    const {
      issueType,
      description,
      acUnitIds,
      preferredDate,
      address,
      images
    } = req.body;

    if (!issueType || !description) {
      return res.status(400).json({
        message: 'Issue type and description are required'
      });
    }

    const count = await prisma.complaint.count();

    let savedImages = null;
    if (images && Array.isArray(images)) {
      const imgDir = path.join(__dirname, '..', '..', 'uploads', 'complaints');
      if (!fs.existsSync(imgDir)) {
        fs.mkdirSync(imgDir, { recursive: true });
      }
      savedImages = images.map((img, index) => {
        if (!img.base64) return null;
        const imgFilename = `complaint_${req.user.id}_${Date.now()}_${index}.png`;
        const imgPath = path.join(imgDir, imgFilename);
        fs.writeFileSync(imgPath, Buffer.from(img.base64, 'base64'));
        return { name: img.name || `Image ${index + 1}`, url: `/uploads/complaints/${imgFilename}` };
      }).filter(Boolean);
    }

    const complaintNumber =
      `#CMP-${9000 + count + 1}`;

    const complaint =
      await prisma.complaint.create({
        data: {
          complaintNumber,
          images: savedImages,

          customerId: req.user.id,

          issueType,

          description,

          address,

          preferredDate: preferredDate
            ? new Date(preferredDate)
            : null,

          status: 'Pending',

          acUnits: acUnitIds?.length
            ? {
              connect: acUnitIds.map(id => ({
                id
              }))
            }
            : undefined,

          events: {
            create: [
              {
                status: 'Complaint Logged',
                description: 'Customer raised a new complaint'
              }
            ]
          }
        },

        include: {
          acUnits: true
        }
      });

    // Notify all admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      if (admin.fcmToken) {
        await notificationService.sendPushNotification(
          admin.id,
          'New Complaint Raised',
          `A new complaint ${complaintNumber} has been raised by ${req.user.name}`,
          { complaintId: complaint.id, type: 'NEW_COMPLAINT', icon: 'bell', color: 'blue' }
        );
      }
    }

    res.status(201).json(complaint);

  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Error raising complaint',
      error: error.message
    });
  }
};

exports.raiseAgain = async (req, res) => {
  try {
    const { id } = req.params;

    // Find the complaint
    const complaint = await prisma.complaint.findUnique({
      where: { id }
    });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.customerId !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { id },
      data: {
        status: 'Pending',
        technicianId: null, // Reset technician so it goes back to the pool
        events: {
          create: [
            {
              status: 'Complaint Raised Again',
              description: 'Customer reported the issue was not fixed and raised it again'
            }
          ]
        }
      },
      include: {
        acUnits: true,
        events: true,
      }
    });

    // Notify admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      if (admin.fcmToken) {
        await notificationService.sendPushNotification(
          admin.id,
          'Complaint Raised Again',
          `Complaint ${complaint.complaintNumber} has been re-opened by the customer.`,
          { complaintId: updatedComplaint.id, type: 'COMPLAINT_REOPENED', icon: 'alert-triangle', color: 'red' }
        );
      }
    }

    res.json(updatedComplaint);

  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error raising complaint again',
      error: error.message
    });
  }
};


exports.getComplaintHistory = async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      where: { customerId: req.user.id },
      orderBy: { date: 'desc' },
      include: {
        technician: {
          select: { name: true, phone: true, avatar: true }
        }
      }
    });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching history' });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const { type, address, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    const newAddress = await prisma.address.create({
      data: {
        userId: req.user.id,
        type,
        address,
        isDefault
      }
    });
    res.status(201).json(newAddress);
  } catch (error) {
    res.status(500).json({ message: 'Error adding address' });
  }
};

exports.getACUnits = async (req, res) => {
  try {
    const units = await prisma.aCUnit.findMany({
      where: { userId: req.user.id }
    });
    res.json(units);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error fetching AC units',
      error: error.message
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, phone },
      include: { addresses: true, acUnits: true }
    });
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, address, isDefault } = req.body;

    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }

    const updatedAddress = await prisma.address.update({
      where: { id },
      data: { type, address, isDefault }
    });
    res.json(updatedAddress);
  } catch (error) {
    res.status(500).json({ message: 'Error updating address', error: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.address.delete({
      where: { id }
    });
    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting address', error: error.message });
  }
};
