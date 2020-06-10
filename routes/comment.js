const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const request = require('request');
const multer = require('multer');
const path = require('path');
const midtransClient = require('midtrans-client');
const isNumber = require('is-number');

const app = express.Router();

//buat koneksi
const conn = mysql.createPool({
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST
});

//function untuk melakukan execute query
function executeQuery(conn, query) {
    return new Promise(function (resolve, reject) {
        conn.query(query, function (err, result) {
            if (err) { reject(err); }
            else { resolve(result); }
        });
    });
}

function getConnection() {
    return new Promise(function (resolve, reject) {
        conn.getConnection(function (err, conn) {
            if (err) { reject(err); }
            else { resolve(conn); }
        });
    });
}

//message return
let message = []
message[200] = { status: 200, message: "OK" }
message[201] = { status: 201, message: "Created" }
message[500] = { status: 500, message: "Internal Error" }
message[400] = { status: 400, message: "Bad Request" }
message[401] = { status: 401, message: "Unauthorized" }
message[403] = { status: 403, message: "Invalid Key" }
message[404] = { status: 404, message: "Not Found" }
message[409] = { status: 409, message: "User has already registered" }
message[426] = { status: 426, message: "Upgrade Required" }

// ID COMMENT (A.I.), ID POST, ID USER, ISI COMMENT, COMMENTED AT, STATUS COMMENT
// POST COMMENT -Bobby
app.post("/api/comment", async function (req, res) {
    let id_post = req.body.id_post, id_user = req.body.id_user, comment = req.body.comment;
    let key = req.query.key;

    if (!key) { return res.status(403).send(message[403]); }
    else {
        let user = {}
        try {
            user = await verify_api(key)
        } catch (err) {
            return res.status(403).send(message[403])
        }
    }

    if (!id_post) return res.status(400).send(message[400]);
    if (!id_user) return res.status(400).send(message[400]);
    if (!comment) return res.status(400).send(message[400]);

    let insertComment = await executeQuery(conn, `insert into comment values(0,'${id_post}','${id_user}','${comment}', CURRENT_TIMESTAMP(), 1)`);
    return res.status(200).send(message[200]);
})

// AMBIL COMMENT -Bobby
app.get("/api/comment/get/:id", async function (req, res) {
    let id = req.params.id;
    let key = req.query.key;

    if (!key) { return res.status(403).send(message[403]); }
    else {
        let user = {}
        try {
            user = await verify_api(key)
        } catch (err) {
            return res.status(403).send(message[403])
        }
    }

    if (!id) {
        let getAllComment = await executeQuery(conn, `select * from comment`);
        return res.status(200).send(getAllComment);
    }

    let getCommentById = await executeQuery(conn, `select * from comment where id_comment=${parseInt(id)}`);
    if (getCommentById.length < 1) return res.status(404).send(message[404]);
    return res.status(200).send(getCommentById);
});

// UPDATE COMMENT -Bobby
app.put("/api/comment/:id", async function (req, res) {
    let id = req.params.id, updatedComment = req.body.updatedComment;
    let key = req.query.key;

    if (!key) { return res.status(403).send(message[403]); }
    else {
        let user = {}
        try {
            user = await verify_api(key)
        } catch (err) {
            return res.status(403).send(message[403])
        }
    }

    if (!id) return res.status(400).send(message[400]);
    if (!updatedComment) return res.status(400).send(message[400]);

    let getCommentById = await executeQuery(conn, `select * from comment where id_comment=${parseInt(id)}`);
    if (getCommentById.length < 1) return res.status(404).send(message[404]);

    try {
        let updateComment = await executeQuery(conn, `update comment set content_comment='${updatedComment}' where id_comment=${parseInt(id)}`);
        return res.status(200).send(message[200]);
    } catch (error) {
        return res.status(400).send(message[400]);
    }
});

// DELETE COMMENT -Bobby
app.delete("/api/comment/:id", async function (req, res) {
    let id = req.params.id;
    let key = req.query.key;

    if (!key) { return res.status(403).send(message[403]); }
    else {
        let user = {}
        try {
            user = await verify_api(key)
        } catch (err) {
            return res.status(403).send(message[403])
        }
    }

    let getCommentById = await executeQuery(conn, `select * from comment where id_comment=${parseInt(id)}`);
    if (getCommentById.length < 1) return res.status(404).send(message[404]);

    try {
        let deleteComment = await executeQuery(conn, `update comment set status_comment=0 where id_comment=${parseInt(id)}`);
        return res.status(200).send(message[200]);
    } catch (error) {
        return res.status(400).send(message[400]);
    }
});

function verify_api(key) { //alfon
    return new Promise(function (resolve, reject) {
        let user = {}
        //cek apakah expired
        try {
            user = jwt.verify(key, "proyek_soa");
            resolve(user)
        } catch (err) {
            //401 not authorized
            reject({ error: err })
        }
    })
}

module.exports = app;
