// index.js

require('dotenv').config();
const express = require('express');
const smartcar = require('smartcar');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache'); // Import node-cache
const app = express();
const port = 8000;

// Initialize the cache with a TTL of 5 minutes (300 seconds)
const vehicleCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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

// Function to refresh expired tokens
async function refreshExpiredTokens() {
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

  return tokens;
}

// Immediately refresh tokens on server startup
let currentTokens = [];
refreshExpiredTokens()
  .then(tokens => {
    currentTokens = tokens;
  })
  .catch(err => {
    console.error('Error during initial token refresh:', err.message);
  });

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

    // Update currentTokens with the new token
    currentTokens = readTokens();

    res.send(`Authorization successful for ${state}! You can now access <a href="/vehicles">/vehicles</a>.`);
  } catch (err) {
    console.error('Error exchanging code:', err.message);
    res.status(500).send('An error occurred during authorization.');
  }
});

// Middleware to attach tokens to request (no refreshing here)
app.use((req, res, next) => {
  req.tokens = currentTokens; // Use the globally updated tokens
  next();
});

/**
 * Function to fetch vehicle details from Smartcar APIs
 * Includes fetching odometer (miles) data.
 * @param {Array} tokens - Array of token objects.
 * @returns {Array} - Array of vehicle details objects.
 */
async function fetchVehicleDetails(tokens) {
  let allVehicleDetails = [];

  if (tokens.length === 0) {
    console.warn('No tokens found.');
    return allVehicleDetails;
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
            
            // Fetch attributes
            const attributes = await vehicle.attributes();
            
            // Fetch location
            const location = await vehicle.location();
            
            // Fetch odometer (miles)
            const odometerData = await vehicle.odometer();
            console.log(`Odometer Data for vehicle ID ${id}:`, JSON.stringify(odometerData, null, 2));
            let miles = 'N/A';
            if (odometerData && odometerData.distance !== undefined && odometerData.distance !== null) {
              const distance = odometerData.distance;
              const unitSystem = odometerData.meta && odometerData.meta.unitSystem ? odometerData.meta.unitSystem : null;
              console.log(`Distance: ${distance} ${unitSystem}`);

              if (unitSystem === 'imperial') {
                miles = `${Math.round(distance)} mi`; // Rounded to nearest integer
              } else if (unitSystem === 'metric') {
                const milesValue = distance * 0.621371;
                miles = `${Math.round(milesValue)} mi`; // Convert to miles and round
              } else {
                console.warn(`Unknown unit system for vehicle ID ${id}: ${unitSystem}`);
              }
            }

            return {
              brand: brand.toUpperCase(),
              make: attributes.make,
              model: attributes.model,
              year: attributes.year,
              latitude: location.latitude,
              longitude: location.longitude,
              miles: miles // Include miles as integer
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

  return allVehicleDetails;
}

// Route to retrieve and display vehicles from all authorized brands
app.get('/vehicles', async (req, res) => {
  try {
    const tokens = req.tokens; // Array of token objects
    let allVehicleDetails = [];

    if (tokens.length === 0) {
      console.warn('No tokens found. Redirecting to login.');
      return res.status(401).send('No tokens found. Please authorize the application by visiting <a href="/login/toyota">/login/toyota</a> or <a href="/login/subaru">/login/subaru</a>.');
    }

    // Check if vehicle data is in cache
    const cachedVehicles = vehicleCache.get('allVehicles');
    if (cachedVehicles) {
      console.log('Serving vehicle data from cache.');
      return res.render('vehicles', { vehicles: cachedVehicles, googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
    }

    console.log('No cached vehicle data found. Fetching from Smartcar APIs...');
    allVehicleDetails = await fetchVehicleDetails(tokens);

    if (allVehicleDetails.length === 0) {
      console.warn('No vehicle details to render.');
      return res.status(200).send('No vehicles found for the authorized accounts.');
    }

    // Store fetched data in cache
    vehicleCache.set('allVehicles', allVehicleDetails);
    console.log('Vehicle data cached successfully.');

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

/**
 * Function to periodically refresh cached vehicle data
 * Fetches the latest vehicle details and updates the cache.
 */
async function refreshCachedVehicleData() {
  try {
    console.log('Refreshing cached vehicle data...');
    const tokens = readTokens();
    const vehicleDetails = await fetchVehicleDetails(tokens);

    if (vehicleDetails.length > 0) {
      vehicleCache.set('allVehicles', vehicleDetails);
      console.log('Cached vehicle data refreshed successfully.');
    } else {
      console.warn('No vehicle data fetched during cache refresh.');
    }
  } catch (err) {
    console.error('Error refreshing cached vehicle data:', err.message);
  }
}

// Start the server after initial token refresh and cache population
refreshExpiredTokens()
  .then(tokens => {
    currentTokens = tokens;
    // Initial cache population
    return fetchVehicleDetails(currentTokens);
  })
  .then(initialVehicleDetails => {
    if (initialVehicleDetails.length > 0) {
      vehicleCache.set('allVehicles', initialVehicleDetails);
      console.log('Initial vehicle data cached successfully.');
    } else {
      console.warn('No vehicle data fetched during initial cache population.');
    }

    // Set up periodic cache refresh every 10 minutes
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    setInterval(refreshCachedVehicleData, TEN_MINUTES_MS);

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  })
  .catch(err => {
    console.error('Failed to start server due to token refresh or initial cache error:', err.message);
    process.exit(1); // Exit the process with failure
  });
