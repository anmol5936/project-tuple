const jwt = require('jsonwebtoken');
const {User,DeliveryPersonnel} = require('../models'); 


const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch user from database
    const user = await User.findById(decoded.id).select('role'); // Adjust fields as needed
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    // Fetch delivery personnel record if applicable
    const personnel = await DeliveryPersonnel.findOne({ userId: user._id });
    
    // Populate req.user
    req.user = {
      id: user._id,
      role: user.role, // Ensure User model has a 'role' field
      deliveryPersonnel: personnel ? personnel._id : null,
    };

    next();
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(403).json({ message: 'Invalid or expired token.' });
  }
};

const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticateToken, authorizeRole };