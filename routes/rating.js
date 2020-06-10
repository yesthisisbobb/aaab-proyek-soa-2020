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








//POST RATING = ALFON
app.post('/api/rating/:type/:id',async function(req,res){
    let type = req.params.type
    let id = req.params.id
    let key = req.query.key
    let score = req.body.score
    const conn = await getConnection();

    //cek kelengkapan field
    if(!id||!type||!score||!id) return res.status(400).send(message[400])
    if(type<0||type>1 || score > 10 || score < 1) return res.status(400).send(message[400])
    //cek kalau score bukan angka
    if(!(/^\d+$/.test(score))) return res.status(400).send(message[400])
    
    //cek user
    let user = {}
    try {
      user = await verify_api(key)
      console.log(user)
    } catch (error) {
      return res.status(403).send(message[403])
    }
    
    //insert rating
    try {
      let que_cari = `SELECT * FROM rating WHERE rating_user_email = '${user.email}' and rating_movie_id = ${id}`
      let hasil_cari =  await executeQuery(conn,que_cari)
      if(hasil_cari.length>0){
        let que_upd = `UPDATE rating SET rating_score = ${score} WHERE rating_id = ${hasil_cari[0].rating_id}`
        let hasil_update = await executeQuery(conn,que_upd)
        if(hasil_update.affectedRows==0) return res.status(500).send(message[500])
        return res.status(200).send(message[200])
      }
      else{
        let que = `INSERT INTO rating(rating_score,rating_user_email,rating_movie_id,rating_type) VALUES(${score},'${user.email}',${id},${type})`
      
        const hasil_insert = await executeQuery(conn,que)
        if(hasil_insert.affectedRows == 0) return res.status(500).send(message[500])
        return res.status(201).send(message[201])
      }
    } catch (error) {
        console.log(error)
        return res.status(500).send(message[500])
    } 
});  

app.get("/api/rating/:id",function(req,res){

})

function verify_api(key){ //alfon
    return new Promise(function(resolve,reject){
      let user = {}
      //cek apakah expired
        try{
            user = jwt.verify(key,"proyek_soa");
            resolve(user)
        }catch(err){
          //401 not authorized
            reject({error:err})
        }
        
    })

}




module.exports = app;