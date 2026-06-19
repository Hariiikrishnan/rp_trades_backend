const prisma = require('../prisma/client');

exports.getTechnicianReviews = async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { technicianId: req.user.id },
      include: {
        customer: { select: { name: true } }
      },
      orderBy: { date: 'desc' }
    });
    const formattedReviews = reviews.map(r => ({
      id: r.id,
      complaintId: r.complaintId,
      customerId: r.customerId,
      technicianId: r.technicianId,
      rating: r.rating,
      reviewText: r.reviewText,
      date: r.date,
      customerName: r.customer?.name ?? 'Customer'
    }));
    res.json(formattedReviews);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews' });
  }
};

exports.getComplaintReview = async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: {
        complaintId: req.params.complaintId,
      },
    });

    if (!review) {
      return res.status(404).json({
        message: 'No review found',
      });
    }

    return res.json(review);
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message,
    });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { complaintId, rating, reviewText } = req.body;
    
    // Find the complaint to get technician ID
    const complaint = await prisma.complaint.findUnique({
      where: { complaintNumber: complaintId }
    });
  
    
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    
    if (!complaint.technicianId) {
      return res.status(400).json({ message: 'No technician assigned to this complaint' });
    }




   const review = await prisma.review.create({
  data: {
    complaintId: complaint.id,
    customerId: req.user.id,
    technicianId: complaint.technicianId,
    rating: parseInt(rating),
    reviewText
  }
});
    res.status(201).json(review);
  } catch (error) {
      console.error(error);
    res.status(500).json({ message: 'Error creating review', error: error.message });
  }
};
