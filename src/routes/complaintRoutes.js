const express = require('express');
const router = express.Router();
const prisma = require('../prisma/client');
const { authenticate } = require('../middleware/auth');

router.get('/:id', authenticate, async (req, res) => {
  try {
    const complaint = await prisma.complaint.findUnique({
      where: { id: req.params.id },
      include: {
        customer: { select: { name: true, phone: true } },
        technician: { select: { name: true, phone: true } },
        serviceReport: true,
        acUnits: true
      }
    });
    if (!complaint) return res.status(404).json({ message: 'Complaint not found' });
    res.json(complaint);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching complaint' });
  }
});

module.exports = router;
