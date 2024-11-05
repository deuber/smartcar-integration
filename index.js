require('dotenv').config();
const express = require('express');
const smartcar = require('smartcar');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const app = express();
const port = 8000;

// Initialize the cache with a TTL of 5 minutes (300 seconds)
const vehicleCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON bodies
app.use(express.json());

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Define the path to the tokens file and notes directory
const tokensFilePath = path.join(__dirname, 'tokens.json');
const notesDirectory = path.join(__dirname, 'notes');

// Ensure notes directory exists
if (!fs.existsSync(notesDirectory)) {
  fs.mkdirSync(notesDirectory);
}

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
    const existingIndex = tokens.findIndex(token => token.brand === newToken.brand);
    if (existingIndex !== -1) {
      tokens[existingIndex] = newToken;
    } else {
      tokens.push(newToken);
    }
    fs.writeFileSync(tokensFilePath, JSON.stringify(tokens, null, 2));
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
        const newAccess = await client.exchangeRefreshToken(tokenObj.refreshToken);
        tokenObj.accessToken = newAccess.accessToken;
        tokenObj.refreshToken = newAccess.refreshToken;
        tokenObj.expiration = Date.now() + newAccess.expiresIn * 1000;
        writeTokens(tokenObj);
        updated = true;
      } catch (err) {
        console.error(`Error refreshing access token for ${tokenObj.brand}:`, err.message);
      }
    }
  }

  if (updated) {
    tokens = readTokens();
  }

  return tokens;
}

// Function to fetch vehicle details from Smartcar APIs
async function fetchVehicleDetails(tokens) {
  let allVehicleDetails = [];

  if (tokens.length === 0) {
    console.warn('No tokens found.');
    return allVehicleDetails;
  }

  for (const tokenObj of tokens) {
    const { brand, accessToken } = tokenObj;
    try {
      const { vehicles } = await smartcar.getVehicles(accessToken);
      const vehicleDetails = await Promise.all(
        vehicles.map(async (id) => {
          try {
            const vehicle = new smartcar.Vehicle(id, accessToken);
            const attributes = await vehicle.attributes();
            const location = await vehicle.location();
            const odometerData = await vehicle.odometer();
            const miles = Math.round(odometerData.distance * 0.621371);
            const notes = readNotes(id);

            return {
              id,
              brand: brand.toUpperCase(),
              make: attributes.make,
              model: attributes.model,
              year: attributes.year,
              latitude: location.latitude,
              longitude: location.longitude,
              miles,
              notes
            };
          } catch (vehicleErr) {
            console.error(`Error fetching data for vehicle ID ${id} (${brand}):`, vehicleErr.message);
            return null;
          }
        })
      );
      allVehicleDetails = allVehicleDetails.concat(vehicleDetails.filter(detail => detail !== null));
    } catch (err) {
      console.error(`Error fetching vehicles for ${brand}:`, err.message);
    }
  }

  return allVehicleDetails;
}

// Function to read notes for a specific vehicle ID
function readNotes(vehicleId) {
  const filePath = path.join(notesDirectory, `${vehicleId}.json`);
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } else {
      return [];
    }
  } catch (err) {
    console.error(`Error reading notes for vehicle ${vehicleId}:`, err.message);
    return [];
  }
}

// Function to write a new note for a given vehicle ID
function writeNote(vehicleId, note) {
  const filePath = path.join(notesDirectory, `${vehicleId}.json`);
  try {
    let notes = [];
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      notes = JSON.parse(data);
    }
    notes.push(note);
    fs.writeFileSync(filePath, JSON.stringify(notes, null, 2));
    return true;
  } catch (err) {
    console.error(`Error writing note for vehicle ${vehicleId}:`, err.message);
    return false;
  }
}

// Route to start the authorization flow for a specific brand
app.get('/login/:brand', (req, res) => {
  const { brand } = req.params;
  if (!['toyota', 'subaru'].includes(brand.toLowerCase())) {
    return res.status(400).send('Invalid brand specified.');
  }

  const scopes = ['read_vehicle_info', 'read_odometer', 'read_location'];
  const authUrl = client.getAuthUrl(scopes, { state: brand.toLowerCase() });
  res.redirect(authUrl);
});

// Callback route for Smartcar authorization
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state) {
    return res.status(400).send('Authorization code or state parameter is missing.');
  }

  try {
    const access = await client.exchangeCode(code);
    writeTokens({
      brand: state,
      accessToken: access.accessToken,
      refreshToken: access.refreshToken,
      expiration: Date.now() + access.expiresIn * 1000
    });
    currentTokens = readTokens();
    res.send('Authorization successful!');
  } catch (err) {
    console.error('Error exchanging code:', err.message);
    res.status(500).send('Authorization error.');
  }
});

// Middleware to attach tokens to request
app.use((req, res, next) => {
  req.tokens = currentTokens;
  next();
});

// Route to display vehicles
app.get('/vehicles', async (req, res) => {
  const tokens = req.tokens;
  const cachedVehicles = vehicleCache.get('allVehicles');
  
  if (cachedVehicles) {
    return res.render('vehicles', { vehicles: cachedVehicles, googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
  }

  const vehicleDetails = await fetchVehicleDetails(tokens);
  if (vehicleDetails.length > 0) {
    vehicleCache.set('allVehicles', vehicleDetails);
  }
  res.render('vehicles', { vehicles: vehicleDetails, googleApiKey: process.env.GOOGLE_API_MAPS_KEY });
});

// GET route to fetch notes for a specific vehicle
app.get('/notes/:vehicleId', (req, res) => {
  const { vehicleId } = req.params;
  res.json(readNotes(vehicleId));
});

// POST route to add a new note for a vehicle
app.post('/notes/:vehicleId', (req, res) => {
  const { vehicleId } = req.params;
  const { note, date, odometer } = req.body;

  if (!note || !date || odometer === undefined) {
    return res.status(400).json({ error: 'Note, date, and odometer are required.' });
  }

  const newNote = {
    note: note.trim(),
    date,
    odometer: Math.round(odometer)
  };

  if (writeNote(vehicleId, newNote)) {
    res.status(201).json({ message: 'Note added successfully.' });
  } else {
    res.status(500).json({ error: 'Failed to add note.' });
  }
});

// DELETE route to delete a specific note for a vehicle
app.delete('/notes/:vehicleId/:noteIndex', (req, res) => {
  const { vehicleId, noteIndex } = req.params;
  const filePath = path.join(notesDirectory, `${vehicleId}.json`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Vehicle notes not found.' });
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const notes = JSON.parse(data);

    if (noteIndex < 0 || noteIndex >= notes.length) {
      return res.status(400).json({ error: 'Invalid note index.' });
    }

    notes.splice(noteIndex, 1);
    fs.writeFileSync(filePath, JSON.stringify(notes, null, 2));
    res.status(200).json({ message: 'Note deleted successfully.' });
  } catch (err) {
    console.error(`Error deleting note for vehicle ${vehicleId}:`, err.message);
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// Start the server
let currentTokens = [];
refreshExpiredTokens()
  .then(tokens => {
    currentTokens = tokens;
    return fetchVehicleDetails(currentTokens);
  })
  .then(initialVehicleDetails => {
    if (initialVehicleDetails.length > 0) {
      vehicleCache.set('allVehicles', initialVehicleDetails);
    }
    app.listen(port, () => console.log(`Server is running on http://localhost:${port}`));
  })
  .catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
