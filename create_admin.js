const bcrypt = require('bcryptjs');
const prisma = require('./src/prisma/client');

async function createSuperAdmin() {
  try {
    const username = 'admin_rp';
    const password = 'Admin@123';
    
    // Check if user already exists
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log('User already exists!');
      process.exit(0);
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await prisma.user.create({
      data: {
        name: 'Super Admin',
        username: username,
        passwordHash: passwordHash,
        assignedPassword: password, // As per business rule
        role: 'ADMIN',
        status: 'active'
      }
    });

    console.log('Super Admin created successfully:', admin.username);
  } catch (error) {
    console.error('Failed to create admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();
