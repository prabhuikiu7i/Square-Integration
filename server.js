const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const Client = require('pg').Client;
const app = express();
const port = 8080;


const client = new Client({
    host: 'localhost',
    user: 'postgres',
    port: 5432,
    password: 'baseline77',
    database: 'postgres'
});

client.connect();

app.use(cors());
app.use(bodyParser.json());

app.post('/', async (req, res) => {
    try {
        console.log("server is running");
        res.json({ success: true });
    } catch (error) {
        console.error("Error fetching items:", error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
