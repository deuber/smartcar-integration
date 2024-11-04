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
      return JSON.parse(data); // Returns an array of token objects
    }
    return [];
  } catch (err) {
    console.error('Error reading tokens:', err.message);
    return [];
  }
}

// Function to write tokens to the file
function writeTokens(newToken) {
  try {
    let tokens = [];
    if (fs.existsSync(tokensFilePath)) {
      const data = fs.readFileSync(tokensFilePath, 'utf8');
      tokens = JSON.parse(data);
    }
    // Check if the brand already has tokens
    const existingIndex = tokens.findIndex(token => token.brand === newToken.brand);
    if (existingIndex !== -1) {
      tokens[existingIndex] = newToken; // Update existing token
    } else {
      tokens.push(newToken); // Add new token
    }
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokens, null, 2));
    console.log(`Tokens for ${newToken.brand} saved successfully.`);
  } catch (err) {
    console.error('Error writing tokens:', err.message);
  }
}

// Route to start the authorization flow for a specific brand
app.get('/login/:brand', (req, res) => {
  const { brand } = req.params; // Extract 'brand' from req.params
  const brandLower = brand.toLowerCase(); // Convert brand to lowercase
  
  // Validate the brand parameter
  if (!['toyota', 'subaru'].includes(brandLower)) {
    return res.status(400).send('Invalid brand specified. Please use /login/toyota or /login/subaru.');
  }

  const scopes = ['read_vehicle_info', 'read_odometer', 'read_location'];
  const state = brandLower; // Use state to identify the brand during callback

  const authUrl = client.getAuthUrl(scopes, { state });
  console.log(`Redirecting ${brandLower} user to Smartcar authorization URL: ${authUrl}`);
  res.redirect(authUrl);
});

// Callback route to handle the authorization code exchange
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // 'toyota' or 'subaru'

  if (!code) {
    console.error('Authorization code is missing.');
    return res.status(400).send('Authorization code is missing.');
  }

  if (!state) {
    console.error('State parameter is missing.');
    return res.status(400).send('State parameter is missing.');
  }

  try {
    console.log(`Exchanging authorization code for tokens for brand: ${state}...`);
    const access = await client.exchangeCode(code);
    writeTokens({
      brand: state,
      accessToken: access.accessToken,
      refreshToken: access.refreshToken,
      expiration: Date.now() + access.expiresIn * 1000
    });
    res.send(`Authorization successful for ${state}! You can now access <a href="/vehicles">/vehicles</a>.`);
  } catch (err) {
    console.error('Error exchanging code:', err.message);
    res.status(500).send('An error occurred during authorization.');
  }
});

// Middleware to refresh access tokens if expired
app.use(async (req, res, next) => {
  let tokens = readTokens();
  let updated = false;

  for (let tokenObj of tokens) {
    if (Date.now() >= tokenObj.expiration) {
      try {
        console.log(`Access token for ${tokenObj.brand} expired. Refreshing token...`);
        const newAccess = await client.exchangeRefreshToken(tokenObj.refreshToken);
        tokenObj.accessToken = newAccess.accessToken;
        tokenObj.refreshToken = newAccess.refreshToken;
        tokenObj.expiration = Date.now() + newAccess.expiresIn * 1000;
        writeTokens(tokenObj);
        console.log(`Access token for ${tokenObj.brand} refreshed successfully.`);
        updated = true;
      } catch (err) {
        console.error(`Error refreshing access token for ${tokenObj.brand}:`, err.message);
      }
    }
  }

  if (updated) {
    tokens = readTokens(); // Reload tokens after refresh
  }

  req.tokens = tokens; // Attach tokens to request for downstream use
  next();
});

// Route to retrieve and display vehicles from all authorized brands
app.get('/vehicles', async (req, res) => {
  try {
    const tokens = req.tokens; // Array of token objects
    let allVehicleDetails = [];

    if (tokens.length === 0) {
      console.warn('No tokens found. Redirecting to login.');
      return res.status(401).send('No tokens found. Please authorize the application by visiting <a href="/login/toyota">/login/toyota</a> or <a href="/login/subaru">/login/subaru</a>.');
    }

    for (const tokenObj of tokens) {
      const { brand, accessToken } = tokenObj;
      try {
        console.log(`Fetching vehicles for brand: ${brand}...`);
        const { vehicles } = await smartcar.getVehicles(accessToken);
        console.log(`Retrieved ${vehicles.length} vehicle(s) for ${brand}:`, vehicles);

        if (vehicles.length === 0) {
          console.warn(`No vehicles found for ${brand}.`);
          continue;
        }

        const vehicleDetails = await Promise.all(
          vehicles.map(async (id) => {
            try {
              const vehicle = new smartcar.Vehicle(id, accessToken);
              const attributes = await vehicle.attributes();
              const location = await vehicle.location();
              return {
                brand: brand.toUpperCase(),
                make: attributes.make,
                model: attributes.model,
                year: attributes.year,
                latitude: location.latitude,
                longitude: location.longitude
              };
            } catch (vehicleErr) {
              console.error(`Error fetching data for vehicle ID ${id} (${brand}):`, vehicleErr.message);
              return null; // Skip this vehicle
            }
          })
        );

        // Filter out any null entries due to errors
        const validVehicleDetails = vehicleDetails.filter(detail => detail !== null);
        allVehicleDetails = allVehicleDetails.concat(validVehicleDetails);
      } catch (err) {
        console.error(`Error fetching vehicles for ${brand}:`, err.message);
        continue; // Skip to next token
      }
    }

    if (allVehicleDetails.length === 0) {
      console.warn('No vehicle details to render.');
      return res.status(200).send('No vehicles found for the authorized accounts.');
    }

    res.render('vehicles', { vehicles: allVehicleDetails, googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
  } catch (err) {
    console.error('Error fetching vehicles:', err.message);
    res.status(500).send('An error occurred while fetching vehicles.');
  }
});

// Home route with distinct login options for each brand
app.get('/', (req, res) => {
  res.send(`
    <h1>Welcome to the Vehicle Tracker</h1>
    <p>Select a brand to authorize:</p>
    <ul>
      <li><a href="/login/toyota">Login with Smartcar (Toyota)</a></li>
      <li><a href="/login/subaru">Login with Smartcar (Subaru)</a></li>
    </ul>
    <p>After authorization, visit <a href="/vehicles">/vehicles</a> to view your vehicles.</p>
  `);
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
