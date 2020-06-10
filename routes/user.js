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

// UPDATE PROFILE -Bobby
app.put("/api/update_profile/:email", async function (req, res) {
    let email = req.params.email;
    let password = req.body.password;
    let address = req.body.address;
    let phone = req.body.phone;
    let name = req.body.name;

    let key = req.query.key;

    if (!key) { return res.status(403).send(message[403]); }
    else {
        console.log("Key nya: " + key);

        let user = {}
        try {
            user = await verify_api(key)
        } catch (err) {
            return res.status(403).send(message[403])
        }
    }

    if (!email) {
        return res.status(400).send("No email reference!");
    }

    let checkUser = await executeQuery(conn, `select * from user where user_email = '${email}'`);
    if (checkUser.length < 1) {
        return res.status(404).send("User with that email does not exist!");
    }

    let updateEmail = await executeQuery(conn, `update user set user_password = '${password}', user_address = '${address}', user_phone = '${phone}', user_name = '${name}' where user_email = '${email}'`);
    if (updateEmail["affectedRows"] > 0) {
        return res.status(200).send("Updated!");
    }
});


//REGISTER = ALFON
app.post("/api/register", async (req,res)=>{
    let user_email = req.body.user_email;
    let user_password = req.body.user_password;
    let user_balance = 0;
    let user_key = hash();
    let user_address = req.body.user_address;
    let user_phone = req.body.user_phone;
    let user_name = req.body.user_name;
    
    if(!user_email||!user_password||!user_address||!user_phone||!user_name) return res.status(400).send(message[400])
    
    const token = jwt.sign({    
        "email":user_email,
        "name" : user_name
    }   ,"proyek_soa");
    
    let query = `INSERT INTO user VALUES('${user_email}','${user_password}',${user_balance},'${token}','${user_address}','${user_phone}','${user_name}', NOW() + INTERVAL 7 DAY,'')`;
    console.log(query)
    let conn = await getConnection();
  
    try {
      let result = await executeQuery(conn, query);
      conn.release();
      return res.status(201).send(message[201]);
    } catch (error) {
        console.log("error : " +error)
        return res.status(409).send(message[409])
    }
    
  });
  
  //LOGIN = ALFON
  app.post("/api/login",async function(req,res){
    const conn = await getConnection()
    const email = req.body.email
    const password = req.body.password
    let que = `SELECT * FROM user WHERE user_email = '${email}' and user_password = '${password}'`
    const user = await executeQuery(conn,que)
    if(user.length == 0) return res.status(400).send(message[400])
    let user_date = new Date(user[0].expired_date)
    let today_tmp = Date.now();
    let today = new Date(today_tmp)
    let today_str = today.getFullYear()+"-"+(today.getMonth()+1)+"-"+today.getDate()
    
    if(today>user_date) return res.status(426).send(message[426])

    console.log(user[0].expired_date)
    

    return res.status(200).send({"key" : user[0].user_key})
});


//CHECK EXP DATE = ALFON
app.get('/api/checkExpirationDate',async function(req,res){
    //let email = req.body.email
    //let password = req.body.password
    let key = req.query.key
    // let token = req.header("x-auth-token")
    if(!key)return res.status(400).send(message[400])
    //if(!token) return res.status(400).send("invalid key")

    const conn = await getConnection()
    let que_user = `SELECT * FROM user WHERE user_key = '${key}'`
    let user = await executeQuery(conn,que_user)
    if(user.length==0) return res.status(400).send(message[400])
    let token = user[0].user_key
    let exp_date = new Date(user[0].expired_date)
    let now = new Date(Date.now())
    let compare = Math.abs(exp_date - now);
    let day = Math.round((compare/1000)/(3600*24))
    console.log("exp date : "+exp_date.getDate()+"-"+exp_date.getMonth()+"-"+exp_date.getFullYear())
    console.log("today : "+now.getDate()+"-"+now.getMonth()+"-"+now.getFullYear())
    return res.status(200).send({status:200,message:day+" days"})


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