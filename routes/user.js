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
        return res.status(400).send(message[400]);
    }

    let checkUser = await executeQuery(conn, `select * from user where user_email = '${email}'`);
    if (checkUser.length < 1) {
        return res.status(404).send(message[404]);
    }

    let updateEmail = await executeQuery(conn, `update user set user_password = '${password}', user_address = '${address}', user_phone = '${phone}', user_name = '${name}' where user_email = '${email}'`);
    if (updateEmail["affectedRows"] > 0) {
        return res.status(200).send(message[200]);
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

app.put("/api/updatepropic",uploads.single("propic"), async function (req, res) {//albert
    const token = req.header("x-auth-token");
    const filename = req.file.filename.toString();
    if(!filename){
      return res.status(404).send("File Required");
    }
    let user = {};
    if(!token){
        return res.status(400).send("Token not found");
    }
    try{
         user = jwt.verify(token,"proyek_soa");
    }catch(err){
        return res.status(400).send("Token Invalid");
    }
    try {
      await executeQuery(conn, `update user set user_profile='${filename}' where user_email='${user.email}'`);
      return res.status(200).send("Profile Picture Updated");
    } catch (error) {
      return res.status(400).send(error);
    }
  });


//payment -sion
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

// get history -sion
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
  
//get paket -sion
app.get("/api/paket", (req,res)=>{
let output = {
    'bronze' : 'Rp.50.000,00- untuk 1 (satu) bulan',
    'silver' : 'Rp.75.000,00- untuk 3 (tiga) bulan',
    'gold' : 'Rp.100.000,00- untuk 6 (enam) bulan',
    'platinum' : 'Rp.150.000,00- untuk 1 (satu) tahun'
};
return res.send(output);
});
  
//respon ke midtrans -sion
app.post('/respon', (req,res)=>{
    return res.status(200).send("success");
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