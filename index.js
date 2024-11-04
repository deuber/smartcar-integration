require('dotenv').config();
const express = require('express');
const smartcar = require('smartcar');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 8000;

// Define the path to the tokens file
const tokensFilePath = path.join(__dirname, 'tokens.json');

// Initialize the Smartcar AuthClient
const client = new smartcar.AuthClient({
  clientId: process.env.SMARTCAR_CLIENT_ID,
  clientSecret: process.env.SMARTCAR_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI, // Ensure this matches the registered URI
  scope: ['read_vehicle_info', 'read_location'],
  mode: 'live' // Use 'live' for production
});

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Function to read tokens from the file
function readTokens() {
  try {
    if (fs.existsSync(tokensFilePath)) {
      const data = fs.readFileSync(tokensFilePath, 'utf8');
      return JSON.parse(data);
    }
    return null;
  } catch (err) {
    console.error('Error reading tokens:', err.message);
    return null;
  }
}

// Function to write tokens to the file
function writeTokens(tokens) {
  try {
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokens, null, 2));
    console.log('Tokens saved successfully.');
  } catch (err) {
    console.error('Error writing tokens:', err.message);
  }
}

// Route to start the authorization flow
app.get('/login', (req, res) => {
  const authUrl = client.getAuthUrl();
  console.log('Redirecting user to Smartcar authorization URL:', authUrl);
  res.redirect(authUrl);
});

// Callback route to handle the authorization code exchange
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    console.error('Authorization code is missing.');
    return res.status(400).send('Authorization code is missing.');
  }
  try {
    console.log('Exchanging authorization code for tokens...');
    const access = await client.exchangeCode(code);
    writeTokens({
      accessToken: access.accessToken,
      refreshToken: access.refreshToken,
      expiration: Date.now() + access.expiresIn * 1000
    });
    res.send('Authorization successful! You can now access <a href="/vehicles">/vehicles</a>.');
  } catch (err) {
    console.error('Error exchanging code:', err.message);
    res.status(500).send('An error occurred during authorization.');
  }
});

// Middleware to refresh the access token if expired
app.use(async (req, res, next) => {
  let tokens = readTokens();
  if (!tokens) {
    console.warn('No tokens found. Redirecting to /login.');
    return res.status(401).send('No tokens found. Please authorize the application by visiting <a href="/login">/login</a>.');
  }
  if (Date.now() >= tokens.expiration) {
    try {
      console.log('Access token expired. Refreshing token...');
      const newAccess = await client.exchangeRefreshToken(tokens.refreshToken);
      tokens = {
        accessToken: newAccess.accessToken,
        refreshToken: newAccess.refreshToken,
        expiration: Date.now() + newAccess.expiresIn * 1000
      };
      writeTokens(tokens);
      console.log('Access token refreshed successfully.');
    } catch (err) {
      console.error('Error refreshing access token:', err.message);
      return res.status(500).send('Error refreshing access token.');
    }
  }
  req.accessToken = tokens.accessToken;
  next();
});

// Route to retrieve and display vehicles
app.get('/vehicles', async (req, res) => {
  try {
    console.log('Fetching vehicles...');
    const { vehicles } = await smartcar.getVehicles(req.accessToken);
    console.log(`Retrieved ${vehicles.length} vehicle(s):`, vehicles);

    if (vehicles.length === 0) {
      console.warn('No vehicles found for the authenticated user.');
      return res.render('vehicles', { vehicles: [], googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
    }

    const vehicleDetails = await Promise.all(
      vehicles.map(async (id) => {
        try {
          const vehicle = new smartcar.Vehicle(id, req.accessToken);
          const attributes = await vehicle.attributes();
          const location = await vehicle.location();
          console.log(`Fetched data for vehicle ID ${id}:`, { attributes, location });
          return {
            make: attributes.make,
            model: attributes.model,
            year: attributes.year,
            latitude: location.latitude,
            longitude: location.longitude
          };
        } catch (vehicleErr) {
          console.error(`Error fetching data for vehicle ID ${id}:`, vehicleErr.message);
          return null; // Skip this vehicle
        }
      })
    );

    // Filter out any null entries due to errors
    const validVehicleDetails = vehicleDetails.filter(detail => detail !== null);
    console.log('Final Vehicle Details to Render:', validVehicleDetails);

    res.render('vehicles', { vehicles: validVehicleDetails, googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
  } catch (err) {
    console.error('Error fetching vehicles:', err.message);
    res.status(500).send('An error occurred while fetching vehicles.');
  }
});

// Home route for convenience
app.get('/', (req, res) => {
  res.send('<h1>Welcome to the Vehicle Tracker</h1><p><a href="/login">Login with Smartcar</a></p>');
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
