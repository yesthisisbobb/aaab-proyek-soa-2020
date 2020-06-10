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

// SEARCH MOVIE -Bobby
app.get("/api/search/movies", async (req, res) => {
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

    request(options, async function (error, response) {
        if (error) throw new Error(error);
        let temp = await JSON.parse(response.body);
        console.log(temp.results);

        let endResultTemp = {
            "page": temp.page,
            "total_results": temp.total_results,
            "total_pages": temp.total_pages,
            "results": []
        }

        temp.results.forEach(r => {
            endResultTemp.results.push(
                {
                    "popularity": r.popularity,
                    "vote_count": r.vote_count,
                    "video": r.video,
                    "poster_path": r.poster_path,
                    "id": r.id,
                    "adult": r.adult,
                    "backdrop_path": r.backdrop_path,
                    "original_language": r.original_language,
                    "original_title": r.original_title,
                    "genre_ids": r.genre_ids,
                    "title": r.title,
                    "vote_average": r.vote_average,
                    "overview": r.overview,
                    "release_date": r.release_date
                }
            );
        });
        console.log(endResultTemp);

        res.status(200).send(endResultTemp);
    });
});


//GET REMINDER BASED ON USER'S WATCHLIST = ALFON
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

app.get('/api/trailer/:id',async function(req,res){//albert
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

app.get('/api/recommendedMovie',async function(req,res){//albert
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
    const tv = await executeQuery(con, `select movie_id from watchlist where watchlist_type=0 and email_user='${user.email}'`);
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

// ADD WATCHLIST MOVIES - sion
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

// GET WATCHLIST MOVIES -sion
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

// DELETE WATCHLIST MOVIES -sion
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



  function get_movie_detail(id){ //alfon
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


  function check_expired(date){ //alfon
    let user_date = new Date(date)
    let today_tmp = Date.now();
    let today = new Date(today_tmp)
    let today_str = today.getFullYear()+"-"+(today.getMonth()+1)+"-"+today.getDate()
    
    if(today>user_date) return true
    return false
  
  }

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

function getTrailer(id){//albert
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

function get_movie_bygenre(genre_id){//albert
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

function getMax(arr, prop) {//albert
    var max;
    for (var i=0 ; i<arr.length ; i++) {
        if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop])){
          max = arr[i];
        }
    }
    return max;
  }

module.exports = app;