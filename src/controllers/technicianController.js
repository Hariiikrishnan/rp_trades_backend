const prisma = require('../prisma/client');
const notificationService = require("../services/notificationService");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { generateReportPDF } = require('../services/pdfGenerator');
const { compressBase64Image } =
  require('../utils/imageCompressor');

const sharp = require('sharp');

exports.getTechnicianProfile = async (req, res) => {
  try {
    const technician = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        specialty: true,
        isAvailable: true,
        techReviews: {
          select: { rating: true }
        }
      }
    });

    if (!technician) {
      return res.status(404).json({ message: 'Technician not found' });
    }

    const avgRating = technician.techReviews.length > 0
      ? technician.techReviews.reduce((sum, r) => sum + r.rating, 0) / technician.techReviews.length
      : 4.8; // Default rating if no reviews

    const { techReviews, ...rest } = technician;
    res.json({
      ...rest,
      rating: Number(avgRating.toFixed(1))
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching profile', error: error.message });
  }
};

exports.getAssignedJobs = async (req, res) => {
  try {
    const jobs = await prisma.complaint.findMany({
      where: {
        technicianId: req.user.id,
        status: { in: ['Assigned', 'InProgress', 'Completed'] }
      },
      include: {
        customer: { select: { name: true, phone: true, avatar: true } },
        acUnits: true,
        serviceReport: { select: { pdfPath: true } }
      }
    });
    res.json(jobs);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching jobs' });
  }
};

exports.updateJobStatus = async (req, res) => {
  try {
    const { complaintId, status } = req.body;
    const updatedJob = await prisma.complaint.update({
      where: { id: complaintId },
      data: { status },
      include: { customer: true }
    });

    if (updatedJob.customer && updatedJob.customer.fcmToken) {
      await notificationService.sendPushNotification(
        updatedJob.customer.id,
        'Complaint Status Updated',
        `Your complaint ${updatedJob.complaintNumber} is now ${status}`,
        { complaintId: updatedJob.id, type: 'STATUS_UPDATED', icon: 'info', color: 'orange' }
      );
    }

    res.json(updatedJob);
  } catch (error) {
    res.status(500).json({ message: 'Error updating job status' });
  }
};

exports.submitServiceReport = async (req, res) => {
  try {
    const {
      complaintId,
      commissioningDate,
      indoorModel,
      indoorSerial,
      outdoorModel,
      outdoorSerial,
      operationTest,
      qualityCheck,
      customerEducation,
      billing,
      customerSignature,   // base64 PNG string
      engineerSignature,   // base64 PNG string
      remarks,
      customerName,
      mobileNumber,
      address,
      invoiceNumber,
      dop,
      jobType,
      observation,
      actionTaken,
      installationImages
    } = req.body;



    // Save signature images to disk
    const sigDir = path.join(__dirname, '..', '..', 'uploads', 'signatures');
    if (!fs.existsSync(sigDir)) {
      fs.mkdirSync(sigDir, { recursive: true });
    }

    let customerSigPath = null;
    let engineerSigPath = null;
    let customerSigUrl = null;
    let engineerSigUrl = null;

    if (customerSignature) {
      const custSigFilename = `customer_sig_${complaintId}_${Date.now()}.png`;
      customerSigPath = path.join(sigDir, custSigFilename);
      customerSigUrl = `/uploads/signatures/${custSigFilename}`;
      await sharp(
  Buffer.from(customerSignature, 'base64')
)
.rotate() 
.jpeg({
  quality: 50
})
.toFile(customerSigPath);
    }

    if (engineerSignature) {
      const engSigFilename = `engineer_sig_${complaintId}_${Date.now()}.png`;
      engineerSigPath = path.join(sigDir, engSigFilename);
      engineerSigUrl = `/uploads/signatures/${engSigFilename}`;
      await sharp(
  Buffer.from(engineerSignature, 'base64')
)
.rotate() 
.jpeg({
  quality: 50
})
.toFile(engineerSigPath);
    }

    let savedImages = null;
    if (installationImages && Array.isArray(installationImages)) {
      const imgDir = path.join(__dirname, '..', '..', 'uploads', 'images');
      if (!fs.existsSync(imgDir)) {
        fs.mkdirSync(imgDir, { recursive: true });
      }
    savedImages = await Promise.all(
      installationImages.map(async (img, index) => {
        if (!img.base64) return null;

        const imgFilename =
          `img_${complaintId}_${Date.now()}_${index}.jpg`;

        const imgPath =
          path.join(imgDir, imgFilename);

        await compressBase64Image(
          img.base64,
          imgPath
        );

        return {
          name: img.name || `Image ${index + 1}`,
          url: `/uploads/images/${imgFilename}`
        };
      })
    );

    savedImages = savedImages.filter(Boolean);
    }

    const report = await prisma.serviceReport.create({
      data: {
        complaintId,
        commissioningDate: new Date(commissioningDate),
        engineerName: req.user.name,
        indoorModel,
        indoorSerial,
        outdoorModel,
        outdoorSerial,
        operationTest,
        qualityCheck,
        customerEducation,
        installationCharge: billing.subtotal,
        gst: billing.tax,
        totalAmount: billing.total,
        customerSignature: customerSigUrl,
        engineerSignature: engineerSigUrl,
        customerName: customerName || null,
        mobileNumber: mobileNumber || null,
        remarks: remarks || null,
        invoiceNumber: invoiceNumber || null,
        dop: dop ? new Date(dop) : null,
        jobType: jobType || 'Installation',
        observation: observation || null,
        actionTaken: actionTaken || null,
        images: savedImages || null
      }
    });

    console.log(invoiceNumber);

    // ─── Replace the inline PDFDocument block in submitServiceReport ────────────
    // Keep everything ABOVE the "Build PDF using pdfkit" comment unchanged,
    // then replace FROM that comment down to (but not including) the
    // "Update ServiceReport with pdfPath" block with the call below:

    // ── Generate PDF ─────────────────────────────────────────────────────────────
    const reportDir = path.join(__dirname, '..', '..', 'uploads', 'reports');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

    const pdfFilename = invoiceNumber
      ? `Report_${invoiceNumber}.pdf`
      : `Report_${customerName || report.id}.pdf`;
    const pdfPath = path.join(reportDir, pdfFilename);
    const pdfUrl = `/uploads/reports/${pdfFilename}`;

    await generateReportPDF(
      {
        jobType: jobType || 'Installation',
        customerName,
        mobileNumber,
        address,
        invoiceNumber,
        dop,
        commissioningDate,
        engineerName: req.user.name,
        indoorModel,
        indoorSerial,
        outdoorModel,
        outdoorSerial,
        operationTest,
        qualityCheck,
        observation,
        actionTaken,
        billing,
        remarks: remarks || '',
        customerSigPath,          // absolute path (already written above)
        engineerSigPath,          // absolute path (already written above)
        savedImages: savedImages || [],
      },
      pdfPath
    );


    // Update ServiceReport with pdfPath
    await prisma.serviceReport.update({
      where: { id: report.id },
      data: { pdfPath: pdfUrl }
    });

    // Add pdfPath to response report
    report.pdfPath = pdfUrl;

    // Mark complaint as completed and add timeline event
    const updatedComplaint = await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: 'Completed',
        events: {
          create: [
            {
              status: 'Service Completed',
              description: 'Technician completed the job and submitted the report.'
            }
          ]
        }
      },
      include: { customer: true }
    });

    if (updatedComplaint.customer && updatedComplaint.customer.fcmToken) {
      await notificationService.sendPushNotification(
        updatedComplaint.customer.id,
        'Job Completed',
        `Service report has been submitted for ${updatedComplaint.complaintNumber}`,
        { complaintId: updatedComplaint.id, type: 'JOB_COMPLETED', icon: 'check', color: 'green' }
      );
    }

    // Notify admins
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
    for (const admin of admins) {
      if (admin.fcmToken) {
        await notificationService.sendPushNotification(
          admin.id,
          'Job Completed',
          `Job ${updatedComplaint.complaintNumber} was completed by ${req.user.name}`,
          { complaintId: updatedComplaint.id, type: 'JOB_COMPLETED', icon: 'check', color: 'green' }
        );
      }
    }

    res.status(201).json(report);
  } catch (error) {
    console.error('Error submitting report:', error);
    res.status(500).json({ message: 'Error submitting report', error: error.message });
  }
};

exports.getEarnings = async (req, res) => {
  try {
    const technicianId = req.user.id;

    const completedJobs = await prisma.complaint.count({
      where: {
        technicianId,
        status: 'Completed'
      }
    });

    const serviceReports = await prisma.serviceReport.aggregate({
      where: {
        complaint: {
          technicianId
        }
      },
      _sum: {
        totalAmount: true
      }
    });

    const reviews = await prisma.review.aggregate({
      where: { technicianId },
      _avg: { rating: true },
      _count: { id: true }
    });

    res.json({
      totalEarnings: serviceReports._sum.totalAmount || 0,
      completedJobs,
      averageRating: reviews._avg.rating || 0,
      totalReviews: reviews._count.id || 0,
      efficiency: completedJobs > 0 ? 95 : 0 // mock efficiency score for now
    });

  } catch (error) {
    res.status(500).json({ message: 'Error fetching earnings', error: error.message });
  }
};
