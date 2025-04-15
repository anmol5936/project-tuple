const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, SystemLog, Area } = require('../models');

exports.register = async (req, res) => {
  try {
    const { 
      username, 
      password, 
      email, 
      firstName, 
      lastName, 
      role, 
      phone,
      area: {
        name,
        city,
        state,
        postalCodes = []
      } = {}
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User already exists with this email or username' 
      });
    }

    // For Customer role, area details are required
    if (role === 'Customer' && (!name || !city || !state)) {
      return res.status(400).json({
        message: 'Area details are required for customer registration'
      });
    }

    // Find or create area
    let area;
    if (name && city && state) {
      area = await Area.findOne({
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        city: { $regex: new RegExp(`^${city}$`, 'i') },
        state: { $regex: new RegExp(`^${state}$`, 'i') }
      });

      if (!area) {
        area = await Area.create({
          name,
          city,
          state,
          postalCodes,
          isActive: true
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      username,
      password: hashedPassword,
      email,
      firstName,
      lastName,
      role,
      phone,
      areas: area ? [area._id] : [],
      notificationPreferences: {
        email: true,
        sms: false
      }
    });

    // If user is a manager or deliverer, update area with their reference
    if (area) {
      if (role === 'Manager') {
        area.managers.push(user._id);
      } else if (role === 'Deliverer') {
        area.deliverers.push(user._id);
      } else if (role === 'Customer') {
        area.customers.push(user._id);
      }
      await area.save();
    }

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log the registration
    await SystemLog.create({
      userId: user._id,
      actionType: 'REGISTRATION',
      actionDetails: `New ${role} registered`,
      ipAddress: req.ip
    });

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        area: area ? {
          id: area._id,
          name: area.name,
          city: area.city,
          state: area.state
        } : null
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Error registering user',
      error: error.message 
    });
  }
};
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await User.findOne({ username })
      .populate('areas', 'name city state');

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        username: user.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log the login
    await SystemLog.create({
      userId: user._id,
      actionType: 'LOGIN',
      actionDetails: 'User logged in',
      ipAddress: req.ip
    });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        areas: user.areas
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Error during login',
      error: error.message 
    });
  }
};

exports.logout = async (req, res) => {
  try {
    // Log the logout
    if (req.user) {
      await SystemLog.create({
        userId: req.user.id,
        actionType: 'LOGOUT',
        actionDetails: 'User logged out',
        ipAddress: req.ip
      });
    }

    res.json({ 
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      message: 'Error during logout',
      error: error.message 
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    // Get user from database (excluding password)
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('areas', 'name city state postalCodes')
      .populate('defaultAddress');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        phone: user.phone,
        areas: user.areas,
        defaultAddress: user.defaultAddress,
        notificationPreferences: user.notificationPreferences,
        isActive: user.isActive,
        dateCreated: user.dateCreated
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ 
      message: 'Error fetching user details',
      error: error.message 
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Get user from database
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    // Log the password change
    await SystemLog.create({
      userId: user._id,
      actionType: 'PASSWORD_CHANGE',
      actionDetails: 'Password changed successfully',
      ipAddress: req.ip
    });

    res.json({ 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      message: 'Error changing password',
      error: error.message 
    });
  }
};



module.exports = exports;