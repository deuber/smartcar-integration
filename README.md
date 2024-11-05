
Smartcar Integration with Google Maps
=====================================

This project demonstrates how to integrate the Smartcar API into a Node.js application, enabling users to authorize access to their vehicles, retrieve vehicle information, and display their locations on a Google Map. The application is designed to work with vehicles compatible with Smartcar, including Subaru and Toyota models, but it should also support any vehicle available through Smartcar's API.

Motivation
----------

This app was created to fill a gap left by services like DIMO and Fleetio, which don’t provide exactly the functionality needed or are not free. Additionally, building this app allowed me to explore API integrations, which is one of my passions.

Features
--------

- **User Authorization**: OAuth-based authentication to securely access vehicle data.
- **Token Management**: Manages access and refresh tokens for Smartcar, ensuring secure access.
- **Vehicle Information Retrieval**: Fetches and displays details about authorized vehicles.
- **Google Maps Integration**: Displays vehicle locations on a Google Map, with unique markers for different brands.
- **Service Notes**: Allows users to add, view, and delete service notes (e.g., oil changes, tire rotations) for each vehicle.

Prerequisites
-------------

Before running this application, ensure you have the following:

- **Node.js**: [Download and install Node.js](https://nodejs.org/).
- **Smartcar Developer Account**: [Sign up for a Smartcar account](https://smartcar.com/).
- **Smartcar Application Credentials**: Obtain your `clientId`, `clientSecret`, and set your `redirectUri` in the Smartcar dashboard.
- **Google Maps API Key**: [Get an API key](https://developers.google.com/maps/documentation/javascript/get-api-key) for displaying maps.

Setup
-----

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/deuber/smartcar-integration.git
   ```

2. **Navigate to the Project Directory**:
   ```bash
   cd smartcar-integration
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Configure Environment Variables**:
   Create a `.env` file in the root directory with the following content:

   ```env
   SMARTCAR_CLIENT_ID=your_client_id
   SMARTCAR_CLIENT_SECRET=your_client_secret
   REDIRECT_URI=http://localhost:8000/callback
   GOOGLE_API_MAPS_KEY=your_google_maps_api_key
   ```

   Replace `your_client_id`, `your_client_secret`, and `your_google_maps_api_key` with your actual credentials.

Running the Application
-----------------------

1. **Start the Server**:
   ```bash
   node index.js
   ```
   The server will run at `http://localhost:8000`.

2. **Initiate Authorization**:
   Navigate to `http://localhost:8000/login/toyota` or `http://localhost:8000/login/subaru` to start the authorization flow. You’ll be redirected to Smartcar's authorization page.

3. **Authorize the Application**:
   Log in with your vehicle's credentials and grant access. After authorization, you’ll be redirected back to the application.

4. **View Vehicle Information and Map**:
   Access `http://localhost:8000/vehicles` to see details about your authorized vehicles, along with their current locations on a Google Map.

Project Structure
-----------------

```plaintext
smartcar-integration/
├── index.js            # Main application file
├── package.json        # Project metadata and dependencies
├── .env                # Environment variables (not included in version control)
├── public/             # Static assets
│   ├── css/            # Stylesheets, including Bootstrap
│   ├── js/             # Client-side scripts for notes and map
├── views/              # EJS templates for rendering views
│   ├── vehicles.ejs    # Main view displaying vehicle details and map
│   ├── partials/       # Includes partial templates for notes
└── README.md           # Project documentation
```

Dependencies
------------

- **express**: Web framework for Node.js.
- **smartcar**: Official Smartcar SDK for interacting with vehicle APIs.
- **dotenv**: Loads environment variables from a `.env` file.
- **NodeCache**: Caching library for managing vehicle data.
- **Google Maps JavaScript API**: Displays vehicle locations on a map.

Service Notes
-------------

Service notes for each vehicle, such as oil changes or tire rotations, are saved in a `notes` directory within the project. Each vehicle’s notes are stored in a JSON file named by the vehicle’s unique ID. These notes can be viewed, added, and deleted directly from the application interface.

Example JSON structure for service notes:
```json
[
  {
    "note": "Oil changed",
    "date": "2024-10-15",
    "odometer": 20000
  },
  {
    "note": "Tire rotation",
    "date": "2024-11-01",
    "odometer": 21000
  }
]
```

Notes
-----

- Ensure your `redirectUri` in the Smartcar dashboard matches the one specified in your `.env` file.
- The Google Maps API key must be correctly configured in `.env` to load the map.
- Service notes are stored in individual files within the `notes` directory, which is created if it doesn’t already exist.

License
-------

This project is licensed under the MIT License. See the LICENSE file for details.
