// REQUIRE YG NPM JS
const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const request = require('request');
const multer = require('multer');
const path = require('path');
const midtransClient = require('midtrans-client');
const isNumber = require('is-number');


// REQUIRE YANG NGAMBIL FILE
const hash = require('./hash_string');

const app = express();

app.use('/public/uploads/', express.static('./public/uploads'));

//message return
let message = []
message[200] = {status:200,message:"OK"}
message[201] = {status:201,message:"Created"}
message[500] = {status:500,message:"Internal Error"}
message[400] = {status:400,message:"Bad Request"}
message[401] = {status:401,message:"Unauthorized"}
message[403] = {status:403,message:"Invalid Key"}
message[404] = {status:404,message:"Not Found"}
message[409] = {status:409,message:"User has already registered"}
message[426] = {status:426,message:"Upgrade Required"}

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

const storage = multer.diskStorage({
  destination : function(req,file,callback){
      callback(null,"./public/uploads");
  },
  filename : function (req,file,callback){
      const filename = file.originalname.split(".");
      const extension = filename[1];
      callback(null,Date.now() + "." + extension);
  }
});

const uploads = multer({
  storage : storage,
  fileFilter: function(req,file,callback){
      checkFileType(file,callback);
  }
});

function checkFileType(file,callback){
  const filetypes= /jpeg|jpg|png/;
  const extname=filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype=filetypes.test(file.mimetype);
  if(mimetype && extname){
      return callback(null,true);
  }else{
      callback('Invalid Format!!!');
  }
}

app.get("/", function (req,res) {
  res.status(404).send("This is not the page you're looking for");
});

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
  let conn = await getConnection();

  try {
    let result = await executeQuery(conn, query);
    conn.release();

  } catch (error) {
      console.log("error : " +error)
      return res.status(409).send(message[409])
  }
  res.status(201).send(message[201]);
});

app.put("/api/update_profile/:email", async function (req,res) {
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
      return res.status(404).send("User with that email doesn't exist!");
  }

  let updateEmail = await executeQuery(conn, `update user set user_password = '${password}', user_address = '${address}', user_phone = '${phone}', user_name = '${name}' where user_email = '${email}'`);
  if(updateEmail["affectedRows"] > 0){
      return res.status(200).send("Updated!");
  }
});

app.post("/api/payment", async function (req,res) {
    let email = req.body.email;
    let password = req.body.password;
    let card_number = req.body.card_number;
    let card_exp_month = req.body.card_exp_month;
    let card_exp_year = req.body.card_exp_year;
    let card_cvv = req.body.card_cvv;
    let paket = req.body.paket;
    
    //semua param ini required
    if (!email) { return res.status(400).send(message[400]); }
    if (!password) { return res.status(400).send(message[400]); }
    if (!card_number) { return res.status(400).send(message[400]); }
    if (!card_exp_month) { return res.status(400).send(message[400]); }
    if (!card_exp_year) { return res.status(400).send(message[400]); }
    if (!card_cvv) { return res.status(400).send(message[400]); }
    if (!paket) { return res.status(400).send(message[400]); }

    if(!isNumber(card_number) || !isNumber(card_exp_month) || !isNumber(card_exp_year) || !isNumber(card_cvv) || !isNumber(paket)){
      return res.status(400).send(message[400]);
    }

    let conn = await getConnection();
    let checkUser = await executeQuery(conn, `select * from user where user_email = '${email}' and user_password = '${password}'`);
    conn.release();
    
    if (checkUser.length < 1) { return res.status(404).send(message[404]); }

    let core = new midtransClient.CoreApi({
      isProduction : false,
      serverKey : process.env.MIDTRANS_SERVER_KEY,
      clientKey : process.env.MIDTRANS_CLIENT_KEY
    });

    let hari = 0;
    let bayar = 0;

    if(paket == 0){
      hari = 30;
      bayar = 50000;
    }
    else if(paket == 1){
      hari = 90;
      bayar = 75000;
    }
    else if(paket == 2){
      hari = 180;
      bayar = 100000;
    }
    else if(paket == 3){
      hari = 365;
      bayar = 150000;
    }

    let parameter = {
      'card_number': card_number,
      'card_exp_month': card_exp_month,
      'card_exp_year': card_exp_year,
      'card_cvv': card_cvv,
      'client_key': core.apiConfig.clientKey,
    };

    core.cardToken(parameter).then((cardTokenResponse)=>{
      let cardToken = cardTokenResponse.token_id;
      let parameter = {
          "payment_type": "credit_card",
          "transaction_details": {
              "gross_amount": bayar,
              "order_id": Date.now(),
          },
          "credit_card":{
              "token_id": cardToken
          }
      };

      return core.charge(parameter);
    })
    .then(async (chargeResponse)=>{       
        
        if(chargeResponse.status_code == 200){
          let query = `UPDATE user SET expired_date = DATE_ADD(expired_date, INTERVAL ${hari} DAY) WHERE user_email = '${email}' AND user_password='${password}'`;
          let conn = await getConnection();
          let result = await executeQuery(conn, query);
          conn.release();
          return res.status(200).send(message[200]);
        }
        else{
          return res.status(chargeResponse.status_code).send(chargeResponse.status_message);
        }
        
    })
    .catch((e)=>{
        console.log('Error occured:',e.message);
    });;

});

app.get("/api/paket", (req,res)=>{
  let output = {
    'bronze' : 'Rp.50.000,00- untuk 1 (satu) bulan',
    'silver' : 'Rp.75.000,00- untuk 3 (tiga) bulan',
    'gold' : 'Rp.100.000,00- untuk 6 (enam) bulan',
    'platinum' : 'Rp.150.000,00- untuk 1 (satu) tahun'
  };
  return res.send(output);
});

//endpoint ini untuk midtrans akses notifikasi
app.post('/respon', (req,res)=>{
  return res.status(200).send("success");
});

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
    
    // if(today>user_date) return res.status(426).send(message[426])

    console.log(user[0].expired_date)
    

    return res.status(200).send({"key" : user[0].user_key})
});

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

//GET REMINDER BASED ON USER'S WATCHLIST
app.get('/api/reminderMovie',async function(req,res){
  let key = req.query.key
  if(!key) return res.status(403).send(message[403])

  let user = {}
  //cek apakah expired
  try{
    user = await verify_api(key)
  }catch(err){
    //401 not authorized
    return res.status(403).send(message[403])
  }
  console.log(user)
  const conn = await getConnection()

  //check authorization
  let que_user = `SELECT * FROM user WHERE user_key = '${key}' and user_email = '${user.email}'`
  let user_data = await executeQuery(conn,que_user)
  if(check_expired(user_data[0].expired_date)) return res.status(401).send(message[401]);
  
  
  let que = `SELECT movie_id FROM watchlist WHERE email_user = '${user.email}' and watchlist_type=0`
  const movies_id = await executeQuery(conn,que)

  console.log(movies_id)
  let hasil = []
  for(let i = 0;i < movies_id.length;i++){
    const tmp = await get_movie_detail(movies_id[i].movie_id)
    let release_date = new Date(tmp.release_date)
    let today = new Date(Date.now())
    console.log(release_date)
    //console.log(today)
    if(today>release_date) console.log("released")
    else{
      let obj = {
        title : tmp.original_title,
        genres : tmp.genres,
        release_date : tmp.release_date
      }
      hasil.push(obj)
    }
    
  }
  
  console.log(hasil)

  return res.status(200).send(hasil)

});

//untuk kasih rating 
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

//GET today's tv show update 
app.get("/api/reminderTV",async function(req,res){
  let key = req.query.key
  if(!key) return res.status(403).send(message[403])

  let user = {}
  //cek apakah expired
  try{
    user = await verify_api(key)
  }catch(err){
    //401 not authorized
    return res.status(403).send(message[403])
  }

  
  console.log(user)
  const conn = await getConnection()

  //check authorization
  let que_user = `SELECT * FROM user WHERE user_key = '${key}' and user_email = '${user.email}'`
  let user_data = await executeQuery(conn,que_user)
  if(check_expired(user_data[0].expired_date)) return res.status(401).send(message[401])


  let que = `SELECT movie_id FROM watchlist WHERE email_user = '${user.email}' and watchlist_type=1`
  const tv_id = await executeQuery(conn,que)

  console.log(tv_id)
  let hasil = []
  for(let i = 0;i < tv_id.length;i++){
    const tmp = await JSON.parse(await get_tv_detail(tv_id[i].movie_id))
    let today = new Date(Date.now())
    let obj = {}
    
    if(tmp.next_episode_to_air){
      let date = new Date(tmp.next_episode_to_air.air_date)
      let eps = tmp.next_episode_to_air.episode_number  
      if(date==today){
        obj = {
          title : tmp.name,
          episode : eps,
          description : tmp.name+` episode ${eps} is currently on air`
        }
      }
      else if(date>today){
        let compare = Math.abs(date - today);
        let day = Math.round((compare/1000)/(3600*24))
        obj = {
          title : tmp.name,
          episode : eps,
          description : tmp.name+` episode ${eps} will be airing in ${day} day(s)`
        }
      }
    }

    console.log()
    hasil.push(obj)
  }
  
  return res.status(200).send(hasil)

});

// ADD WATCHLIST MOVIES
app.post("/api/watchlist/movies", async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;
  
  let key = req.query.key;
  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `INSERT INTO watchlist VALUES(NULL,'${email_user}','${movie_id}',0)`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Add to Watchlist");
});

// GET WATCHLIST MOVIES
app.get("/api/watchlist/movies",async (req,res)=>{
  let user_email = req.query.user;
  let key = req.query.key;

  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `SELECT movie_id FROM watchlist WHERE email_user='${user_email}' AND watchlist_type = 0`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  if(Object.keys(result).length == 0) return res.status(404).send(message[404]);

  res.status(200).send(result);
});

// DELETE WATCHLIST MOVIES
app.delete("/api/watchlist/movies",async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  let key = req.query.key;
  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `DELETE FROM watchlist WHERE movie_id='${movie_id}' AND email_user='${email_user}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Delete From Watchlist");
});

// ADD WATCHLIST TV
app.post("/api/watchlist/tv", async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;
  
  let key = req.query.key;
  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `INSERT INTO watchlist VALUES(NULL,'${email_user}','${movie_id}',1)`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Add to Watchlist");
});

// GET WATCHLIST TV
app.get("/api/watchlist/tv",async (req,res)=>{
  let user_email = req.query.user;
  let key = req.query.key;

  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `SELECT movie_id as tv_id FROM watchlist WHERE email_user='${user_email}' AND watchlist_type = 1`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  if(Object.keys(result).length == 0) return res.status(404).send(message[404]);

  res.status(200).send(result);
});

// DELETE WATCHLIST TV
app.delete("/api/watchlist/tv",async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  let key = req.query.key;
  //cek kalau token tidak disertakan
  if(key == "" || key == null || typeof key === 'undefined'){
    return res.status(403).send(message[403]);
  }

  let query = `DELETE FROM watchlist WHERE movie_id='${movie_id}' AND email_user='${email_user}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Delete From Watchlist");
});

// SEARCH MOVIE
app.get("/api/search/movies",async (req,res)=>{
  let keyword = req.query.keyword;

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

  let options = {
    'method': 'GET',
    'url': `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${keyword}`,
  };

  request(options, function (error, response) {
    if (error) throw new Error(error);
    res.status(200).send(response.body);
  });
});

// GET TV SERIES
app.get("/api/search/tv", async (req, res) => {
  let keyword = req.query.keyword;

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

  options = {
    'method': 'GET',
    'url': `https://api.themoviedb.org/3/search/tv?api_key=${process.env.TMDB_API_KEY}&query=${keyword}`,
  };

  request(options, function (error, response) {
    if (error) throw new Error(error);
    res.status(200).send(response.body);
  });
});

// ID COMMENT (A.I.), ID POST, ID USER, ISI COMMENT, COMMENTED AT, STATUS COMMENT
// POST COMMENT
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

  if (!id_post) return res.status(400).send("No id_post sent!");
  if (!id_user) return res.status(400).send("No id_user sent!");
  if (!comment) return res.status(400).send("Comment should not be empty!");

  let insertComment = await executeQuery(conn, `insert into comment values(0,'${id_post}','${id_user}','${comment}', CURRENT_TIMESTAMP(), 1)`);
  return res.status(200).send("Comment added");
})

// AMBIL COMMENT
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
  if (getCommentById.length < 1) return res.status(404).send("Comment not found");
  return res.status(200).send(getCommentById);
});

// UPDATE COMMENT
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

  if (!id) return res.status(400).send("No id sent!");
  if (!updatedComment) return res.status(400).send("Updated comment is empty, maybe trying to delete?");

  let getCommentById = await executeQuery(conn, `select * from comment where id_comment=${parseInt(id)}`);
  if (getCommentById.length < 1) return res.status(404).send("Comment not found");

  try {
    let updateComment = await executeQuery(conn, `update comment set content_comment='${updatedComment}' where id_comment=${parseInt(id)}`);
    return res.status(200).send("Database updated, affected rows: " + updateComment["affectedRows"]);
  } catch (error) {
    return res.status(400).send(error);
  }
});

// DELETE COMMENT
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
  if (getCommentById.length < 1) return res.status(404).send("Comment not found");

  try {
    let deleteComment = await executeQuery(conn, `update comment set status_comment=0 where id_comment=${parseInt(id)}`);
    return res.status(200).send("Database updated, affected rows: " + deleteComment["affectedRows"]);
  } catch (error) {
    return res.status(400).send(error);
  }
});

//asc
function getTrailer(id){
  return new Promise(function(resolve,reject){
      var options = {
          'method': 'GET',
          'url': `https://api.themoviedb.org/3/movie/${id}/videos?api_key=${process.env.TMDB_API_KEY}&language=en-US`,
        };
        request(options, function (error, response) { 
          if (error) reject(new Error(error));
          else resolve(response.body);
      });
  })  
}

function get_tv_detail(id){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `https://api.themoviedb.org/3/tv/${id}?api_key=${key}`,
    };
      request(options, function (error, response) { 
        if (error) reject(new Error(error));
        else resolve(response.body);
    });
  })
}

function get_tv_bygenre(genre_id){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `
      https://api.themoviedb.org/3/discover/tv?api_key=${key}&sort_by=popularity.desc&with_genres=${genre_id}`,
    };
      request(options, function (error, response) { 
        if (error) reject(new Error(error));
        else resolve(response.body);
    });
  })
}

function get_movie_bygenre(genre_id){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `
      https://api.themoviedb.org/3/discover/movie?api_key=${key}&sort_by=popularity.desc&with_genres=${genre_id}`,
    };
      request(options, function (error, response) { 
        if (error) reject(new Error(error));
        else resolve(response.body);
    });
  })
}

app.get('/api/tvbyepisode',async function(req,res){
  let key = req.query.key;
  let con = await getConnection(); 
  if(!key){
    return res.status(404).send("API Key not found! Register to get your API key!");
  }
  let checkkey = await executeQuery(con, `select * from user where user_key='${key}'`);
  if(checkkey.length==0){
    return res.status(403).send(message[403]);
  }
  let user = {}
  //cek apakah expired
  try{
    user = await verify_api(key)
  }catch(err){
    //401 not authorized
    return res.status(403).send(message[403])
  }
  let maxepisode = req.query.maxepisode;
  let temp_id = [];
  let temp_tv = [];
  let temp_tv2 = [];
  let genre_id = req.query.genre;
  if(!genre_id){
    return res.status(404).send("TV Show genre required!");
  }
  if(!maxepisode){
    return res.status(404).send("Max episode required!");
  }
  let que_user = `SELECT * FROM user WHERE user_key = '${key}' and user_email = '${user.email}'`
  let user_data = await executeQuery(conn,que_user);
  if(check_expired(user_data[0].expired_date)) return res.status(401).send(message[401]);
  try {
    if(!maxepisode){
      const movie = JSON.parse(await get_tv_bygenre(genre_id));
      const result = movie.results;
      res.status(200).send(result);
    }else{
      const tv = JSON.parse(await get_tv_bygenre(genre_id));
      const result = tv.results;
      for (let i = 0; i < result.length; i++) {
        temp_id.push(parseInt(result[i].id));
      }
      for (let i = 0; i < temp_id.length; i++) {
        temp_tv.push(JSON.parse(await get_tv_detail(temp_id[i])));
      }
      for (let i = 0; i < temp_tv.length; i++) {
        if(parseInt(temp_tv[i].number_of_episodes)<=parseInt(maxepisode)){
          let obj = {
            title : temp_tv[i].name,
            episodes : temp_tv[i].number_of_episodes
          }
          temp_tv2.push(obj);
        }
      }
      res.status(200).send(temp_tv2);
    }
  } catch (error) {
    res.status(500).send(error);
  }
  con.release();
});

app.get('/api/recommendedMovie',async function(req,res){//recommended Movie dari genre di watchlist paling banyak
  let key = req.query.key;
  let con = await getConnection(); 
  if(!key){
    return res.status(403).send("API Key not found! Register to get your API key!");
  }
  let checkkey = await executeQuery(con, `select * from user where user_key='${key}'`);
  if(checkkey.length==0){
    return res.status(403).send(message[403]);
  }
  let user = {}
  //cek apakah expired
  try{
    user = await verify_api(key)
  }catch(err){
    //401 not authorized
    return res.status(401).send(message[401]);
  }
  var temp_movie = [];
  var temp_genre = [];

  let que_user = `SELECT * FROM user WHERE user_key = '${key}' and user_email = '${user.email}'`
  let user_data = await executeQuery(conn,que_user)
  if(check_expired(user_data[0].expired_date)) return res.status(401).send(message[401]);

  try {
    const tv = await executeQuery(con, `select movie_id from watchlist where watchlist_type=0 and email_user=${user.email}`);
    for (let i = 0; i < tv.length; i++) {
      temp_movie.push(await get_movie_detail(parseInt(tv[i].movie_id)));
    }
    for (let i = 0; i < temp_movie.length; i++) {
      for (let j = 0; j < temp_movie[i].genres.length; j++) {
        temp_genre.push(temp_movie[i].genres[j]);
      }
    }
    var occurences = temp_genre.reduce(function (r, row) {
      r[row.id] = ++r[row.id] || 1;
      return r;
    }, {});
    
    var result = Object.keys(occurences).map(function (key) {
        return { key: key, value: occurences[key] };
    });
    var maxValue = getMax(result, "value");
    const movie = JSON.parse(await get_movie_bygenre(maxValue.key));
    let temp = [];
    for (let i = 0; i < movie.results.length; i++) {
      let obj = {
        title : movie.results[i].original_title,
        release_date : movie.results[i].release_date
      }
      temp.push(obj);
    }
    res.status(200).send(temp);
  } catch (error) {
    res.status(500).send(error);
  }
  con.release();
});

app.get('/api/recommendedTvshow',async function(req,res){//recommended tv show dari genre di watchlist paling banyak
  let key = req.query.key;
  let con = await getConnection(); 
  if(!key){
    return res.status(404).send("API Key not found! Register to get your API key!");
  }
  let checkkey = await executeQuery(con, `select * from user where user_key='${key}'`);
  if(checkkey.length==0){
    return res.status(403).send(message[403]);
  }
  let user = {}
  //cek apakah expired
  try{
    user = await verify_api(key)
  }catch(err){
    //401 not authorized
    return res.status(403).send(message[403])
  }
  var temp_tv = [];
  var temp_genre = [];

  let que_user = `SELECT * FROM user WHERE user_key = '${key}' and user_email = '${user.email}'`
  let user_data = await executeQuery(conn,que_user)
  if(check_expired(user_data[0].expired_date)) return res.status(401).send(message[401]);

  try {
    const tv = await executeQuery(con, `select movie_id from watchlist where watchlist_type=1 and email_user=${user.email}`);
    for (let i = 0; i < tv.length; i++) {
      temp_tv.push(JSON.parse(await get_tv_detail(parseInt(tv[i].movie_id))));
    }
    for (let i = 0; i < temp_tv.length; i++) {
      for (let j = 0; j < temp_tv[i].genres.length; j++) {
        temp_genre.push(temp_tv[i].genres[j]);
      }
    }
    var occurences = temp_genre.reduce(function (r, row) {
      r[row.id] = ++r[row.id] || 1;
      return r;
    }, {});
    
    var result = Object.keys(occurences).map(function (key) {
        return { key: key, value: occurences[key] };
    });
    var maxValue = getMax(result, "value");
    const tvshow = JSON.parse(await get_tv_bygenre(maxValue.key));
    let temp = [];
    for (let i = 0; i < tvshow.results.length; i++) {
      let obj = {
        title : tvshow.results[i].name,
        id : tvshow.results[i].id,
        overview : tvshow.results[i].overview
      }
      temp.push(obj);
    }
    res.status(200).send(temp);
  } catch (error) {
    res.status(500).send(error);
  }
  con.release();
});

function getMax(arr, prop) {
  var max;
  for (var i=0 ; i<arr.length ; i++) {
      if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop])){
        max = arr[i];
      }
  }
  return max;
}

app.get('/api/trailer/:id',async function(req,res){
  let id = req.params.id;
  let key = req.query.key;
  let con = await getConnection(); 
  if(!key){
    return res.status(404).send("API Key not found! Register to get your API key!");
  }
  let checkkey = await executeQuery(con, `select * from user where user_key='${key}'`);
  if(checkkey.length==0){
    return res.status(403).send(message[403]);
  }

  let temp = [];
  try {
    const movie = JSON.parse(await getTrailer(id));
    const result = movie.results;
    for (let i = 0; i < result.length; i++) {
      if(result[i].site=="YouTube"){
        temp.push("Link : https://www.youtube.com/watch?v="+result[i].key);
      }
    }
    res.status(200).send(temp);
  } catch (error) {
    res.status(500).send(error);
  }
  con.release();
});

app.put("/api/updatepropic",uploads.single("propic"), async function (req, res) {
  const token = req.header("x-auth-token");
  const filename = req.file.filename.toString();
  if(!filename){
    return res.status(404).send("File Required");
  }
  let user = {};
  if(!token){
      return res.status(401).send("Token not found");
  }
  try{
       user = jwt.verify(token,"proyek_soa");
  }catch(err){
      return res.status(401).send("Token Invalid");
  }
  try {
    await executeQuery(conn, `update user set user_profile='${filename}' where user_email='${user.email}'`);
    return res.status(200).send("Profile Picture Updated");
  } catch (error) {
    return res.status(400).send(error);
  }
});

//asc
app.get('/api/test_geocode',async function(req,res){
  let address = 'Green Semanggi Mangrove'
  let town = 'Surabaya'
  let Country = 'ID'
  let loc = address+","+town+","+Country
  let hasil = await get_location(loc)
  return res.status(200).send({
    longitude : hasil.longt,
    latitude : hasil.latt
  })
});

function search_movies(keyword){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `https://api.themoviedb.org/3/search/movie?api_key=${key}&query=${keyword}`,
    };
    request(options, async function (error, response) { 
        if(error) reject({"error":error})
        else{
            try {
                let arr_hasil = []
                let tmp = (await JSON.parse(response.body)).results
                
                if(tmp.length > 0){
                  for(let i = 0;i<tmp.length;i++){
                    let detail = await get_movie_detail(tmp.id)
                    arr_hasil.push(detail.imdb_id)
                  }
                }
                
                resolve(tmp);
            } catch (error) {
                reject({error:error})
            }
            
        }
    });
  })
}

function search_movie_by_id(id){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `https://api.themoviedb.org/3/find/tt${id}?api_key=${key}&external_source=imdb_id`,
    };
    request(options, async function (error, response) { 
        if(error) reject({"error":error})
        else{
            try {
                let arr_hasil = []
                let tmp = (await JSON.parse(response.body))
                console.log(tmp)
                if(tmp.length > 0){
                  for(let i = 0;i<tmp.length;i++){
                    let detail = await get_movie_detail(tmp.id)
                    arr_hasil.push(detail.imdb_id)
                  }
                }
                
                resolve(tmp);
            } catch (error) {
                reject({error:error})
            }
            
        }
    });
  })
}

function get_movie_detail(id){
  return new Promise(function(resolve,reject){
    key = process.env.TMDB_API_KEY;
    let options = {
      'method': 'GET',
      'url': `https://api.themoviedb.org/3/movie/${id}?api_key=${key}`,
    };
    request(options, async function (error, response) { 
        if(error) reject({"error":error})
        else{
            try {
                resolve(await JSON.parse(response.body));
            } catch (error) {
                reject({error:error})
            }   
        }
    });
  })
}

//untuk dapat Latitute Longitute
function get_location(location){
    return new Promise(function(resolve,reject){
        key = process.env.GEOCODE_API_KEY;
        let options = {
          'method': 'GET',
          'url': `https://geocode.xyz?auth=${key}&locate=${location}&json=1`,
        };
        request(options, async function (error, response) { 
            if(error) reject({"error":error})
            else{
                try {
                    resolve(await JSON.parse(response.body));
                } catch (error) {
                    reject({error:error})
                }
            }
        });
    })
    
}

function verify_api(key){
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

function check_expired(date){
  let user_date = new Date(date)
  let today_tmp = Date.now();
  let today = new Date(today_tmp)
  let today_str = today.getFullYear()+"-"+(today.getMonth()+1)+"-"+today.getDate()
  
  if(today>user_date) return true
  return false

}

//listener
app.listen(process.env.PORT || 3000, function (req,res) { console.log("Listening on port 3000..."); });