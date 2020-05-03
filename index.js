const express = require('express');
const mysql = require('mysql');

const app = express();

app.use(express.urlencoded({urlencoded: true}));

app.listen(3000, function (req,res) {
    console.log("Listening on port 3000...");
});