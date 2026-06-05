const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = require('../prisma/client');
const notificationService = require("../services/notificationService");

exports.getAdminProfile = async (req, res) => {
  try {
    const admin = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
      }
    });
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};

exports.updateAdminProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const updatedAdmin = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, email, phone },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
      }
    });
    res.json(updatedAdmin);
  } catch (error) {
    res.status(500).json({ message: 'Error updating profile', error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const totalCustomers = await prisma.user.count({ where: { role: 'CUSTOMER' } });
    const totalTechnicians = await prisma.user.count({ where: { role: 'TECHNICIAN' } });

    const totalComplaints = await prisma.complaint.count();
    const pendingComplaints = await prisma.complaint.count({ where: { status: 'Pending' } });
    const assignedComplaints = await prisma.complaint.count({ where: { status: 'Assigned' } });
    const completedComplaints = await prisma.complaint.count({ where: { status: 'Completed' } });

    const recentComplaints = await prisma.complaint.findMany({
      take: 5,
      orderBy: { date: 'desc' },
      include: { customer: { select: { name: true } } }
    });

    const revenueStats = await prisma.serviceReport.aggregate({ _sum: { totalAmount: true } });

    res.json({
      stats: {
        totalCustomers,
        totalTechnicians,
        totalComplaints,
        pending: pendingComplaints,
        assigned: assignedComplaints,
        completed: completedComplaints,
        totalRevenue: revenueStats._sum.totalAmount || 0
      },
      recentComplaints
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error fetching dashboard stats',
      error: error.message
    });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      acUnits
    } = req.body;

    const existingUser =
      await prisma.user.findUnique({
        where: { email }
      });

    if (existingUser) {
      return res.status(400).json({
        message: 'Customer already exists'
      });
    }

    const setupToken =
      crypto.randomBytes(32).toString('hex');

    const customer = await prisma.user.create({
      data: {
        name,
        email,
        phone,
        role: 'CUSTOMER',

        passwordHash: bcrypt.hashSync('123456', 10),
        isPasswordSet: false,

        setupToken,

        setupTokenExpiry: new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ),

        addresses: {
          create: [
            {
              type: 'HOME',
              address,
              isDefault: true
            }
          ]
        },

        acUnits: {
          create: acUnits.map(unit => ({
            details: unit.details
          }))
        }
      },

      include: {
        addresses: true,
        acUnits: true
      }
    });

    res.status(201).json({
      message: 'Customer created successfully',
      setupToken,
      customer
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error creating customer',
      error: error.message
    });
  }
};

exports.createTechnician = async (req, res) => {
  try {
    const {
      name,
      email,
      phone
    } = req.body;

    const existingUser =
      await prisma.user.findUnique({
        where: { email }
      });

    if (existingUser) {
      return res.status(400).json({
        message: 'Technician already exists'
      });
    }

    const setupToken =
      crypto.randomBytes(32).toString('hex');

    const technician =
      await prisma.user.create({
        data: {
          name,
          email,
          phone,
          role: 'TECHNICIAN',

          passwordHash: bcrypt.hashSync('123456', 10),
          isPasswordSet: false,

          setupToken,

          setupTokenExpiry: new Date(
            Date.now() + 24 * 60 * 60 * 1000
          )
        }
      });

    res.status(201).json({
      message: 'Technician created successfully',
      setupToken,
      technician
    });

  } catch (error) {
    res.status(500).json({
      message: 'Error creating technician',
      error: error.message
    });
  }
};

exports.assignTechnician = async (req, res) => {
  try {
    const {
      complaintId,
      technicianId
    } = req.body;

    const updatedComplaint =
      await prisma.complaint.update({
        where: {
          complaintNumber: complaintId
        },

        data: {
          technicianId,
          status: 'Assigned',
          events: {
            create: [
              {
                status: 'Technician Assigned',
                description: 'A technician was assigned to your complaint'
              }
            ]
          }
        },
        include: {
          technician: true,
          customer: true,
          events: true,
        }
      });

    if (updatedComplaint.technician && updatedComplaint.technician.fcmToken) {
      await notificationService.sendPushNotification(
        updatedComplaint.technician.id,
        'New Job Assigned',
        `You have been assigned job ${updatedComplaint.complaintNumber}`,
        { complaintId: updatedComplaint.id, type: 'JOB_ASSIGNED', icon: 'briefcase', color: 'green' }
      );
    }

    if (updatedComplaint.customer && updatedComplaint.customer.fcmToken) {
      await notificationService.sendPushNotification(
        updatedComplaint.customer.id,
        'Technician Assigned',
        `${updatedComplaint.technician.name} has been assigned to your complaint.`,
        { complaintId: updatedComplaint.id, type: 'TECH_ASSIGNED', icon: 'user', color: 'purple' }
      );
    }

    res.json(updatedComplaint);

  } catch (error) {
    res.status(500).json({
      message: 'Error assigning technician',
      error: error.message
    });
  }
};

exports.getTechnicians = async (req, res) => {
  try {
    const technicians =
      await prisma.user.findMany({
        where: {
          role: 'TECHNICIAN'
        },

        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          avatar: true,
          isPasswordSet: true,
          experience: true,
          specialty: true,
          isAvailable: true,
          techReviews: {
            select: { rating: true }
          }
        }
      });

    const techsWithRating = technicians.map(tech => {
      const avgRating = tech.techReviews.length > 0
        ? tech.techReviews.reduce((sum, r) => sum + r.rating, 0) / tech.techReviews.length
        : 4.8;

      const { techReviews, ...rest } = tech;
      return {
        ...rest,
        rating: Number(avgRating.toFixed(1))
      };
    });

    res.json(techsWithRating);

  } catch (error) {
    res.status(500).json({
      message: 'Error fetching technicians',
      error: error.message
    });
  }
};

exports.getCustomers = async (req, res) => {
  try {
    const customers =
      await prisma.user.findMany({
        where: {
          role: 'CUSTOMER'
        },

        include: {
          addresses: true,
          acUnits: true
        }
      });

    res.json(customers);

  } catch (error) {
    res.status(500).json({
      message: 'Error fetching customers',
      error: error.message
    });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Customer deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting customer', error: error.message });
  }
};

exports.deleteTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Technician deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting technician', error: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const revenueStats = await prisma.serviceReport.aggregate({
      _sum: { totalAmount: true },
      _avg: { totalAmount: true }
    });

    const distribution = await prisma.complaint.groupBy({
      by: ['issueType'],
      _count: { id: true }
    });

    const recentReports = await prisma.serviceReport.findMany({
      take: 6,
      orderBy: { commissioningDate: 'asc' },
      select: { totalAmount: true, commissioningDate: true }
    });

    const revenueTrends = recentReports.map((report, index) => ({
      x: index,
      y: report.totalAmount || 0
    }));

    if (revenueTrends.length === 0) {
      revenueTrends.push({ x: 0, y: 0 });
    }

    // Dynamic rating from reviews
    const ratingStats = await prisma.review.aggregate({
      _avg: { rating: true },
    });
    const avgRating = ratingStats._avg.rating ? Number(ratingStats._avg.rating.toFixed(1)) : 0;

    // Dynamic efficiency: completed / total complaints
    const totalComplaints = await prisma.complaint.count();
    const completedComplaints = await prisma.complaint.count({ where: { status: 'Completed' } });
    const efficiency = totalComplaints > 0 ? Math.round((completedComplaints / totalComplaints) * 100) : 0;

    res.json({
      avgTicket: revenueStats._avg.totalAmount || 0,
      totalRevenue: revenueStats._sum.totalAmount || 0,
      growth: 12.4, // placeholder until enough historical data
      rating: avgRating,
      efficiency: efficiency,
      distribution: distribution.map(d => ({ title: d.issueType, value: d._count.id })),
      revenueTrends: revenueTrends
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching analytics', error: error.message });
  }
};

exports.getAdminNotifications = async (req, res) => {
  try {
    // Return all notifications intended for admin, or broadcast
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id }, // Assuming admin notifications are tied to the admin user ID
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching admin notifications', error: error.message });
  }
};

exports.sendBroadcast = async (req, res) => {
  try {
    const { title, message, target } = req.body;
    // This would involve iterating through users based on 'target' and calling notificationService.sendPushNotification
    // For example, to send to all users:
    // const users = await prisma.user.findMany();
    // for (const user of users) {
    //   await notificationService.sendPushNotification(user.id, title, message, { type: 'BROADCAST' });
    // }
    res.json({ message: 'Broadcast sent' });
  } catch (error) {
    res.status(500).json({ message: 'Error sending broadcast', error: error.message });
  }
};

exports.getAllComplaints = async (req, res) => {
  try {
    const complaints = await prisma.complaint.findMany({
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
        technician: { select: { name: true, phone: true } },
        acUnits: true,
        events: true,
      }
    });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching complaints', error: error.message });
  }
};

exports.globalSearch = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const customers = await prisma.user.findMany({
      where: {
        role: 'CUSTOMER',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ]
      },
      include: { addresses: true }
    });

    const technicians = await prisma.user.findMany({
      where: {
        role: 'TECHNICIAN',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ]
      },
      include: { techReviews: { select: { rating: true } } }
    });

    const complaints = await prisma.complaint.findMany({
      where: {
        OR: [
          { complaintNumber: { contains: q, mode: 'insensitive' } },
          { issueType: { contains: q, mode: 'insensitive' } },
        ]
      },
      include: {
        customer: { select: { name: true } },
        technician: { select: { name: true } }
      }
    });

    const results = [
      ...customers.map(c => ({
        type: 'customer',
        title: c.name,
        subtitle: `Customer • ID: ${c.id.substring(0, 8)} • ${c.addresses?.[0]?.address || 'No Address'}`,
        extra: { id: c.id, name: c.name }
      })),
      ...technicians.map(t => {
        const rating = t.techReviews.length > 0
          ? t.techReviews.reduce((sum, r) => sum + r.rating, 0) / t.techReviews.length
          : 4.8;
        return {
          type: 'technician',
          title: t.name,
          subtitle: `Technician • Specialty: ${t.specialty || 'General'} • Rating: ${rating.toFixed(1)}`,
          extra: { id: t.id, name: t.name, specialty: t.specialty, rating: Number(rating.toFixed(1)), isAvailable: t.isAvailable }
        };
      }),
      ...complaints.map(c => ({
        type: 'complaint',
        title: `${c.complaintNumber} (${c.issueType})`,
        subtitle: `Complaint • Customer: ${c.customer?.name || 'N/A'} • Tech: ${c.technician?.name || 'Unassigned'}`,
        extra: c.complaintNumber
      }))
    ];

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error searching', error: error.message });
  }
};

exports.getAllServiceReports = async (req, res) => {
  try {
    console.log("Hiii");

    const reports = await prisma.serviceReport.findMany({
      orderBy: { commissioningDate: 'desc' },
      include: {
        complaint: {
          include: {
            customer: {
              select: {
                name: true,
                phone: true,
              }
            },
            technician: {
              select: {
                name: true,
                phone: true,
              }
            }
          }
        }
      }
    });

    console.log("Reports count:", reports.length);

    res.json(reports);
  } catch (error) {
    console.error("SERVICE REPORT ERROR:");
    console.error(error);
    console.error(error.stack);

    res.status(500).json({
      message: 'Error fetching service reports',
      error: error.message
    });
  }
};
exports.updateTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, specialty, experience, isAvailable } = req.body;
    const exp = parseInt(experience);

    // Convert isAvailable to boolean if it comes as string, just to be safe
    let availableStatus = isAvailable;
    if (typeof isAvailable === 'string') {
      availableStatus = isAvailable === 'true';
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { name, email, phone, specialty, experience: exp, isAvailable: availableStatus }
    });
    res.json(updated);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Error updating technician', error: error.message });
  }
};
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      include: {
        customer: {
          select: {
            id: true,
            name: true,
          }
        },
        technician: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });

    const formattedReviews = reviews.map(r => ({
      id: r.id,

      technicianId: r.technicianId,
      technicianName: r.technician?.name ?? '',

      customerId: r.customerId,
      customerName: r.customer?.name ?? '',

      rating: r.rating,
      reviewText: r.reviewText,
      date: r.date,
    }));

    res.json(formattedReviews);

  } catch (error) {
    res.status(500).json({
      message: 'Error fetching reviews',
      error: error.message
    });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, addresses, acUnits } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name, email, phone },
    });

    if (addresses && Array.isArray(addresses)) {
      await prisma.address.deleteMany({
        where: { userId: id }
      });
      if (addresses.length > 0) {
        await prisma.address.createMany({
          data: addresses.map(addr => ({
            userId: id,
            type: addr.type || 'HOME',
            address: addr.address,
            isDefault: addr.isDefault || false
          }))
        });
      }
    }

    if (acUnits && Array.isArray(acUnits)) {
      const incomingIds = acUnits.map(unit => unit.id).filter(id => id);

      const existingAcs = await prisma.aCUnit.findMany({ where: { userId: id } });
      const acsToDelete = existingAcs.filter(ac => !incomingIds.includes(ac.id));

      for (const ac of acsToDelete) {
        try {
          await prisma.aCUnit.delete({ where: { id: ac.id } });
        } catch (err) {
          console.warn(`Could not delete AC unit ${ac.id}: ${err.message}`);
        }
      }

      for (const unit of acUnits) {
        if (unit.id) {
          const exists = await prisma.aCUnit.findUnique({ where: { id: unit.id } });
          if (exists) {
            await prisma.aCUnit.update({
              where: { id: unit.id },
              data: { details: unit.details }
            });
          } else {
            await prisma.aCUnit.create({
              data: { userId: id, details: unit.details }
            });
          }
        } else {
          await prisma.aCUnit.create({
            data: { userId: id, details: unit.details }
          });
        }
      }
    }

    const finalUser = await prisma.user.findUnique({
      where: { id },
      include: {
        addresses: true,
        acUnits: true
      }
    });

    res.json(finalUser);
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ message: 'Error updating customer', error: error.message });
  }
};