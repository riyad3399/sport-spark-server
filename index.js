const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xiw11k9.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const classesCollection = client.db("sportDB").collection("classes");
    const selectClassCollection = client
      .db("sportDB")
      .collection("selectClass");
    const usersCollection = client.db("sportDB").collection("users");
    const paymentsCollection = client.db("sportDB").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      // console.log("from jwt", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    // verifyAdmin middleware
    // Warning: use verifyJWT before using verifyAdmin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // verifyInstructor middleware
    // Warning: use verifyJWT before using verifyInstructor
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "instructor") {
        return res
          .status(403)
          .send({ error: true, message: "forbidden message" });
      }
      next();
    };

    // users related api
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // instructor related api
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        res.send({ instructor: false });
      }
      const filter = { email: email };
      const user = await usersCollection.findOne(filter);
      const result = { instructor: user?.role === "instructor" };
      res.send(result);
    });

    app.get("/usersdata/instructor", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.delete("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    // classes related api
    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/instructor-classes/:email', async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email }
  
      const result = await classesCollection.find(query).toArray();
      console.log(result);
      res.send(result);
    })

    app.delete('/instructor-classes/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.deleteOne(query)
      res.send(result);
    })

    app.patch('/classes/:id', async (req, res) => {
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const currentStatus = await classesCollection.findOne(filter)
      const updateDoc = {
        $set: {
          status: currentStatus.status="accept"
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    app.post("/classes", async (req, res) => {
      const classInfo = req.body;
      console.log("classes", classInfo);
      const result = await classesCollection.insertOne(classInfo);
      res.send(result);
    });

    // carts related api
    app.get("/select-class", async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const query = { email: email };
      const result = await selectClassCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/select-class", async (req, res) => {
      const item = req.body;
      const result = await selectClassCollection.insertOne(item);
      res.send(result);
    });

    // create class api
    app.post("/create-class", async (req, res) => {
      const classDetails = req.body;
      const result = await classesCollection.insertOne(classDetails);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // TODO: updated the enrolled 
    app.patch('/payments/:id', async (req, res) => {
      const id = req.params.id
      const filter = { _id: new ObjectId(id) }
      const currentDoc = await classesCollection.findOne(filter)
      const updateDoc = {
        $set: {
          enrolled: currentDoc.enrolled + 1
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc)
      res.send(result);
    }) 

    // payment related api
    app.get("/payments", async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    app.post("/payments/:id", async (req, res) => {
      const payment = req.body;
      const id = req.params.id;
  
      const insertResult = await paymentsCollection.insertOne(payment);

      const query = { _id: new ObjectId(id) };
      const deleteResult = await selectClassCollection.deleteOne(query);
      res.send({ insertResult, deleteResult });
    });

    app.delete('/payments', async (req, res) => {
      const history = req.body;
      const result = await paymentsCollection.deleteMany(history)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("assignment is running");
});

app.listen(port, () => {
  console.log(`server running on port: ${port}`);
});
