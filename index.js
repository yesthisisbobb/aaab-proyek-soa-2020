const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const hash = require('./hash_string');
const request = require('request');

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

  if(!user_email||!user_password||!user_address||!user_phone||user_name) return res.status(400).send("semua field harus diisi")
  let query = `INSERT INTO user VALUES('${user_email}','${user_password}',${user_balance},'${user_key}','${user_address}','${user_phone}','${user_name}', NOW() + INTERVAL 7 DAY)`;
  let conn = await getConnection();

  try {
    let result = await executeQuery(conn, query);
    conn.release();

  } catch (error) {
      console.log("error : " +error)
      return res.status(400).send("email sudah terdaftar!")
  }
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

app.post("/api/top_up", async function (req,res) {
    let email = req.body.email;
    let password = req.body.password;
    let value = parseInt(req.body.value);

    if (!email) {
        return res.status(400).send("No email reference!");
    }
    if (!password) {
        return res.status(400).send("Password Required!");
    }

    let checkUser = await executeQuery(conn, `select * from user where user_email = '${email}' and user_password = '${password}'`);
    if (checkUser.length < 1) {
        return res.status(400).send("Email or password invalid!");
    }
    let balance = checkUser[0].user_balance;

    let topUp = await executeQuery(conn, `update user set user_balance = '${balance+value}' where user_email = '${email}'`);
    if(topUp["affectedRows"] > 0){
        return res.status(200).send("Top Up Successful");
    }
    conn.release();
});

app.post("/api/login",async function(req,res){
    const conn = await getConnection()
    const email = req.body.email
    const password = req.body.password
    const key = req.body.key
    let que = `SELECT * FROM user WHERE user_email = '${email}' and user_password = '${password}'`
    const user = await executeQuery(conn,que)
    if(user.length == 0) return res.status(400).send({status:400,message:"email or password incorrect!"})

    if(user[0].user_key != key) return res.status(400).send({status:400,message:"key invalid!"})

    return res.status(200).send({status:200,message:"login successful!"})
  })

app.post("/api/addWatchlist", async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  let query = `INSERT INTO watchlist VALUES('${email_user}','${movie_id}')`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Add to Watchlist");
});

app.get("/api/watchlist",async (req,res)=>{
  let user_email = req.query.user;
  let query = `SELECT movie_id FROM watchlist WHERE email_user='${user_email}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();
  if(Object.keys(result).length == 0) return res.status(200).send("anda belum memiliki watchlist");

  res.status(200).send(result);
});

app.delete("/api/deleteWatchlist",async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  let query = `DELETE FROM watchlist WHERE movie_id='${movie_id}' AND email_user='${email_user}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Delete From Watchlist");
});

app.get("/api/search/movies",async (req,res)=>{
  var keyword = req.body.keyword;
  var options = {
    'method': 'GET',
    'url': `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${keyword}`,
  };

  request(options, function (error, response) {
    if (error) throw new Error(error);
    res.status(200).send(response.body);
  });
});



//listener
app.listen(3000, function (req,res) { console.log("Listening on port 3000..."); });
