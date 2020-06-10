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

// untuk mengakses .env
require("dotenv").config();

// config untuk webservicenya
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

const userRouter = require("./routes/user");
const moviesRouter = require("./routes/movies");
const tvRouter = require("./routes/tv");
const commentRouter = require("./routes/comment");
const RatingRouter = require("./routes/rating");

app.use("/", userRouter);
app.use("/", moviesRouter);
app.use("/", tvRouter);
app.use("/", commentRouter);
app.use("/", RatingRouter);



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

          //tambahkan ke table transaksi
          query = `INSERT INTO transaksi VALUES('${chargeResponse.transaction_id}','${email}',${bayar}, NOW())`;
          conn = await getConnection();
          result = await executeQuery(conn, query);
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

app.get("/api/transaction-history",async (req,res) => {
  let email_user = req.body.email_user;
  let password_user = req.body.password_user;

  if(!email_user){ return res.status(400).send(message[400]); }
  if(!password_user){ return res.status(400).send(message[400]); }

  let conn = await getConnection();
  let checkUser = await executeQuery(conn, `select * from user where user_email = '${email_user}' and user_password = '${password_user}'`);
  conn.release();
  if (checkUser.length < 1) { return res.status(404).send(message[404]); }

  let query = `SELECT * FROM transaksi WHERE email_user='${email_user}'`;
  conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  if(Object.keys(result).length == 0) return res.status(404).send(message[404]);

  res.status(200).send(result);
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



//listener
app.listen(process.env.PORT || 3000, function (req,res) { console.log("Listening on port 3000..."); });