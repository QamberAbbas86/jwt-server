const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5500;

// Trust proxy for Render
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GoHighLevel OAuth configuration
const GHL_CONFIG = {
  clientId: process.env.GHL_CLIENT_ID,
  clientSecret: process.env.GHL_CLIENT_SECRET,
  redirectUri: process.env.GHL_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`,
  scope: 'contacts.readonly opportunities.readonly',
  baseUrl: 'https://services.leadconnectorhq.com',
  url:'https://marketplace.leadconnectorhq.com'
};

// Store tokens (in production, use a database)
let tokenStore = {};

// Home route with auth link
app.get('/', (req, res) => {
  const authUrl = `${GHL_CONFIG.url}/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(GHL_CONFIG.redirectUri)}&client_id=${GHL_CONFIG.clientId}&scope=${encodeURIComponent(GHL_CONFIG.scope)}`;
  
  res.send(`
    <h2>GoHighLevel JWT Token Server</h2>
    <p><a href="${authUrl}">Click here to authenticate with GoHighLevel</a></p>
    <hr>
    <h3>Available Endpoints:</h3>
    <ul>
      <li>GET /auth/callback - OAuth callback (automatic)</li>
      <li>GET /token - Get current JWT token</li>
      <li>POST /refresh - Refresh the JWT token</li>
      <li>GET /locations - Test API call to get locations</li>
    </ul>
  `);
});

// OAuth callback route
app.get('/auth/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Authorization code not provided' });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await axios.post(`${GHL_CONFIG.baseUrl}/oauth/token`, {
      client_id: GHL_CONFIG.clientId,
      client_secret: GHL_CONFIG.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: GHL_CONFIG.redirectUri
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokens = tokenResponse.data;
    
    // Store tokens (in production, associate with user ID)
    tokenStore = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      locationId: tokens.locationId,
      companyId: tokens.companyId,
      userId: tokens.userId,
      createdAt: new Date()
    };

    res.json({
      message: 'Authentication successful!',
      tokenInfo: {
        tokenType: tokens.token_type,
        expiresIn: tokens.expires_in,
        scope: tokens.scope,
        locationId: tokens.locationId,
        companyId: tokens.companyId,
        userId: tokens.userId
      }
    });

  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to exchange code for tokens',
      details: error.response?.data || error.message
    });
  }
});

// Get current JWT token
app.get('/token', (req, res) => {
  if (!tokenStore.accessToken) {
    return res.status(404).json({ error: 'No token available. Please authenticate first.' });
  }

  // Check if token is expired
  const tokenAge = (new Date() - tokenStore.createdAt) / 1000;
  const isExpired = tokenAge >= tokenStore.expiresIn;

  res.json({
    accessToken: tokenStore.accessToken,
    tokenType: tokenStore.tokenType,
    expiresIn: tokenStore.expiresIn,
    isExpired: isExpired,
    ageInSeconds: Math.floor(tokenAge),
    locationId: tokenStore.locationId,
    companyId: tokenStore.companyId,
    userId: tokenStore.userId
  });
});

// Refresh JWT token
app.post('/refresh', async (req, res) => {
  if (!tokenStore.refreshToken) {
    return res.status(404).json({ error: 'No refresh token available. Please authenticate first.' });
  }

  try {
    const refreshResponse = await axios.post(`${GHL_CONFIG.baseUrl}/oauth/token`, {
      client_id: GHL_CONFIG.clientId,
      client_secret: GHL_CONFIG.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: tokenStore.refreshToken
    }, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const newTokens = refreshResponse.data;
    
    // Update stored tokens
    tokenStore = {
      ...tokenStore,
      accessToken: newTokens.access_token,
      refreshToken: newTokens.refresh_token || tokenStore.refreshToken,
      expiresIn: newTokens.expires_in,
      createdAt: new Date()
    };

    res.json({
      message: 'Token refreshed successfully!',
      accessToken: newTokens.access_token,
      expiresIn: newTokens.expires_in
    });

  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      details: error.response?.data || error.message
    });
  }
});

// Test API call - Get locations


// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    hasToken: !!tokenStore.accessToken
  });
});

app.listen(PORT, () => {
  console.log(`🚀 GoHighLevel JWT server running on http://localhost:${PORT}`);
  console.log(`📝 Make sure to set your environment variables:`);
  console.log(`   GHL_CLIENT_ID=your_client_id`);
  console.log(`   GHL_CLIENT_SECRET=your_client_secret`);
  console.log(`   GHL_REDIRECT_URI=http://localhost:${PORT}/auth/callback`);
});