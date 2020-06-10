const express = require("express");

const app = express.Router();

// ID COMMENT (A.I.), ID POST, ID USER, ISI COMMENT, COMMENTED AT, STATUS COMMENT
// POST COMMENT -Bobby
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

// AMBIL COMMENT -Bobby
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

// UPDATE COMMENT -Bobby
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

// DELETE COMMENT -Bobby
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

module.exports = app;
