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
        username: true,
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
    const { name, username, phone } = req.body;
    const updatedAdmin = await prisma.user.update({
      where: { id: req.user.id },
      data: { name, username, phone },
      select: {
        id: true,
        name: true,
        username: true,
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
      username,
      password,
      phone,
      addresses = [],
      acUnits = [],
    } = req.body;
     console.log(req.body);

    // Validation
    if (!name || !username || !password || !addresses || addresses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name, username, password and address are required',
      });
    }

    const existingCustomer =
      await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            ...(phone ? [{ phone }] : []),
          ],
        },
      });

    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: 'Customer already exists',
      });
    }

    // Check duplicate serial numbers in request
    const serialNumbers = acUnits.map(ac => ac.id);

    const duplicates = serialNumbers.filter(
      (item, index) =>
        serialNumbers.indexOf(item) !== index
    );

    if (duplicates.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          'Duplicate AC serial numbers found in request',
      });
    }

    // Check if serial numbers already exist
    if (serialNumbers.length > 0) {
      const existingACs =
        await prisma.aCUnit.findMany({
          where: {
            id: {
              in: serialNumbers,
            },
          },
          select: {
            id: true,
          },
        });
       

      if (existingACs.length > 0) {
        return res.status(400).json({
          success: false,
          message:
            'One or more AC serial numbers already exist',
          existingSerialNumbers:
            existingACs.map(ac => ac.id),
        });
      }
    }

    const setupToken =
      crypto.randomBytes(32).toString('hex');

    const customer =
      await prisma.user.create({
        data: {
          name,
          username,
          phone,

          role: 'CUSTOMER',

          assignedPassword: password,
          passwordHash: bcrypt.hashSync(password, 10),

          addresses: {
            create: addresses.map(addr => ({
              type: addr.type || 'HOME',
              address: addr.address,
              isDefault: addr.isDefault || false,
            })),
          },

          acUnits: {
            create: acUnits.map(ac => ({
              id: ac.id.trim(), // SERIAL NUMBER
              details: ac.details.trim(),
            })),
          },
        },

        include: {
          addresses: true,
          acUnits: true,
        },
      });


    return res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      customer,
    });

  } catch (error) {
    console.error(
      'CREATE CUSTOMER ERROR:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Error creating customer',
      error: error.message,
    });
  }
};



exports.createTechnician = async (req, res) => {
  try {
    const {
      name,
      username,
      password,
      phone,
      specialty,
      experience,
      isAvailable,
    } = req.body;

    if (!name || !username || !password || !phone) {
      return res.status(400).json({
        message: 'Name, username, password and phone are required',
      });
    }

    const existingUser =
      await prisma.user.findUnique({
        where: { username },
      });

    if (existingUser) {
      return res.status(400).json({
        message: 'Technician already exists',
      });
    }

    const setupToken =
      crypto.randomBytes(32).toString('hex');

    const technician =
      await prisma.user.create({
        data: {
          name,
          username,
          phone,

          role: 'TECHNICIAN',

          specialty:
            specialty ?? 'General Servicing',

          experience:
            parseInt(experience ?? 0),

          isAvailable:
            isAvailable ?? true,

          assignedPassword: password,
          passwordHash: bcrypt.hashSync(password, 10),
        },
      });

    res.status(201).json({
      success: true,
      message: 'Technician created successfully',
      technician,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'Error creating technician',
      error: error.message,
    });
  }
};

exports.assignTechnician = async (req, res) => {
  try {
    const {
      complaintId,
      technicianId
    } = req.body;

    const complaint = await prisma.complaint.findFirst({
      where: {
        OR: [
          { id: complaintId },
          { complaintNumber: complaintId }
        ]
      }
    });

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const updatedComplaint =
      await prisma.complaint.update({
        where: {
          id: complaint.id
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
          username: true,
          phone: true,
          status: true,
          avatar: true,
          assignedPassword: true,
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
        : 0.0;

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

    const revenueTrends = recentReports.map((report, index) => {
      const date = report.commissioningDate ? new Date(report.commissioningDate) : null;
      const label = date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : `R${index + 1}`;
      return {
        x: index,
        y: report.totalAmount || 0,
        label: label
      };
    });

    if (revenueTrends.length === 0) {
      revenueTrends.push({ x: 0, y: 0, label: 'No Data' });
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

    // 1. priorityDistribution: Grouping complaints by priority (High, Medium, Low)
    const priorityGroups = await prisma.complaint.groupBy({
      by: ['priority'],
      _count: { id: true }
    });
    const priorityDistribution = priorityGroups.map(p => ({
      priority: p.priority,
      count: p._count.id
    }));

    // 2. ratingsDistribution: Grouping reviews by rating (1 to 5)
    const ratingGroups = await prisma.review.groupBy({
      by: ['rating'],
      _count: { id: true }
    });
    const ratingsDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ratingGroups.forEach(g => {
      ratingsDistribution[g.rating] = g._count.id;
    });

    // 3. techLeaderboard: ranking technicians by completed jobs
    const technicians = await prisma.user.findMany({
      where: { role: 'TECHNICIAN' },
      select: {
        id: true,
        name: true,
        specialty: true,
        experience: true,
        isAvailable: true,
        techReviews: { select: { rating: true } }
      }
    });

    const completedJobsCounts = await prisma.complaint.groupBy({
      by: ['technicianId'],
      where: { status: 'Completed', NOT: { technicianId: null } },
      _count: { id: true }
    });

    const completedJobsMap = {};
    completedJobsCounts.forEach(c => {
      if (c.technicianId) {
        completedJobsMap[c.technicianId] = c._count.id;
      }
    });

    const techLeaderboard = technicians.map(tech => {
      const avgRating = tech.techReviews.length > 0
        ? tech.techReviews.reduce((sum, r) => sum + r.rating, 0) / tech.techReviews.length
        : 0.0;
      return {
        id: tech.id,
        name: tech.name,
        specialty: tech.specialty,
        experience: tech.experience || 0,
        isAvailable: tech.isAvailable,
        completedJobs: completedJobsMap[tech.id] || 0,
        rating: Number(avgRating.toFixed(1))
      };
    });

    // Sort leaderboard by completedJobs desc, then rating desc
    techLeaderboard.sort((a, b) => b.completedJobs - a.completedJobs || b.rating - a.rating);

    res.json({
      avgComplaint: revenueStats._avg.totalAmount || 0,
      totalRevenue: revenueStats._sum.totalAmount || 0,
      growth: null, // placeholder until enough historical data
      rating: avgRating,
      efficiency: efficiency,
      distribution: distribution.map(d => ({ title: d.issueType, value: d._count.id })),
      revenueTrends: revenueTrends,
      priorityDistribution: priorityDistribution,
      ratingsDistribution: ratingsDistribution,
      techLeaderboard: techLeaderboard.slice(0, 5) // Top 5
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
          { username: { contains: q, mode: 'insensitive' } },
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
          { username: { contains: q, mode: 'insensitive' } },
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
          : 0.0;
        return {
          type: 'technician',
          title: t.name,
          subtitle: `Technician • Specialty: ${t.specialty || 'General'} • Rating: ${rating.toFixed(1)}`,
          extra: { id: t.id, name: t.name, specialty: t.specialty, rating: Number(rating.toFixed(1)), isAvailable: t.isAvailable, password: t.assignedPassword, phone: t.phone, username: t.username, experience: t.experience }
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


    res.json(reports);
  } catch (error) {

    res.status(500).json({
      message: 'Error fetching service reports',
      error: error.message
    });
  }
};
exports.updateTechnician = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, phone, specialty, experience, isAvailable, password } = req.body;
    const exp = parseInt(experience);

    // Convert isAvailable to boolean if it comes as string, just to be safe
    let availableStatus = isAvailable;
    if (typeof isAvailable === 'string') {
      availableStatus = isAvailable === 'true';
    }

    const updateData = { name, username, phone, specialty, experience: exp, isAvailable: availableStatus };
    
    if (password && password.trim().length > 0) {
      updateData.assignedPassword = password;
      updateData.passwordHash = bcrypt.hashSync(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData
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
    const { name, username, phone, addresses, acUnits, password } = req.body;

    const updateData = { name, username, phone };
    if (password && password.trim().length > 0) {
      updateData.assignedPassword = password;
      updateData.passwordHash = bcrypt.hashSync(password, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
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

  const invalidAC = acUnits.find(
    unit =>
      !unit.id ||
      !unit.id.trim() ||
      !unit.details ||
      !unit.details.trim()
  );

  if (invalidAC) {
    return res.status(400).json({
      message:
        'Each AC Unit must contain id (serial number) and details'
    });
  }

  await prisma.aCUnit.deleteMany({
    where: {
      userId: id
    }
  });

  if (acUnits.length > 0) {
    await prisma.aCUnit.createMany({
      data: acUnits.map(unit => ({
        id: unit.id.trim(),
        userId: id,
        details: unit.details.trim(),
      }))
    });
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

exports.createComplaintForCustomer = async (req, res) => {
  try {
    const { customerId, issueType, description, acUnitIds, preferredDate, address } = req.body;

    if (!customerId || !issueType || !description) {
      return res.status(400).json({ message: 'Customer ID, issue type and description are required' });
    }

    const count = await prisma.complaint.count();
    const complaintNumber = `#CMP-${9000 + count + 1}`;

    const complaint = await prisma.complaint.create({
      data: {
        complaintNumber,
        customerId,
        issueType,
        description,
        address,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        status: 'Pending',
        acUnits: acUnitIds?.length ? {
          connect: acUnitIds.map(id => ({ id }))
        } : undefined,
        events: {
          create: [
            {
              status: 'Complaint Logged',
              description: 'Admin raised a new complaint on behalf of customer'
            }
          ]
        }
      },
      include: {
        acUnits: true,
        customer: { select: { name: true, phone: true } }
      }
    });

    res.status(201).json(complaint);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: 'Error creating complaint',
      error: error.message
    });
  }
};