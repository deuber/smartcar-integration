require('dotenv').config();
const express = require('express');
const smartcar = require('smartcar');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 8000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Define the path to the tokens file
const tokensFilePath = path.join(__dirname, 'tokens.json');

// Initialize the Smartcar AuthClient
const client = new smartcar.AuthClient({
  clientId: process.env.SMARTCAR_CLIENT_ID,
  clientSecret: process.env.SMARTCAR_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  mode: 'live' // Use 'live' for production
});

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
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokens));
    console.log('Tokens saved successfully.');
  } catch (err) {
    console.error('Error writing tokens:', err.message);
  }
}

// Route to start the authorization flow
app.get('/login', (req, res) => {
  const authUrl = client.getAuthUrl(['read_vehicle_info', 'read_odometer', 'read_location']);
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
    const access = await client.exchangeCode(code);
    writeTokens({
      accessToken: access.accessToken,
      refreshToken: access.refreshToken,
      expiration: Date.now() + access.expiresIn * 1000
    });
    res.send('Authorization successful! You can now access /vehicles.');
  } catch (err) {
    console.error('Error exchanging code:', err.message);
    res.status(500).send('An error occurred during authorization.');
  }
});

// Middleware to refresh the access token if expired
app.use(async (req, res, next) => {
  let tokens = readTokens();
  if (!tokens) {
    return res.status(401).send('No tokens found. Please authorize the application by visiting <a href="/login">/login</a>.');
  }
  if (Date.now() >= tokens.expiration) {
    try {
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
    const { vehicles } = await smartcar.getVehicles(req.accessToken);
    const vehicleDetails = await Promise.all(
      vehicles.map(async (id) => {
        const vehicle = new smartcar.Vehicle(id, req.accessToken);
        const attributes = await vehicle.attributes();
        const location = await vehicle.location();
        return {
          id,
          make: attributes.make,
          model: attributes.model,
          year: attributes.year,
          latitude: location.latitude,
          longitude: location.longitude
        };
      })
    );
    res.render('vehicles', {
      vehicles: vehicleDetails,
      googleApiKey: process.env.GOOGLE_API_MAPS_KEY
    });
  } catch (err) {
    console.error('Error fetching vehicles:', err.message);
    res.status(500).send('An error occurred while fetching vehicles.');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
