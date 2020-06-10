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

// GET TV SERIES -Bobby
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
                    "original_name": r.original_name,
                    "genre_ids": r.genre_ids,
                    "name": r.name,
                    "popularity": r.popularity,
                    "origin_country": r.origin_country,
                    "vote_count": r.vote_count,
                    "first_air_date": r.first_air_date,
                    // "backdrop_path": r.backdrop_path,
                    "original_language": r.original_language,
                    "id": r.id,
                    "vote_average": r.vote_average,
                    "overview": r.overview,
                    "poster_path": r.poster_path
                }
            );
        });
        console.log(endResultTemp);

        res.status(200).send(endResultTemp);
    });
});



//GET UPCOMING TV EPISODE  =  ALFON
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
  
  app.get('/api/recommendedTvshow',async function(req,res){//albert
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
      const tv = await executeQuery(con, `select movie_id from watchlist where watchlist_type=1 and email_user='${user.email}'`);
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

  app.get('/api/tvbyepisode',async function(req,res){//albert
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

  function check_expired(date){//alfon
    let user_date = new Date(date)
    let today_tmp = Date.now();
    let today = new Date(today_tmp)
    let today_str = today.getFullYear()+"-"+(today.getMonth()+1)+"-"+today.getDate()
    
    if(today>user_date) return true
    return false
  
  }
  function get_tv_detail(id){//albert
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

  function getMax(arr, prop) {//albert
    var max;
    for (var i=0 ; i<arr.length ; i++) {
        if (max == null || parseInt(arr[i][prop]) > parseInt(max[prop])){
          max = arr[i];
        }
    }
    return max;
  }

  function get_tv_bygenre(genre_id){//albert
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


function verify_api(key) {//alfon
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