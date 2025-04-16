const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, SystemLog, Area,Address,DeliveryPersonnel } = require('../models');

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
      } = {},
      address: {
        streetAddress,
        city: addressCity,
        state: addressState,
        postalCode,
        deliveryInstructions
      } = {},
      // New delivery personnel specific fields
      bankDetails = {},
      commissionRate
    } = req.body;

    console.log('Registration data:', req.body);

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    console.log('Existing user:', existingUser);

    if (existingUser) {
      return res.status(400).json({
        message: 'User already exists with this email or username'
      });
    }

    // For Customer role, area and address details are required
    if (role === 'Customer') {
      if (!name || !city || !state) {
        return res.status(400).json({
          message: 'Area details (name, city, state) are required for customer registration'
        });
      }
      if (!streetAddress || !addressCity || !addressState || !postalCode) {
        return res.status(400).json({
          message: 'Address details (street address, city, state, postal code) are required for customer registration'
        });
      }
    }

    
    // For Deliverer role, area details are required
    if (role === 'Deliverer') {

      if (!name || !city || !state) {
        return res.status(400).json({
          message: 'Area details (name, city, state) are required for deliverer registration'
        });
      }
    }

    console.log("Area details:", name, city, state);
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

    // Create new user without defaultAddress
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



    await user.save();

    // Create address for customers
    let address;
    if (role === 'Customer' && streetAddress && addressCity && addressState && postalCode) {
      address = await Address.create({
        userId: user._id,
        streetAddress,
        city: addressCity,
        state: addressState,
        postalCode,
        areaId: area?._id,
        deliveryInstructions,
        isActive: true,
        isDefault: true
      });

      // Update user with defaultAddress
      await User.updateOne(
        { _id: user._id },
        { $set: { defaultAddress: address._id } }
      );
    }

    // Create DeliveryPersonnel record for Deliverer role
    if (role === 'Deliverer') {
      const deliveryPersonnel = await DeliveryPersonnel.create({
        userId: user._id,
        joiningDate: new Date(),
        areasAssigned: area ? [area._id] : [],
        isActive: true,
        bankDetails: {
          accountName: bankDetails.accountName || '',
          accountNumber: bankDetails.accountNumber || '',
          bankName: bankDetails.bankName || '',
          ifscCode: bankDetails.ifscCode || ''
        },
        commissionRate: commissionRate || 2.5,
      });
    }

    // If user is a manager, deliverer, or customer, update area with their reference
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
        } : null,
        address: address ? {
          id: address._id,
          streetAddress: address.streetAddress,
          city: address.city,
          state: address.postalCode
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

    // Find user by username and populate areas
    const user = await User.findOne({ username })
      .populate('areas', 'name city state')
      .populate('defaultAddress', 'streetAddress city state postalCode areaId');

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

    // Construct user response with defaultAddress
    const userResponse = {
      id: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      areas: user.areas, // Existing populated areas
      defaultAddress: user.defaultAddress
        ? {
            id: user.defaultAddress._id,
            streetAddress: user.defaultAddress.streetAddress,
            city: user.defaultAddress.city,
            state: user.defaultAddress.state,
            postalCode: user.defaultAddress.postalCode,
            areaId: user.defaultAddress.areaId,
          }
        : undefined,
    };

    res.json({
      message: 'Login successful',
      token,
      user: userResponse,
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