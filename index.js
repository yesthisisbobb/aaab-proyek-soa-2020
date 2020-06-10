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

// DIBAWAH INI FUNCTION-FUNCTION LEGACY
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