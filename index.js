const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const SSLCommerzPayment = require("sslcommerz-lts");
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
    const sslCmmezCollection = client.db("sportDB").collection("sslpayment");
    const bookmarkCollection = client.db("sportDB").collection("bookmark");

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
    app.get("/users", async (req, res) => {
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

    /*------------------------ Bookmark api----------------------- */
    app.get("/bookmark/:email", async (req, res) => {
      const email = req.params.email;
      const query = { userEmail: email };
      const result = await bookmarkCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/bookmark/:id", async (req, res) => {
      const id = req.params.id;
      const {
        userEmail,
        userName,
        classId,
        className,
        classPhoto,
        instructorEmail,
        instructorName,
        price,
      } = req.body;
      const bookmarkData = {
        userEmail,
        userName,
        classId,
        className,
        classPhoto,
        instructorEmail,
        instructorName,
        price,
      };
      const classIdFilter = { classId: id };
      const userEmailFilter = { userEmail };
      const filter = { $and: [classIdFilter, userEmailFilter] };
      const existingUser = await bookmarkCollection.findOne(filter);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await bookmarkCollection.insertOne(bookmarkData);
      res.send(result);
    });

    /*------------------------------- instructor related api ----------------------- */
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

    /*----------------------------- classes related api ----------------------- */
    app.get("/classes", async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    });

    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/instructor-classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { instructorEmail: email };

      const result = await classesCollection.find(query).toArray();
      console.log(result);
      res.send(result);
    });

    app.delete("/instructor-classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.deleteOne(query);
      res.send(result);
    });

    app.patch("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const currentStatus = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          status: (currentStatus.status = "accept"),
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.post("/classes", async (req, res) => {
      const classInfo = req.body;
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
    app.patch("/payments/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const currentDoc = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          enrolled: currentDoc.enrolled + 1,
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // sslcommerz paymetn

    const store_id = process.env.STORE_ID;
    const store_passwd = process.env.STORE_PASS;
    const is_live = false; //true for live, false for sandbox

    app.post("/classpayment", async (req, res) => {
      const query = { _id: new ObjectId(req.body.classId) };
      const classPayInfo = await selectClassCollection.findOne(query);
      const classInfo = req.body;
      const tran_id = new ObjectId().toString();
      const data = {
        total_amount: classInfo?.price,
        currency: classInfo?.currency,
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${tran_id}`,
        fail_url: "http://localhost:3030/fail",
        cancel_url: "http://localhost:3030/cancel",
        ipn_url: "http://localhost:3030/ipn",
        shipping_method: "Courier",
        product_name: "Computer.",
        product_category: "Electronic",
        product_profile: "general",
        cus_name: classInfo?.name,
        cus_email: "customer@example.com",
        cus_add1: classInfo?.address,
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: classInfo?.phone,
        cus_fax: "01711111111",
        ship_name: "Customer Name",
        ship_add1: "Dhaka",
        ship_add2: "Dhaka",
        ship_city: "Dhaka",
        ship_state: "Dhaka",
        ship_postcode: 1000,
        ship_country: "Bangladesh",
      };
      console.log(data);
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        res.send({ url: GatewayPageURL });
        // console.log("Redirecting to: ", GatewayPageURL);

        const finalSuccess = {
          classInfo,
          paidStatus: false,
          transitionId: tran_id,
        };
        const result = sslCmmezCollection.insertOne(finalSuccess);
      });

      app.post("/payment/success/:tranId", async (req, res) => {
        const result = await sslCmmezCollection.updateOne(
          { transitionId: req.params.tranId },
          {
            $set: {
              paidStatus: true,
            },
          }
        );
        if (result.modifiedCount > 0) {
          res.redirect(
            `http://localhost:5173/payment/success/${req.params.tranId}`
          );
        }
      });
    });

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

    app.delete("/payments", async (req, res) => {
      const history = req.body;
      const result = await paymentsCollection.deleteMany(history);
      res.send(result);
    });

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
