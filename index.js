const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const hash = require('./hash_string');

const app = express();

//untuk mengakses .env
require("dotenv").config();

//config untuk webservicenya
app.use(express.urlencoded({ extended: true }));

//buat koneksi
const conn = mysql.createPool({
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST
});

//function untuk melakukan execute query
function executeQuery(conn, query){
  return new Promise(function(resolve,reject){
    conn.query(query,function(err,result){
        if(err){ reject(err); }
        else{ resolve(result); }
    });
  });
}

function getConnection() {
  return new Promise(function(resolve,reject){
    conn.getConnection(function(err,conn){
      if(err){ reject(err); }
      else{ resolve(conn); }
    });
  });
}

app.post("/api/register", async (req,res)=>{
  let user_email = req.body.user_email;
  let user_password = req.body.user_password;
  let user_balance = 0;
  let user_key = hash();
  let user_address = req.body.user_address;
  let user_phone = req.body.user_phone;
  let user_name = req.body.user_name;

  let query = `INSERT INTO user VALUES('${user_email}','${user_password}',${user_balance},'${user_key}','${user_address}','${user_phone}','${user_name}', NOW() + INTERVAL 7 DAY)`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();
  res.status(200).send("Berhasil Mendaftar");
});

app.put("/api/update_profile/:email", async function (req,res) {
    let email = req.params.email;
    let password = req.body.password;
    let address = req.body.address;
    let phone = req.body.phone;
    let name = req.body.name;

    if (!email) {
        return res.status(400).send("No email reference!");
    }

    let checkUser = await executeQuery(conn, `select * from user where user_email = '${email}'`);
    if (checkUser.length < 1) {
        return res.status(400).send("User with that email doesn't exist!");
    }

    let updateEmail = await executeQuery(conn, `update user set user_password = '${password}', user_address = '${address}', user_phone = '${phone}', user_name = '${name}' where user_email = '${email}'`);
    if(updateEmail["affectedRows"] > 0){
        return res.status(200).send("Account berhasil diubah!");
    }
});

//listener
app.listen(3000, function (req,res) {
    console.log("Listening on port 3000...");
});
