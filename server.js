const express = require('express');
const { MongoClient } = require('mongodb');
const { Pool } = require("pg");
const { promisify } = require("util");
const redis = require("redis");

// const client = redis.createClient();

// const rIncr = promisify(client.incr).bind(client);

// const rGet = promisify(client.get).bind(client);
// const rSetex = promisify(client.setex).bind(client);

const connectionString = "mongodb://localhost:27017";


const pool = new Pool({
  connectionString:
    "postgresql://postgres:mysecretpassword@localhost:5431/postgres",
});

function cache(key, ttl, slowFn) {
  return async function (...props) {
    const cachedResponse = await rGet(key);
    if (cachedResponse) {
      return cachedResponse;
    }
    const result = await slowFn(...props);
    await rSetex(key, ttl, result);
    return result;
  };
}

async function verySlowAndExpensiveFunction() {
  // imagine this is like a really big join on PostgreSQL
  // or a call to an expensive API

  console.log("oh no an expensive call!");
  const p = new Promise((resolve) => {
    setTimeout(() => {
      resolve(new Date().toUTCString());
    }, 5000);
  });

  return p;
}

const cachedFn = cache("expensive_call", 10, verySlowAndExpensiveFunction);

async function init() {

    // const client = new MongoClient(connectionString, {
    //     useUnifiedTopology: true
    // })

    // await client.connect();

    const app = express();

    app.get("/get", async (req, res) => {
      const client = await pool.connect();
      const [commentsRes, boardRes] = await Promise.all([
        client.query(
          `SELECT * FROM comments NATURAL LEFT JOIN rich_content WHERE board_id = ${req.query.search}`,
          // "SELECT * FROM comments NATURAL LEFT JOIN rich_content WHERE board_id = $1",
          // [req.query.search]
        ),
        client.query("SELECT * FROM boards WHERE board_id = $1", [
          req.query.search,
        ]),
      ]);
      res
        .json({
          status: "ok",
          board: boardRes.rows[0] || {},
          posts: commentsRes.rows || [],
        })
        .end();
      await client.end();
    });

    app.get("/getm", async (req, res) => {
        const db = await client.db('adoption');

        const collection = db.collection('pets');

        const pets = await collection
        .find(
          {
            $text: { $search: req.query.search },
          },
          { _id: 0 }
        )
        .sort({ score: { $meta: "textScore" } })
        .limit(10)
        .toArray();
        
      res.json({ status: "ok", pets }).end();
    })

    app.get("/pageview", async (_, res) => {
      // const views = await rIncr("pageviews");
  
      res.json({
        status: "ok",
        views: null,
      });
    });

    app.get("/getfn", async (_, res) => {
      const data = await cachedFn();
    
      res.json({
        data,
        status: "ok",
      });
    });



    const PORT = 3000;

    app.use(express.static("./static"))

    app.listen(PORT);

    console.log(`APP RUNNING ON http://localhost:${PORT}`);
}

init();