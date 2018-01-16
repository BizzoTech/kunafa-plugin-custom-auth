const express = require('express');
const bodyParser = require('body-parser');
const process = require('process');

const uuid = require('uuid');

const nano = require('nano');
const Promise = require("bluebird");

const COUCHDB_USER = process.env.COUCHDB_USER;
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD;

const publicDb = nano(`http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@public-db:5984`).use("public");
const mainDb = nano(`http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@main-db:5984`).use("db");
const usersDb = nano(`http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@auth-db:5984`).use("_users");

function insertDoc(db, doc) {
  return new Promise((resolve, reject) => {
    db.insert(doc, function (err, result) {
      if (!err || err.error === 'conflict') {
        resolve(result);
      } else {
        return reject(err);
      }
    });
  });
}

function profileAlreadyCreated(profileId) {
  return new Promise((resolve, reject) => {
    publicDb.get(profileId, (err, body) => {
      if (err) {
        if (err.statusCode == 404) {
          resolve(false);
        }
        reject(err);
      }
      resolve(true);
    });
  });
}


const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.post('/signup', async (req, res, next) => {

  try {
    const username = req.body.username;
    const password = req.body.password;

    const profile = {
      _id: `profile_${username}`,
      username,
      type: "profile"
    }

    const user = {
      _id: "org.couchdb.user:" + username,
      name: username,
      roles: [],
      type: "user",
      password,
      profileId: profile._id
    };

    const event = {
      "_id": `${profile._id}-${Date.now()}-ADD_PROFILE`,
      "createdBy": "Server",
      "status": "draft",
      "action": {
        "type": "ADD_PROFILE",
        "doc": profile
      },
      "preProcessors": [],
      "relevantDocsIds": [profile._id],
      "type": "EVENT",
      "postProcessors": [],
      "createdAt": Date.now()
    }

    if (await profileAlreadyCreated(profile._id)) {
      res.json({
        error: "Already created"
      });
    } else {
      await Promise.all([
        insertDoc(mainDb, event),
        insertDoc(usersDb, user)
      ]);
      res.json({ name: username, password, profileId: profile._id, event });
    }
  } catch (e) {
    console.log(e);
    res.json(e);
  }
});

app.listen(3000, function () {
  console.log('Auth app listening on port 3000!')
})
