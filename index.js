// REQUIRE YG NPM JS
const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const request = require('request');
const http = require('http');

// REQUIRE YANG NGAMBIL FILE
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
  let town = req.body.town;
  let user_phone = req.body.user_phone;
  let user_name = req.body.user_name;


  if(!user_email||!user_password||!user_address||!user_phone||!user_name||!town) return res.status(400).send("semua field harus diisi")
  user_address = user_address+","+town
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
    console.log(value);

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

// add watchlist
app.post("/api/watchlist", async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  if(email_user === undefined){ return res.status(400).send("email user tidak ada"); }
  if(movie_id === undefined){ return res.status(400).send("movie id tidak ada"); }

  let query = `INSERT INTO watchlist VALUES('${email_user}','${movie_id}')`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Add to Watchlist");
});

// get watchlist
app.get("/api/watchlist",async (req,res)=>{
  let user_email = req.query.user;
  let query = `SELECT movie_id FROM watchlist WHERE email_user='${user_email}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();
  if(Object.keys(result).length == 0) return res.status(404).send("anda belum memiliki watchlist");

  res.status(200).send(result);
});

// delete watchlist
app.delete("/api/watchlist",async (req,res)=>{
  let email_user = req.body.user_email;
  let movie_id = req.body.movie_id;

  let query = `DELETE FROM watchlist WHERE movie_id='${movie_id}' AND email_user='${email_user}'`;
  let conn = await getConnection();
  let result = await executeQuery(conn, query);
  conn.release();

  res.status(200).send("Delete From Watchlist");
});

app.get("/api/search/movies",async (req,res)=>{
  let keyword = req.query.keyword;
  let type = req.query.type;
  let options = {
    'method': 'GET',
    'url': `https://api.themoviedb.org/3/search/movie?api_key=${process.env.TMDB_API_KEY}&query=${keyword}`,
  };
  if (type == "tv series" || type == "series" || type == "tv") {
    options = {
      'method': 'GET',
      'url': `https://api.themoviedb.org/3/search/tv?api_key=${process.env.TMDB_API_KEY}&query=${keyword}`,
    };
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

  if (!id_post) return res.status(400).send("No id_post sent!");
  if (!id_user) return res.status(400).send("No id_user sent!");
  if (!comment) return res.status(400).send("Comment should not be empty!");

  let insertComment = await executeQuery(conn, `insert into comment values('','${id_post}','${id_user}','${comment}', CURRENT_TIMESTAMP(), 1)`);
  return res.status(200).send("User " + id_user + " commented");
})

// AMBIL COMMENT
app.get("/api/comment/get/:id", async function (req, res) {
  let id = req.params.id;

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

  let getCommentById = await executeQuery(conn, `select * from comment where id_comment=${parseInt(id)}`);
  if (getCommentById.length < 1) return res.status(404).send("Comment not found");

  try {
    let deleteComment = await executeQuery(conn, `update comment set status_comment=0 where id_comment=${parseInt(id)}`);
    return res.status(200).send("Database updated, affected rows: " + deleteComment["affectedRows"]);
  } catch (error) {
    return res.status(400).send(error);
  }
});

app.get('/api/jadwal',async function(req,res){

});

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

app.get('/api/trailer/:id',async function(req,res){
  let id = req.params.id;
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
});



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
})

app.post('/api/pesantiket',async function(req,res){
  //user_email	movie	seat	theater	tanggal	jam	studio
  const conn = await getConnection();
  let user_email = req.body.email;
  let movie = req.body.movie;
  let seat = req.body.seat;
  let theater = req.body.theater;
  let tanggal = req.body.tanggal;
  let jam = req.body.jam;
  let studio = req.body.studio;
  await executeQuery(conn,`insert into ticket values('${user_email}','${movie}','${seat}','${theater}','${tanggal}','${jam}','${studio}')`);
  return res.status(200).send("Pemesanan Berhasil");
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

//listener
app.listen(3000, function (req,res) { console.log("Listening on port 3000..."); });
