Smartcar Integration
====================

This project demonstrates how to integrate the Smartcar API into a Node.js application, enabling users to authorize access to their vehicles and retrieve vehicle information.

Features
--------

-   **User Authorization**: Initiates the OAuth flow to allow users to grant access to their vehicles.
-   **Token Management**: Handles access and refresh tokens, storing them securely.
-   **Vehicle Information Retrieval**: Fetches and displays details about authorized vehicles.

Prerequisites
-------------

Before running this application, ensure you have the following:

-   **Node.js**: [Download and install Node.js](https://nodejs.org/).
-   **Smartcar Developer Account**: [Sign up for a Smartcar account](https://smartcar.com/).
-   **Smartcar Application Credentials**: Obtain your `clientId`, `clientSecret`, and set your `redirectUri` in the Smartcar dashboard.

Setup
-----

1.  **Clone the Repository**:

    

    

    `git clone https://github.com/deuber/smartcar-integration.git`

2.  **Navigate to the Project Directory**:

    

    

    `cd smartcar-integration`

3.  **Install Dependencies**:

    

    

    `npm install`

4.  **Configure Environment Variables**:

    Create a `.env` file in the root directory with the following content:

    env

    

    `SMARTCAR_CLIENT_ID=your_client_id
    SMARTCAR_CLIENT_SECRET=your_client_secret
    REDIRECT_URI=http://localhost:8000/callback`

    Replace `your_client_id` and `your_client_secret` with your actual Smartcar application credentials.

Running the Application
-----------------------

1.  **Start the Server**:

    

    

    `node index.js`

    The server will run at `http://localhost:8000`.

2.  **Initiate Authorization**:

    Navigate to `http://localhost:8000/login` in your browser. You'll be redirected to the Smartcar authorization page.

3.  **Authorize the Application**:

    Log in with your vehicle's credentials and grant access. After authorization, you'll be redirected back to the application.

4.  **View Vehicle Information**:

    Access `http://localhost:8000/vehicles` to see details about your authorized vehicles.

Project Structure
-----------------

plaintext



`smartcar-integration/
├── index.js       # Main application file
├── package.json   # Project metadata and dependencies
├── .env           # Environment variables (not included in version control)
└── README.md      # Project documentation`

Dependencies
------------

-   **express**: Web framework for Node.js.
-   **smartcar**: Official Smartcar SDK for Node.js.
-   **dotenv**: Loads environment variables from a `.env` file.

Notes
-----

-   Ensure your `redirectUri` in the Smartcar dashboard matches the one specified in your `.env` file.
-   Tokens are stored in the `.env` file for simplicity. In a production environment, consider using a more secure storage solution.

License
-------

This project is licensed under the MIT License. See the LICENSE file for details.
