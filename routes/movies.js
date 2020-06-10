const express = require("express");
const jwt = require("jsonwebtoken");
const mysql = require('mysql');

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

function verify_api(key) {
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